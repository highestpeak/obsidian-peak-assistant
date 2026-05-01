import {
	computePPR,
	type PPRSeed,
	type PPRConfig,
	type MultiLayerEdge,
} from '@/service/search/query/personalizedPageRank';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Helper: build adjacency from edge list
// ---------------------------------------------------------------------------

function makeEdgeFetcher(adj: Record<string, MultiLayerEdge[]>): (nodeId: string) => MultiLayerEdge[] {
	return (nodeId: string) => adj[nodeId] ?? [];
}

// ---------------------------------------------------------------------------
// Test 1: Chain graph  A → B → C, seed = [A]
// ---------------------------------------------------------------------------

async function testChainGraph() {
	const edges: Record<string, MultiLayerEdge[]> = {
		A: [{ to: 'B', weight: 1 }],
		B: [{ to: 'C', weight: 1 }],
	};
	const seeds: PPRSeed[] = [{ nodeId: 'A', weight: 1 }];
	const result = await computePPR(seeds, makeEdgeFetcher(edges), {});

	const sA = result.scores.get('A') ?? 0;
	const sB = result.scores.get('B') ?? 0;
	const sC = result.scores.get('C') ?? 0;

	assert(sA > sB, `chain: expected A(${sA}) > B(${sB})`);
	assert(sB > sC, `chain: expected B(${sB}) > C(${sC})`);
	assert(sA > 0 && sB > 0 && sC > 0, 'chain: all scores should be positive');
	console.log(`  chain graph: A=${sA.toFixed(4)} B=${sB.toFixed(4)} C=${sC.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// Test 2: Diamond graph  A→B, A→C, B→D, C→D, seed = [A]
// ---------------------------------------------------------------------------

async function testDiamondGraph() {
	const edges: Record<string, MultiLayerEdge[]> = {
		A: [{ to: 'B', weight: 1 }, { to: 'C', weight: 1 }],
		B: [{ to: 'D', weight: 1 }],
		C: [{ to: 'D', weight: 1 }],
	};
	const seeds: PPRSeed[] = [{ nodeId: 'A', weight: 1 }];
	const result = await computePPR(seeds, makeEdgeFetcher(edges), {});

	const sA = result.scores.get('A') ?? 0;
	const sB = result.scores.get('B') ?? 0;
	const sC = result.scores.get('C') ?? 0;
	const sD = result.scores.get('D') ?? 0;

	// B and C are symmetric — should be approximately equal
	assert(Math.abs(sB - sC) < 1e-6, `diamond: expected B(${sB}) ≈ C(${sC})`);
	// D accumulates from two paths
	assert(sD > 0, 'diamond: D should have positive score');
	assert(sA > sB, `diamond: expected A(${sA}) > B(${sB})`);
	console.log(`  diamond graph: A=${sA.toFixed(4)} B=${sB.toFixed(4)} C=${sC.toFixed(4)} D=${sD.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// Test 3: Weighted edges  A→B (0.9), A→C (0.1), seed = [A]
// ---------------------------------------------------------------------------

async function testWeightedEdges() {
	const edges: Record<string, MultiLayerEdge[]> = {
		A: [{ to: 'B', weight: 0.9 }, { to: 'C', weight: 0.1 }],
	};
	const seeds: PPRSeed[] = [{ nodeId: 'A', weight: 1 }];
	const result = await computePPR(seeds, makeEdgeFetcher(edges), {});

	const sB = result.scores.get('B') ?? 0;
	const sC = result.scores.get('C') ?? 0;

	assert(sB > sC, `weighted: expected B(${sB}) >> C(${sC})`);
	// B should get roughly 9x the score of C
	assert(sB / sC > 5, `weighted: expected B/C ratio > 5, got ${(sB / sC).toFixed(2)}`);
	console.log(`  weighted edges: B=${sB.toFixed(4)} C=${sC.toFixed(4)} ratio=${(sB / sC).toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// Test 4: Multiple seeds  diamond graph, seeds = [B:0.7, C:0.3]
// ---------------------------------------------------------------------------

async function testMultipleSeeds() {
	const edges: Record<string, MultiLayerEdge[]> = {
		A: [{ to: 'B', weight: 1 }, { to: 'C', weight: 1 }],
		B: [{ to: 'D', weight: 1 }],
		C: [{ to: 'D', weight: 1 }],
	};
	const seeds: PPRSeed[] = [
		{ nodeId: 'B', weight: 0.7 },
		{ nodeId: 'C', weight: 0.3 },
	];
	const result = await computePPR(seeds, makeEdgeFetcher(edges), {});

	const sB = result.scores.get('B') ?? 0;
	const sC = result.scores.get('C') ?? 0;

	assert(sB > sC, `multi-seed: expected B(${sB}) > C(${sC})`);
	console.log(`  multiple seeds: B=${sB.toFixed(4)} C=${sC.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// Test 5: Safety cap  100-node cycle, maxPushOps = 50
// ---------------------------------------------------------------------------

async function testSafetyCap() {
	const N = 100;
	const edges: Record<string, MultiLayerEdge[]> = {};
	for (let i = 0; i < N; i++) {
		const from = `node_${i}`;
		const to = `node_${(i + 1) % N}`;
		edges[from] = [{ to, weight: 1 }];
	}
	const seeds: PPRSeed[] = [{ nodeId: 'node_0', weight: 1 }];
	const config: PPRConfig = { maxPushOps: 50 };
	const result = await computePPR(seeds, makeEdgeFetcher(edges), config);

	assert(result.truncated === true, `safety cap: expected truncated=true, got ${result.truncated}`);
	assert(result.pushOps <= 50, `safety cap: expected pushOps <= 50, got ${result.pushOps}`);
	assert(result.scores.size > 0, 'safety cap: should still produce some scores');
	console.log(`  safety cap: pushOps=${result.pushOps} truncated=${result.truncated} nodes=${result.scores.size}`);
}

// ---------------------------------------------------------------------------
// Test 6: Empty seeds
// ---------------------------------------------------------------------------

async function testEmptySeeds() {
	const edges: Record<string, MultiLayerEdge[]> = {
		A: [{ to: 'B', weight: 1 }],
	};
	const seeds: PPRSeed[] = [];
	const result = await computePPR(seeds, makeEdgeFetcher(edges), {});

	assert(result.scores.size === 0, `empty seeds: expected 0 scores, got ${result.scores.size}`);
	assert(result.pushOps === 0, `empty seeds: expected 0 pushOps, got ${result.pushOps}`);
	console.log(`  empty seeds: scores=${result.scores.size} pushOps=${result.pushOps}`);
}

// ---------------------------------------------------------------------------
// Test 7: Isolated node  no edges, seed = [X]
// ---------------------------------------------------------------------------

async function testIsolatedNode() {
	const edges: Record<string, MultiLayerEdge[]> = {};
	const seeds: PPRSeed[] = [{ nodeId: 'X', weight: 1 }];
	const result = await computePPR(seeds, makeEdgeFetcher(edges), {});

	const sX = result.scores.get('X') ?? 0;

	// An isolated node should absorb all its own residual → score ≈ 1.0
	assert(sX > 0.95, `isolated: expected X ≈ 1.0, got ${sX}`);
	assert(result.scores.size === 1, `isolated: expected 1 scored node, got ${result.scores.size}`);
	console.log(`  isolated node: X=${sX.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function runAll() {
	console.log('personalized-pagerank.test.ts:');
	await testChainGraph();
	await testDiamondGraph();
	await testWeightedEdges();
	await testMultipleSeeds();
	await testSafetyCap();
	await testEmptySeeds();
	await testIsolatedNode();
	console.log('personalized-pagerank.test.ts: all passed');
}
runAll();
