import assert from 'node:assert/strict';
import {
	centerViewportOnSameModelPoint,
	placeGraphInspectCard,
	resolveGraphEscapeAction,
	retainGraphSelection,
	updateGraphSelection,
} from '@/ui/component/graph/graphInteractionModel';

assert.deepEqual(
	updateGraphSelection([], 'a', false),
	['a'],
	'a plain click replaces the current graph selection',
);
assert.deepEqual(
	updateGraphSelection(['a'], 'b', true),
	['a', 'b'],
	'Cmd/Ctrl click adds a node to the graph selection',
);
assert.deepEqual(
	updateGraphSelection(['a', 'b'], 'a', true),
	['b'],
	'Cmd/Ctrl click toggles an already-selected node off',
);
assert.deepEqual(
	retainGraphSelection(['a', 'missing', 'b'], new Set(['a', 'b', 'c'])),
	['a', 'b'],
	'a new subgraph drops selection ids that are no longer visible',
);

assert.deepEqual(
	resolveGraphEscapeAction({ inspectCardOpen: true, nodeListOpen: true, fullscreen: true }),
	'inspect-card',
	'Escape closes the inspect card before every graph layer below it',
);
assert.deepEqual(
	resolveGraphEscapeAction({ inspectCardOpen: false, nodeListOpen: true, fullscreen: true }),
	'node-list',
	'Escape closes the node list before fullscreen',
);
assert.deepEqual(
	resolveGraphEscapeAction({ inspectCardOpen: false, nodeListOpen: false, fullscreen: true }),
	'fullscreen',
	'Escape closes fullscreen only after internal graph overlays are gone',
);

const leftPlacement = placeGraphInspectCard({
	anchor: { x: 720, y: 260 },
	connectedPoints: [{ x: 790, y: 220 }, { x: 840, y: 320 }, { x: 180, y: 260 }],
	viewport: { width: 900, height: 600 },
	card: { width: 350, height: 420 },
	offset: 18,
});
assert.equal(leftPlacement.side, 'left', 'a right-congested node places the inspect card on the left');
assert.ok(leftPlacement.left >= 12, 'the inspect card stays inside the left viewport edge');
assert.ok(leftPlacement.top >= 12, 'the inspect card stays inside the top viewport edge');

assert.deepEqual(
	centerViewportOnSameModelPoint({
		viewport: { zoom: 2, pan: { x: 10, y: 20 } },
		before: { width: 200, height: 100 },
		after: { width: 400, height: 200 },
	}),
	{ zoom: 2, pan: { x: 110, y: 70 } },
	'fullscreen resize preserves the model point under the viewport center',
);

console.log('graph-interaction-model: passed');
