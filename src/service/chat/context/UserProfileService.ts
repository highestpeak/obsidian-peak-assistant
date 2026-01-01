import { App, TFile } from 'obsidian';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';
import type { LLMProviderService } from '@/core/providers/types';
import { ensureFolder } from '@/core/utils/vault-utils';
import { USER_PROFILE_MIN_CONFIDENCE_THRESHOLD } from '@/core/constant';

/**
 * User profile category constants.
 */
export const USER_PROFILE_VALID_CATEGORIES = [
	'fact',
	'preference',
	'decision',
	'habit',
	'communication-style',
	'work-pattern',
	'tool-preference',
	'expertise-area',
	'response-style',
	'other',
] as const;

/**
 * Valid category types for user profile items.
 */
export type UserProfileCategory = typeof USER_PROFILE_VALID_CATEGORIES[number];

/**
 * User profile item.
 * All user profile information (memories, preferences, profile) uses this structure.
 */
export interface UserProfileItem {
	text: string;
	category: UserProfileCategory;
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
			await ensureFolder(this.app, folderPath);
		}
		const file = this.app.vault.getAbstractFileByPath(this.contextFilePath);
		if (!(file instanceof TFile)) {
			await this.app.vault.create(this.contextFilePath, '# User Context\n\n- (No context items yet)\n');
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
					// Must have text
					if (!c || typeof c.text !== 'string' || !c.text.trim()) {
						return false;
					}
					// Validate category
					if (!c.category || typeof c.category !== 'string' || !USER_PROFILE_VALID_CATEGORIES.includes(c.category as UserProfileCategory)) {
						return false;
					}
					// Validate confidence if provided
					if (c.confidence !== undefined && (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1)) {
						return false;
					}
					return true;
				})
				.map((c) => ({
					text: c.text.trim(),
					category: c.category as UserProfileCategory,
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
	 * Update context list with new items.
	 */
	async updateProfile(params: {
		newItems: UserProfileItem[];
	}): Promise<UserProfileItem[]> {
		try {
			// Load existing context
			const existingContext = await this.loadContext();

			// Convert new items to statements for prompt
			const newStatements = params.newItems.map(item => item.text).join('\n');

			// Convert Map to flat array of texts for prompt
			const existingMemories = Array.from(existingContext.values()).flat();

			// Render update prompt and call LLM
			const content = await this.promptService.chatWithPrompt(
				PromptId.MemoryUpdateBulletList,
				{
					newStatement: newStatements,
					existingMemories,
				},
			);

			// Parse bullet list from response
			const updatedTexts = this.parseBulletList(content);
			
			// Reconstruct items (preserve category from new items)
			const updatedItems: UserProfileItem[] = updatedTexts.map(text => {
				// Try to find matching item from new items to preserve category
				const matchingNewItem = params.newItems.find(item => text.includes(item.text) || item.text.includes(text));
				return {
					text,
					category: matchingNewItem?.category || 'other', // Use 'other' as fallback if no matching item found
				};
			});

			// Save updated context
			await this.saveContext(updatedItems);

			return updatedItems;
		} catch (error) {
			console.warn('[UserProfileService] Failed to update context:', error);
			return await this.loadContextItems();
		}
	}

	/**
	 * Load existing context items from file, grouped by category.
	 */
	async loadContext(): Promise<Map<UserProfileCategory, string[]>> {
		const items = await this.loadContextItems();
		const map = new Map<UserProfileCategory, string[]>();
		
		for (const item of items) {
			const texts = map.get(item.category) || [];
			texts.push(item.text);
			map.set(item.category, texts);
		}
		
		return map;
	}

	/**
	 * Load existing context items from file as UserProfileItem[].
	 */
	private async loadContextItems(): Promise<UserProfileItem[]> {
		const file = this.app.vault.getAbstractFileByPath(this.contextFilePath);
		if (!(file instanceof TFile)) {
			return [];
		}

		try {
			const content = await this.app.vault.read(file);
			// Try to parse as JSON first (structured format)
			const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				try {
					const rawItems = JSON.parse(jsonMatch[1] || jsonMatch[0]) as any[];
					// Validate categories
					const items: UserProfileItem[] = rawItems
						.filter((item): item is UserProfileItem => {
							if (!item || typeof item.text !== 'string' || !item.text.trim()) {
								return false;
							}
							if (!item.category || typeof item.category !== 'string' || !USER_PROFILE_VALID_CATEGORIES.includes(item.category as UserProfileCategory)) {
								return false;
							}
							return true;
						})
						.map((item) => ({
							text: item.text.trim(),
							category: item.category as UserProfileCategory,
							confidence: item.confidence,
						}));
					return items;
				} catch {
					// Fall through to bullet list parsing
				}
			}
			
			// Fallback: parse as bullet list (legacy format, use 'other' category)
			const texts = this.parseBulletList(content);
			return texts.map(text => ({
				text,
				category: 'other' as UserProfileCategory, // Legacy format doesn't have category info
			}));
		} catch (error) {
			console.warn('[UserProfileService] Failed to load context:', error);
			return [];
		}
	}

	/**
	 * Convert Map to UserProfileItem[].
	 */
	private mapToItems(map: Map<UserProfileCategory, string[]>): UserProfileItem[] {
		const items: UserProfileItem[] = [];
		for (const [category, texts] of map.entries()) {
			for (const text of texts) {
				items.push({ text, category });
			}
		}
		return items;
	}

	/**
	 * Save context items to file.
	 */
	private async saveContext(items: UserProfileItem[]): Promise<void> {
		// Save as JSON for structured format
		const content = `# User Context\n\n\`\`\`json\n${JSON.stringify(items, null, 2)}\n\`\`\`\n\n## Plain List\n\n${items.map((item) => `- ${item.text}`).join('\n')}\n`;
		const file = this.app.vault.getAbstractFileByPath(this.contextFilePath);
		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		} else {
			await this.app.vault.create(this.contextFilePath, content);
		}
	}

	/**
	 * Parse bullet list from text.
	 */
	private parseBulletList(text: string): string[] {
		const lines = text.split('\n');
		const items: string[] = [];
		
		for (const line of lines) {
			const trimmed = line.trim();
			// Match bullet points: - item or * item
			const match = trimmed.match(/^[-*]\s+(.+)$/);
			if (match) {
				items.push(match[1].trim());
			}
		}

		return items;
	}

	/**
	 * Convert profile JSON to context items.
	 */
	private profileToContextItems(profile: Record<string, any>): UserProfileItem[] {
		const items: UserProfileItem[] = [];

		if (profile.communicationStyle) {
			items.push({
				text: profile.communicationStyle,
				category: 'communication-style',
			});
		}
		if (Array.isArray(profile.workPatterns)) {
			profile.workPatterns.forEach((pattern: string) => {
				items.push({
					text: pattern,
					category: 'work-pattern',
				});
			});
		}
		if (Array.isArray(profile.toolPreferences)) {
			profile.toolPreferences.forEach((tool: string) => {
				items.push({
					text: tool,
					category: 'tool-preference',
				});
			});
		}
		if (Array.isArray(profile.expertiseAreas)) {
			profile.expertiseAreas.forEach((area: string) => {
				items.push({
					text: area,
					category: 'expertise-area',
				});
			});
		}
		if (profile.responseStyle) {
			items.push({
				text: profile.responseStyle,
				category: 'response-style',
			});
		}

		return items;
	}

	/**
	 * Merge new context items with existing ones, avoiding duplicates.
	 */
	private mergeContextItems(existing: UserProfileItem[], newItems: UserProfileItem[]): UserProfileItem[] {
		const merged = [...existing];
		
		for (const newItem of newItems) {
			// Check if similar item already exists
			const existingIndex = merged.findIndex(item => 
				item.text.toLowerCase() === newItem.text.toLowerCase() ||
				(item.category === newItem.category && item.text.includes(newItem.text))
			);
			
			if (existingIndex >= 0) {
				// Update existing item
				merged[existingIndex] = newItem;
			} else {
				// Add new item
				merged.push(newItem);
			}
		}

		return merged;
	}

}
