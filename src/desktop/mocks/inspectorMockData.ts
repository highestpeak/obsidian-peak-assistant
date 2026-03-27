import { GraphNodeType } from '@/core/po/graph.po';

/**
 * Mock data for Inspector (Find path, Links candidates) in desktop/mock environment.
 * Use this when wiring mock inspector service so UI can show sample data without real vault.
 */

export interface MockInspectorLinkItem {
	path: string;
	label: string;
	kind: string;
	similarity?: string;
}

/** Mock candidate paths for Find path target input (and Links section). */
export const MOCK_INSPECTOR_CANDIDATE_PATHS: MockInspectorLinkItem[] = [
	{ path: 'Knowledge Graph.md', label: 'Knowledge Graph', kind: 'physical' },
	{ path: 'Graph Traversal.md', label: 'Graph Traversal', kind: 'physical' },
	{ path: 'Semantic Search.md', label: 'Semantic Search', kind: 'semantic', similarity: '92%' },
	{ path: 'Inspector Overview.md', label: 'Inspector Overview', kind: 'semantic', similarity: '88%' },
	{ path: 'Vault Search.md', label: 'Vault Search', kind: 'physical' },
	{ path: 'Quick Search.md', label: 'Quick Search', kind: 'physical' },
	{ path: 'Find Path Algorithm.md', label: 'Find Path Algorithm', kind: 'semantic', similarity: '85%' },
	{ path: 'Local Graph.md', label: 'Local Graph', kind: 'physical' },
	{ path: 'Note Context.md', label: 'Note Context', kind: 'semantic', similarity: '82%' },
	{ path: 'Obsidian Plugin API.md', label: 'Obsidian Plugin API', kind: 'physical' },
];

/** Mock path result (paths found between two notes) for Find path Run. */
export const MOCK_INSPECTOR_PATH_RESULT: { paths: string[]; markdown?: string } = {
	paths: [
		'Current note → Knowledge Graph.md → Graph Traversal.md → Target note',
		'Current note → Semantic Search.md → Target note',
	],
	markdown: '**Paths found (2)**\n\n1. Current note → Knowledge Graph → Graph Traversal → Target note\n2. Current note → Semantic Search → Target note',
};

/** Mock graph for Graph section (nodes + edges). */
export const MOCK_INSPECTOR_GRAPH: { nodes: Array<{ id: string; label: string; type: string; path?: string }>; edges: Array<{ from_node_id: string; to_node_id: string; type?: string }> } = {
	nodes: [
		{ id: 'current', label: 'Current note', type: GraphNodeType.Document, path: 'Current note.md' },
		{ id: 'kg', label: 'Knowledge Graph', type: GraphNodeType.Document, path: 'Knowledge Graph.md' },
		{ id: 'gt', label: 'Graph Traversal', type: GraphNodeType.Document, path: 'Graph Traversal.md' },
		{ id: 'ss', label: 'Semantic Search', type: GraphNodeType.Document, path: 'Semantic Search.md' },
		{ id: 'vs', label: 'Vault Search', type: GraphNodeType.Document, path: 'Vault Search.md' },
	],
	edges: [
		{ from_node_id: 'current', to_node_id: 'kg', type: 'physical' },
		{ from_node_id: 'kg', to_node_id: 'gt', type: 'physical' },
		{ from_node_id: 'current', to_node_id: 'ss', type: 'semantic' },
		{ from_node_id: 'ss', to_node_id: 'vs', type: 'physical' },
	],
};

/** Mock inspect markdown for Inspect section. */
export const MOCK_INSPECTOR_INSPECT_MARKDOWN = `## Note context (mock)

- **Physical links**: Knowledge Graph, Graph Traversal, Vault Search, Quick Search.
- **Semantic**: Semantic Search (92%), Inspector Overview (88%), Find Path Algorithm (85%).

Use the Inspector to explore links and run Find path.`;
