import assert from 'node:assert/strict';
import { buildVisibleFolderTree } from '../src/ui/component/graph/folderTreeModel';
import { buildFolderTreeLayout } from '../src/ui/component/graph/folderTreeLayoutModel';
import {
	buildFolderTreeRelationRoutes,
	FOLDER_TREE_RELATION_ROUTING_DEFAULTS,
} from '../src/ui/component/graph/folderTreeRelationRoutingModel';

const projection = buildVisibleFolderTree([
	{ id: 'near-a', path: 'kb/a/near-a.md' },
	{ id: 'near-b', path: 'kb/a/near-b.md' },
	{ id: 'wide-obstacle', path: 'kb/z/wide-obstacle.md' },
	{ id: 'target', path: 'kb2/target.md' },
]);
const layout = buildFolderTreeLayout(projection, {
	labelById: new Map([
		['near-a', 'Near A'],
		['near-b', 'Near B'],
		['wide-obstacle', 'A deliberately very long document title that reaches the width clamp'],
		['target', 'Target'],
	]),
	linkCountByDocumentId: new Map(),
});
const routes = buildFolderTreeRelationRoutes(layout, [
	{ id: 'local', sourceId: 'near-a', targetId: 'near-b' },
	{ id: 'long-a', sourceId: 'near-a', targetId: 'target' },
	{ id: 'long-b', sourceId: 'near-b', targetId: 'target' },
]);

const local = routes.get('local');
const longA = routes.get('long-a');
const longB = routes.get('long-b');
const requiredRow = (id: string) => {
	const row = layout.rowById.get(id);
	if (!row) throw new Error(`missing relation fixture row: ${id}`);
	return row;
};
const wideObstacle = requiredRow('wide-obstacle');
const source = requiredRow('near-a');
const target = requiredRow('target');
assert.ok(local && longA && longB);

assert.ok(
	longA.routeX >= wideObstacle.right + FOLDER_TREE_RELATION_ROUTING_DEFAULTS.clearance,
	'a long-span relation clears the widest row inside its vertical interval',
);
assert.ok(
	local.routeX < wideObstacle.right,
	'a short relation uses its local obstacle envelope instead of one oversized global arc',
);
assert.notEqual(longA.laneIndex, longB.laneIndex, 'overlapping spans receive separate reusable lanes');

function reconstructControlPoint(weight: number, distance: number): { x: number; y: number } {
	const dx = target.centerX - source.centerX;
	const dy = target.centerY - source.centerY;
	const length = Math.hypot(dx, dy);
	return {
		x: source.centerX + dx * weight + (-dy / length) * distance,
		y: source.centerY + dy * weight + (dx / length) * distance,
	};
}

const firstControl = reconstructControlPoint(
	longA.controlPointWeights[0],
	longA.controlPointDistances[0],
);
const secondControl = reconstructControlPoint(
	longA.controlPointWeights[1],
	longA.controlPointDistances[1],
);
assert.ok(Math.abs(firstControl.x - longA.routeX) < 0.001);
assert.ok(Math.abs(firstControl.y - source.centerY) < 0.001);
assert.ok(Math.abs(secondControl.x - longA.routeX) < 0.001);
assert.ok(Math.abs(secondControl.y - target.centerY) < 0.001);

const saturatedRoutes = buildFolderTreeRelationRoutes(
	layout,
	Array.from({ length: 10 }, (_, index) => ({
		id: `saturated-${index}`,
		sourceId: 'near-a',
		targetId: 'target',
	})),
);
assert.ok(
	[...saturatedRoutes.values()].every((route) => (
		route.laneIndex < FOLDER_TREE_RELATION_ROUTING_DEFAULTS.maxLanes
	)),
	'lane allocation stays bounded for dense All links results',
);

console.log('PASS: folder tree relation routes clear long labels without oversized global arcs');
