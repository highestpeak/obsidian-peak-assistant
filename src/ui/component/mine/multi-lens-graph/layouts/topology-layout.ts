import * as d3 from 'd3-force';
import type { LensNodeData, LensEdgeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: LensEdgeData['kind']; weight?: number }>;
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

export function computeTopologyLayout(input: LayoutInput): LayoutResult {
	const nodeCount = input.nodes.length;
	// Scale layout area with node count for better spacing
	const spread = Math.max(600, nodeCount * 80);
	const center = spread / 2;

	const simNodes = input.nodes.map((n) => ({ id: n.path, x: Math.random() * spread, y: Math.random() * spread }));
	const simLinks = input.edges.map((e) => ({ source: e.source, target: e.target }));

	const sim = d3
		.forceSimulation(simNodes)
		.force(
			'link',
			d3.forceLink(simLinks).id((d: any) => d.id).distance(220)
		)
		.force('charge', d3.forceManyBody().strength(-800))
		.force('center', d3.forceCenter(center, center))
		.force('collide', d3.forceCollide(80))
		.stop();

	for (let i = 0; i < 400; i++) sim.tick();

	const positions = new Map<string, { x: number; y: number }>();
	for (const n of simNodes) {
		positions.set(n.id, { x: n.x, y: n.y });
	}
	return { positions };
}
