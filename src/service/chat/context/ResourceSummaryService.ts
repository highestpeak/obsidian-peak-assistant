import type { AppHandle } from '@/core/ports/AppHandle';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';
import { stringify as stringifyYaml } from 'yaml';
import { buildFrontmatter, codeBlock } from '@/core/utils/markdown-utils';
import type { ChatResourceRef, ResourceSummaryMeta, ParsedResourceSummaryFile } from '../types';
import type { ResourceKind } from '@/core/document/types';
import { parseFrontmatter } from '@/core/utils/markdown-utils';
import { normalizeVaultPath } from '@/core/utils/path-utils';
import { ensureFolderRecursive, getFileRef, getFolderRef, isFile, writeVaultFile } from '@/core/storage/vault/vault-ops';
import { ResourceKindDetector } from '@/core/document/resource/helper/ResourceKindDetector';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { hashString } from '@/core/utils/hash-utils';

/**
 * Service for managing resource summary notes.
 *
 * T11R Phase 2: `app` typed as {@link AppHandle} (neutral); vault ops via
 * the service-internal duck-typed helpers in `@/service/internal/vault-ops`
 * so this module no longer imports from `obsidian`.
 */
export class ResourceSummaryService {
	private readonly resourcesFolder: string;
	private readonly kindDetector: ResourceKindDetector;

	constructor(
		private readonly app: AppHandle,
		rootFolder: string,
		resourcesSummaryFolderName: string
	) {
		this.resourcesFolder = normalizeVaultPath(`${resourcesSummaryFolderName}`);
		this.kindDetector = new ResourceKindDetector(DocumentLoaderManager.getInstance().getVaultReader());
	}

	/**
	 * Initialize resources folder
	 */
	async init(): Promise<void> {
		await ensureFolderRecursive(this.resourcesFolder, this.app);
	}

	createResourceRef(source: string, summaryNotePath?: string): ChatResourceRef {
		const id = this.generateResourceId(source);
		const kind = this.kindDetector.detectResourceKind(source);
		return {
			source,
			id,
			kind,
			summaryNotePath,
		};
	}

	getResourceSummaryPath(resourceId: string): string {
		return normalizeVaultPath(`${this.resourcesFolder}/Resource-${resourceId}.md`);
	}

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
	}): Promise<VaultFileRef> {
		const path = this.getResourceSummaryPath(params.resourceId);
		const existingFile = getFileRef(path, this.app);

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
		return writeVaultFile(existingFile, path, markdown, this.app);
	}

	async readResourceSummary(resourceId: string): Promise<ParsedResourceSummaryFile | null> {
		const path = this.getResourceSummaryPath(resourceId);
		const file = getFileRef(path, this.app);
		if (!file) return null;

		const raw = await this.app.vault.read(file);
		const frontmatter = parseFrontmatter<Record<string, unknown>>(raw);
		if (!frontmatter) return null;

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

	async listResourceSummaries(): Promise<ParsedResourceSummaryFile[]> {
		const folder = getFolderRef(this.resourcesFolder, this.app);
		if (!folder) return [];

		const results: ParsedResourceSummaryFile[] = [];
		const children = (folder as VaultFolderRef & { children?: ReadonlyArray<unknown> }).children ?? [];
		for (const child of children) {
			if (isFile(child)) {
				const f = child as VaultFileRef;
				if (f.name.startsWith('Resource-') && f.extension === 'md') {
					const resourceId = f.basename.replace(/^Resource-/, '');
					const parsed = await this.readResourceSummary(resourceId);
					if (parsed) results.push(parsed);
				}
			}
		}
		return results;
	}

	private generateResourceId(source: string): string {
		return hashString(source, 8);
	}

	private buildResourceSummaryMarkdown(meta: ResourceSummaryMeta): string {
		const frontmatter = buildFrontmatter(meta);
		const sections: string[] = [];

		sections.push('# Original Resource');
		sections.push('## Resource Link');

		if (meta.kind === 'url') {
			sections.push(`[${meta.source}](${meta.source})`);
		} else if (meta.kind === 'tag') {
			sections.push(`Tag: ${meta.source}`);
		} else if (meta.kind === 'folder' || meta.kind === 'markdown') {
			const normalizedPath = meta.source.replace(/^\[\[|\]\]$/g, '');
			sections.push(`[[${normalizedPath}]]`);
		} else {
			if (meta.source.includes('/') && !meta.source.includes('://')) {
				sections.push(`[[${meta.source}]]`);
			} else {
				sections.push(meta.source);
			}
		}

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

		const convLinks = (meta.mentionedInConversations || []).map(id => `- Conversation: ${id}`);
		const projLinks = (meta.mentionedInProjects || []).map(id => `- Project: ${id}`);
		const fileLinks = (meta.mentionedInFiles || []).map(path => `- [[${path}]]`);

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
}
