import type { App, CachedMetadata, TFile } from 'obsidian';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MobileSearchResult {
	path: string;
	title: string;
	score: number;
	snippet?: string;
	matchType: 'path' | 'tag' | 'content';
}

interface IntuitionMap {
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
	'the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'of',
	'and', 'or', 'for', 'with', 'as', 'by', 'it', 'be',
	'this', 'that',
]);

/** Max files to read content for (tier-3 scoring). */
const CONTENT_READ_LIMIT = 50;

const DEFAULT_SEARCH_LIMIT = 20;

// ---------------------------------------------------------------------------
// Exported scoring helpers (pure functions, easy to test)
// ---------------------------------------------------------------------------

/**
 * Tokenize a query string: split on whitespace/punctuation, lowercase,
 * and remove stopwords.
 */
export function tokenizeQuery(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[\s\p{P}]+/u)
		.filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/**
 * Score a file path against query tokens.
 * Filename match = 3 pts per token, directory match = 1 pt per token.
 */
export function scorePath(filePath: string, tokens: string[]): number {
	const lower = filePath.toLowerCase();
	const lastSlash = lower.lastIndexOf('/');
	const filename = lastSlash >= 0 ? lower.slice(lastSlash + 1) : lower;
	const dirs = lastSlash >= 0 ? lower.slice(0, lastSlash) : '';

	let score = 0;
	for (const t of tokens) {
		if (filename.includes(t)) score += 3;
		else if (dirs.includes(t)) score += 1;
	}
	return score;
}

/**
 * Score content by counting occurrences of each token (case-insensitive).
 */
export function scoreContent(content: string, tokens: string[]): number {
	const lower = content.toLowerCase();
	let score = 0;
	for (const t of tokens) {
		let idx = 0;
		while (true) {
			idx = lower.indexOf(t, idx);
			if (idx === -1) break;
			score++;
			idx += t.length;
		}
	}
	return score;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function scoreMetadata(cache: CachedMetadata | null, tokens: string[]): number {
	if (!cache) return 0;
	let score = 0;

	// Tags (both frontmatter tags and inline tags)
	const tags: string[] = [];
	if (cache.tags) {
		for (const t of cache.tags) tags.push(t.tag.toLowerCase().replace(/^#/, ''));
	}
	if (cache.frontmatter?.tags) {
		const fm = cache.frontmatter.tags;
		const arr: string[] = Array.isArray(fm) ? fm : [fm];
		for (const t of arr) tags.push(String(t).toLowerCase());
	}

	// Aliases
	const aliases: string[] = [];
	if (cache.frontmatter?.aliases) {
		const a = cache.frontmatter.aliases;
		const arr: string[] = Array.isArray(a) ? a : [a];
		for (const al of arr) aliases.push(String(al).toLowerCase());
	}

	for (const token of tokens) {
		for (const tag of tags) {
			if (tag.includes(token)) { score++; break; }
		}
		for (const alias of aliases) {
			if (alias.includes(token)) { score++; break; }
		}
	}

	return score;
}

function extractSnippet(content: string, tokens: string[], maxLen = 160): string | undefined {
	const lower = content.toLowerCase();
	let bestIdx = -1;
	for (const t of tokens) {
		const idx = lower.indexOf(t);
		if (idx !== -1) { bestIdx = idx; break; }
	}
	if (bestIdx === -1) return undefined;
	const start = Math.max(0, bestIdx - 40);
	const end = Math.min(content.length, start + maxLen);
	let snippet = content.slice(start, end).replace(/\n/g, ' ');
	if (start > 0) snippet = '...' + snippet;
	if (end < content.length) snippet = snippet + '...';
	return snippet;
}

// ---------------------------------------------------------------------------
// MobileSearchService
// ---------------------------------------------------------------------------

export class MobileSearchService {
	private app: App;
	private intuitionMap: IntuitionMap | null = null;
	private fileCache: TFile[] | null = null;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Load the vault intuition map (optional knowledge graph summary).
	 * Silently ignores missing/invalid files.
	 */
	async loadIntuitionMap(): Promise<void> {
		const path = '.obsidian/plugins/obsidian-peak-assistant/data/vault-intuition.json';
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file && 'stat' in file) {
				const raw = await this.app.vault.cachedRead(file as TFile);
				this.intuitionMap = JSON.parse(raw) as IntuitionMap;
			}
		} catch {
			// Intuition map is optional — continue without it.
			this.intuitionMap = null;
		}
	}

	/**
	 * Search the vault using a tiered path/tag/content strategy.
	 */
	async search(query: string, limit: number = DEFAULT_SEARCH_LIMIT): Promise<MobileSearchResult[]> {
		const tokens = tokenizeQuery(query);
		if (tokens.length === 0) return [];

		const allFiles = this.getAllMarkdownFiles();

		// --- Tier 1: Path/title scoring (all files) ---
		interface Candidate {
			file: TFile;
			pathScore: number;
			tagScore: number;
			contentScore: number;
		}

		const candidates: Candidate[] = allFiles.map((file) => ({
			file,
			pathScore: scorePath(file.path, tokens),
			tagScore: 0,
			contentScore: 0,
		}));

		// --- Tier 2: Tag/frontmatter scoring (all files) ---
		for (const c of candidates) {
			const cache = this.app.metadataCache.getFileCache(c.file);
			c.tagScore = scoreMetadata(cache, tokens);
		}

		// Sort by preliminary score desc to pick top N for content reading
		candidates.sort(
			(a, b) =>
				(b.pathScore * 10 + b.tagScore * 5) -
				(a.pathScore * 10 + a.tagScore * 5),
		);

		// --- Tier 3: Content scoring (top N candidates) ---
		const contentCandidates = candidates.slice(0, CONTENT_READ_LIMIT);
		await Promise.all(
			contentCandidates.map(async (c) => {
				try {
					const content = await this.app.vault.cachedRead(c.file);
					c.contentScore = scoreContent(content, tokens);
				} catch {
					// Skip unreadable files
				}
			}),
		);

		// Also read content for any file with zero preliminary score that
		// might still match on content. We already limited to top N above,
		// so this is bounded.

		// Final scoring and sorting
		const scored = candidates
			.map((c) => {
				const totalScore = c.pathScore * 10 + c.tagScore * 5 + c.contentScore;
				if (totalScore === 0) return null;

				const matchType: MobileSearchResult['matchType'] =
					c.pathScore > 0 ? 'path' : c.tagScore > 0 ? 'tag' : 'content';

				return {
					file: c.file,
					result: {
						path: c.file.path,
						title: c.file.basename,
						score: totalScore,
						matchType,
					} as MobileSearchResult,
					contentScore: c.contentScore,
				};
			})
			.filter((x): x is NonNullable<typeof x> => x !== null);

		scored.sort((a, b) => b.result.score - a.result.score);

		// Extract snippets for top results that had content matches
		const topResults = scored.slice(0, limit);
		await Promise.all(
			topResults.map(async (item) => {
				if (item.contentScore > 0) {
					try {
						const content = await this.app.vault.cachedRead(item.file);
						item.result.snippet = extractSnippet(content, tokens);
					} catch {
						// ignore
					}
				}
			}),
		);

		return topResults.map((x) => x.result);
	}

	/**
	 * Read file content by path.
	 */
	async readFileContent(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !('stat' in file)) {
			throw new Error(`File not found: ${filePath}`);
		}
		return this.app.vault.cachedRead(file as TFile);
	}

	/**
	 * Get recently modified files.
	 */
	getRecentFiles(limit: number = 10): TFile[] {
		const files = this.getAllMarkdownFiles();
		return files
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, limit);
	}

	/**
	 * Invalidate the internal file list cache.
	 */
	invalidateCache(): void {
		this.fileCache = null;
	}

	// -----------------------------------------------------------------------
	// Private
	// -----------------------------------------------------------------------

	private getAllMarkdownFiles(): TFile[] {
		if (!this.fileCache) {
			this.fileCache = this.app.vault.getMarkdownFiles();
		}
		return this.fileCache;
	}
}
