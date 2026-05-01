import {
  computePPR,
  type PPRSeed,
  type MultiLayerEdge,
} from '@/service/search/query/personalizedPageRank';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Simulate a realistic vault graph:
// - Hub note "MOC" connected to many notes
// - Cluster A: TypeScript notes (A1, A2, A3) — densely interconnected
// - Cluster B: Python notes (B1, B2, B3) — densely interconnected
// - Bridge: A2 → B1 (cross-cluster link)

const graph = new Map<string, MultiLayerEdge[]>([
  ['MOC', [
    { to: 'A1', weight: 0.5 }, { to: 'A2', weight: 0.5 },
    { to: 'A3', weight: 0.5 }, { to: 'B1', weight: 0.5 },
    { to: 'B2', weight: 0.5 }, { to: 'B3', weight: 0.5 },
  ]],
  ['A1', [{ to: 'A2', weight: 0.8 }, { to: 'MOC', weight: 0.3 }]],
  ['A2', [{ to: 'A1', weight: 0.8 }, { to: 'A3', weight: 0.7 }, { to: 'B1', weight: 0.4 }]],
  ['A3', [{ to: 'A2', weight: 0.7 }, { to: 'MOC', weight: 0.3 }]],
  ['B1', [{ to: 'B2', weight: 0.8 }, { to: 'MOC', weight: 0.3 }]],
  ['B2', [{ to: 'B1', weight: 0.8 }, { to: 'B3', weight: 0.7 }]],
  ['B3', [{ to: 'B2', weight: 0.7 }, { to: 'MOC', weight: 0.3 }]],
]);

async function runTests() {
  // Test 1: Seeds in Cluster A → Cluster A scores > Cluster B scores
  {
    const seeds: PPRSeed[] = [
      { nodeId: 'A1', weight: 0.5 },
      { nodeId: 'A2', weight: 0.3 },
      { nodeId: 'A3', weight: 0.2 },
    ];
    const result = await computePPR(seeds, (id) => graph.get(id) ?? [], {});

    const avgA = ['A1', 'A2', 'A3'].map(id => result.scores.get(id) ?? 0).reduce((a, b) => a + b) / 3;
    const avgB = ['B1', 'B2', 'B3'].map(id => result.scores.get(id) ?? 0).reduce((a, b) => a + b) / 3;

    assert(avgA > avgB, `Cluster A avg (${avgA.toFixed(4)}) should > Cluster B avg (${avgB.toFixed(4)})`);

    // B1 should get more than B3 due to bridge A2→B1
    const sB1 = result.scores.get('B1') ?? 0;
    const sB3 = result.scores.get('B3') ?? 0;
    assert(sB1 > sB3, `B1 (${sB1.toFixed(4)}) should > B3 (${sB3.toFixed(4)}) via bridge`);

    // Seed A1 should > MOC (PPR is query-biased, unlike global PageRank)
    const sA1 = result.scores.get('A1') ?? 0;
    const sMOC = result.scores.get('MOC') ?? 0;
    assert(sA1 > sMOC, `Seed A1 (${sA1.toFixed(4)}) should > MOC (${sMOC.toFixed(4)})`);

    console.log('✓ Cluster A seeds → Cluster A boosted');
    console.log(`  A avg: ${avgA.toFixed(4)}, B avg: ${avgB.toFixed(4)}, MOC: ${sMOC.toFixed(4)}`);
  }

  // Test 2: Same graph, seeds in Cluster B → Cluster B boosted instead
  {
    const seeds: PPRSeed[] = [
      { nodeId: 'B1', weight: 0.5 },
      { nodeId: 'B2', weight: 0.3 },
      { nodeId: 'B3', weight: 0.2 },
    ];
    const result = await computePPR(seeds, (id) => graph.get(id) ?? [], {});

    const avgA = ['A1', 'A2', 'A3'].map(id => result.scores.get(id) ?? 0).reduce((a, b) => a + b) / 3;
    const avgB = ['B1', 'B2', 'B3'].map(id => result.scores.get(id) ?? 0).reduce((a, b) => a + b) / 3;

    assert(avgB > avgA, `Cluster B avg (${avgB.toFixed(4)}) should > Cluster A avg (${avgA.toFixed(4)})`);
    console.log('✓ Cluster B seeds → Cluster B boosted');
  }

  console.log('\nAll PPR integration tests passed!');
}

runTests();
