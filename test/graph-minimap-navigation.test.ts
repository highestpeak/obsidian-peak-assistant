import assert from 'assert';
import { readFileSync } from 'fs';
import {
	clampMiniMapCenter,
	graphExtentToMiniMapViewport,
	miniMapCenterToPan,
} from '../src/ui/component/graph/graphMiniMapNavigation';

assert.deepStrictEqual(
	graphExtentToMiniMapViewport(
		{ x1: 0, y1: 0, width: 1_000, height: 500 },
		{ x1: 250, y1: 100, x2: 750, y2: 350 },
	),
	{ x: 25, y: 20, width: 50, height: 50 },
	'a model-space graph extent must map to the same mini-map viewport rectangle',
);

assert.deepStrictEqual(
	graphExtentToMiniMapViewport(
		{ x1: 100, y1: 200, width: 400, height: 200 },
		{ x1: -200, y1: 0, x2: 800, y2: 700 },
	),
	{ x: 0, y: 0, width: 100, height: 100 },
	'a viewport larger than the graph must remain bounded by the mini map',
);

assert.deepStrictEqual(
	graphExtentToMiniMapViewport(
		{ x1: 0, y1: 0, width: 100, height: 100 },
		{ x1: -20, y1: 20, x2: 30, y2: 60 },
	),
	{ x: 0, y: 20, width: 50, height: 40 },
	'a partially off-graph viewport must retain its true size while clamping its position',
);

assert.deepStrictEqual(
	clampMiniMapCenter(
		{ x: -8, y: 96 },
		{ x: 10, y: 20, width: 20, height: 40 },
	),
	{ x: 10, y: 80 },
	'dragging must keep the viewport rectangle inside the mini map',
);

assert.deepStrictEqual(
	miniMapCenterToPan({
		bounds: { x1: 0, y1: 0, width: 1_000, height: 500 },
		center: { x: 50, y: 50 },
		zoom: 2,
		viewport: { width: 800, height: 600 },
	}),
	{ x: -600, y: -200 },
	'mini-map navigation must center the selected model point in the Cytoscape viewport',
);

const canvas = readFileSync('src/ui/component/graph/AtlasGraphCanvasImpl.tsx', 'utf8');
const styles = readFileSync('src/styles/peak-components.css', 'utf8');

assert.match(canvas, /setPointerCapture\(event\.pointerId\)/, 'mini-map drag must capture the active pointer');
assert.match(canvas, /onPointerMove=\{handleMiniMapPointerMove\}/, 'mini-map drag must continuously pan the graph');
assert.match(canvas, /onKeyDown=\{handleMiniMapKeyDown\}/, 'mini-map navigation must remain keyboard operable');
assert.doesNotMatch(
	styles,
	/\.pk-graph-minimap\s*\{[^}]*pointer-events:\s*none/s,
	'the shared mini map must not discard all pointer input',
);

console.log('graph-minimap-navigation: passed');
