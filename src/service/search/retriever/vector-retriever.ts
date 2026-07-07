import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { applyChunkDecay } from './fts-retriever';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { embedText } from '@/service/search/embeddings/embedClient';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { DEFAULT_SEARCH_TOP_K } from '@/core/constant';

const VECTOR_CHUNK_DECAY = 0.5;
const VECTOR_SEARCH_LIMIT_MULTIPLIER = 3;

export class VectorRetriever implements SearchRetriever {
    readonly name = 'vector';

    shouldActivate(plan: QueryPlan): boolean {
        if (plan.retrievers.vector <= 0.1) return false;
        if (!sqliteStoreManager.isVectorSearchEnabled()) return false;

        const registry = ProfileRegistry.getInstance();
        const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
        return !!(embProfile?.embeddingEndpoint && embProfile?.embeddingModel);
    }

    async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
        let embedding: number[];
        try {
            embedding = await embedText(plan.raw);
        } catch (error) {
            console.error('[VectorRetriever] Failed to generate embedding:', error);
            return [];
        }

        const topK = DEFAULT_SEARCH_TOP_K;
        const searchLimit = Math.min(topK * VECTOR_SEARCH_LIMIT_MULTIPLIER, 150);

        const embeddingRepo = sqliteStoreManager.getEmbeddingRepo('vault');
        const docChunkRepo = sqliteStoreManager.getDocChunkRepo('vault');
        const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo('vault');

        const vectorResults = await embeddingRepo.searchSimilarAndGetId(embedding, searchLimit);
        if (!vectorResults.length) return [];

        const scoreByKey = new Map<string, number>();
        for (const result of vectorResults) {
            const key = result.chunk_id ?? result.id;
            scoreByKey.set(key, result.similarity);
        }

        const chunkIds = vectorResults.filter(r => r.chunk_id).map(r => r.chunk_id as string);
        const docOnlyEmb = vectorResults.filter(r => !r.chunk_id);

        const chunkRows = chunkIds.length ? await docChunkRepo.getByChunkIds(chunkIds) : [];

        const docIds = new Set<string>();
        for (const r of chunkRows) docIds.add(r.doc_id);
        for (const r of docOnlyEmb) docIds.add(r.doc_id);

        const metaRows = await indexedDocumentRepo.getByIds(Array.from(docIds));
        const metaById = new Map(metaRows.map(m => [m.id, m]));

        type Chunk = {
            path: string;
            docId?: string;
            chunkId?: string;
            score: number;
            title?: string;
            content: string;
            contentRaw?: string;
            matchType: 'semantic';
            source: string;
            chunkType?: string;
            type?: string;
            lastModified?: number;
        };

        const chunks: Chunk[] = [];

        for (const r of chunkRows) {
            const meta = metaById.get(r.doc_id);
            const path = meta?.path ?? r.doc_id;
            const score = Number(scoreByKey.get(String(r.chunk_id)) ?? 0);

            let title = meta?.title ?? null;
            if (!title && path) {
                const parts = path.split('/');
                const filename = parts[parts.length - 1] || path;
                title = filename.replace(/\.[^/.]+$/, '');
            }

            const rawText = r.content_raw ?? '';
            chunks.push({
                path,
                docId: r.doc_id,
                chunkId: r.chunk_id,
                score,
                title: title ?? undefined,
                content: rawText,
                contentRaw: rawText,
                matchType: 'semantic',
                source: this.name,
                chunkType: r.chunk_type ?? undefined,
                type: meta?.type ?? undefined,
                lastModified: Number(meta?.mtime ?? r.mtime ?? 0),
            });
        }

        for (const r of docOnlyEmb) {
            const meta = metaById.get(r.doc_id);
            const path = meta?.path ?? r.doc_id;
            const score = Number(scoreByKey.get(r.id) ?? 0);
            const summaryText = [meta?.summary, meta?.full_summary].filter(Boolean).join('\n\n') || '';

            let title = meta?.title ?? null;
            if (!title && path) {
                const parts = path.split('/');
                const filename = parts[parts.length - 1] || path;
                title = filename.replace(/\.[^/.]+$/, '');
            }

            chunks.push({
                path,
                docId: r.doc_id,
                score,
                title: title ?? undefined,
                content: summaryText,
                contentRaw: summaryText,
                matchType: 'semantic',
                source: this.name,
                chunkType: r.chunk_type ?? undefined,
                type: meta?.type ?? undefined,
                lastModified: Number(meta?.mtime ?? 0),
            });
        }

        const decayed = applyChunkDecay(chunks, VECTOR_CHUNK_DECAY);

        return decayed.slice(0, topK).map(c => ({
            path: c.path,
            docId: c.docId,
            chunkId: c.chunkId,
            score: c.score,
            title: c.title,
            content: c.content,
            contentRaw: c.contentRaw,
            matchType: c.matchType,
            source: c.source,
            type: c.type,
            lastModified: c.lastModified,
        }));
    }
}
