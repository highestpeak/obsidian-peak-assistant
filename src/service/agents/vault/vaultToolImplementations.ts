/**
 * Provider-neutral vault operations shared by Peak Harness tools and tests.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import type { CachedMetadataSnapshot } from '@/core/ports/HostMetadataPort';

type Vault = AppHandle['vault'];
type MetadataCache = AppHandle['metadataCache'];

export interface ListFoldersParams {
	maxDepth?: number;
}

export interface FolderInfo {
	path: string;
	mdCount: number;
}

export interface ListFoldersResult {
	folders: FolderInfo[];
	totalMdFiles: number;
}

export async function listFoldersImpl(
	vault: Vault,
	params: ListFoldersParams,
): Promise<ListFoldersResult> {
	const maxDepth = Math.max(1, Math.min(params.maxDepth ?? 2, 5));
	const files = vault.getMarkdownFiles();
	const folderCounts = new Map<string, number>();

	for (const file of files) {
		const parts = file.path.split('/');
		const limit = Math.min(parts.length - 1, maxDepth);
		for (let depth = 1; depth <= limit; depth++) {
			const folderPath = parts.slice(0, depth).join('/');
			folderCounts.set(folderPath, (folderCounts.get(folderPath) ?? 0) + 1);
		}
	}

	const folders = Array.from(folderCounts.entries())
		.map(([path, mdCount]) => ({ path, mdCount }))
		.sort((left, right) => right.mdCount - left.mdCount);
	return { folders, totalMdFiles: files.length };
}

export interface ReadFolderParams {
	folder: string;
	recursive?: boolean;
}

export interface ReadFolderFileInfo {
	path: string;
	basename: string;
}

export interface ReadFolderResult {
	folder: string;
	files: ReadFolderFileInfo[];
	totalCount: number;
}

export async function readFolderImpl(
	vault: Vault,
	params: ReadFolderParams,
): Promise<ReadFolderResult> {
	const folder = params.folder.replace(/\/+$/, '');
	const recursive = params.recursive ?? true;
	const matches = vault.getMarkdownFiles().filter((file: VaultFileRef) => {
		if (!file.path.startsWith(`${folder}/`) && file.path !== folder) return false;
		if (recursive) return true;
		const remainder = file.path.slice(folder.length + 1);
		return !remainder.includes('/');
	});

	return {
		folder,
		files: matches.map((file: VaultFileRef) => ({
			path: file.path,
			basename: (file as VaultFileRef).basename,
		})),
		totalCount: matches.length,
	};
}

export interface ReadNoteParams {
	path: string;
	maxChars?: number;
}

export interface ReadNoteResult {
	path: string;
	frontmatter: Record<string, unknown>;
	bodyPreview: string;
	wikilinks: string[];
	tags: string[];
	error?: string;
}

export async function readNoteImpl(
	vault: Vault,
	metadataCache: MetadataCache,
	params: ReadNoteParams,
): Promise<ReadNoteResult> {
	const file = vault.getAbstractFileByPath(params.path) as VaultFileRef | null;
	if (!file || !('extension' in file)) {
		return {
			path: params.path,
			frontmatter: {},
			bodyPreview: '',
			wikilinks: [],
			tags: [],
			error: 'not found',
		};
	}

	const content = await vault.cachedRead(file);
	const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
	const cache = metadataCache.getFileCache(file) as CachedMetadataSnapshot | null;
	return {
		path: params.path,
		frontmatter: (cache?.frontmatter ?? {}) as Record<string, unknown>,
		bodyPreview: body.slice(0, params.maxChars ?? 5000),
		wikilinks: (cache?.links ?? []).map((link) => link.link),
		tags: (cache?.tags ?? []).map((tag) => tag.tag),
	};
}

export interface WikilinkExpandParams {
	startPath: string;
	maxSteps?: number;
}

export interface WikilinkExpandResult {
	startPath: string;
	visited: string[];
}

export async function wikilinkExpandImpl(
	vault: Vault,
	metadataCache: MetadataCache,
	params: WikilinkExpandParams,
): Promise<WikilinkExpandResult> {
	const maxSteps = Math.max(1, Math.min(params.maxSteps ?? 2, 4));
	const visited = new Set<string>();
	const queue: Array<{ path: string; depth: number }> = [
		{ path: params.startPath, depth: 0 },
	];

	while (queue.length > 0) {
		const next = queue.shift();
		if (!next || visited.has(next.path)) continue;
		visited.add(next.path);
		if (next.depth >= maxSteps) continue;

		const file = vault.getAbstractFileByPath(next.path) as VaultFileRef | null;
		if (!file) continue;
		const cache = metadataCache.getFileCache(file);
		for (const linkRef of cache?.links ?? []) {
			const destination = metadataCache.getFirstLinkpathDest(linkRef.link, next.path);
			if (!destination || visited.has(destination.path)) continue;
			queue.push({ path: destination.path, depth: next.depth + 1 });
		}
	}

	return { startPath: params.startPath, visited: Array.from(visited) };
}

export interface GrepParams {
	query: string;
	limit?: number;
}

export interface GrepHit {
	path: string;
	snippet: string;
	score: number;
}

export interface GrepResult {
	query: string;
	hits: GrepHit[];
}

export type GrepSearchFn = (
	query: string,
	limit: number,
) => Promise<GrepHit[]>;

export async function grepImpl(
	searchFn: GrepSearchFn,
	params: GrepParams,
): Promise<GrepResult> {
	const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
	return {
		query: params.query,
		hits: await searchFn(params.query, limit),
	};
}

export interface SubmitPlanInput {
	selected_paths: string[];
	rationale: string;
	proposed_outline: string;
	coverage_assessment: string;
	follow_up_questions: string[];
	plan_sections?: Array<{
		id: string;
		title: string;
		content_type: string;
		visual_type: string;
		evidence_paths: string[];
		brief: string;
		weight: number;
		mission_role: string;
	}>;
}

export interface SubmitPlanFeedback {
	approved: boolean;
	adjustedPaths?: string[];
	adjustedOutline?: string;
	message?: string;
}
