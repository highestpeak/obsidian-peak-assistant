/**
 * Link nodes that have no edges to concept/tag nodes by embedding similarity, or to a shared "mess" node.
 * Uses optional title->embedding cache to avoid repeated embedding calls.
 */
import type { AISearchGraph, AISearchNode, AISearchEdge } from '../../AISearchAgent';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { TTLCache } from '@/core/utils/ttl-cache';

const DEFAULT_SIMILARITY_THRESHOLD = 0.65;
const DEFAULT_MAX_EDGES_PER_NODE = 4;
const DEFAULT_MAX_TOTAL_EDGES = 40;
const EMBEDDING_CACHE_TTL_MS = 15 * 60 * 1000;

/** Default cache for title->embedding when options do not provide one. */
const defaultEmbeddingCache = new TTLCache<number[]>(EMBEDDING_CACHE_TTL_MS);

/** Concept/tag node types we link *to* (targets). */
const CONCEPT_TAG_TYPES = new Set(['concept', 'tag']);

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Resolve embeddings for titles: use cache where possible, batch-fetch the rest, then fill cache.
 */
async function getEmbeddingsCached(
    titles: string[],
    cache: TTLCache<number[]>,
    generateEmbeddings: (texts: string[]) => Promise<number[][]>
): Promise<number[][]> {
    const result: number[][] = [];
    const toFetch: string[] = [];
    const toFetchIndex: number[] = [];

    for (let i = 0; i < titles.length; i++) {
        const key = titles[i];
        const cached = cache.get(key);
        if (cached !== undefined) {
            result[i] = cached;
        } else {
            toFetch.push(key);
            toFetchIndex.push(i);
        }
    }

    if (toFetch.length > 0) {
        let vectors: number[][];
        try {
            vectors = await generateEmbeddings(toFetch);
        } catch (e) {
            throw e;
        }
        if (vectors.length !== toFetch.length) throw new Error('embedding length mismatch');
        for (let k = 0; k < toFetch.length; k++) {
            const key = toFetch[k];
            const vec = vectors[k];
            cache.set(key, vec);
            result[toFetchIndex[k]] = vec;
        }
    }

    return result;
}

export type ConceptLinkOptions = {
    generateEmbeddings: (texts: string[]) => Promise<number[][]>;
    similarityThreshold?: number;
    maxEdgesPerNode?: number;
    maxTotalEdges?: number;
    /** Optional cache for title -> embedding vector. If not provided, a default TTL cache is used. */
    embeddingCache?: TTLCache<number[]>;
};

/** Stable id for the single "mess" node used when a no-edge node has no similar concept/tag. */
const MESS_NODE_ID_PREFIX = 'node-mess-';

/**
 * Ensure a single mess node exists in graph; create and push if missing.
 * Returns id and the node when it was just created (so caller can include it in patch).
 */
function ensureMessNode(graph: AISearchGraph): { id: string; newNode: AISearchNode | null } {
    const existing = graph.nodes.find((n) => n.type === 'mess' && n.id.startsWith(MESS_NODE_ID_PREFIX));
    if (existing) return { id: existing.id, newNode: null };
    const id = `${MESS_NODE_ID_PREFIX}${generateUuidWithoutHyphens()}`;
    const newNode: AISearchNode = {
        id,
        type: 'mess',
        title: 'misc',
        attributes: {},
    };
    graph.nodes.push(newNode);
    return { id, newNode };
}

export type ConceptLinkResult = {
    newEdges: AISearchEdge[];
    newNodes: AISearchNode[];
};

/**
 * Link nodes that currently have no edges (and are not concept/tag) to concept/tag nodes by similarity,
 * or to a shared mess node when no concept/tag is similar enough. Mutates graph when adding the mess node.
 * Returns new edges and any new nodes (e.g. mess); caller should push to graph.edges / graph.nodes and patch.
 */
export async function addConceptLinksBySimilarity(
    graph: AISearchGraph,
    options: ConceptLinkOptions
): Promise<ConceptLinkResult> {
    const {
        similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
        maxEdgesPerNode = DEFAULT_MAX_EDGES_PER_NODE,
        maxTotalEdges = DEFAULT_MAX_TOTAL_EDGES,
        embeddingCache = defaultEmbeddingCache,
    } = options;

    const conceptTagNodes = graph.nodes.filter((n) =>
        CONCEPT_TAG_TYPES.has(n.type?.toLowerCase?.() ?? '')
    ) as AISearchNode[];

    const nodeIdsWithEdges = new Set<string>();
    for (const e of graph.edges) {
        nodeIdsWithEdges.add(e.source);
        nodeIdsWithEdges.add(e.target);
    }

    const noEdgeNodes = graph.nodes.filter(
        (n) =>
            !CONCEPT_TAG_TYPES.has(n.type?.toLowerCase?.() ?? '') &&
            !nodeIdsWithEdges.has(n.id)
    ) as AISearchNode[];

    if (noEdgeNodes.length === 0) return { newEdges: [], newNodes: [] };

    const edgeType = 'semantic';
    const existingKeys = new Set(
        graph.edges.map((e) => `${e.source}\t${e.type}\t${e.target}`)
    );

    const noEdgeTitles = noEdgeNodes.map((n) => (n.title ?? n.id ?? '').trim() || n.id);
    const conceptTagTitles = conceptTagNodes.map((n) => (n.title ?? n.id ?? '').trim() || n.id);

    let noEdgeEmbeddings: number[][];
    let conceptTagEmbeddings: number[][];
    try {
        [noEdgeEmbeddings, conceptTagEmbeddings] = await Promise.all([
            getEmbeddingsCached(noEdgeTitles, embeddingCache, options.generateEmbeddings),
            conceptTagTitles.length > 0
                ? getEmbeddingsCached(conceptTagTitles, embeddingCache, options.generateEmbeddings)
                : Promise.resolve([]),
        ]);
    } catch (e) {
        console.warn('[conceptLinkBySimilarity] Embedding failed, skipping.', e);
        return { newEdges: [], newNodes: [] };
    }

    if (noEdgeEmbeddings.length !== noEdgeNodes.length) return { newEdges: [], newNodes: [] };
    if (conceptTagNodes.length > 0 && conceptTagEmbeddings.length !== conceptTagNodes.length)
        return { newEdges: [], newNodes: [] };

    const newEdges: AISearchEdge[] = [];
    const newNodes: AISearchNode[] = [];
    let messNodeId: string | null = null;

    for (let i = 0; i < noEdgeNodes.length; i++) {
        if (newEdges.length >= maxTotalEdges) break;

        const node = noEdgeNodes[i];
        const vec = noEdgeEmbeddings[i];
        const added: number[] = [];

        if (conceptTagNodes.length > 0) {
            const candidates: { j: number; sim: number }[] = [];
            for (let j = 0; j < conceptTagNodes.length; j++) {
                const sim = cosineSimilarity(vec, conceptTagEmbeddings[j]);
                if (sim >= similarityThreshold) candidates.push({ j, sim });
            }
            candidates.sort((a, b) => b.sim - a.sim);

            for (const { j, sim } of candidates) {
                if (added.length >= maxEdgesPerNode) break;
                const targetId = conceptTagNodes[j].id;
                const key = `${node.id}\t${edgeType}\t${targetId}`;
                if (existingKeys.has(key)) continue;
                existingKeys.add(key);
                added.push(j);
                newEdges.push({
                    id: `edge-sim-${generateUuidWithoutHyphens()}`,
                    source: node.id,
                    target: targetId,
                    type: edgeType,
                    attributes: { weight: Math.round(sim * 100) / 100 },
                });
            }
        }

        if (added.length === 0) {
            const mess = ensureMessNode(graph);
            messNodeId = mess.id;
            if (mess.newNode) newNodes.push(mess.newNode);
            const key = `${node.id}\t${edgeType}\t${messNodeId}`;
            if (!existingKeys.has(key)) {
                existingKeys.add(key);
                newEdges.push({
                    id: `edge-sim-${generateUuidWithoutHyphens()}`,
                    source: node.id,
                    target: messNodeId,
                    type: edgeType,
                    attributes: { weight: 0 },
                });
            }
        }
    }

    return { newEdges, newNodes };
}
