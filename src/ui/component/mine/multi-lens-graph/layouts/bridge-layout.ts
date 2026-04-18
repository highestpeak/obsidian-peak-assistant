import type { LensNodeData } from '../types';

export interface BridgeLayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: string }>;
	clusters?: Array<{ id: string; name: string; description: string }>;
	bridges?: Array<{ node_path: string; connects: [string, string]; explanation: string }>;
}

export interface BridgeLayoutResult {
	positions: Map<string, { x: number; y: number }>;
	bridgeEdges?: Array<{ source: string; target: string; kind: string; label?: string }>;
	swimlanes?: Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>;
}

const COL_WIDTH = 280;
const COL_GAP = 320;
const ROW_HEIGHT = 100;
const PADDING = 40;

export function computeBridgeLayout(input: BridgeLayoutInput): BridgeLayoutResult {
	const { nodes, clusters, bridges } = input;
	const positions = new Map<string, { x: number; y: number }>();
	if (nodes.length === 0) return { positions };

	const bridgeEdges: BridgeLayoutResult['bridgeEdges'] = [];
	const swimlanes: BridgeLayoutResult['swimlanes'] = [];

	const bridgePathSet = new Set((bridges ?? []).map(b => b.node_path));

	// Group non-bridge nodes by cluster
	const clusterNodes = new Map<string, LensNodeData[]>();
	const bridgeNodes: LensNodeData[] = [];

	for (const n of nodes) {
		if (bridgePathSet.has(n.path)) {
			bridgeNodes.push(n);
		} else {
			const cid = n.clusterId ?? n.group ?? 'unknown';
			if (!clusterNodes.has(cid)) clusterNodes.set(cid, []);
			clusterNodes.get(cid)!.push(n);
		}
	}

	const clusterIds = clusters?.map(c => c.id) ?? [];
	const orderedClusterIds = clusterIds.length > 0
		? clusterIds.filter(id => clusterNodes.has(id))
		: [...clusterNodes.keys()];

	// If no bridges, fall back to simple column layout
	if (bridgeNodes.length === 0) {
		let colX = PADDING;
		for (const cid of orderedClusterIds) {
			const cNodes = clusterNodes.get(cid) ?? [];
			cNodes.forEach((n, i) => {
				positions.set(n.path, { x: colX, y: PADDING + i * ROW_HEIGHT });
			});
			colX += COL_WIDTH + COL_GAP;
		}
		return { positions };
	}

	// Split clusters into left and right halves
	const midIndex = Math.ceil(orderedClusterIds.length / 2);
	const leftClusterIds = orderedClusterIds.slice(0, midIndex);
	const rightClusterIds = orderedClusterIds.slice(midIndex);

	// Position left clusters
	let colX = PADDING;
	for (const cid of leftClusterIds) {
		const cNodes = clusterNodes.get(cid) ?? [];
		const clusterName = clusters?.find(c => c.id === cid)?.name ?? cid;
		let maxRowCount = 0;
		cNodes.forEach((n, i) => {
			positions.set(n.path, { x: colX, y: PADDING + ROW_HEIGHT + i * ROW_HEIGHT });
			maxRowCount = i + 1;
		});
		const height = PADDING + ROW_HEIGHT + maxRowCount * ROW_HEIGHT + PADDING;
		swimlanes.push({ id: cid, name: clusterName, x: colX - 15, y: PADDING / 2, width: COL_WIDTH, height });
		colX += COL_WIDTH + COL_GAP;
	}

	// Position bridge nodes in center
	const bridgeCenterX = colX;
	bridgeNodes.forEach((n, i) => {
		positions.set(n.path, { x: bridgeCenterX, y: PADDING + ROW_HEIGHT + i * (ROW_HEIGHT + 20) });
	});
	colX += COL_WIDTH + COL_GAP;

	// Position right clusters
	for (const cid of rightClusterIds) {
		const cNodes = clusterNodes.get(cid) ?? [];
		const clusterName = clusters?.find(c => c.id === cid)?.name ?? cid;
		let maxRowCount = 0;
		cNodes.forEach((n, i) => {
			positions.set(n.path, { x: colX, y: PADDING + ROW_HEIGHT + i * ROW_HEIGHT });
			maxRowCount = i + 1;
		});
		const height = PADDING + ROW_HEIGHT + maxRowCount * ROW_HEIGHT + PADDING;
		swimlanes.push({ id: cid, name: clusterName, x: colX - 15, y: PADDING / 2, width: COL_WIDTH, height });
		colX += COL_WIDTH + COL_GAP;
	}

	// Generate bridge edges
	for (const b of (bridges ?? [])) {
		for (const cid of b.connects) {
			const cNodes = clusterNodes.get(cid);
			if (cNodes && cNodes.length > 0) {
				bridgeEdges.push({
					source: b.node_path,
					target: cNodes[0].path,
					kind: 'cross-domain',
					label: b.explanation,
				});
			}
		}
	}

	return { positions, bridgeEdges, swimlanes };
}
