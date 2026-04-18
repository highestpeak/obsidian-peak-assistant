import { computeBridgeLayout } from '../src/ui/component/mine/multi-lens-graph/layouts/bridge-layout';

function test(name: string, fn: () => void) {
	try { fn(); console.log(`  PASS: ${name}`); }
	catch (e) { console.error(`  FAIL: ${name}`, (e as Error).message); process.exit(1); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('bridge-layout tests:');

const NODES = [
	{ label: 'A', path: 'a.md', role: 'leaf' as const, group: 'c1', clusterId: 'c1' },
	{ label: 'B', path: 'b.md', role: 'leaf' as const, group: 'c1', clusterId: 'c1' },
	{ label: 'Bridge', path: 'br.md', role: 'bridge' as const, group: 'c1', clusterId: 'c1' },
	{ label: 'C', path: 'c.md', role: 'leaf' as const, group: 'c2', clusterId: 'c2' },
	{ label: 'D', path: 'd.md', role: 'leaf' as const, group: 'c2', clusterId: 'c2' },
];

const CLUSTERS = [
	{ id: 'c1', name: 'Topic 1', description: 'First' },
	{ id: 'c2', name: 'Topic 2', description: 'Second' },
];

const BRIDGES = [
	{ node_path: 'br.md', connects: ['c1', 'c2'] as [string, string], explanation: 'Connects topics' },
];

test('places bridge nodes between cluster columns', () => {
	const result = computeBridgeLayout({
		nodes: NODES, edges: [], clusters: CLUSTERS, bridges: BRIDGES,
	});
	const positions = result.positions;
	const bridgePos = positions.get('br.md')!;
	const aPos = positions.get('a.md')!;
	const cPos = positions.get('c.md')!;
	assert(bridgePos != null, 'bridge node has position');
	assert(bridgePos.x > aPos.x && bridgePos.x < cPos.x, 'bridge is between clusters');
});

test('groups non-bridge nodes by cluster', () => {
	const result = computeBridgeLayout({
		nodes: NODES, edges: [], clusters: CLUSTERS, bridges: BRIDGES,
	});
	const positions = result.positions;
	const aX = positions.get('a.md')!.x;
	const bX = positions.get('b.md')!.x;
	const cX = positions.get('c.md')!.x;
	const dX = positions.get('d.md')!.x;
	assert(aX === bX, 'a and b in same column');
	assert(cX === dX, 'c and d in same column');
	assert(aX !== cX, 'different clusters in different columns');
});

test('returns bridge edges connecting bridge to clusters', () => {
	const result = computeBridgeLayout({
		nodes: NODES, edges: [], clusters: CLUSTERS, bridges: BRIDGES,
	});
	assert(result.bridgeEdges != null, 'bridge edges returned');
	assert(result.bridgeEdges!.length >= 2, 'at least 2 bridge edges');
});
