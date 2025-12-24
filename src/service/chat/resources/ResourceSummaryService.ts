import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { buildFrontmatter, codeBlock } from '@/core/utils/markdown-utils';
import { stringifyYaml } from 'obsidian';
import type { ChatResourceRef, ResourceKind, ResourceSummaryMeta, ParsedResourceSummaryFile } from './types';
import { parseFrontmatter } from '@/core/utils/markdown-utils';
import { ensureFolder } from '@/core/utils/vault-utils';

/**
 * Service for managing resource summary notes.
 * Creates and updates markdown files that summarize resources (files, URLs, etc.)
 * and maintain bidirectional links between resources and conversations/projects.
 */
export class ResourceSummaryService {
	private readonly resourcesFolder: string;

	constructor(
		private readonly app: App,
		rootFolder: string
	) {
		this.resourcesFolder = normalizePath(`${rootFolder}/.resources`);
	}

	/**
	 * Initialize resources folder
	 */
	async init(): Promise<void> {
		await ensureFolder(this.app, this.resourcesFolder);
	}

	/**
	 * Generate a stable resource ID from source string
	 */
	generateResourceId(source: string): string {
		// Use a simple hash function for stable ID generation
		// In a browser/Node environment, we can use crypto if available
		if (typeof crypto !== 'undefined' && crypto.subtle) {
			// For now, use a simple hash that's stable
			return this.simpleHash(source);
		}
		return this.simpleHash(source);
	}

	/**
	 * Simple hash function for stable ID generation
	 */
	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		// Convert to positive hex string
		return Math.abs(hash).toString(16).padStart(8, '0');
	}

	/**
	 * Detect resource kind from source string
	 */
	detectResourceKind(source: string): ResourceKind {
		if (/^https?:\/\//i.test(source)) {
			return 'url';
		}
		if (source.startsWith('#')) {
			return 'tag';
		}
		if (source.includes('[[') || source.endsWith('.md')) {
			return 'note';
		}
		const ext = source.split('.').pop()?.toLowerCase();
		if (ext === 'pdf') return 'pdf';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif'].includes(ext || '')) {
			return 'image';
		}
		if (source.includes('/')) {
			return 'folder';
		}
		return 'text';
	}

	/**
	 * Create or get resource reference from source
	 */
	createResourceRef(source: string, summaryNotePath?: string): ChatResourceRef {
		const id = this.generateResourceId(source);
		const kind = this.detectResourceKind(source);
		return {
			source,
			id,
			kind,
			summaryNotePath,
		};
	}

	/**
	 * Get resource summary note file path
	 */
	getResourceSummaryPath(resourceId: string): string {
		return normalizePath(`${this.resourcesFolder}/Resource-${resourceId}.md`);
	}

	/**
	 * Create or update resource summary note
	 */
	async saveResourceSummary(params: {
		resourceId: string;
		source: string;
		kind: ResourceKind;
		title?: string;
		shortSummary?: string;
		fullSummary?: string;
		mentionedInConversations?: string[];
		mentionedInProjects?: string[];
		mentionedInFiles?: string[];
	}): Promise<TFile> {
		const path = this.getResourceSummaryPath(params.resourceId);
		const existingFile = this.app.vault.getAbstractFileByPath(path) as TFile | null;

		const meta: ResourceSummaryMeta = {
			id: params.resourceId,
			source: params.source,
			kind: params.kind,
			title: params.title,
			shortSummary: params.shortSummary,
			fullSummary: params.fullSummary,
			lastUpdatedTimestamp: Date.now(),
					mentionedInConversations: params.mentionedInConversations ?? [],
					mentionedInProjects: params.mentionedInProjects ?? [],
					mentionedInFiles: params.mentionedInFiles ?? [],
		};

		const markdown = this.buildResourceSummaryMarkdown(meta);
		return this.writeFile(existingFile, path, markdown);
	}

	/**
	 * Build markdown content for resource summary note
	 */
	private buildResourceSummaryMarkdown(meta: ResourceSummaryMeta): string {
		const frontmatter = buildFrontmatter(meta);
		const sections: string[] = [];

		// Original resource reference section
		sections.push('# Original Resource');
		sections.push('## Resource Link');
		
		// Reference the original resource based on kind
		if (meta.kind === 'url') {
			sections.push(`[${meta.source}](${meta.source})`);
		} else if (meta.kind === 'tag') {
			sections.push(`Tag: ${meta.source}`);
		} else if (meta.kind === 'note' || meta.kind === 'folder') {
			// Use wikilink for vault files
			const normalizedPath = meta.source.replace(/^\[\[|\]\]$/g, '');
			sections.push(`[[${normalizedPath}]]`);
		} else {
			// For other types, try to use wikilink if it looks like a path
			if (meta.source.includes('/') && !meta.source.includes('://')) {
				sections.push(`[[${meta.source}]]`);
			} else {
				sections.push(meta.source);
			}
		}

		// Summary section
		sections.push('# Summary');
		sections.push('## meta');
		sections.push(
			codeBlock('resource-summary-meta', stringifyYaml({
				id: meta.id,
				kind: meta.kind,
				lastUpdatedTimestamp: meta.lastUpdatedTimestamp,
			}))
		);
		sections.push('## short');
		sections.push(meta.shortSummary || 'No summary available yet.');
		if (meta.fullSummary) {
			sections.push('## full');
			sections.push(meta.fullSummary);
		}

		// References section - links to conversations and projects that use this resource
		const convLinks = (meta.mentionedInConversations || []).map(id => {
			// We don't know the exact file path here, so we'll use a placeholder
			// In practice, this should be resolved by the caller or during migration
			return `- Conversation: ${id}`;
		});
		const projLinks = (meta.mentionedInProjects || []).map(id => {
			return `- Project: ${id}`;
		});

		// File references
		const fileLinks = (meta.mentionedInFiles || []).map(path => {
			return `- [[${path}]]`;
		});

		if (convLinks.length > 0 || projLinks.length > 0 || fileLinks.length > 0) {
			sections.push('# Referenced In');
			if (convLinks.length > 0) {
				sections.push('## Conversations');
				sections.push(convLinks.join('\n'));
			}
			if (projLinks.length > 0) {
				sections.push('## Projects');
				sections.push(projLinks.join('\n'));
			}
			if (fileLinks.length > 0) {
				sections.push('## Files');
				sections.push(fileLinks.join('\n'));
			}
		}

		return `${frontmatter}${sections.join('\n\n')}\n`;
	}

	/**
	 * Read resource summary note
	 */
	async readResourceSummary(resourceId: string): Promise<ParsedResourceSummaryFile | null> {
		const path = this.getResourceSummaryPath(resourceId);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			return null;
		}

		const raw = await this.app.vault.read(file);
		const frontmatter = parseFrontmatter<Record<string, unknown>>(raw);
		if (!frontmatter) {
			return null;
		}

		const meta: ResourceSummaryMeta = {
			id: String(frontmatter.data.id ?? resourceId),
			source: String(frontmatter.data.source ?? ''),
			kind: (frontmatter.data.kind as ResourceKind) || 'other',
			title: frontmatter.data.title ? String(frontmatter.data.title) : undefined,
			shortSummary: frontmatter.data.shortSummary ? String(frontmatter.data.shortSummary) : undefined,
			fullSummary: frontmatter.data.fullSummary ? String(frontmatter.data.fullSummary) : undefined,
			lastUpdatedTimestamp: Number(frontmatter.data.lastUpdatedTimestamp ?? Date.now()),
			mentionedInConversations: Array.isArray(frontmatter.data.mentionedInConversations)
				? frontmatter.data.mentionedInConversations.map(String)
				: [],
			mentionedInProjects: Array.isArray(frontmatter.data.mentionedInProjects)
				? frontmatter.data.mentionedInProjects.map(String)
				: [],
			mentionedInFiles: Array.isArray(frontmatter.data.mentionedInFiles)
				? frontmatter.data.mentionedInFiles.map(String)
				: [],
		};

		return {
			meta,
			content: frontmatter.body,
			file,
		};
	}

	/**
	 * Write file to vault
	 */
	private async writeFile(file: TFile | null, path: string, content: string): Promise<TFile> {
		if (file) {
			await this.app.vault.modify(file, content);
			return file;
		}
		return this.app.vault.create(path, content);
	}

	/**
	 * Get all resource summaries
	 */
	async listResourceSummaries(): Promise<ParsedResourceSummaryFile[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.resourcesFolder);
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const results: ParsedResourceSummaryFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.name.startsWith('Resource-') && child.extension === 'md') {
				const resourceId = child.basename.replace(/^Resource-/, '');
				const parsed = await this.readResourceSummary(resourceId);
				if (parsed) {
					results.push(parsed);
				}
			}
		}
		return results;
	}
}

