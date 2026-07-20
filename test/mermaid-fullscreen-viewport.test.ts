import assert from 'node:assert/strict';
import {
	MERMAID_MAX_SCALE,
	MERMAID_MIN_SCALE,
	panMermaidViewport,
	zoomMermaidViewport,
} from '../src/ui/component/mine/mermaidViewport';

function testZoomClampsToSafeRange(): void {
	const viewport = { scale: 1, x: 12, y: -8 };
	assert.equal(zoomMermaidViewport(viewport, 0.01).scale, MERMAID_MIN_SCALE);
	assert.equal(zoomMermaidViewport(viewport, 20).scale, MERMAID_MAX_SCALE);
}

function testCursorAnchorStaysFixedWhileZooming(): void {
	const current = { scale: 1, x: 30, y: -20 };
	const anchor = { x: 140, y: 75 };
	const contentPoint = {
		x: (anchor.x - current.x) / current.scale,
		y: (anchor.y - current.y) / current.scale,
	};
	const next = zoomMermaidViewport(current, 2.5, anchor);
	assert.equal(next.x + contentPoint.x * next.scale, anchor.x);
	assert.equal(next.y + contentPoint.y * next.scale, anchor.y);
}

function testPanKeepsScaleAndAddsPointerDelta(): void {
	assert.deepEqual(
		panMermaidViewport({ scale: 1.4, x: 10, y: -5 }, 24, -18),
		{ scale: 1.4, x: 34, y: -23 },
	);
}

testZoomClampsToSafeRange();
testCursorAnchorStaysFixedWhileZooming();
testPanKeepsScaleAndAddsPointerDelta();
