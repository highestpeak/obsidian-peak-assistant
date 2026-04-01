/**
 * Vault folder DFS scan (same exclusions as hub snapshot) for backbone map.
 */

import ignore from 'ignore';
import { TFolder } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { getAIHubSummaryFolder } from '@/app/settings/types';
import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import { IgnoreService } from '@/service/search/IgnoreService';

export type FolderScanRow = { path: string; depth: number; childFolderCount: number };

function normalizeVaultFolderPath(folderPath: unknown): string {
	const raw = folderPath == null ? '' : String(folderPath).trim();
	if (raw === '' || raw === '/') return '';
	return raw.replace(/^\/+|\/+$/g, '');
}

/** Settings-driven prefixes excluded from explore (e.g. autosave). */
export function getBackboneExcludedPrefixes(): string[] {
	const settings = AppContext.getInstance().settings;
	const enabled = settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true;
	if (!enabled) return [];
	const rootFolder = normalizeVaultFolderPath(settings.ai.rootFolder);
	const autoSaveFolder = normalizeVaultFolderPath(settings.search.aiAnalysisAutoSaveFolder);
	return [...new Set([rootFolder, autoSaveFolder].filter(Boolean))];
}

function isPathExcludedByPrefixes(path: string, excludedPathPrefixes: string[]): boolean {
	if (!excludedPathPrefixes.length) return false;
	const p = normalizeVaultFolderPath(path);
	if (p === '') return false;
	const hub = normalizeVaultFolderPath(getAIHubSummaryFolder());
	if (hub && (p === hub || p.startsWith(`${hub}/`))) return false;
	for (const raw of excludedPathPrefixes) {
		const prefix = normalizeVaultFolderPath(raw);
		if (!prefix) continue;
		if (p === prefix) return true;
		if (p.startsWith(`${prefix}/`)) return true;
	}
	return false;
}

function shouldIgnoreFolderForBackbone(path: string): boolean {
	const p = normalizeVaultFolderPath(path);
	const hub = normalizeVaultFolderPath(getAIHubSummaryFolder());
	if (hub && (p === hub || p.startsWith(`${hub}/`))) return false;
	try {
		return IgnoreService.getInstance().shouldIgnore(path);
	} catch {
		const patterns = AppContext.getInstance().settings.search.ignorePatterns ?? [];
		if (!patterns.length) return false;
		const ig = ignore();
		ig.add(patterns);
		const clean = String(path).replace(/\\/g, '/').replace(/^\//, '');
		return ig.ignores(clean);
	}
}

export function visibleChildFolders(folder: TFolder, excludedPathPrefixes: string[]): TFolder[] {
	const subs = folder.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	return subs.filter(
		(s) =>
			!isPathExcludedByPrefixes(s.path, excludedPathPrefixes) && !shouldIgnoreFolderForBackbone(s.path),
	);
}

type SubtreeDepthAgg = { sumDepths: number; count: number; maxDepth: number };

/**
 * DFS over the vault to compute per-folder subtree depth stats (matches hub digest depth rules).
 */
export function buildFolderSubtreeStatsMap(
	root: TFolder,
	excludedPathPrefixes: string[],
): Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }> {
	const map = new Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }>();

	function dfs(folder: TFolder, depth: number): SubtreeDepthAgg {
		const visibleSubs = visibleChildFolders(folder, excludedPathPrefixes);
		let sumDepths = depth;
		let count = 1;
		let maxDepth = depth;
		for (const sub of visibleSubs) {
			const a = dfs(sub, depth + 1);
			sumDepths += a.sumDepths;
			count += a.count;
			maxDepth = Math.max(maxDepth, a.maxDepth);
		}
		map.set(normalizeVaultPath(folder.path), {
			subtreeMaxDepth: maxDepth,
			subtreeAvgDepth: count > 0 ? sumDepths / count : depth,
		});
		return { sumDepths, count, maxDepth };
	}

	const top = root.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	for (const ch of top) {
		dfs(ch, 1);
	}
	return map;
}

function collectFoldersDfsPreorder(
	folder: TFolder,
	depth: number,
	maxDepth: number,
	maxFolders: number,
	excludedPathPrefixes: string[],
	out: FolderScanRow[],
): void {
	if (out.length >= maxFolders) return;
	if (isPathExcludedByPrefixes(folder.path, excludedPathPrefixes)) return;
	if (shouldIgnoreFolderForBackbone(folder.path)) return;

	const visibleSubs = visibleChildFolders(folder, excludedPathPrefixes);
	const childFolderCount = visibleSubs.length;
	out.push({ path: folder.path, depth, childFolderCount });
	if (out.length >= maxFolders) return;
	if (depth >= maxDepth) return;

	for (const sub of visibleSubs) {
		collectFoldersDfsPreorder(sub, depth + 1, maxDepth, maxFolders, excludedPathPrefixes, out);
		if (out.length >= maxFolders) return;
	}
}

/**
 * Depth-first pre-order folder list (paths + depth + child folder count).
 */
export function collectFolderTreeRows(
	root: TFolder,
	maxDepth: number,
	maxFolders: number,
	excludedPathPrefixes: string[],
): FolderScanRow[] {
	const out: FolderScanRow[] = [];
	const top = root.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	for (const ch of top) {
		collectFoldersDfsPreorder(ch, 1, maxDepth, maxFolders, excludedPathPrefixes, out);
		if (out.length >= maxFolders) break;
	}
	return out;
}
