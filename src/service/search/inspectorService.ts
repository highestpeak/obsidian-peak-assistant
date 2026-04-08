/**
 * Inspector data service: links (physical + semantic), graph traversal, find path, inspect note.
 * Uses sqliteStoreManager and search-graph-inspector helpers.
 * When current file is under ChatFolder, uses ChatDB and resolves outlink targets (vault notes) from VaultDB (cross-DB fallback).
 */

import type { IndexTenant } from '@/core/storage/sqlite/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getPathFromNode, getSemanticNeighbors } from '@/service/tools/search-graph-inspector/common';
import { graphTraversal, GraphVisualizationEdge, GraphVisualizationNode } from '@/service/tools/search-graph-inspector/graph-traversal';
import { hubLocalGraph } from '@/service/tools/search-graph-inspector/hub-local-graph';
import { findPath } from '@/service/tools/search-graph-inspector/find-path';
import { inspectNoteContext } from '@/service/tools/search-graph-inspector/inspect-note-context';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import { SemanticRelatedEdgesReadService } from '@/service/search/index/helper/semanticRelatedEdges';
import { AISearchGraph } from '../agents/shared-types';
import { stableGraphVisualizationEdgeId } from '@/core/utils/id-utils';
import { GraphEdgeType, isIndexedNoteNodeType } from '@/core/po/graph.po';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';

const LINKS_LIMIT = 300;
const SEMANTIC_LIMIT = 20;

export interface InspectorLinkItem {
	path: string;
	label: string;
	/** 'physical' | 'semantic' */
	kind: string;
	/** e.g. "85.2%" for semantic */
	similarity?: string;
	/** True when this path appears in both physical and semantic (kept in physical list). */
	alsoSemantic?: boolean;
	/** Incoming edges count (backlinks) when metadata included */
	backlinks?: number;
	/** Last modified timestamp (ms) when metadata included */
	mtime?: number | null;
	/** Short summary for hover preview when metadata included */
	summary?: string | null;
	/** Tags from indexed document row (frontmatter + hashtags) when metadata included */
	tags?: string[];
	/** True when the graph edge is marked long-range (cross-folder highway). */
	longRange?: boolean;
}

/** Payload shape: physical + semantic arrays (e.g. for copy/paste). */
export interface InspectorLinksPayload {
	physical: InspectorLinkItem[];
	semantic: InspectorLinkItem[];
}

/** Options for getInspectorLinks */
export interface GetInspectorLinksOptions {
	/** Include semantic neighbors */
	includeSemantic: boolean;
	/** Attach backlinks, mtime, summary to each item */
	includeMetadata?: boolean;
}

/**
 * Get physical (graph) and optional semantic links for a note.
 */
export async function getInspectorLinks(
	currentPath: string,
	inspectorOptions: GetInspectorLinksOptions
): Promise<{ physical: InspectorLinkItem[]; semantic: InspectorLinkItem[] }> {
	const { includeSemantic: incSem, includeMetadata: incMeta } = inspectorOptions;
	const tenant: IndexTenant = getIndexTenantForPath(currentPath);
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

	const docMeta = await indexedDocumentRepo.getByPath(currentPath);
	if (!docMeta) {
		return { physical: [], semantic: [] };
	}

	const edges = await mobiusEdgeRepo.getAllEdgesForNode(docMeta.id, LINKS_LIMIT);
	const longRangeByNeighborId = new Map<string, boolean>();
	for (const e of edges) {
		if (e.type !== GraphEdgeType.References && e.type !== GraphEdgeType.ReferencesResource) {
			continue;
		}
		let attrs: { longRange?: boolean } = {};
		try {
			attrs = JSON.parse(e.attributes || '{}') as { longRange?: boolean };
		} catch {
			attrs = {};
		}
		const neighborId = e.from_node_id === docMeta.id ? e.to_node_id : e.from_node_id;
		if (attrs.longRange) {
			longRangeByNeighborId.set(neighborId, true);
		}
	}
	const inIds = edges.filter((e) => e.to_node_id === docMeta.id).map((e) => e.from_node_id);
	const outIds = edges.filter((e) => e.from_node_id === docMeta.id).map((e) => e.to_node_id);
	const allIds = [...new Set([...inIds, ...outIds])];
	const nodesMap = await mobiusNodeRepo.getByIds(allIds);

	const physicalRaw: InspectorLinkItem[] = [];
	for (const node of nodesMap.values()) {
		if (isIndexedNoteNodeType(node.type) && node.label) {
			const path = getPathFromNode(node);
			physicalRaw.push({
				path,
				label: node.label,
				kind: 'physical',
				longRange: longRangeByNeighborId.get(node.id) ?? false,
			});
		}
	}

	let semanticRaw: InspectorLinkItem[] = [];
	if (incSem) {
		const filterDocIds = new Set([...nodesMap.values()]
			.filter((n) => isIndexedNoteNodeType(n.type))
			.map(n => n.id));
		filterDocIds.add(docMeta.id);

		const graphSemanticItems = await SemanticRelatedEdgesReadService.loadGraphSemanticLinkItems(
			docMeta.id,
			tenant,
			SEMANTIC_LIMIT,
		);
		const graphAsInspector: InspectorLinkItem[] = graphSemanticItems.map((g) => ({
			path: g.path,
			label: g.label,
			kind: 'semantic',
			similarity: g.similarity,
		}));

		const semanticNodes = await getSemanticNeighbors(docMeta.id, SEMANTIC_LIMIT, filterDocIds, tenant);
		const vecAsInspector: InspectorLinkItem[] = [];
		for (const n of semanticNodes) {
			if (!isIndexedNoteNodeType(n.type) || !n.label) continue;
			const path = getPathFromNode(n);
			if (!path) continue;
			vecAsInspector.push({
				path,
				label: n.label,
				kind: 'semantic',
				similarity: (n as { similarity?: string }).similarity,
			});
		}

		const similarityRank = (it: InspectorLinkItem): number => {
			const s = it.similarity;
			if (s == null) return -1;
			const n = parseFloat(String(s).replace(/%/, ''));
			return Number.isFinite(n) ? n : -1;
		};
		const mergedByPath = new Map<string, InspectorLinkItem>();
		for (const it of [...graphAsInspector, ...vecAsInspector]) {
			if (!it.path?.trim()) continue;
			const cur = mergedByPath.get(it.path);
			if (!cur || similarityRank(it) > similarityRank(cur)) {
				mergedByPath.set(it.path, it);
			}
		}
		semanticRaw = [...mergedByPath.values()];
	}

	let { physical, semantic } = filterAndSortLinks(physicalRaw, semanticRaw);

	if (incMeta) {
		const combined = [...physical, ...semantic];
		const enriched = await attachLinkMetadataCrossTenant(combined);
		const pathToEnriched = new Map(enriched.map((e) => [e.path, e]));
		physical = physical
			.map((p) => pathToEnriched.get(p.path))
			.filter((x): x is InspectorLinkItem => x != null);
		semantic = semantic
			.map((s) => pathToEnriched.get(s.path))
			.filter((x): x is InspectorLinkItem => x != null);
	}

	return { physical, semantic };
}

/** Attach backlinks, mtime, summary; resolves meta from vault or chat tenant per path (cross-DB fallback for outlinks). */
async function attachLinkMetadataCrossTenant(items: InspectorLinkItem[]): Promise<InspectorLinkItem[]> {
	if (!items.length) return items;
	const paths = [...new Set(items.map((i) => i.path).filter(Boolean))];

	const byTenant = new Map<IndexTenant, string[]>();
	for (const p of paths) {
		const t = getIndexTenantForPath(p);
		const list = byTenant.get(t) ?? [];
		list.push(p);
		byTenant.set(t, list);
	}

	const metaMap = new Map<string, { id: string; mtime?: number | null; summary?: string | null; tags?: string | null }>();
	for (const [t, tenantPaths] of byTenant) {
		const repo = sqliteStoreManager.getIndexedDocumentRepo(t);
		const m = await repo.getByPaths(tenantPaths);
		for (const [path, meta] of m) {
			if (meta?.id) metaMap.set(path, { id: meta.id, mtime: meta.mtime, summary: meta.summary, tags: meta.tags });
		}
	}

	const backlinksByPath = new Map<string, number>();
	for (const [t, tenantPaths] of byTenant) {
		const pathToId = new Map<string, string>();
		for (const p of tenantPaths) {
			const id = metaMap.get(p)?.id;
			if (id) pathToId.set(p, id);
		}
		const ids = [...pathToId.values()];
		if (!ids.length) continue;
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(t);
		const countMap = await mobiusEdgeRepo.countInComingEdges(ids);
		for (const [path, docId] of pathToId) {
			backlinksByPath.set(path, countMap.get(docId) ?? 0);
		}
	}

	return items.map((item) => {
		const meta = metaMap.get(item.path);
		let tags: string[] = [];
		if (meta?.tags) {
			const blob = decodeIndexedTagsBlob(meta.tags);
			const topicFlat =
				blob.topicTagEntries?.length ?
					blob.topicTagEntries.flatMap((e) => [e.id, ...(e.label ? [e.label] : [])])
				:	blob.topicTags;
			tags = [
				...new Set([
					...topicFlat,
					...blob.keywordTags,
					...blob.functionalTagEntries.flatMap((e) => [e.id, ...(e.label ? [e.label] : [])]),
				]),
			];
		}
		return {
			...item,
			backlinks: backlinksByPath.get(item.path) ?? 0,
			mtime: meta?.mtime ?? null,
			summary: meta?.summary ?? null,
			tags,
		};
	});
}

function filterAndSortLinks(physicalRaw: InspectorLinkItem[], semanticRaw: InspectorLinkItem[]): { physical: InspectorLinkItem[]; semantic: InspectorLinkItem[] } {
	const seenPathPhysical = new Set<string>();
	const seenPathSemantic = new Set<string>();
	for (const p of physicalRaw) {
		if (seenPathPhysical.has(p.path)) continue;
		seenPathPhysical.add(p.path);
	}
	for (const s of semanticRaw) {
		if (seenPathSemantic.has(s.path)) continue;
		seenPathSemantic.add(s.path);
	}

	const physicalPaths = new Set(physicalRaw.map(p => p.path).filter(p => p && p.trim() !== ''));
	const semanticPaths = new Set(semanticRaw.map(s => s.path).filter(p => p && p.trim() !== ''));
	const pathsInBoth = new Set([...physicalPaths].filter(p => semanticPaths.has(p)));

	const semanticByPath = new Map(semanticRaw.map(s => [s.path, s]));
	// Physical: mark alsoSemantic + similarity for in-both; sort: in-both first (by similarity desc), then rest
	const physical: InspectorLinkItem[] = physicalRaw.map(p => {
		if (pathsInBoth.has(p.path)) {
			const sem = semanticByPath.get(p.path);
			return { ...p, alsoSemantic: true, similarity: sem?.similarity };
		}
		return p;
	});

	const similarityNum = (item: InspectorLinkItem): number => {
		const s = item.similarity;
		if (s == null) return -1;
		const n = parseFloat(String(s).replace(/%/, ''));
		return Number.isFinite(n) ? n : -1;
	};
	physical.sort((a, b) => {
		const aLr = a.longRange ? 1 : 0;
		const bLr = b.longRange ? 1 : 0;
		if (aLr !== bLr) {
			return bLr - aLr;
		}
		const aBoth = pathsInBoth.has(a.path);
		const bBoth = pathsInBoth.has(b.path);
		if (aBoth && !bBoth) return -1;
		if (!aBoth && bBoth) return 1;
		if (aBoth && bBoth) return similarityNum(b) - similarityNum(a);
		return 0;
	});
	// Semantic: only paths not in physical; sort by similarity desc
	const semantic: InspectorLinkItem[] = semanticRaw
		.filter(s => !physicalPaths.has(s.path))
		.sort((a, b) => similarityNum(b) - similarityNum(a));
	return { physical, semantic };
}

/**
 * Run graph traversal from a note; returns structured graph for UI.
 */
export async function runInspectorGraph(
	startPath: string,
	hops: 1 | 2 | 3,
	includeSemantic: boolean
): Promise<{ graph?: AISearchGraph; error?: string }> {
	try {
		const result = await graphTraversal({
			start_note_path: startPath,
			hops,
			include_semantic_paths: includeSemantic,
			limit: 20,
			response_format: 'structured',
			mode: 'graph_traversal',
		});
		const graph = result?.graph
		const nodes: (GraphVisualizationNode & { path?: string; attributes?: Record<string, unknown> })[] = graph?.nodes ?? [];
		const edges: GraphVisualizationEdge[] = graph?.edges ?? [];
		return {
			graph: {
				nodes: nodes.map(node => ({
					id: node.id,
					type: node.type,
					title: node.label,
					path: node.path,
					attributes: {
						...node.attributes,
						depth: node.depth,
						foundBy: node.foundBy,
					},
				})),
				edges: edges.map(edge => ({
					id: stableGraphVisualizationEdgeId(edge.from_node_id, edge.to_node_id, edge.type),
					source: edge.from_node_id,
					target: edge.to_node_id,
					type: edge.type,
					attributes: {
						weight: edge.weight,
					},
				})),
			},
		};
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Graph traversal failed' };
	}
}

/**
 * Run weighted local graph expansion for one hub-like note; returns structured graph for UI.
 */
export async function runInspectorHubLocalGraph(
	startPath: string,
	maxDepth: number = 4,
): Promise<{ graph?: AISearchGraph; error?: string; frontierSummary?: Record<string, unknown>; coverageSummary?: Record<string, unknown> }> {
	try {
		const result = await hubLocalGraph({
			center_note_path: startPath,
			max_depth: maxDepth,
			response_format: 'structured',
		});
		const graph = (result as { graph?: { nodes?: Array<GraphVisualizationNode & { path?: string; attributes?: Record<string, unknown> }>; edges?: Array<GraphVisualizationEdge & { attributes?: Record<string, unknown> }> } })?.graph;
		const nodes = graph?.nodes ?? [];
		const edges = graph?.edges ?? [];
		return {
			graph: {
				nodes: nodes.map((node) => ({
					id: node.id,
					type: node.type,
					title: node.label,
					path: node.path,
					attributes: {
						...node.attributes,
						depth: node.depth,
						foundBy: node.foundBy,
					},
				})),
				edges: edges.map((edge) => ({
					id: stableGraphVisualizationEdgeId(edge.from_node_id, edge.to_node_id, edge.type),
					source: edge.from_node_id,
					target: edge.to_node_id,
					type: edge.type,
					attributes: {
						weight: edge.weight,
						...(edge as { attributes?: Record<string, unknown> }).attributes,
					},
				})),
			},
			frontierSummary: (result as { frontierSummary?: Record<string, unknown> }).frontierSummary,
			coverageSummary: (result as { coverageSummary?: Record<string, unknown> }).coverageSummary,
		};
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Hub local graph failed' };
	}
}

/**
 * Run find_path between two notes.
 */
export async function runInspectorPath(
	startPath: string,
	endPath: string,
	_includeSemantic: boolean
): Promise<{ paths?: string[]; markdown?: string; error?: string }> {
	try {
		const result = await findPath({
			start_note_path: startPath,
			end_note_path: endPath,
			limit: 10,
			include_semantic_paths: false,
			response_format: 'hybrid',
			mode: 'find_path',
		});
		if (typeof result === 'string') {
			if (result.includes('Failed') || result.includes('not found')) {
				return { error: result };
			}
			return { markdown: result };
		}
		const paths = (result as any)?.paths ?? (result as any)?.data?.paths;
		if (paths?.length) {
			return { paths: paths.map((p: any) => (typeof p === 'string' ? p : p.pathString ?? p)) };
		}
		return {};
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Find path failed' };
	}
}

/**
 * Run inspect_note_context for a note; returns markdown summary.
 */
export async function runInspectorInspect(
	notePath: string,
	includeSemantic: boolean
): Promise<{ markdown?: string; error?: string }> {
	try {
		const result = await inspectNoteContext({
			note_path: notePath,
			limit: 15,
			include_semantic_paths: includeSemantic,
			response_format: 'markdown',
		});
		if (typeof result === 'string') {
			if (result.includes('not found')) {
				return { error: result };
			}
			return { markdown: result };
		}
		return {};
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Inspect failed' };
	}
}
