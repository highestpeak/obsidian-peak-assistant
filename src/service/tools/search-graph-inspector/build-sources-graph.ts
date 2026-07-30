import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { getSemanticNeighbors } from "./common";
import type { SearchResultItem } from "@/core/search/searchTypes";
import { normalizeFilePath } from "@/core/utils/file-utils";
import { GraphEdgeType } from "@/core/types/graph";
import {
	projectSourcesGraphEdges,
	type ProjectedSourcesGraphEdge,
	type SourcesGraphCandidateEdge,
} from "./source-graph-direction";

export type SourcesGraph = {
	nodes: { id: string; label: string; type: string; attributes: { path?: string } }[];
	edges: ProjectedSourcesGraphEdge[];
};

const CACHE_MAX_ENTRIES = 5;

/** Cache: key (sorted paths) -> SourcesGraph. Avoids rebuild on view toggle/remount. */
const sourcesGraphCache = new Map<string, SourcesGraph>();

/** Normalize path for comparison. */
function normPath(p: string): string {
	return normalizeFilePath(String(p ?? "").trim()).toLowerCase();
}

/** Stable cache key from sources (sorted normalized paths). */
function getSourcesCacheKey(sources: SearchResultItem[]): string {
	const paths = new Set<string>();
	for (const s of sources) {
		const raw = ((s as any).path ?? (s as any).source ?? "").trim();
		if (raw) paths.add(normalizeFilePath(raw).toLowerCase());
	}
	return [...paths].sort().join("|");
}

/** Sync cache lookup. Returns cached graph if sources match, else null. */
export function getCachedSourcesGraph(sources: SearchResultItem[]): SourcesGraph | null {
	if (!sources.length) return null;
	return sourcesGraphCache.get(getSourcesCacheKey(sources)) ?? null;
}

/**
 * Build graph from sources: nodes from sources, edges discovered via graph-inspector
 * (physical links + semantic links). Results are cached; same sources return cached graph.
 */
export async function buildSourcesGraphWithDiscoveredEdges(
	sources: SearchResultItem[]
): Promise<SourcesGraph | null> {
	if (!sources.length) return null;

	const cacheKey = getSourcesCacheKey(sources);
	const cached = sourcesGraphCache.get(cacheKey);
	if (cached) return cached;

	const pathToDisplayId = new Map<string, string>();
	const pathToSource = new Map<string, SearchResultItem>();
	for (const s of sources) {
		const path = (s as any).path ?? (s as any).source ?? "";
		if (!path) continue;
		const n = normPath(path);
		const displayId = (s as any).id ?? `file:${path}`.replace(/[_\s]+/g, "-");
		pathToDisplayId.set(n, displayId);
		pathToSource.set(n, s);
	}

	const pathSet = new Set<string>();
	for (const s of sources) {
		const raw = ((s as any).path ?? (s as any).source ?? "").trim();
		if (!raw) continue;
		pathSet.add(normalizeFilePath(raw));
	}
	const uniquePaths = [...pathSet];

	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

	const pathToIndexedDoc = await indexedDocumentRepo.getByPaths(uniquePaths);
	const pathToDocId = new Map<string, string>();
	const docIdToDisplayId = new Map<string, string>();
	for (const [path, meta] of pathToIndexedDoc) {
		if (!meta?.id) continue;
		const n = normPath(path);
		const displayId = pathToDisplayId.get(n);
		if (displayId) {
			pathToDocId.set(n, meta.id);
			docIdToDisplayId.set(meta.id, displayId);
		}
	}

	const sourceDocIds = new Set(docIdToDisplayId.keys());

	const nodes: SourcesGraph["nodes"] = sources.map((s) => {
		const path = (s as any).path ?? (s as any).source ?? "";
		const id = (s as any).id ?? `file:${path}`.replace(/[_\s]+/g, "-");
		const label = (s as any).title ?? path?.split("/").pop?.()?.replace(/\.(md|markdown)$/i, "") ?? id;
		return { id, label, type: "file", attributes: path ? { path } : {} };
	});

	const edgeCandidates: SourcesGraphCandidateEdge[] = [];
	const EDGE_LIMIT = 30;
	const referenceTypes = new Set<string>([
		GraphEdgeType.References,
		GraphEdgeType.ReferencesResource,
	]);

	for (const docId of sourceDocIds) {
		const indexedEdges = await mobiusEdgeRepo.getAllEdgesForNode(docId, EDGE_LIMIT);
		const referenceNeighborIds = new Set<string>();
		const knownNeighborIds = new Set<string>();
		for (const edge of indexedEdges) {
			const neighborId = edge.from_node_id === docId ? edge.to_node_id : edge.from_node_id;
			if (!sourceDocIds.has(neighborId)) continue;

			if (referenceTypes.has(edge.type)) {
				referenceNeighborIds.add(neighborId);
				knownNeighborIds.add(neighborId);
				edgeCandidates.push({
					fromNodeId: edge.from_node_id,
					toNodeId: edge.to_node_id,
					kind: "reference",
				});
				continue;
			}
			if (edge.type !== GraphEdgeType.SemanticRelated) continue;
			knownNeighborIds.add(neighborId);
			edgeCandidates.push({
				fromNodeId: edge.from_node_id,
				toNodeId: edge.to_node_id,
				kind: "semantic",
			});
		}

		// Semantic neighbors supplement sparse physical reference neighborhoods.
		if (referenceNeighborIds.size < 5) {
			const physicalPlusExcluded = new Set(knownNeighborIds);
			physicalPlusExcluded.add(docId);
			const semantic = await getSemanticNeighbors(docId, 10, physicalPlusExcluded);
			for (const n of semantic) {
				if (!sourceDocIds.has(n.id)) continue;
				edgeCandidates.push({
					fromNodeId: docId,
					toNodeId: n.id,
					kind: "semantic",
				});
			}
		}
	}

	const edges = projectSourcesGraphEdges(edgeCandidates, docIdToDisplayId);
	const result: SourcesGraph = { nodes, edges };
	if (sourcesGraphCache.size >= CACHE_MAX_ENTRIES) {
		const firstKey = sourcesGraphCache.keys().next().value;
		if (firstKey != null) sourcesGraphCache.delete(firstKey);
	}
	sourcesGraphCache.set(cacheKey, result);
	return result;
}
