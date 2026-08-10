import { brandes } from '../src/service/search/index/helper/structural/brandesBetweenness';
import { louvain } from '../src/service/search/index/helper/structural/louvainCommunity';
import { computeConstraint } from '../src/service/search/index/helper/structural/burtConstraint';
import type { AnalysisGraph, AnalysisNode } from '../src/service/search/index/helper/structural/types';

function test(name: string, fn: () => void) {
	try { fn(); console.log(`  PASS: ${name}`); }
	catch (e) { console.error(`  FAIL: ${name}`, (e as Error).message); process.exit(1); }
}

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

function assertApprox(actual: number, expected: number, tolerance: number, msg: string) {
	assert(
		Math.abs(actual - expected) <= tolerance,
		`${msg}: expected ~${expected}, got ${actual}`,
	);
}

/** Build undirected adjacency from edge list. */
function buildGraph(
	nodeIds: string[],
	edges: Array<[string, string, number?]>,
): AnalysisGraph {
	const nodes: AnalysisNode[] = nodeIds.map(id => ({ id, path: `${id}.md` }));
	const adjacency = new Map<string, Map<string, number>>();
	for (const id of nodeIds) adjacency.set(id, new Map());

	for (const [a, b, w] of edges) {
		const weight = w ?? 1.0;
		adjacency.get(a)!.set(b, weight);
		adjacency.get(b)!.set(a, weight);
	}

	return {
		nodes,
		adjacency,
		nodeCount: nodeIds.length,
		edgeCount: edges.length,
		totalNodeCount: nodeIds.length,
		analysisMode: 'exact',
		signalsByNode: new Map(),
		referenceEdges: edges.map(([from, to]) => ({ from, to })),
	};
}

console.log('structural-algorithms tests:');

// ─── Test 1: Brandes on barbell graph ──────────────────────────────
test('Brandes: barbell graph — bridge node has highest BC', () => {
	// Two 4-cliques connected by a single bridge node 'X'
	const nodeIds = ['a', 'b', 'c', 'd', 'X', 'e', 'f', 'g', 'h'];
	const edges: Array<[string, string]> = [
		// Left clique: a, b, c, d
		['a', 'b'], ['a', 'c'], ['a', 'd'],
		['b', 'c'], ['b', 'd'],
		['c', 'd'],
		// Bridge
		['d', 'X'], ['X', 'e'],
		// Right clique: e, f, g, h
		['e', 'f'], ['e', 'g'], ['e', 'h'],
		['f', 'g'], ['f', 'h'],
		['g', 'h'],
	];

	const graph = buildGraph(nodeIds, edges);
	const bc = brandes(graph);

	// Bridge node X should have the highest betweenness
	const bcX = bc.get('X')!;
	assert(bcX === 1.0, `Bridge node BC should be 1.0 (max normalized), got ${bcX}`);

	// Interior clique nodes should have much lower betweenness
	const bcA = bc.get('a')!;
	assert(bcA < 0.5, `Interior node BC should be low, got ${bcA}`);
});

// ─── Test 2: Brandes on star graph ──────────────────────────────────
test('Brandes: star graph — center has highest BC, leaves have 0', () => {
	const nodeIds = ['center', 'l1', 'l2', 'l3', 'l4', 'l5'];
	const edges: Array<[string, string]> = [
		['center', 'l1'], ['center', 'l2'], ['center', 'l3'],
		['center', 'l4'], ['center', 'l5'],
	];

	const graph = buildGraph(nodeIds, edges);
	const bc = brandes(graph);

	assert(bc.get('center')! === 1.0, `Center BC should be 1.0`);
	for (let i = 1; i <= 5; i++) {
		assert(bc.get(`l${i}`)! === 0, `Leaf l${i} BC should be 0, got ${bc.get(`l${i}`)}`);
	}
});

// ─── Test 3: Louvain on planted partition ────────────────────────────
test('Louvain: planted partition — detects 2 communities with Q > 0.3', () => {
	// Group A: a1-a8 (dense), Group B: b1-b8 (dense), sparse inter-group
	const groupA = Array.from({ length: 8 }, (_, i) => `a${i}`);
	const groupB = Array.from({ length: 8 }, (_, i) => `b${i}`);
	const nodeIds = [...groupA, ...groupB];

	const edges: Array<[string, string]> = [];
	// Dense within group A
	for (let i = 0; i < groupA.length; i++) {
		for (let j = i + 1; j < groupA.length; j++) {
			edges.push([groupA[i]!, groupA[j]!]);
		}
	}
	// Dense within group B
	for (let i = 0; i < groupB.length; i++) {
		for (let j = i + 1; j < groupB.length; j++) {
			edges.push([groupB[i]!, groupB[j]!]);
		}
	}
	// 1 sparse cross-group edge
	edges.push(['a0', 'b0']);

	const graph = buildGraph(nodeIds, edges);
	const { communities, modularityQ } = louvain(graph, 1.0);

	// Should detect exactly 2 communities
	const uniqueCommunities = new Set(communities.values());
	assert(uniqueCommunities.size === 2, `Expected 2 communities, got ${uniqueCommunities.size}`);

	// All nodes in group A should be in the same community
	const comA = communities.get('a0')!;
	for (const id of groupA) {
		assert(communities.get(id) === comA, `${id} should be in same community as a0`);
	}

	// All nodes in group B should be in the same community
	const comB = communities.get('b0')!;
	for (const id of groupB) {
		assert(communities.get(id) === comB, `${id} should be in same community as b0`);
	}

	// Communities should be different
	assert(comA !== comB, 'Group A and B should be in different communities');

	// Modularity should be reasonable
	assert(modularityQ > 0.3, `Q should be > 0.3, got ${modularityQ}`);
});

// ─── Test 4: Burt constraint on star ──────────────────────────────
test('Burt constraint: star — center low, leaves high', () => {
	const nodeIds = ['center', 'l1', 'l2', 'l3', 'l4', 'l5'];
	const edges: Array<[string, string]> = [
		['center', 'l1'], ['center', 'l2'], ['center', 'l3'],
		['center', 'l4'], ['center', 'l5'],
	];

	const graph = buildGraph(nodeIds, edges);
	const constraint = computeConstraint(graph);

	const centerC = constraint.get('center')!;
	assert(centerC < 0.3, `Center constraint should be low (<0.3), got ${centerC}`);

	for (let i = 1; i <= 5; i++) {
		const leafC = constraint.get(`l${i}`)!;
		assert(leafC >= 0.9, `Leaf l${i} constraint should be high (>=0.9), got ${leafC}`);
	}
});

// ─── Test 5: Burt constraint on complete graph K4 ──────────────────
test('Burt constraint: K4 — all nodes equal, high', () => {
	const nodeIds = ['a', 'b', 'c', 'd'];
	const edges: Array<[string, string]> = [
		['a', 'b'], ['a', 'c'], ['a', 'd'],
		['b', 'c'], ['b', 'd'],
		['c', 'd'],
	];

	const graph = buildGraph(nodeIds, edges);
	const constraint = computeConstraint(graph);

	const values = Array.from(constraint.values());
	// All values should be equal
	const first = values[0]!;
	for (const v of values) {
		assertApprox(v, first, 0.001, 'K4 nodes should have equal constraint');
	}
	// In K4, constraint should be relatively high (fully embedded)
	assert(first > 0.5, `K4 constraint should be > 0.5, got ${first}`);
});

console.log('All structural-algorithms tests passed.');
