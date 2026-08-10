import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync('src/ui/component/graph/AtlasGraphCanvasImpl.tsx', 'utf8');
const css = readFileSync('src/styles/peak-components.css', 'utf8');

assert.match(canvas, /portalHostForDocument\(fullscreen\.ownerDocument\)/, 'fullscreen portals into the graph window, including popouts');
assert.match(canvas, /host\.className = 'pk-graph-surface-host'/, 'the live graph owns one persistent surface host');
assert.match(canvas, /target\.appendChild\(surfaceHost\)/, 'fullscreen moves the same graph surface instead of building a second Cytoscape core');
assert.match(canvas, /usePeakEscapeLayer\(/, 'fullscreen registers with the shared Escape stack');
assert.match(canvas, /event\.stopImmediatePropagation\(\)/, 'the first Escape is contained before the underlying Obsidian modal can close');
assert.match(canvas, /trigger\.focus\(\{ preventScroll: true \}\)/, 'closing fullscreen restores the invoking control');
assert.match(canvas, /body\.style\.overflow = 'hidden'/, 'the owner document is scroll-locked while fullscreen is open');
assert.match(canvas, /label="Zoom out"/, 'fullscreen exposes explicit zoom-out');
assert.match(canvas, /label="Zoom in"/, 'fullscreen exposes explicit zoom-in');
assert.match(canvas, /communityInteraction\.ui\.fitAll/, 'fullscreen exposes a true fit-entire-graph action');
assert.match(canvas, /communityInteraction\.ui\.readableView/, 'fullscreen separately exposes the readable viewport action');
assert.match(canvas, /View graph fullscreen/, 'the direct graph toolbar exposes fullscreen beside image export');
assert.match(css, /\.pk-graph-fullscreen-overlay\s*\{[\s\S]*position: fixed;/, 'fullscreen visually covers the owner window');
assert.match(css, /overscroll-behavior: contain;/, 'fullscreen wheel and pan stay contained');

console.log('result-graph-fullscreen-contract: passed');
