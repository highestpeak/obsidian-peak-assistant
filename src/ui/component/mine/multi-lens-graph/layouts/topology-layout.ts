import type { LensNodeData } from '../types';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';

interface TopologyInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: string; weight?: number }>;
}

interface SimNode {
	id: string;
	x: number;
	y: number;
	clusterId?: string;
	importance: number;
}

interface SimLink {
	source: string;
	target: string;
	weight: number;
}

// Estimate node width for collision radius (includes padding)
export function estimateNodeWidth(label: string): number {
	let w = 0;
	for (const ch of label) {
		w += ch.charCodeAt(0) > 127 ? 14 : 8;
	}
	return Math.min(Math.max(w + 40, 100), 300); // +40 for px-4 padding on both sides
}

/** Deterministic hash → angle for initial node positions (no Math.random). */
function hashToAngle(id: string, total: number, index: number): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
	// Spread nodes around circle with hash-based jitter
	const baseAngle = (2 * Math.PI * index) / Math.max(total, 1);
	const jitter = ((h & 0xffff) / 0xffff - 0.5) * (Math.PI / total);
	return baseAngle + jitter;
}

export function computeTopologyLayout(input: TopologyInput): { positions: Map<string, { x: number; y: number }> } {
	const { nodes, edges } = input;
	if (nodes.length === 0) return { positions: new Map() };

	// Compute cluster centers — spread clusters in a circle
	const clusterIds = [...new Set(nodes.map(n => n.clusterId ?? 'default'))];
	const clusterCenters = new Map<string, { x: number; y: number }>();
	const radius = Math.max(200, nodes.length * 25);
	clusterIds.forEach((cid, i) => {
		const angle = (2 * Math.PI * i) / clusterIds.length - Math.PI / 2;
		clusterCenters.set(cid, {
			x: radius * Math.cos(angle),
			y: radius * Math.sin(angle),
		});
	});

	// Initialize simulation nodes near their cluster center (deterministic positions)
	const simNodes: SimNode[] = nodes.map((n, idx) => {
		const center = clusterCenters.get(n.clusterId ?? 'default') ?? { x: 0, y: 0 };
		const angle = hashToAngle(n.path, nodes.length, idx);
		const spread = 60;
		return {
			id: n.path,
			x: center.x + Math.cos(angle) * spread,
			y: center.y + Math.sin(angle) * spread,
			clusterId: n.clusterId,
			importance: n.importance ?? 0.5,
		};
	});

	const nodeMap = new Map(simNodes.map(n => [n.id, n]));

	// Build links (only for nodes that exist)
	const simLinks: SimLink[] = edges
		.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
		.map(e => ({ source: e.source, target: e.target, weight: e.weight ?? 0.5 }));

	// Run simulation
	const sim = forceSimulation(simNodes as any)
		.force('link', forceLink(simLinks as any)
			.id((d: any) => d.id)
			.distance(250)
			.strength((d: any) => d.weight * 0.3))
		.force('charge', forceManyBody().strength(-500))
		.force('center', forceCenter(0, 0))
		.force('collide', forceCollide().radius((d: any) => {
			const node = nodes.find(n => n.path === d.id);
			return estimateNodeWidth(node?.label ?? '') / 2 + 40;
		}))
		// Cluster centering force: pull nodes toward their cluster center
		.force('clusterX', forceX().x((d: any) => {
			const center = clusterCenters.get(d.clusterId ?? 'default');
			return center?.x ?? 0;
		}).strength(0.15))
		.force('clusterY', forceY().y((d: any) => {
			const center = clusterCenters.get(d.clusterId ?? 'default');
			return center?.y ?? 0;
		}).strength(0.15))
		.stop();

	// Run synchronously (300 ticks is enough for convergence)
	for (let i = 0; i < 300; i++) sim.tick();

	// Extract positions
	const positions = new Map<string, { x: number; y: number }>();
	for (const n of simNodes) {
		positions.set(n.id, { x: n.x, y: n.y });
	}

	return { positions };
}
