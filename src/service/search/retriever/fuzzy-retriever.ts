import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { findFuzzyCandidates } from '@/service/search/support/levenshtein';
import { normalizeBm25Scores } from './fts-retriever';
import { DEFAULT_SEARCH_TOP_K } from '@/core/constant';

const CACHE_TTL_MS = 60_000;
const FUZZY_SEARCH_LIMIT_MULTIPLIER = 3;

export interface FuzzyCorrection {
    original: string;
    corrected: string;
}

/**
 * Split titles into lowercase word tokens, keeping tokens ≥ 2 chars.
 * Splits on spaces, hyphens, underscores, slashes, and punctuation.
 * Returns a deduplicated array.
 */
export function buildTitleTokenCache(titleRows: Array<{ title?: string | null }>): string[] {
    const seen = new Set<string>();
    for (const row of titleRows) {
        if (!row.title) continue;
        const tokens = row.title.split(/[\s\-_/.,;:!?()[\]{}"']+/);
        for (const token of tokens) {
            const lower = token.toLowerCase();
            if (lower.length >= 2) {
                seen.add(lower);
            }
        }
    }
    return Array.from(seen);
}

/**
 * For each query term, find the closest fuzzy candidate in the cache.
 * Exact matches are skipped (those are handled by FTS exact search).
 * Returns one FuzzyCorrection per term that has a candidate.
 */
export function findFuzzyTerms(queryTerms: string[], cache: string[]): FuzzyCorrection[] {
    const corrections: FuzzyCorrection[] = [];
    for (const term of queryTerms) {
        const lower = term.toLowerCase();
        const candidates = findFuzzyCandidates(lower, cache);
        if (candidates.length > 0) {
            corrections.push({ original: term, corrected: candidates[0] });
        }
    }
    return corrections;
}

export class FuzzyRetriever implements SearchRetriever {
    readonly name = 'fuzzy';

    private cache: string[] = [];
    private cacheTimestamp = 0;

    // Always active — fuzzy search applies to any query with terms
    shouldActivate(plan: QueryPlan): boolean {
        return plan.terms.length > 0;
    }

    private refreshCacheIfNeeded(): void {
        const now = Date.now();
        if (now - this.cacheTimestamp < CACHE_TTL_MS && this.cache.length > 0) return;

        const docChunkRepo = sqliteStoreManager.getDocChunkRepo('vault');
        const titleRows = docChunkRepo.getAllMetaTitles();
        this.cache = buildTitleTokenCache(titleRows);
        this.cacheTimestamp = now;
    }

    async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
        this.refreshCacheIfNeeded();

        const queryTerms = plan.terms.map(t => t.text.toLowerCase()).filter(Boolean);
        const corrections = findFuzzyTerms(queryTerms, this.cache);
        if (corrections.length === 0) return [];

        // Build FTS query using corrected terms as prefix matches
        const ftsQuery = corrections.map(c => `${c.corrected}*`).join(' OR ');

        const topK = DEFAULT_SEARCH_TOP_K;
        const searchLimit = Math.min(topK * FUZZY_SEARCH_LIMIT_MULTIPLIER, 150);

        const docChunkRepo = sqliteStoreManager.getDocChunkRepo('vault');
        const rows = docChunkRepo.searchMetaFts(ftsQuery, searchLimit);
        if (!rows.length) return [];

        // Batch-normalize BM25 scores
        const bm25Values = rows.map(r => Number(r.bm25 ?? 0));
        const normalizedScores = normalizeBm25Scores(bm25Values);

        // Build correction summary string for the result tag
        const correctionLabel = corrections.map(c => `${c.original}→${c.corrected}`).join(', ');

        return rows.map((r, i) => ({
            path: r.path,
            docId: r.docId,
            score: normalizedScores[i],
            title: r.title ?? undefined,
            content: r.title ?? r.path,
            matchType: 'fuzzy' as const,
            source: 'fuzzy',
            fuzzyCorrection: correctionLabel,
        })).slice(0, topK);
    }
}
