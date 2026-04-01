/**
 * Ranks topic/keyword tags for backbone tree display using TF × folder-IDF × root-IDF × type priors.
 * Suppresses vault-wide "noise" tags (todo, mess, …) without a manual blocklist.
 */

import { normalizeVaultPath } from '@/core/utils/vault-path-utils';

/** Tag category for scoring priors (functional tags are usually workflow noise). */
export type TagRankCategory = 'topic' | 'keyword' | 'functional';

const TYPE_PRIOR: Record<TagRankCategory, number> = {
	topic: 1,
	keyword: 0.82,
	functional: 0.22,
};

/** Normalized labels that are workflow / state, not thematic (always stripped from tree columns). */
const STATIC_ROW_NOISE: ReadonlySet<string> = new Set([
	'todo',
	'todolist',
	'todo-list',
	'mess',
	'messy',
	'waiting',
	'pending',
	'later',
	'done',
	'doing',
	'inbox',
	'index',
	'archive',
	'draft',
	'wip',
]);

/** Hide tags that appear on direct files in at least this fraction of scanned folders. */
const MAX_FOLDER_COVERAGE_FOR_ROW = 0.1;

function normalizeTagKey(tag: string): string {
	return tag.trim().toLowerCase();
}

function folderDfForTag(tag: string, stats: TagGlobalStats): number {
	const d = stats.tagFolderDf.get(tag);
	if (d !== undefined) return d;
	const k = normalizeTagKey(tag);
	for (const [t, df] of stats.tagFolderDf) {
		if (normalizeTagKey(t) === k) return df;
	}
	return 0;
}

/**
 * Tags removed from per-folder kw/topics columns; listed separately in the backbone markdown legend.
 */
export function shouldHideTagFromFolderRows(tag: string, stats: TagGlobalStats): boolean {
	if (!tag.trim()) return false;
	if (STATIC_ROW_NOISE.has(normalizeTagKey(tag))) return true;
	const N = stats.folderCount;
	if (N <= 0) return false;
	const df = folderDfForTag(tag, stats);
	if (df <= 0) return false;
	return df / N >= MAX_FOLDER_COVERAGE_FOR_ROW;
}

/**
 * One-line legend entries: hidden tags with folder-DF, most frequent first.
 */
export function buildVaultNoiseTagLegend(stats: TagGlobalStats, maxEntries = 80): string[] {
	if (stats.folderCount <= 0) return [];
	const items: Array<{ tag: string; df: number }> = [];
	const seen = new Set<string>();
	for (const [tag, df] of stats.tagFolderDf) {
		if (df <= 0) continue;
		if (!shouldHideTagFromFolderRows(tag, stats)) continue;
		const k = normalizeTagKey(tag);
		if (seen.has(k)) continue;
		seen.add(k);
		items.push({ tag, df });
	}
	items.sort((a, b) => b.df - a.df);
	return items.slice(0, maxEntries).map(({ tag, df }) => `${tag} (${df} folders)`);
}

/** Global presence stats over scanned folders (direct files only). */
export type TagGlobalStats = {
	/** Number of scanned folder rows (denominator for folder coverage). */
	folderCount: number;
	/** Distinct first path segments among scanned folders. */
	rootBucketCount: number;
	/** Tag label -> number of folders where it appears on at least one direct file. */
	tagFolderDf: Map<string, number>;
	/** Tag label -> number of distinct first-path buckets where it appears. */
	tagRootDf: Map<string, number>;
};

/** First path segment after normalization (vault "area" bucket). */
export function firstVaultPathSegment(path: string): string {
	const n = normalizeVaultPath(path);
	const parts = n.split('/').filter(Boolean);
	return parts[0] ?? '';
}

function smoothIdf(df: number, n: number): number {
	if (n <= 0) return 1;
	return Math.log((n + 1) / (df + 1)) + 1;
}

/**
 * Computes folder/root document frequency for tags from direct-file tag counts per folder.
 */
export function buildTagGlobalStats(
	folders: Array<{
		folderPath: string;
		topicTagCounts: Map<string, number>;
		keywordTagCounts: Map<string, number>;
		functionalTagCounts: Map<string, number>;
	}>,
): TagGlobalStats {
	const tagFolderSets = new Map<string, Set<string>>();
	const tagRootSets = new Map<string, Set<string>>();
	const allRoots = new Set<string>();

	for (const f of folders) {
		const root = firstVaultPathSegment(f.folderPath);
		allRoots.add(root || '_');

		const seenInFolder = new Set<string>();
		const bump = (tag: string) => {
			if (!tag || seenInFolder.has(tag)) return;
			seenInFolder.add(tag);
			let fs = tagFolderSets.get(tag);
			if (!fs) {
				fs = new Set();
				tagFolderSets.set(tag, fs);
			}
			fs.add(f.folderPath);
			let rs = tagRootSets.get(tag);
			if (!rs) {
				rs = new Set();
				tagRootSets.set(tag, rs);
			}
			rs.add(root || '_');
		};

		for (const t of f.topicTagCounts.keys()) {
			if ((f.topicTagCounts.get(t) ?? 0) > 0) bump(t);
		}
		for (const t of f.keywordTagCounts.keys()) {
			if ((f.keywordTagCounts.get(t) ?? 0) > 0) bump(t);
		}
		for (const t of f.functionalTagCounts.keys()) {
			if ((f.functionalTagCounts.get(t) ?? 0) > 0) bump(t);
		}
	}

	const N = folders.length;
	const R = Math.max(1, allRoots.size);
	const tagFolderDf = new Map<string, number>();
	const tagRootDf = new Map<string, number>();
	for (const [tag, set] of tagFolderSets) {
		tagFolderDf.set(tag, set.size);
	}
	for (const [tag, set] of tagRootSets) {
		tagRootDf.set(tag, set.size);
	}

	return {
		folderCount: N,
		rootBucketCount: R,
		tagFolderDf,
		tagRootDf,
	};
}

function rootDfForTag(tag: string, stats: TagGlobalStats): number {
	const d = stats.tagRootDf.get(tag);
	if (d !== undefined) return d;
	const k = normalizeTagKey(tag);
	for (const [t, df] of stats.tagRootDf) {
		if (normalizeTagKey(t) === k) return df;
	}
	return 0;
}

function scoreTag(tf: number, tag: string, category: TagRankCategory, stats: TagGlobalStats): number {
	if (tf <= 0) return 0;
	const df = folderDfForTag(tag, stats);
	const r = rootDfForTag(tag, stats);
	const idfFolder = smoothIdf(df, stats.folderCount);
	const idfRoot = smoothIdf(r, stats.rootBucketCount);
	const prior = TYPE_PRIOR[category];
	return tf * idfFolder * idfRoot * prior;
}

/**
 * Ranks topic tags by display score; returns top `limit` labels.
 */
export function rankTopicTagsForDisplay(
	topicTagCounts: Map<string, number>,
	stats: TagGlobalStats,
	limit: number,
): string[] {
	return rankMapByScore(topicTagCounts, 'topic', stats, limit, shouldHideTagFromFolderRows);
}

/**
 * Merges keyword + functional counts, ranks by score, returns top `limit` labels.
 */
export function rankKeywordTagsForDisplay(
	keywordTagCounts: Map<string, number>,
	functionalTagCounts: Map<string, number>,
	stats: TagGlobalStats,
	limit: number,
): string[] {
	const entries: Array<{ tag: string; tf: number; category: TagRankCategory }> = [];
	const seen = new Set<string>();
	for (const [tag, c] of keywordTagCounts) {
		if (c <= 0) continue;
		const fc = functionalTagCounts.get(tag) ?? 0;
		const tf = c + fc;
		const category: TagRankCategory = 'keyword';
		entries.push({ tag, tf, category });
		seen.add(tag);
	}
	for (const [tag, c] of functionalTagCounts) {
		if (c <= 0 || seen.has(tag)) continue;
		entries.push({ tag, tf: c, category: 'functional' });
	}
	entries.sort((a, b) => {
		const sa = scoreTag(a.tf, a.tag, a.category, stats);
		const sb = scoreTag(b.tf, b.tag, b.category, stats);
		if (sb !== sa) return sb - sa;
		return a.tag.localeCompare(b.tag);
	});
	const out: string[] = [];
	for (const e of entries) {
		if (shouldHideTagFromFolderRows(e.tag, stats)) continue;
		out.push(e.tag);
		if (out.length >= Math.max(0, limit)) break;
	}
	return out;
}

function rankMapByScore(
	counts: Map<string, number>,
	category: TagRankCategory,
	stats: TagGlobalStats,
	limit: number,
	exclude: (tag: string, stats: TagGlobalStats) => boolean,
): string[] {
	const scored = [...counts.entries()]
		.filter(([, c]) => c > 0)
		.map(([tag, tf]) => ({
			tag,
			s: scoreTag(tf, tag, category, stats),
		}))
		.sort((a, b) => {
			if (b.s !== a.s) return b.s - a.s;
			return a.tag.localeCompare(b.tag);
		});
	const out: string[] = [];
	for (const x of scored) {
		if (exclude(x.tag, stats)) continue;
		out.push(x.tag);
		if (out.length >= Math.max(0, limit)) break;
	}
	return out;
}

/**
 * Builds topic/keyword maps restricted to picked names (original TF preserved) for weighted % line.
 */
export function pickCountsForWeightedLine(
	full: Map<string, number>,
	pickedNames: readonly string[],
): Map<string, number> {
	const m = new Map<string, number>();
	for (const name of pickedNames) {
		const c = full.get(name);
		if (c !== undefined && c > 0) m.set(name, c);
	}
	return m;
}

/** Merges keyword + functional counts for picked labels (weighted line uses combined mass). */
export function mergeKeywordFunctionalForPicked(
	keywordFull: Map<string, number>,
	functionalFull: Map<string, number>,
	pickedNames: readonly string[],
): Map<string, number> {
	const m = new Map<string, number>();
	for (const name of pickedNames) {
		const k = keywordFull.get(name) ?? 0;
		const f = functionalFull.get(name) ?? 0;
		if (k + f > 0) m.set(name, k + f);
	}
	return m;
}

/** Empty stats for no-folder fallback. */
export function emptyTagGlobalStats(): TagGlobalStats {
	return {
		folderCount: 0,
		rootBucketCount: 1,
		tagFolderDf: new Map(),
		tagRootDf: new Map(),
	};
}
