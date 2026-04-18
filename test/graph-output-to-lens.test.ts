import { graphOutputToLensData } from '../src/service/agents/ai-graph/graph-output-to-lens';
import type { GraphOutput } from '../src/service/agents/ai-graph/graph-output-types';

const SAMPLE_OUTPUT: GraphOutput = {
	nodes: [
		{ path: 'a.md', label: 'Note A', role: 'hub', cluster_id: 'c1', summary: 'Hub note', importance: 0.9, created_at: 1700000000000 },
		{ path: 'b.md', label: 'Note B', role: 'leaf', cluster_id: 'c1', summary: 'Leaf note', importance: 0.4, created_at: 1700100000000 },
		{ path: 'c.md', label: 'Note C', role: 'bridge', cluster_id: 'c2', summary: 'Bridge note', importance: 0.7, created_at: 1700200000000 },
	],
	edges: [
		{ source: 'a.md', target: 'b.md', kind: 'builds_on', label: 'B expands A', weight: 0.8 },
		{ source: 'a.md', target: 'c.md', kind: 'complements', label: 'Cross-domain link', weight: 0.5 },
	],
	clusters: [
		{ id: 'c1', name: 'Topic A', description: 'First topic' },
		{ id: 'c2', name: 'Topic B', description: 'Second topic' },
	],
	bridges: [
		{ node_path: 'c.md', connects: ['c1', 'c2'], explanation: 'Connects topics' },
	],
	evolution_chains: [
		{ chain: ['a.md', 'b.md'], theme: 'Idea evolution' },
	],
};

function test(name: string, fn: () => void) {
	try { fn(); console.log(`  PASS: ${name}`); }
	catch (e) { console.error(`  FAIL: ${name}`, (e as Error).message); process.exit(1); }
}

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('graph-output-to-lens tests:');

test('converts nodes with correct fields', () => {
	const result = graphOutputToLensData(SAMPLE_OUTPUT);
	assert(result.nodes.length === 3, 'expected 3 nodes');
	const hub = result.nodes.find(n => n.path === 'a.md')!;
	assert(hub.role === 'hub', 'hub role');
	assert(hub.clusterId === 'c1', 'cluster id mapped');
	assert(hub.importance === 0.9, 'importance mapped');
	assert(hub.createdAt === 1700000000000, 'createdAt mapped');
});

test('converts edges with correct kind', () => {
	const result = graphOutputToLensData(SAMPLE_OUTPUT);
	assert(result.edges.length === 2, 'expected 2 edges');
	assert(result.edges[0].kind === 'builds_on', 'edge kind preserved');
	assert(result.edges[0].label === 'B expands A', 'edge label preserved');
});

test('includes clusters, bridges, evolutionChains', () => {
	const result = graphOutputToLensData(SAMPLE_OUTPUT);
	assert(result.clusters!.length === 2, 'clusters present');
	assert(result.bridges!.length === 1, 'bridges present');
	assert(result.evolutionChains!.length === 1, 'evolution chains present');
});

test('sets correct availableLenses', () => {
	const result = graphOutputToLensData(SAMPLE_OUTPUT);
	assert(result.availableLenses.includes('topology'), 'topology always available');
	assert(result.availableLenses.includes('bridge'), 'bridge available when bridges exist');
	assert(result.availableLenses.includes('timeline'), 'timeline available when chains or timestamps exist');
});

test('omits bridge lens when no bridges', () => {
	const noBridges = { ...SAMPLE_OUTPUT, bridges: [] };
	const result = graphOutputToLensData(noBridges);
	assert(!result.availableLenses.includes('bridge'), 'no bridge lens');
});
