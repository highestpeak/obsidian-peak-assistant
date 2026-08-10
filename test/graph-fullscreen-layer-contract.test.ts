import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { graphFullscreenOpen } from '@/app/ui-host/modals/graphFullscreenGuard';

assert.equal(graphFullscreenOpen({ querySelector: () => ({}) }), true);
assert.equal(graphFullscreenOpen({ querySelector: () => null }), false);

const quickSearch = readFileSync('src/app/ui-host/modals/QuickSearchModal.tsx', 'utf8');
const fileAtlas = readFileSync('src/app/file-atlas/FileAtlasModal.tsx', 'utf8');
const canvas = readFileSync('src/ui/component/graph/AtlasGraphCanvasImpl.tsx', 'utf8');

for (const [name, source] of [['Quick Search', quickSearch], ['File Atlas', fileAtlas]] as const) {
	assert.match(source, /override close\(\): void/, `${name} owns a guarded close boundary`);
	assert.match(source, /graphFullscreenOpen/, `${name} refuses to close behind graph fullscreen`);
}
assert.match(canvas, /resolveGraphEscapeAction/, 'fullscreen Escape resolves exactly one top graph layer');
assert.match(canvas, /event\.repeat/, 'held Escape cannot cascade through multiple layers');

console.log('graph-fullscreen-layer-contract: passed');
