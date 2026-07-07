/**
 * Unit tests for T2a · Result Subgraph Service.
 *
 * Coverage matrix (per spec §Result Graph View · Content Layers, §Isolated
 * Result Nodes, §Node Cap and plan §T2a Done-when):
 *   - happy path: 10 docs + 2 hubs + cross-doc reference edges
 *   - isolated-only: no edges at all
 *   - sparse: single reference edge among 10 docs
 *   - over-cap: 150 input docs, cap = 100 → overflowCount = 50, top-by-score
 *   - hub anchor pull-in: hub_doc not in results but 3 result docs are members
 *   - hub anchor cap: > 20 discovered → silently kept top 20 by member count
 *   - semantic-only connection stays isolated
 *   - scope filter drops edges reaching outside {results} ∪ {anchors}
 */

import {
    buildResultSubgraph,
    type ResultSubgraphDeps,
    type ResultSubgraphInput,
    type ResultSubgraphOutput,
} from '@/service/search/graph/resultSubgraph';

// ─── In-memory fake deps ─────────────────────────────────────────────────────

interface FakeState {
    nodes: Map<string, { path: string; title: string; communityId: string | null; folder: string }>;
    hubs: Map<string, { path: string; title: string; constituentCount: number; memberDocIds: Set<string> }>;
    /** structural edges (both endpoints, kind); undirected treated as one row. */
    edges: Array<{ from: string; to: string; kind: 'reference' | 'semantic' }>;
}

function makeDeps(state: FakeState): ResultSubgraphDeps {
    return {
        async getNodeMetadata(docIds) {
            const out = new Map<string, { path: string; title: string; communityId: string | null; folder: string }>();
            for (const id of docIds) {
                const m = state.nodes.get(id);
                if (m) out.set(id, m);
            }
            return out;
        },
        async getHubsForMemberDoc(docId) {
            const out: string[] = [];
            for (const [hubId, meta] of state.hubs) {
                if (meta.memberDocIds.has(docId)) out.push(hubId);
            }
            return out;
        },
        async getHubAnchorMetadata(hubIds) {
            const out = new Map<string, { path: string; title: string; constituentCount: number }>();
            for (const id of hubIds) {
                const m = state.hubs.get(id);
                if (m) out.set(id, { path: m.path, title: m.title, constituentCount: m.constituentCount });
            }
            return out;
        },
        async getStructuralEdgesWithin(nodeIds) {
            const scope = new Set(nodeIds);
            return state.edges.filter((e) => scope.has(e.from) && scope.has(e.to));
        },
        async getHubConstituentEdges(hubIds, resultDocIds) {
            const hubSet = new Set(hubIds);
            const docSet = new Set(resultDocIds);
            const out: Array<{ from: string; to: string }> = [];
            for (const hubId of hubIds) {
                if (!hubSet.has(hubId)) continue;
                const meta = state.hubs.get(hubId);
                if (!meta) continue;
                for (const memberId of meta.memberDocIds) {
                    if (docSet.has(memberId)) out.push({ from: hubId, to: memberId });
                }
            }
            return out;
        },
    };
}

function docMeta(i: number, opts: Partial<{ folder: string; community: string | null }> = {}) {
    return {
        path: `notes/doc-${i}.md`,
        title: `Doc ${i}`,
        communityId: opts.community ?? `c-${i % 3}`,
        folder: opts.folder ?? 'notes',
    };
}

// ─── Test harness (mirrors the pattern in test/query-parser.test.ts) ─────────

let PASS = 0;
let FAIL = 0;

function assert(desc: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  PASS: ${desc}`);
        PASS++;
    } else {
        console.error(`  FAIL: ${desc}`);
        console.error(`    Expected: ${e}`);
        console.error(`    Got:      ${a}`);
        FAIL++;
    }
}

function assertTrue(desc: string, cond: boolean) {
    if (cond) {
        console.log(`  PASS: ${desc}`);
        PASS++;
    } else {
        console.error(`  FAIL: ${desc}`);
        FAIL++;
    }
}

async function runTests() {
    // ── Test 1: Happy path (10 docs + 2 hubs, reference edges) ──
    console.log('\nTest 1: Happy path (10 docs + 2 hubs, cross-doc reference edges)');
    {
        const state: FakeState = {
            nodes: new Map(Array.from({ length: 10 }, (_, i) => [`d${i}`, docMeta(i)])),
            hubs: new Map([
                ['h1', { path: 'hubs/H1.md', title: 'H1', constituentCount: 5, memberDocIds: new Set(['d0', 'd1', 'd2']) }],
                ['h2', { path: 'hubs/H2.md', title: 'H2', constituentCount: 7, memberDocIds: new Set(['d5', 'd6']) }],
            ]),
            edges: [
                { from: 'd0', to: 'd1', kind: 'reference' },
                { from: 'd3', to: 'd4', kind: 'reference' },
                { from: 'd7', to: 'd8', kind: 'reference' },
                { from: 'd0', to: 'd5', kind: 'semantic' }, // semantic only — kept in edges but not connecting
            ],
        };
        const scores = new Map(Array.from({ length: 10 }, (_, i) => [`d${i}`, 10 - i]));
        const input: ResultSubgraphInput = {
            resultDocIds: Array.from({ length: 10 }, (_, i) => `d${i}`),
            matchScores: scores,
            nodeCap: 100,
        };
        const out = await buildResultSubgraph(makeDeps(state), input);
        assert('resultNodes count', out.resultNodes.length, 10);
        assert('hubAnchors count', out.hubAnchors.length, 2);
        assert('overflowCount', out.overflowCount, 0);
        // Edges: 3 reference + 1 semantic + hub_constituent (3 + 2 = 5) = 9
        const refCount = out.edges.filter((e) => e.kind === 'reference').length;
        const semCount = out.edges.filter((e) => e.kind === 'semantic').length;
        const hcCount = out.edges.filter((e) => e.kind === 'hub_constituent').length;
        assert('reference edges', refCount, 3);
        assert('semantic edges', semCount, 1);
        assert('hub_constituent edges', hcCount, 5);
        // Isolated = docs with no reference / hub_constituent link. d9 has neither.
        // d0..d2 → hub_constituent h1; d5, d6 → hub_constituent h2; d0/d1, d3/d4, d7/d8 → reference.
        // d9 alone is isolated (semantic-only d0→d5 doesn't help d9).
        assert('isolatedDocIds', out.isolatedDocIds, ['d9']);
        // Score ordering preserved.
        assertTrue('resultNodes[0].score >= resultNodes[9].score', out.resultNodes[0]!.score >= out.resultNodes[9]!.score);
        // Metadata plumbed through.
        assert('resultNodes[0].path', out.resultNodes[0]!.path, 'notes/doc-0.md');
        assert('hubAnchors[0].constituentCount', out.hubAnchors[0]!.constituentCount > 0, true);
    }

    // ── Test 2: Isolated-only (no edges anywhere, no hubs) ──
    console.log('\nTest 2: Isolated-only');
    {
        const state: FakeState = {
            nodes: new Map(Array.from({ length: 5 }, (_, i) => [`d${i}`, docMeta(i)])),
            hubs: new Map(),
            edges: [],
        };
        const scores = new Map(Array.from({ length: 5 }, (_, i) => [`d${i}`, 1]));
        const out = await buildResultSubgraph(makeDeps(state), {
            resultDocIds: ['d0', 'd1', 'd2', 'd3', 'd4'],
            matchScores: scores,
            nodeCap: 100,
        });
        assert('all docs isolated', out.isolatedDocIds.sort(), ['d0', 'd1', 'd2', 'd3', 'd4']);
        assert('no hubs', out.hubAnchors.length, 0);
        assert('no edges', out.edges.length, 0);
        assert('resultNodes still populated', out.resultNodes.length, 5);
    }

    // ── Test 3: Sparse (1 reference edge among 10 docs) ──
    console.log('\nTest 3: Sparse (1 reference among 10, no hubs)');
    {
        const state: FakeState = {
            nodes: new Map(Array.from({ length: 10 }, (_, i) => [`d${i}`, docMeta(i)])),
            hubs: new Map(),
            edges: [{ from: 'd0', to: 'd1', kind: 'reference' }],
        };
        const scores = new Map(Array.from({ length: 10 }, (_, i) => [`d${i}`, 1]));
        const out = await buildResultSubgraph(makeDeps(state), {
            resultDocIds: Array.from({ length: 10 }, (_, i) => `d${i}`),
            matchScores: scores,
            nodeCap: 100,
        });
        assert('8 isolated', out.isolatedDocIds.length, 8);
        const connected = new Set(['d0', 'd1']);
        for (const id of out.isolatedDocIds) {
            assertTrue(`${id} not in connected set`, !connected.has(id));
        }
        assert('1 reference edge', out.edges.filter((e) => e.kind === 'reference').length, 1);
    }

    // ── Test 4: Over-cap trimming (150 → 100, overflowCount = 50, top-by-score) ──
    console.log('\nTest 4: Over-cap trimming');
    {
        const N = 150;
        const cap = 100;
        const state: FakeState = {
            nodes: new Map(Array.from({ length: N }, (_, i) => [`d${i}`, docMeta(i)])),
            hubs: new Map(),
            edges: [],
        };
        // Assign score = i, so top 100 by score are d50..d149.
        const scores = new Map(Array.from({ length: N }, (_, i) => [`d${i}`, i]));
        const out = await buildResultSubgraph(makeDeps(state), {
            resultDocIds: Array.from({ length: N }, (_, i) => `d${i}`),
            matchScores: scores,
            nodeCap: cap,
        });
        assert('resultNodes capped at 100', out.resultNodes.length, 100);
        assert('overflowCount = 50', out.overflowCount, 50);
        // Top scorer first.
        assert('top result is d149', out.resultNodes[0]!.id, 'd149');
        // d49 should NOT appear (below cutoff).
        const ids = new Set(out.resultNodes.map((n) => n.id));
        assertTrue('d49 dropped', !ids.has('d49'));
        assertTrue('d50 kept', ids.has('d50'));
        assertTrue('d149 kept', ids.has('d149'));
    }

    // ── Test 5: Hub anchor pull-in (hub_doc not in results, 3 result docs are members) ──
    console.log('\nTest 5: Hub anchor pull-in when hub_doc not in results');
    {
        const state: FakeState = {
            nodes: new Map(Array.from({ length: 3 }, (_, i) => [`d${i}`, docMeta(i)])),
            hubs: new Map([
                ['hX', { path: 'hubs/HX.md', title: 'HX', constituentCount: 3, memberDocIds: new Set(['d0', 'd1', 'd2']) }],
            ]),
            edges: [],
        };
        const scores = new Map([['d0', 1], ['d1', 1], ['d2', 1]]);
        const out = await buildResultSubgraph(makeDeps(state), {
            resultDocIds: ['d0', 'd1', 'd2'],
            matchScores: scores,
            nodeCap: 100,
        });
        assert('1 hub anchor pulled in', out.hubAnchors.length, 1);
        assert('hub id', out.hubAnchors[0]!.id, 'hX');
        assert('3 hub_constituent edges', out.edges.filter((e) => e.kind === 'hub_constituent').length, 3);
        // All 3 docs are connected via hub_constituent → nothing isolated.
        assert('no isolated', out.isolatedDocIds, []);
    }

    // ── Test 6: Hub anchor cap (discovered > 20 → silently kept top 20 by member count) ──
    console.log('\nTest 6: Hub anchor cap at 20');
    {
        const nodes = new Map<string, { path: string; title: string; communityId: string | null; folder: string }>();
        const hubs = new Map<string, { path: string; title: string; constituentCount: number; memberDocIds: Set<string> }>();
        // 30 hubs, hub_i has (i+1) result-doc members drawn from d0..d29.
        // → hub_29 has most members; hub_0 has 1 member.
        for (let i = 0; i < 30; i++) {
            const members = new Set<string>();
            for (let j = 0; j <= i; j++) members.add(`d${j}`);
            hubs.set(`h${i}`, { path: `hubs/h${i}.md`, title: `H${i}`, constituentCount: i + 1, memberDocIds: members });
        }
        for (let i = 0; i < 30; i++) nodes.set(`d${i}`, docMeta(i));
        const state: FakeState = { nodes, hubs, edges: [] };
        const scores = new Map(Array.from({ length: 30 }, (_, i) => [`d${i}`, 1]));
        const out = await buildResultSubgraph(makeDeps(state), {
            resultDocIds: Array.from({ length: 30 }, (_, i) => `d${i}`),
            matchScores: scores,
            nodeCap: 100,
        });
        assert('hub anchor count capped at 20', out.hubAnchors.length, 20);
        // Top hub (h29, most members) must be kept; bottom hub (h0, one member) must be dropped.
        const keptIds = new Set(out.hubAnchors.map((a) => a.id));
        assertTrue('h29 kept (most members)', keptIds.has('h29'));
        assertTrue('h0 dropped (fewest members)', !keptIds.has('h0'));
    }

    // ── Test 7: Semantic-only connection stays isolated (spec §Isolated) ──
    console.log('\nTest 7: Semantic-only connection does not un-isolate');
    {
        const state: FakeState = {
            nodes: new Map([['d0', docMeta(0)], ['d1', docMeta(1)]]),
            hubs: new Map(),
            edges: [{ from: 'd0', to: 'd1', kind: 'semantic' }],
        };
        const out = await buildResultSubgraph(makeDeps(state), {
            resultDocIds: ['d0', 'd1'],
            matchScores: new Map([['d0', 1], ['d1', 1]]),
            nodeCap: 100,
        });
        assert('semantic edge present', out.edges.filter((e) => e.kind === 'semantic').length, 1);
        assert('both docs still isolated', out.isolatedDocIds.sort(), ['d0', 'd1']);
    }

    // ── Test 8: Empty input ──
    console.log('\nTest 8: Empty input');
    {
        const out = await buildResultSubgraph(makeDeps({ nodes: new Map(), hubs: new Map(), edges: [] }), {
            resultDocIds: [],
            matchScores: new Map(),
            nodeCap: 100,
        });
        assert('empty resultNodes', out.resultNodes.length, 0);
        assert('empty hubAnchors', out.hubAnchors.length, 0);
        assert('empty edges', out.edges.length, 0);
        assert('empty isolatedDocIds', out.isolatedDocIds.length, 0);
        assert('overflow=0', out.overflowCount, 0);
    }

    // ── Test 9: Return-shape parity with locked contract ──
    console.log('\nTest 9: Return-shape parity');
    {
        const out: ResultSubgraphOutput = await buildResultSubgraph(
            makeDeps({
                nodes: new Map([['d0', docMeta(0)]]),
                hubs: new Map(),
                edges: [],
            }),
            { resultDocIds: ['d0'], matchScores: new Map([['d0', 5]]), nodeCap: 100 },
        );
        const keys = Object.keys(out).sort();
        assert('output keys', keys, ['edges', 'hubAnchors', 'isolatedDocIds', 'overflowCount', 'resultNodes']);
        const rn = out.resultNodes[0]!;
        const rnKeys = Object.keys(rn).sort();
        assert(
            'resultNode keys',
            rnKeys,
            ['communityId', 'folder', 'id', 'path', 'score', 'title'],
        );
    }

    console.log(`\n─── Result Subgraph tests ─── pass=${PASS} fail=${FAIL}`);
    if (FAIL > 0) process.exit(1);
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
