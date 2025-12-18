import Graph from 'graphology';
import { extractTags, extractWikiLinks } from '@/core/utils/markdown-utils';

// Graphology types are incomplete, use any for graph instance
type GraphInstance = any;

/**
 * Graph index for search signals.
 *
 * Node conventions:
 * - file nodes:  `file:${path}`
 * - tag nodes:   `tag:${tag}`
 * - link nodes:  `link:${target}` (unresolved wiki links, best-effort)
 */
export class SearchGraphIndex {
	private readonly graph: GraphInstance;

	private constructor(graph: GraphInstance) {
		this.graph = graph;
	}

	/**
	 * Create and initialize the graph index.
	 * If `graphJson` is provided, it will be used to restore the graph.
	 */
	static getInstance(params?: { graphJson?: string | null }): SearchGraphIndex {
		const graph = new Graph() as GraphInstance;
		const json = params?.graphJson ?? null;
		if (json) {
			const parsed = JSON.parse(json);
			// Migrate legacy format (nodes as object) to Graphology format (nodes as array)
			if (parsed.nodes && !Array.isArray(parsed.nodes)) {
				const legacyNodes = parsed.nodes;
				parsed.nodes = Object.entries(legacyNodes).map(([key, attributes]) => ({
					key,
					attributes: attributes || null,
				}));
			}
			// Use Graphology's built-in import method
			graph.import(parsed);
			return new SearchGraphIndex(graph);
		}
		return new SearchGraphIndex(graph);
	}

	/**
	 * Export current graph to JSON string for persistence.
	 * Uses Graphology's built-in export method to serialize graph data.
	 * https://graphology.github.io/serialization.html#format
	 */
	save(): string {
		const data = this.graph.export();
		return JSON.stringify(data);
	}

	/**
	 * Upsert a markdown document into the graph.
	 * This method is best-effort and intentionally keeps parsing simple for MVP.
	 */
	upsertMarkdownDocument(params: { path: string; content: string }): void {
		const fileNode = this.fileNodeId(params.path);
		if (!this.graph.hasNode(fileNode)) this.graph.addNode(fileNode, { kind: 'file', path: params.path });

		const links = extractWikiLinks(params.content);
		for (const link of links) {
			const linkNode = `link:${link}`;
			if (!this.graph.hasNode(linkNode)) this.graph.addNode(linkNode, { kind: 'link', target: link });
			this.safeMergeEdge(fileNode, linkNode, 'ref');
		}

		const tags = extractTags(params.content);
		for (const tag of tags) {
			const tagNode = `tag:${tag}`;
			if (!this.graph.hasNode(tagNode)) this.graph.addNode(tagNode, { kind: 'tag', tag });
			this.safeMergeEdge(fileNode, tagNode, 'tag');
		}
	}

	/**
	 * Remove a file node and all its incident edges from the graph.
	 * This keeps tag/link nodes to avoid expensive garbage collection.
	 */
	removeFile(params: { path: string }): void {
		const node = this.fileNodeId(params.path);
		if (!this.graph.hasNode(node)) return;
		// graphology dropNode removes all incident edges.
		this.graph.dropNode(node);
	}

	/**
	 * Return related file paths within N hops of the given file.
	 * The idea is: file -> (tag/link) -> file.
	 */
	getRelatedFilePaths(params: { currentFilePath: string; maxHops?: number }): Set<string> {
		const maxHops = params.maxHops ?? 2;
		const start = this.fileNodeId(params.currentFilePath);
		if (!this.graph.hasNode(start)) return new Set();

		const visited = new Set<string>([start]);
		let frontier = new Set<string>([start]);

		for (let hop = 0; hop < maxHops; hop++) {
			const next = new Set<string>();
			for (const node of frontier) {
				const neighbors = this.graph.outNeighbors(node);
				for (const n of neighbors) {
					if (visited.has(n)) continue;
					visited.add(n);
					next.add(n);
				}
			}
			frontier = next;
			if (!frontier.size) break;
		}

		const related = new Set<string>();
		for (const node of visited) {
			if (node.startsWith('file:') && node !== start) {
				related.add(node.slice('file:'.length));
			}
		}
		return related;
	}

	/**
	 * Build a small 2-hop subgraph for UI preview.
	 */
	getPreview(params: { currentFilePath: string; maxNodes?: number }): {
		nodes: Array<{ id: string; label: string; kind: 'file' | 'tag' | 'heading' }>;
		edges: Array<{ from: string; to: string; weight?: number }>;
	} {
		const maxNodes = params.maxNodes ?? 30;
		const start = this.fileNodeId(params.currentFilePath);
		if (!this.graph.hasNode(start)) {
			return { nodes: [], edges: [] };
		}

		const keep = new Set<string>([start]);
		const firstHop = this.graph.outNeighbors(start);
		for (const n of firstHop) keep.add(n);
		for (const n of firstHop) {
			for (const n2 of this.graph.outNeighbors(n)) keep.add(n2);
		}

		const nodes: Array<{ id: string; label: string; kind: 'file' | 'tag' | 'heading' }> = [];
		for (const id of keep) {
			if (nodes.length >= maxNodes) break;
			if (id.startsWith('file:')) nodes.push({ id, label: id.slice('file:'.length), kind: 'file' });
			else if (id.startsWith('tag:')) nodes.push({ id, label: `#${id.slice('tag:'.length)}`, kind: 'tag' });
			else nodes.push({ id, label: id, kind: 'heading' });
		}

		const nodeSet = new Set(nodes.map((n) => n.id));
		const edges: Array<{ from: string; to: string; weight?: number }> = [];
		for (const from of nodeSet) {
			for (const to of this.graph.outNeighbors(from)) {
				if (!nodeSet.has(to)) continue;
				const keyRef = `${from}=>${to}:ref`;
				const keyTag = `${from}=>${to}:tag`;
				const weight =
					(this.graph.hasEdge(keyRef) ? Number(this.graph.getEdgeAttribute(keyRef, 'weight') ?? 1) : 0) +
					(this.graph.hasEdge(keyTag) ? Number(this.graph.getEdgeAttribute(keyTag, 'weight') ?? 1) : 0);
				edges.push({ from, to, weight: weight || undefined });
			}
		}
		return { nodes, edges };
	}

	private fileNodeId(path: string): string {
		return `file:${path}`;
	}

	private safeMergeEdge(from: string, to: string, kind: string): void {
		const key = `${from}=>${to}:${kind}`;
		if (!this.graph.hasEdge(key)) {
			this.graph.addDirectedEdgeWithKey(key, from, to, { kind, weight: 1 });
			return;
		}
		const prev = this.graph.getEdgeAttribute(key, 'weight') ?? 1;
		this.graph.setEdgeAttribute(key, 'weight', prev + 1);
	}
}


