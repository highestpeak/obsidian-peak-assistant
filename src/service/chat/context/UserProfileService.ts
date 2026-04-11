import { App, TFile } from 'obsidian';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';
import type { LLMProviderService } from '@/core/providers/types';
import { ensureFolder } from '@/core/utils/vault-utils';
import { USER_PROFILE_MIN_CONFIDENCE_THRESHOLD } from '@/core/constant';

/**
 * Category is free-form: AI or user decides the name. Stored as markdown ## heading.
 */
export type UserProfileCategory = string;

/**
 * User profile item. Category can be any string (section heading in markdown).
 */
export interface UserProfileItem {
	text: string;
	category: string;
	confidence?: number;
}

/**
 * Service for managing user profile.
 */
export class UserProfileService {
	constructor(
		private readonly app: App,
		private readonly promptService: PromptService,
		private readonly chat: LLMProviderService,
		private readonly contextFilePath: string,
	) {}

	/**
	 * Initialize context service and ensure file exists.
	 */
	async init(): Promise<void> {
		const folderPath = this.contextFilePath.substring(0, this.contextFilePath.lastIndexOf('/'));
		if (folderPath) {
			await ensureFolder(folderPath);
		}
		const file = this.app.vault.getAbstractFileByPath(this.contextFilePath);
		if (!(file instanceof TFile)) {
			await this.app.vault.create(this.contextFilePath, '# User Profile\n\n');
		}
	}

	/**
	 * Extract context candidates from a conversation exchange or other sources.
	 */
	async extractCandidates(params: {
		userMessage: string;
		assistantReply: string;
		context?: Record<string, string>;
	}): Promise<UserProfileItem[]> {
		try {
			const content = await this.promptService.chatWithPrompt(
				PromptId.MemoryExtractCandidatesJson,
				{
					userMessage: params.userMessage,
					assistantReply: params.assistantReply,
					context: params.context || {},
				},
			);

			// Parse JSON response
			const rawCandidates: any[] = JSON.parse(content.trim());

			// Validate candidates
			const validatedCandidates: UserProfileItem[] = rawCandidates
				.filter((c): c is UserProfileItem => {
					if (!c || typeof c.text !== 'string' || !c.text.trim()) return false;
					if (typeof c.category !== 'string' || !c.category.trim()) return false;
					if (c.confidence !== undefined && (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1)) return false;
					return true;
				})
				.map((c) => ({
					text: c.text.trim(),
					category: c.category.trim(),
					confidence: c.confidence,
				}))
				// Filter by confidence threshold if provided
				.filter((c) => !c.confidence || c.confidence >= USER_PROFILE_MIN_CONFIDENCE_THRESHOLD);

			return validatedCandidates;
		} catch (error) {
			console.warn('[UserProfileService] Failed to extract context candidates:', error);
			return [];
		}
	}

	/**
	 * Merge new items into existing profile via LLM. Saves whatever the prompt returns; no loss-ratio check or programmatic fallback.
	 */
	async updateProfile(params: {
		newItems: UserProfileItem[];
	}): Promise<UserProfileItem[]> {
		try {
			const existingMarkdown = await this.getProfileAsMarkdown();
			const existingItems = await this.loadContextItems();
			const newItemsMarkdown = this.formatItemsAsMarkdown(params.newItems);
			const content = await this.promptService.chatWithPrompt(
				PromptId.UserProfileOrganizeMarkdown,
				{
					currentProfileMarkdown: existingMarkdown || '(empty)',
					newItemsMarkdown: newItemsMarkdown || undefined,
				},
			);
			const trimmed = content.trim();
			const fence = trimmed.match(/```(?:markdown|md)?\s*([\s\S]*?)```/);
			const raw = fence ? fence[1].trim() : trimmed;
			const merged = this.cleanProfileItemsBeforeSave(this.parseMarkdownProfile(raw));
			// Do not overwrite with empty when we had content or new items (LLM may have returned wrong format).
			if (merged.length === 0 && (existingItems.length > 0 || params.newItems.length > 0)) {
				console.warn('[UserProfileService] Parse returned no items; keeping existing profile.');
				return existingItems;
			}
			await this.saveContext(merged);
			return merged;
		} catch (error) {
			console.warn('[UserProfileService] Failed to update context:', error);
			return this.loadContextItems();
		}
	}

	/** No programmatic cleanup; quality is controlled by prompts only. */
	private cleanProfileItemsBeforeSave(items: UserProfileItem[]): UserProfileItem[] {
		return items;
	}

	/** Format items as markdown (## category then - item per line) for the merge prompt. */
	private formatItemsAsMarkdown(items: UserProfileItem[]): string {
		if (items.length === 0) return '';
		const byCategory = new Map<string, string[]>();
		const order: string[] = [];
		for (const item of items) {
			if (!byCategory.has(item.category)) {
				order.push(item.category);
				byCategory.set(item.category, []);
			}
			byCategory.get(item.category)!.push(item.text.replace(/\n/g, ' ').trim());
		}
		const parts: string[] = [];
		for (const cat of order) {
			const texts = byCategory.get(cat);
			if (texts?.length) {
				parts.push(`## ${cat}`);
				for (const t of texts) parts.push(`- ${t}`);
			}
		}
		return parts.join('\n');
	}

	/**
	 * Load existing context items from file, grouped by category.
	 */
	async loadContext(): Promise<Map<string, string[]>> {
		const items = await this.loadContextItems();
		const map = new Map<string, string[]>();
		for (const item of items) {
			const texts = map.get(item.category) || [];
			texts.push(item.text);
			map.set(item.category, texts);
		}
		return map;
	}

	/**
	 * Get current profile as markdown (same format as saved). Use when sending profile to AI.
	 */
	async getProfileAsMarkdown(): Promise<string> {
		const items = await this.loadContextItems();
		if (items.length === 0) return '';
		const byCategory = new Map<string, string[]>();
		const order: string[] = [];
		for (const item of items) {
			if (!byCategory.has(item.category)) order.push(item.category);
			const list = byCategory.get(item.category) ?? [];
			list.push(item.text.replace(/\n/g, ' ').trim());
			byCategory.set(item.category, list);
		}
		const parts: string[] = [];
		for (const cat of order) {
			const texts = byCategory.get(cat);
			if (texts?.length) {
				parts.push(`## ${cat}`);
				for (const t of texts) parts.push(`- ${t}`);
			}
		}
		return parts.join('\n');
	}

	/**
	 * Ask AI to organize the current profile into clean markdown; then save.
	 */
	async organizeProfileWithAI(): Promise<void> {
		const currentMarkdown = await this.getProfileAsMarkdown();
		if (!currentMarkdown.trim()) return;
		const content = await this.promptService.chatWithPrompt(
			PromptId.UserProfileOrganizeMarkdown,
			{ currentProfileMarkdown: currentMarkdown },
		);
		let trimmed = content.trim();
		const fence = trimmed.match(/```(?:markdown|md)?\s*([\s\S]*?)```/);
		if (fence) trimmed = fence[1].trim();
		let organized = this.parseMarkdownProfile(trimmed);
		if (organized.length > 0) {
			organized = this.cleanProfileItemsBeforeSave(organized);
			await this.saveContext(organized);
		}
	}

	/**
	 * Load existing context items from file. Markdown only: ## heading = category, - line = item.
	 */
	private async loadContextItems(): Promise<UserProfileItem[]> {
		const file = this.app.vault.getAbstractFileByPath(this.contextFilePath);
		if (!(file instanceof TFile)) return [];
		try {
			const content = await this.app.vault.read(file);
			return this.parseMarkdownProfile(content);
		} catch (error) {
			console.warn('[UserProfileService] Failed to load context:', error);
			return [];
		}
	}

	/**
	 * Strip parenthetical notes from bullet text (e.g. Phi output "(8 words)", "[Merged]").
	 * Optional cleanup so stored profile stays free of meta.
	 */
	private static stripPhiMetaFromBulletText(text: string): string {
		return text
			.replace(/\s*\([^)]*\)\s*/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	/**
	 * Parse markdown profile: ## category (any heading text) then - item lines.
	 */
	private parseMarkdownProfile(content: string): UserProfileItem[] {
		const items: UserProfileItem[] = [];
		const lines = content.split('\n');
		let currentCategory = '';
		for (const line of lines) {
			const sectionMatch = line.match(/^##\s+(.+)$/);
			if (sectionMatch) {
				currentCategory = sectionMatch[1].trim().replace(/\s*\(\d+\)\s*$/g, '').trim();
				continue;
			}
			const bulletMatch = line.match(/^[-*]\s+(.+)$/);
			if (bulletMatch && currentCategory) {
				const rawText = bulletMatch[1].trim();
				const cleaned = UserProfileService.stripPhiMetaFromBulletText(rawText);
				if (!cleaned) continue;
				// Skip obviously junk bullets (long paragraphs from essays/assignments).
				if (cleaned.length > 200) continue;
				const parts = cleaned.split(/\s*[❌✅]\s*/).map((s) => s.trim()).filter(Boolean);
				for (const text of parts.length ? parts : [cleaned]) {
					if (text && text.length <= 200) items.push({ text, category: currentCategory });
				}
			}
		}
		return items;
	}

	/**
	 * Save context items to file as markdown only (## category, - item). No JSON.
	 */
	private async saveContext(items: UserProfileItem[]): Promise<void> {
		const byCategory = new Map<string, string[]>();
		const order: string[] = [];
		for (const item of items) {
			if (!byCategory.has(item.category)) order.push(item.category);
			const list = byCategory.get(item.category) ?? [];
			const text = UserProfileService.stripPhiMetaFromBulletText(item.text.replace(/\n/g, ' ').trim());
			if (text) list.push(text);
			byCategory.set(item.category, list);
		}
		const parts: string[] = ['# User Profile', ''];
		for (const cat of order) {
			const texts = byCategory.get(cat);
			if (texts?.length) {
				parts.push(`## ${cat}`);
				for (const t of texts) parts.push(`- ${t}`);
				parts.push('');
			}
		}
		const content = parts.join('\n').trimEnd() + '\n';
		const file = this.app.vault.getAbstractFileByPath(this.contextFilePath);
		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		} else {
			await this.app.vault.create(this.contextFilePath, content);
		}
	}

}
