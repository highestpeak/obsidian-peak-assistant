/**
 * Inspector data service: links (physical + semantic), graph traversal, find path, inspect note.
 * Uses sqliteStoreManager and search-graph-inspector helpers.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getPathFromNode, getSemanticNeighbors } from '@/service/tools/search-graph-inspector/common';
import { graphTraversal, GraphVisualizationEdge, GraphVisualizationNode } from '@/service/tools/search-graph-inspector/graph-traversal';
import { findPath } from '@/service/tools/search-graph-inspector/find-path';
import { inspectNoteContext } from '@/service/tools/search-graph-inspector/inspect-note-context';
import { AISearchGraph } from '../agents/AISearchAgent';
import { generateStableUuid } from '@/core/utils/id-utils';

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
	/** Tags from doc_meta (frontmatter + hashtags) when metadata included */
	tags?: string[];
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
	const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
	const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
	const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();

	const docMeta = await docMetaRepo.getByPath(currentPath);
	if (!docMeta) {
		return { physical: [], semantic: [] };
	}

	// All edges (incoming + outgoing) for this node
	const edges = await graphEdgeRepo.getAllEdgesForNode(docMeta.id, LINKS_LIMIT);
	const inIds = edges.filter((e) => e.to_node_id === docMeta.id).map((e) => e.from_node_id);
	const outIds = edges.filter((e) => e.from_node_id === docMeta.id).map((e) => e.to_node_id);
	const allIds = [...new Set([...inIds, ...outIds])];
	const nodesMap = await graphNodeRepo.getByIds(allIds);

	const physicalRaw: InspectorLinkItem[] = [];
	for (const node of nodesMap.values()) {
		if (node.type === 'document' && node.label) {
			const path = getPathFromNode(node);
			physicalRaw.push({
				path,
				label: node.label,
				kind: 'physical',
			});
		}
	}

	let semanticRaw: InspectorLinkItem[] = [];
	if (incSem) {
		const filterDocIds = new Set([...nodesMap.values()]
			.filter(n => n.type === 'document')
			.map(n => n.id));
		filterDocIds.add(docMeta.id);

		const semanticNodes = await getSemanticNeighbors(docMeta.id, SEMANTIC_LIMIT, filterDocIds);
		for (const n of semanticNodes) {
			if (n.type !== 'document' || !n.label) continue;
			const path = getPathFromNode(n);
			semanticRaw.push({
				path,
				label: n.label,
				kind: 'semantic',
				similarity: (n as any).similarity,
			});
		}
	}

	let { physical, semantic } = filterAndSortLinks(physicalRaw, semanticRaw);

	if (incMeta) {
		const combined = [...physical, ...semantic];
		const enriched = await attachLinkMetadata(combined);
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

/** Attach backlinks, mtime, summary to link items. */
async function attachLinkMetadata(items: InspectorLinkItem[]): Promise<InspectorLinkItem[]> {
	if (!items.length) return items;
	const paths = [...new Set(items.map((i) => i.path).filter(Boolean))];
	const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
	const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

	const metaMap = await docMetaRepo.getByPaths(paths);
	const docIds = [...metaMap.values()].map((d) => d.id).filter(Boolean);
	const backlinksMap = docIds.length
		? await graphEdgeRepo.countInComingEdges(docIds)
		: new Map<string, number>();

	const pathToId = new Map<string, string>();
	for (const [path, meta] of metaMap) {
		if (meta.id) pathToId.set(path, meta.id);
	}

	return items.map((item) => {
		const meta = metaMap.get(item.path);
		const docId = pathToId.get(item.path);
		let tags: string[] = [];
		if (meta?.tags) {
			try {
				const parsed = JSON.parse(meta.tags);
				tags = Array.isArray(parsed)
					? parsed.filter((t): t is string => typeof t === 'string').map((t) => String(t).trim()).filter(Boolean)
					: [];
			} catch {
				// ignore invalid JSON
			}
		}
		return {
			...item,
			backlinks: docId ? backlinksMap.get(docId) ?? 0 : 0,
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
					id: generateStableUuid(`${edge.from_node_id}-${edge.to_node_id}-${edge.type}`),
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
