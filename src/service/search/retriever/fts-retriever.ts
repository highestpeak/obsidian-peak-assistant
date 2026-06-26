import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { normalizeTextForFts } from '@/core/utils/segmenter';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { DEFAULT_SEARCH_TOP_K, SEARCH_SCORING_DIVERSITY_BOOST_CONTENT } from '@/core/constant';

const FTS_CHUNK_DECAY = 0.5;
const FTS_SEARCH_LIMIT_MULTIPLIER = 3;

/**
 * Batch-normalize BM25 scores from SQLite FTS5.
 * BM25 values from SQLite are negative (more negative = better match).
 * Maps: most negative → 1.0, least negative → 0.0.
 */
export function normalizeBm25Scores(bm25Values: number[]): number[] {
    if (bm25Values.length === 0) return [];
    if (bm25Values.length === 1) return [1.0];

    const min = Math.min(...bm25Values); // most negative = best
    const max = Math.max(...bm25Values); // least negative = worst
    const range = max - min;

    if (range === 0) return bm25Values.map(() => 1.0);

    // Invert: most negative (min) maps to 1.0, least negative (max) maps to 0.0
    return bm25Values.map(v => (max - v) / range);
}

/**
 * Apply exponential chunk decay for multi-chunk documents.
 * Groups chunks by path, sorts by score desc, applies decay^index, sums into one entry per doc.
 * Keeps the best chunk's content and other fields.
 */
export function applyChunkDecay<T extends { path: string; score: number; content: string }>(
    chunks: T[],
    decay: number = 0.5,
): T[] {
    if (chunks.length === 0) return [];

    // Group by path
    const groups = new Map<string, T[]>();
    for (const chunk of chunks) {
        const group = groups.get(chunk.path);
        if (group) {
            group.push(chunk);
        } else {
            groups.set(chunk.path, [chunk]);
        }
    }

    const results: T[] = [];
    for (const [, group] of groups) {
        // Sort by score descending
        group.sort((a, b) => b.score - a.score);

        // Apply decay: score_i * decay^i, sum all
        let combinedScore = 0;
        for (let i = 0; i < group.length; i++) {
            combinedScore += group[i].score * Math.pow(decay, i);
        }

        // Use best chunk as base, override score
        results.push({ ...group[0], score: combinedScore });
    }

    // Sort results by combined score descending
    results.sort((a, b) => b.score - a.score);
    return results;
}

/**
 * Build FTS5 query string from QueryPlan.
 * - terms → each as `term*` (prefix match), joined with OR
 * - phrases → `"phrase text"` (FTS5 phrase syntax)
 * - excludes → `NOT excludeterm`
 */
function buildFtsQueryFromPlan(plan: QueryPlan): string {
    const parts: string[] = [];

    // Terms as prefix matches, joined with OR
    if (plan.terms.length > 0) {
        const termParts = plan.terms.map(t => {
            const normalized = normalizeTextForFts(t.text);
            if (!normalized) return null;
            return `${normalized}*`;
        }).filter((p): p is string => p !== null);

        if (termParts.length > 0) {
            parts.push(termParts.join(' OR '));
        }
    }

    // Phrases
    for (const phrase of plan.phrases) {
        const normalized = normalizeTextForFts(phrase);
        if (normalized) {
            parts.push(`"${normalized.replace(/"/g, '""')}"`);
        }
    }

    // Excludes
    for (const exclude of plan.excludes) {
        const normalized = normalizeTextForFts(exclude);
        if (normalized) {
            parts.push(`NOT ${normalized}`);
        }
    }

    return parts.join(' ');
}

export class FtsRetriever implements SearchRetriever {
    readonly name = 'fts';

    shouldActivate(plan: QueryPlan): boolean {
        return plan.terms.length > 0 || plan.phrases.length > 0;
    }

    async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
        const ftsQuery = buildFtsQueryFromPlan(plan);
        if (!ftsQuery.trim()) return [];

        const topK = DEFAULT_SEARCH_TOP_K;
        const searchLimit = Math.min(topK * FTS_SEARCH_LIMIT_MULTIPLIER, 150);

        const docChunkRepo = sqliteStoreManager.getDocChunkRepo('vault');
        const rows = docChunkRepo.searchFts(ftsQuery, searchLimit);
        if (!rows.length) return [];

        // Batch-normalize BM25 scores
        const bm25Values = rows.map(r => Number(r.bm25 ?? 0));
        const normalizedScores = normalizeBm25Scores(bm25Values);

        // Apply diversity boost: score by how many distinct terms appear in content
        const termTexts = plan.terms.map(t => normalizeTextForFts(t.text).toLowerCase()).filter(Boolean);

        const chunks = rows.map((r, i) => {
            let score = normalizedScores[i];

            // Diversity boost: reward chunks matching more distinct terms
            if (termTexts.length > 0) {
                const normalizedContent = (r.content ?? '').toLowerCase();
                const matchedCount = termTexts.filter(t => normalizedContent.includes(t)).length;
                const diversityRatio = matchedCount / termTexts.length;
                const diversityBoost = 1 + diversityRatio * SEARCH_SCORING_DIVERSITY_BOOST_CONTENT;
                score *= diversityBoost;
            }

            return {
                path: r.path,
                docId: r.docId,
                score,
                title: r.title ?? undefined,
                content: r.content,
                matchType: 'exact' as const,
                source: 'fts',
                chunkId: r.chunkId,
            };
        });

        // Apply chunk decay to merge multi-chunk documents
        const decayed = applyChunkDecay(chunks, FTS_CHUNK_DECAY);

        return decayed.slice(0, topK).map(c => ({
            path: c.path,
            docId: c.docId,
            score: c.score,
            title: c.title,
            content: c.content,
            matchType: c.matchType,
            source: c.source,
        }));
    }
}
