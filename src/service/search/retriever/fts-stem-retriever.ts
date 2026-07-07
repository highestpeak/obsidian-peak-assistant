import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { normalizeBm25Scores, applyChunkDecay } from './fts-retriever';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { sanitizeFtsBarewords } from '@/core/utils/segmenter';
import { DEFAULT_SEARCH_TOP_K } from '@/core/constant';

const FTS_STEM_SEARCH_LIMIT = 100;

export class FtsStemRetriever implements SearchRetriever {
    readonly name = 'ftsStem';

    shouldActivate(plan: QueryPlan): boolean {
        return plan.terms.some(t => t.stem !== t.text);
    }

    async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
        const stemTokens = plan.terms
            .filter(t => t.stem !== t.text)
            .flatMap(t => sanitizeFtsBarewords(t.stem).map(w => t.isPrefix ? `${w}*` : w));
        if (stemTokens.length === 0) return [];

        const ftsQuery = stemTokens.join(' OR ');

        const docChunkRepo = sqliteStoreManager.getDocChunkRepo('vault');
        const rows = docChunkRepo.searchFtsStem(ftsQuery, FTS_STEM_SEARCH_LIMIT);
        if (!rows.length) return [];

        const bm25Values = rows.map(r => Number(r.bm25 ?? 0));
        const normalizedScores = normalizeBm25Scores(bm25Values);

        const chunks = rows.map((r, i) => ({
            path: r.path,
            docId: r.docId,
            score: normalizedScores[i],
            content: r.content ?? '',
            matchType: 'stem' as const,
            source: this.name,
            title: r.title ?? undefined,
            chunkId: r.chunkId,
            type: r.docType ?? undefined,
        }));

        const decayed = applyChunkDecay(chunks);

        return decayed.slice(0, DEFAULT_SEARCH_TOP_K).map(c => ({
            path: c.path,
            docId: c.docId,
            chunkId: c.chunkId,
            score: c.score,
            title: c.title,
            content: c.content,
            matchType: c.matchType,
            source: c.source,
            type: c.type,
        }));
    }
}
