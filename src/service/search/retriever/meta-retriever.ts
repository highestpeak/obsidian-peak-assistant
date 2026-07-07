import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { normalizeTextForFts, sanitizeFtsBarewords } from '@/core/utils/segmenter';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { normalizeBm25Scores } from './fts-retriever';
import { DEFAULT_SEARCH_TOP_K, SEARCH_SCORING_DIVERSITY_BOOST_META } from '@/core/constant';

const META_SEARCH_LIMIT_MULTIPLIER = 3;

/**
 * Build FTS5 query string for doc_meta_fts from QueryPlan.
 * - terms → each as `term*` (prefix match), joined with OR
 * - phrases → `"phrase text"` (FTS5 phrase syntax)
 * - excludes → `NOT excludeterm`
 * - tag filters → FTS5 column syntax `{tags}: value`
 */
function buildMetaFtsQuery(plan: QueryPlan): string {
    const parts: string[] = [];

    // Terms as prefix matches, joined with OR
    if (plan.terms.length > 0) {
        const termParts = plan.terms.flatMap(t =>
            sanitizeFtsBarewords(normalizeTextForFts(t.text)).map(w => `${w}*`),
        );

        if (termParts.length > 0) {
            parts.push(termParts.join(' OR '));
        }
    }

    // Phrases
    for (const phrase of plan.phrases) {
        const words = sanitizeFtsBarewords(normalizeTextForFts(phrase));
        if (words.length > 0) {
            parts.push(`"${words.join(' ')}"`);
        }
    }

    // Excludes
    for (const exclude of plan.excludes) {
        const words = sanitizeFtsBarewords(normalizeTextForFts(exclude));
        for (const w of words) {
            parts.push(`NOT ${w}`);
        }
    }

    // Tag filters via FTS5 column syntax
    for (const filter of plan.filters) {
        if (filter.field === 'tag') {
            const words = sanitizeFtsBarewords(normalizeTextForFts(filter.value));
            for (const w of words) {
                parts.push(`{tags}: ${w}*`);
            }
        }
    }

    return parts.join(' ');
}

export class MetaRetriever implements SearchRetriever {
    readonly name = 'meta';

    // Always active — meta search covers title/path/tags for any query with terms or phrases
    shouldActivate(plan: QueryPlan): boolean {
        return plan.terms.length > 0 || plan.phrases.length > 0;
    }

    async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
        const ftsQuery = buildMetaFtsQuery(plan);
        if (!ftsQuery.trim()) return [];

        const topK = DEFAULT_SEARCH_TOP_K;
        const searchLimit = Math.min(topK * META_SEARCH_LIMIT_MULTIPLIER, 150);

        const docChunkRepo = sqliteStoreManager.getDocChunkRepo('vault');
        const rows = docChunkRepo.searchMetaFts(ftsQuery, searchLimit);
        if (!rows.length) return [];

        // Batch-normalize BM25 scores
        const bm25Values = rows.map(r => Number(r.bm25 ?? 0));
        const normalizedScores = normalizeBm25Scores(bm25Values);

        // Keyword diversity boost: reward docs matching more distinct terms in title/path
        const termTexts = plan.terms.map(t => normalizeTextForFts(t.text).toLowerCase()).filter(Boolean);

        // Apply ext: filter post-hoc (FTS5 cannot filter by file extension)
        const extFilters = plan.filters
            .filter(f => f.field === 'ext')
            .map(f => f.value.toLowerCase().replace(/^\./, ''));

        const results = rows.map((r, i) => {
            let score = normalizedScores[i];

            // Diversity boost: reward docs matching more distinct terms
            if (termTexts.length > 0) {
                const combinedText = `${(r.title ?? '')} ${r.path}`.toLowerCase();
                const matchedCount = termTexts.filter(t => combinedText.includes(t)).length;
                const diversityRatio = matchedCount / termTexts.length;
                const diversityBoost = 1 + diversityRatio * SEARCH_SCORING_DIVERSITY_BOOST_META;
                score *= diversityBoost;
            }

            return {
                path: r.path,
                docId: r.docId,
                score,
                title: r.title ?? undefined,
                content: r.title ?? r.path,
                matchType: 'meta' as const,
                source: 'meta',
                type: r.docType ?? undefined,
            };
        });

        // Apply ext: post-filter
        const filtered = extFilters.length > 0
            ? results.filter(r => {
                const pathLower = r.path.toLowerCase();
                const dotIdx = pathLower.lastIndexOf('.');
                const ext = dotIdx >= 0 ? pathLower.slice(dotIdx + 1) : '';
                return extFilters.includes(ext);
            })
            : results;

        return filtered
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(r => ({
                path: r.path,
                docId: r.docId,
                score: r.score,
                title: r.title,
                content: r.content,
                matchType: r.matchType,
                source: r.source,
                type: r.type,
            }));
    }
}
