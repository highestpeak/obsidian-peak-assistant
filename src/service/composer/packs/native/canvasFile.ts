/**
 * Peak Composer — Obsidian `.canvas` (JSON Canvas) structural adapter (WP8, §10.12).
 *
 * A `.canvas` file is JSON with `nodes[]` and `edges[]` (the open JSON Canvas
 * spec). The S4 spike locked the approach: parse JSON, patch nodes/edges BY ID
 * on the parsed model, re-serialize with tab indentation (Obsidian's on-disk
 * format). Unknown node/edge properties a future Obsidian version adds are held
 * on the parsed object and survive serialization by construction — we never
 * string-replace to guess structure (handoff §10.12).
 *
 * Framework-neutral: no Obsidian / DOM imports.
 */

/** A canvas node with the spec fields we read plus any unknown passthrough props. */
export interface CanvasNode {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	text?: string;
	file?: string;
	label?: string;
	[unknown: string]: unknown;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: string;
	toSide?: string;
	label?: string;
	color?: string;
	[unknown: string]: unknown;
}

export interface CanvasModel {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	[unknown: string]: unknown;
}

/** Read-only structural summary for the preview surface. */
export interface CanvasNodeSummary {
	id: string;
	type: string;
	/** Short label: text first line, file basename, or group label. */
	label: string;
	color?: string;
}

export interface CanvasEdgeSummary {
	id: string;
	from: string;
	to: string;
	label?: string;
}

export interface CanvasPreview {
	valid: boolean;
	reason?: string;
	nodeCount: number;
	edgeCount: number;
	/** Node kind → count (text/file/group/link). */
	nodeTypes: Record<string, number>;
	nodes: CanvasNodeSummary[];
	edges: CanvasEdgeSummary[];
}

/**
 * Typed, id-addressed patches. Every mutation resolves the target by id and
 * fails closed (throws) when the id is absent — never relocates by index guess.
 */
export type CanvasPatch =
	| { op: 'move-node'; id: string; x: number; y: number }
	| { op: 'nudge-node'; id: string; dx: number; dy: number }
	| { op: 'set-node-text'; id: string; text: string }
	| { op: 'set-node-label'; id: string; label: string }
	| { op: 'set-node-color'; id: string; color: string }
	| { op: 'add-edge'; edge: CanvasEdge }
	| { op: 'remove-edge'; id: string }
	| { op: 'remove-node'; id: string };

export function parseCanvasModel(raw: string): CanvasModel {
	const model = JSON.parse(raw) as CanvasModel;
	if (!model || typeof model !== 'object') throw new Error('invalid .canvas: not an object');
	if (!Array.isArray(model.nodes)) model.nodes = [];
	if (!Array.isArray(model.edges)) model.edges = [];
	return model;
}

/** Serialize a canvas model with the on-disk tab indentation Obsidian uses. */
export function serializeCanvasModel(model: CanvasModel): string {
	return JSON.stringify(model, null, '\t');
}

export function buildCanvasPreview(raw: string): CanvasPreview {
	try {
		const model = parseCanvasModel(raw);
		const nodeTypes: Record<string, number> = {};
		for (const n of model.nodes) nodeTypes[n.type] = (nodeTypes[n.type] ?? 0) + 1;
		return {
			valid: true,
			nodeCount: model.nodes.length,
			edgeCount: model.edges.length,
			nodeTypes,
			nodes: model.nodes.map(summarizeNode),
			edges: model.edges.map((e) => ({
				id: e.id,
				from: e.fromNode,
				to: e.toNode,
				...(e.label !== undefined ? { label: e.label } : {}),
			})),
		};
	} catch (err) {
		return {
			valid: false,
			reason: err instanceof Error ? err.message : 'Could not parse canvas',
			nodeCount: 0,
			edgeCount: 0,
			nodeTypes: {},
			nodes: [],
			edges: [],
		};
	}
}

function summarizeNode(node: CanvasNode): CanvasNodeSummary {
	return {
		id: node.id,
		type: node.type,
		label: nodeLabel(node),
		...(node.color !== undefined ? { color: node.color } : {}),
	};
}

function nodeLabel(node: CanvasNode): string {
	if (typeof node.label === 'string' && node.label.trim()) return node.label.trim();
	if (typeof node.text === 'string' && node.text.trim()) return firstLine(node.text);
	if (typeof node.file === 'string' && node.file.trim()) return basename(node.file);
	return `(${node.type})`;
}

function firstLine(text: string): string {
	const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
	return line.replace(/^#+\s*/, '').trim();
}

function basename(path: string): string {
	return path.split('/').pop() ?? path;
}

/**
 * Apply typed patches to canvas bytes, returning the re-serialized JSON.
 * Untouched nodes/edges and their unknown properties are preserved.
 */
export function applyCanvasPatch(raw: string, patches: readonly CanvasPatch[]): string {
	const model = parseCanvasModel(raw);
	for (const patch of patches) applyOne(model, patch);
	return serializeCanvasModel(model);
}

function applyOne(model: CanvasModel, patch: CanvasPatch): void {
	if (patch.op === 'add-edge') {
		if (model.edges.some((e) => e.id === patch.edge.id)) {
			throw new Error(`.canvas patch: edge id '${patch.edge.id}' already exists`);
		}
		model.edges.push(patch.edge);
		return;
	}
	if (patch.op === 'remove-edge') {
		const before = model.edges.length;
		model.edges = model.edges.filter((e) => e.id !== patch.id);
		if (model.edges.length === before) throw new Error(`.canvas patch: edge '${patch.id}' not found`);
		return;
	}
	if (patch.op === 'remove-node') {
		const node = requireNode(model, patch.id);
		model.nodes = model.nodes.filter((n) => n !== node);
		// Drop dangling edges attached to the removed node.
		model.edges = model.edges.filter((e) => e.fromNode !== patch.id && e.toNode !== patch.id);
		return;
	}
	const node = requireNode(model, patch.id);
	switch (patch.op) {
		case 'move-node':
			node.x = patch.x;
			node.y = patch.y;
			return;
		case 'nudge-node':
			node.x += patch.dx;
			node.y += patch.dy;
			return;
		case 'set-node-text':
			node.text = patch.text;
			return;
		case 'set-node-label':
			node.label = patch.label;
			return;
		case 'set-node-color':
			node.color = patch.color;
			return;
	}
}

function requireNode(model: CanvasModel, id: string): CanvasNode {
	const node = model.nodes.find((n) => n.id === id);
	if (!node) throw new Error(`.canvas patch: node '${id}' not found`);
	return node;
}
