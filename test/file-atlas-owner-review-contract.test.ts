import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function source(relativePath: string): string {
	return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const tree = source('src/ui/view/file-atlas/components/AtlasTree.tsx');
const modal = source('src/app/file-atlas/FileAtlasModal.tsx');
const hostAdapter = source('src/app/file-atlas/composeFileAtlasHost.ts');
const inspector = source('src/ui/view/file-atlas/components/AtlasInspector.tsx');
const graph = source('src/ui/view/file-atlas/components/FileAtlasGraph.tsx');
const canvas = source('src/ui/component/graph/AtlasGraphCanvasImpl.tsx');
const css = source('src/styles/file-atlas.css');

assert.match(tree, /onDoubleClick=\{\(\) => props\.onOpenInEditor\(block\)\}/);
assert.match(tree, /e\.metaKey \|\| e\.ctrlKey/);
assert.ok(
	(tree.match(/onDoubleClick=\{\(e\) => e\.stopPropagation\(\)\}/g) ?? []).length >= 2,
	'fold and tray controls must not bubble a row double-click',
);
assert.match(modal, /this\.close\(\)/);
assert.match(modal, /host\.revealLine\(path, line\)/);
assert.match(hostAdapter, /view\?\.editor\?\.focus\(\)/);

assert.match(inspector, /<KeywordCard text=\{keywordText\} config=\{config\} \/>/);
assert.match(inspector, /<StatisticsCard block=\{block\} config=\{config\} \/>/);
assert.match(inspector, /keywordsEmpty/);
assert.doesNotMatch(inspector, /\{!isGroup && \(/);

assert.match(graph, /data\.edges\.filter\(\(edge\) => semantic \|\| edge\.kind !== 'semantic'\)/);
assert.match(graph, /summary=\{meta\}/);
assert.doesNotMatch(graph, /pkfa-graph-chip/);
assert.match(canvas, /summary\?: string/);
assert.match(canvas, /Copy graph as Mermaid/);
assert.match(canvas, /Copy graph as image/);

assert.match(
	css,
	/\.pkfa-search-box input[\s\S]*?box-shadow:\s*none !important;/,
	'inner search input must not draw its own Obsidian/native border shadow',
);
assert.match(css, /\.pkfa-rail-sort:focus-within/);

console.log('PASS: File Atlas owner-review interaction and layout contract');
