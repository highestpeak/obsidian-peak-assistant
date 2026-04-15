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
	const simNodes = input.nodes.map((n) => ({ id: n.path, x: Math.random() * 400, y: Math.random() * 400 }));
	const simLinks = input.edges.map((e) => ({ source: e.source, target: e.target }));

	const sim = d3
		.forceSimulation(simNodes)
		.force(
			'link',
			d3.forceLink(simLinks).id((d: any) => d.id).distance(120)
		)
		.force('charge', d3.forceManyBody().strength(-300))
		.force('center', d3.forceCenter(200, 200))
		.force('collide', d3.forceCollide(40))
		.stop();

	for (let i = 0; i < 200; i++) sim.tick();

	const positions = new Map<string, { x: number; y: number }>();
	for (const n of simNodes) {
		positions.set(n.id, { x: n.x, y: n.y });
	}
	return { positions };
}
