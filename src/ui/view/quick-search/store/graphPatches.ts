/**
 * Graph patch model used by the UI animation pipeline.
 *
 * This is intentionally UI-focused and does not try to match the storage layer graph types.
 */
export type GraphEdgeKind = 'physical' | 'semantic' | 'path' | 'unknown';

export interface GraphPatchNode {
	id: string;
	label: string;
	type?: string;
	/**
	 * Optional role badges for styling (e.g. Source/Sink/Bridge).
	 */
	badges?: string[];
}

export interface GraphPatchEdge {
	from_node_id: string;
	to_node_id: string;
	weight?: number;
	/**
	 * Used for styling (semantic edges as dashed, path edges as neon, etc.)
	 */
	kind?: GraphEdgeKind;
}

export interface GraphPatch {
	upsertNodes: GraphPatchNode[];
	upsertEdges: GraphPatchEdge[];
	removeNodeIds?: string[];
	removeEdges?: Array<{ from_node_id: string; to_node_id: string }>;
	focus?: {
		nodeIds?: string[];
		edgeKeys?: string[];
		mode?: 'semantic' | 'physical' | 'mixed';
	};
	meta?: {
		label: string;
		toolName: string;
	};
}

export function makeEmptyPatch(toolName: string, label: string): GraphPatch {
	return {
		upsertNodes: [],
		upsertEdges: [],
		meta: { toolName, label },
	};
}

function safeString(v: unknown): string | null {
	return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * Convert search-graph-inspector tool outputs into a UI graph patch.
 *
 * NOTE: Many tools may return markdown strings depending on response_format.
 * This converter is best-effort and only patches when structured data is available.
 */
export function toolOutputToGraphPatch(toolName: string, output: unknown): GraphPatch | null {
	switch (toolName) {
		case 'graph_traversal':
			return convertGraphTraversal(output);
		case 'inspect_note_context':
			return convertInspectNoteContext(output);
		case 'find_key_nodes':
			return convertFindKeyNodes(output);
		case 'find_path':
			return convertFindPath(output);
		default:
			return null;
	}
}

function convertGraphTraversal(output: any): GraphPatch | null {
	// structured: { graph: { nodes: [...], edges: [...] }, ... }
	const graph = output?.graph;
	if (!graph?.nodes || !graph?.edges) return null;

	/**
	 * Normalize special node IDs (concept/tag) for stable matching.
	 * This prevents duplicates like "concept:Faiss" vs "concept:faiss" or
	 * "concept:Langgraph for RAG agents" vs "concept:langgraph-for-rag-agents".
	 */
	const normalizeSpecialId = (rawId: string): { id: string; type: 'concept' | 'tag'; label: string } | null => {
		const id = String(rawId ?? '').trim();
		if (!id) return null;
		const lower = id.toLowerCase();
		const mk = (prefix: 'concept:' | 'tag:', type: 'concept' | 'tag') => {
			const rawLabel = id.slice(prefix.length).trim();
			if (!rawLabel) return null;
			// Keep label readable, but normalize key for id stability.
			const key = rawLabel
				.trim()
				.toLowerCase()
				.replace(/[_\s]+/g, '-') // whitespace/underscore -> dash
				.replace(/-+/g, '-') // collapse
				.replace(/^-|-$/g, ''); // trim dashes
			return { id: `${prefix}${key}`, type, label: rawLabel };
		};
		if (lower.startsWith('concept:')) return mk('concept:', 'concept');
		if (lower.startsWith('tag:')) return mk('tag:', 'tag');
		return null;
	};

	const nodesRaw: GraphPatchNode[] = (graph.nodes as any[]).map((n) => ({
		id: String(n.id),
		label: String(n.label ?? n.id),
		type: String(n.type ?? 'document'),
		badges: n.foundBy ? [String(n.foundBy)] : undefined,
	}));

	// Build a quick index and normalize special nodes already present.
	const nodesById = new Map<string, GraphPatchNode>();
	for (const n of nodesRaw) {
		const special = normalizeSpecialId(n.id);
		if (special) {
			const normalized: GraphPatchNode = {
				...n,
				id: special.id,
				type: n.type && n.type !== 'document' ? n.type : special.type,
				label: n.label && n.label !== n.id ? n.label : special.label,
			};
			nodesById.set(normalized.id, normalized);
			continue;
		}
		nodesById.set(n.id, n);
	}

	const edgesRaw: GraphPatchEdge[] = (graph.edges as any[]).map((e) => ({
		from_node_id: String(e.from_node_id),
		to_node_id: String(e.to_node_id),
		weight: typeof e.weight === 'number' ? e.weight : undefined,
		kind: e.type === 'semantic' ? 'semantic' : 'physical',
	}));

	// Normalize edge endpoints and auto-create missing concept/tag nodes.
	const edges: GraphPatchEdge[] = [];
	for (const e of edgesRaw) {
		let fromId = e.from_node_id;
		let toId = e.to_node_id;

		const fromSpecial = normalizeSpecialId(fromId);
		if (fromSpecial) {
			fromId = fromSpecial.id;
			if (!nodesById.has(fromId)) {
				nodesById.set(fromId, { id: fromId, label: fromSpecial.label, type: fromSpecial.type });
			}
		}
		const toSpecial = normalizeSpecialId(toId);
		if (toSpecial) {
			toId = toSpecial.id;
			if (!nodesById.has(toId)) {
				nodesById.set(toId, { id: toId, label: toSpecial.label, type: toSpecial.type });
			}
		}

		edges.push({ ...e, from_node_id: fromId, to_node_id: toId });
	}

	const nodes = Array.from(nodesById.values());

	return {
		upsertNodes: dedupeNodes(nodes),
		upsertEdges: dedupeEdges(edges),
		meta: { toolName: 'graph_traversal', label: 'Expanding neighborhood…' },
	};
}

function convertInspectNoteContext(output: any): GraphPatch | null {
	// structured: { note_path, incoming, outgoing, semanticNeighbors, ... }
	const notePath = safeString(output?.note_path);
	if (!notePath) return null;

	// We use the doc path string as a stable UI id for the center node.
	const centerId = `file:${notePath}`;
	const centerNode: GraphPatchNode = { id: centerId, label: notePath.split('/').pop() || notePath, type: 'document' };

	const nodes: GraphPatchNode[] = [centerNode];
	const edges: GraphPatchEdge[] = [];

	const pushDocNodes = (cluster: any, mode: 'incoming' | 'outgoing' | 'semantic') => {
		const docs: any[] | undefined = cluster?.documentNodes;
		if (!docs?.length) return;
		for (const d of docs) {
			const id = String(d.id);
			nodes.push({
				id,
				label: String(d.label ?? id),
				type: String(d.type ?? 'document'),
			});
			if (mode === 'incoming') {
				edges.push({ from_node_id: id, to_node_id: centerId, kind: 'physical' });
			} else if (mode === 'outgoing') {
				edges.push({ from_node_id: centerId, to_node_id: id, kind: 'physical' });
			} else {
				edges.push({ from_node_id: centerId, to_node_id: id, kind: 'semantic' });
			}
		}
	};

	pushDocNodes(output?.incoming, 'incoming');
	pushDocNodes(output?.outgoing, 'outgoing');
	pushDocNodes(output?.semanticNeighbors, 'semantic');

	return {
		upsertNodes: dedupeNodes(nodes),
		upsertEdges: dedupeEdges(edges),
		meta: { toolName: 'inspect_note_context', label: 'Inspecting note context…' },
	};
}

function convertFindKeyNodes(output: any): GraphPatch | null {
	// structured: { key_nodes: [{ id,label,type,direction,nodeType, ... }], ... }
	const keyNodes: any[] | undefined = output?.key_nodes;
	if (!Array.isArray(keyNodes) || keyNodes.length === 0) return null;

	const nodes: GraphPatchNode[] = keyNodes.map((n) => {
		const id = String(n.id);
		const label = String(n.label ?? id);
		const badges: string[] = [];
		if (n.direction === 'out') badges.push('Source');
		if (n.direction === 'in') badges.push('Sink');
		if (n.nodeType) badges.push(String(n.nodeType));
		return { id, label, type: String(n.type ?? 'document'), badges };
	});

	return {
		upsertNodes: dedupeNodes(nodes),
		upsertEdges: [],
		focus: { nodeIds: nodes.slice(0, 8).map(n => n.id), mode: 'mixed' },
		meta: { toolName: 'find_key_nodes', label: 'Identifying key nodes…' },
	};
}

function convertFindPath(output: any): GraphPatch | null {
	// structured: { paths: [{ pathString: '[[A]] → [[B]]', ... }], ... }
	const paths: any[] | undefined = output?.paths;
	if (!Array.isArray(paths) || paths.length === 0) return null;

	const best = paths[0];
	const pathString = safeString(best?.pathString);
	if (!pathString) return null;

	// Extract [[...]] labels.
	const labels = Array.from(pathString.matchAll(/\[\[([^\]]+)\]\]/g)).map(m => m[1]).filter(Boolean);
	if (labels.length < 2) return null;

	const nodes: GraphPatchNode[] = labels.map((label) => ({
		id: `note:${label}`,
		label,
		type: 'document',
	}));

	const edges: GraphPatchEdge[] = [];
	for (let i = 0; i < labels.length - 1; i++) {
		edges.push({
			from_node_id: `note:${labels[i]}`,
			to_node_id: `note:${labels[i + 1]}`,
			kind: 'path',
			weight: 1,
		});
	}

	return {
		upsertNodes: dedupeNodes(nodes),
		upsertEdges: dedupeEdges(edges),
		focus: { nodeIds: nodes.map(n => n.id), mode: 'mixed' },
		meta: { toolName: 'find_path', label: 'Tracing connection path…' },
	};
}

function dedupeNodes(nodes: GraphPatchNode[]): GraphPatchNode[] {
	const map = new Map<string, GraphPatchNode>();
	for (const n of nodes) {
		if (!map.has(n.id)) map.set(n.id, n);
	}
	return Array.from(map.values());
}

function edgeKey(e: GraphPatchEdge): string {
	return `${e.from_node_id}::${e.to_node_id}::${e.kind ?? 'unknown'}`;
}

function dedupeEdges(edges: GraphPatchEdge[]): GraphPatchEdge[] {
	const map = new Map<string, GraphPatchEdge>();
	for (const e of edges) {
		const k = edgeKey(e);
		if (!map.has(k)) map.set(k, e);
	}
	return Array.from(map.values());
}

