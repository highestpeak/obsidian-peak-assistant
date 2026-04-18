import { computeTimelineLayout } from '../src/ui/component/mine/multi-lens-graph/layouts/timeline-layout';

function test(name: string, fn: () => void) {
    try { fn(); console.log(`  PASS: ${name}`); }
    catch (e) { console.error(`  FAIL: ${name}`, (e as Error).message); process.exit(1); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('timeline-layout tests:');

const DAY = 86400000;
const BASE = 1700000000000;

const NODES = [
    { label: 'Early', path: 'early.md', createdAt: BASE },
    { label: 'Mid', path: 'mid.md', createdAt: BASE + 30 * DAY },
    { label: 'Late', path: 'late.md', createdAt: BASE + 90 * DAY },
    { label: 'Solo', path: 'solo.md', createdAt: BASE + 60 * DAY },
];

const CHAINS = [
    { chain: ['early.md', 'mid.md', 'late.md'], theme: 'Main evolution' },
];

test('positions nodes left-to-right by time', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    const pos = result.positions;
    assert(pos.get('early.md')!.x < pos.get('mid.md')!.x, 'early < mid');
    assert(pos.get('mid.md')!.x < pos.get('late.md')!.x, 'mid < late');
});

test('respects proportional time spacing', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    const pos = result.positions;
    const earlyX = pos.get('early.md')!.x;
    const midX = pos.get('mid.md')!.x;
    const lateX = pos.get('late.md')!.x;
    const ratio = (midX - earlyX) / (lateX - earlyX);
    assert(Math.abs(ratio - 1/3) < 0.1, `proportional spacing: ratio=${ratio.toFixed(2)}`);
});

test('chain nodes above axis, solo nodes near axis', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    const pos = result.positions;
    const axisY = result.axisY!;
    assert(Math.abs(pos.get('early.md')!.y - axisY) > 20, 'chain node offset from axis');
    assert(Math.abs(pos.get('solo.md')!.y - axisY) < 40, 'solo node near axis');
});

test('returns chain edges', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    assert(result.chainEdges!.length === 2, '2 chain edges for 3-node chain');
    assert(result.chainEdges![0].source === 'early.md', 'first edge source');
    assert(result.chainEdges![0].target === 'mid.md', 'first edge target');
});

test('returns time ticks', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    assert(result.timeTicks != null, 'ticks present');
    assert(result.timeTicks!.length > 0, 'at least one tick');
    assert(result.timeTicks![0].label != null, 'tick has label');
});
