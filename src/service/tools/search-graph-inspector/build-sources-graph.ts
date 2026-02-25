import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { getSemanticNeighbors } from "./common";
import { getPathFromNode } from "./common";
import { getAiAnalysisExcludeContext } from "./ai-analysis-exclude";
import type { SearchResultItem } from "@/service/search/types";
import { normalizeFilePath } from "@/core/utils/file-utils";

export type SourcesGraph = {
	nodes: { id: string; label: string; type: string; attributes: { path?: string } }[];
	edges: { id: string; from_node_id: string; to_node_id: string; kind: string }[];
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

	const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
	const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
	const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();

	const pathToDocMeta = await docMetaRepo.getByPaths(uniquePaths);
	const pathToDocId = new Map<string, string>();
	const docIdToDisplayId = new Map<string, string>();
	for (const [path, meta] of pathToDocMeta) {
		if (!meta?.id) continue;
		const n = normPath(path);
		const displayId = pathToDisplayId.get(n);
		if (displayId) {
			pathToDocId.set(n, meta.id);
			docIdToDisplayId.set(meta.id, displayId);
		}
	}

	const sourceDocIds = new Set(docIdToDisplayId.keys());
	const excludeCtx = await getAiAnalysisExcludeContext();
	const excludedDocIds = excludeCtx?.excludedDocIds ?? new Set<string>();

	const nodes: SourcesGraph["nodes"] = sources.map((s) => {
		const path = (s as any).path ?? (s as any).source ?? "";
		const id = (s as any).id ?? `file:${path}`.replace(/[_\s]+/g, "-");
		const label = (s as any).title ?? path?.split("/").pop?.()?.replace(/\.(md|markdown)$/i, "") ?? id;
		return { id, label, type: "file", attributes: path ? { path } : {} };
	});

	const seenEdges = new Set<string>();
	const edges: SourcesGraph["edges"] = [];
	const EDGE_LIMIT = 30;

	for (const docId of sourceDocIds) {
		if (excludedDocIds.has(docId)) continue;
		const fromDisplayId = docIdToDisplayId.get(docId);
		if (!fromDisplayId) continue;

		// Physical edges
		const physicalEdges = await graphEdgeRepo.getAllEdgesForNode(docId, EDGE_LIMIT);
		const neighborIds = new Set<string>();
		for (const e of physicalEdges) {
			const neighborId = e.from_node_id === docId ? e.to_node_id : e.from_node_id;
			if (excludedDocIds.has(neighborId)) continue;
			neighborIds.add(neighborId);
		}

		// Semantic neighbors (when physical neighbors are few)
		if (neighborIds.size < 5) {
			const physicalPlusExcluded = new Set(neighborIds);
			excludedDocIds.forEach((id) => physicalPlusExcluded.add(id));
			physicalPlusExcluded.add(docId);
			const semantic = await getSemanticNeighbors(docId, 10, physicalPlusExcluded);
			for (const n of semantic) {
				if (sourceDocIds.has(n.id)) neighborIds.add(n.id);
			}
		}

		// Resolve neighbor doc_ids to paths
		const neighborNodes = neighborIds.size > 0
			? await graphNodeRepo.getByIds([...neighborIds])
			: new Map();
		for (const [, node] of neighborNodes) {
			if (node.type !== "document") continue;
			const neighborPath = getPathFromNode(node);
			if (!neighborPath) continue;
			const n = normPath(neighborPath);
			if (!pathToDisplayId.has(n)) continue;
			const toDisplayId = pathToDisplayId.get(n)!;
			if (fromDisplayId === toDisplayId) continue;
			const key = fromDisplayId < toDisplayId ? `${fromDisplayId}|${toDisplayId}` : `${toDisplayId}|${fromDisplayId}`;
			if (seenEdges.has(key)) continue;
			seenEdges.add(key);
			edges.push({
				id: `e-${fromDisplayId}-${toDisplayId}`,
				from_node_id: fromDisplayId,
				to_node_id: toDisplayId,
				kind: "link",
			});
		}
	}

	const result: SourcesGraph = { nodes, edges };
	if (sourcesGraphCache.size >= CACHE_MAX_ENTRIES) {
		const firstKey = sourcesGraphCache.keys().next().value;
		if (firstKey != null) sourcesGraphCache.delete(firstKey);
	}
	sourcesGraphCache.set(cacheKey, result);
	return result;
}
