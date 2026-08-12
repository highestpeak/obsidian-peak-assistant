import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(path, 'utf8');
const atlasGraph = read('src/ui/view/file-atlas/components/FileAtlasGraph.tsx');
const atlasHost = read('src/app/file-atlas/composeFileAtlasHost.ts');
const resultGraph = read('src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx');
const canvas = read('src/ui/component/graph/AtlasGraphCanvasImpl.tsx');

assert.match(atlasGraph, /ResultBrowserGraphControls/, 'File Atlas reuses the shared graph preset controls');
assert.doesNotMatch(atlasGraph, /const LAYOUTS/, 'File Atlas does not keep a second graph preset list');
assert.match(atlasGraph, /communityAvailable/, 'File Atlas exposes the shared Community projection');
assert.match(atlasGraph, /onShowSemanticChange=\{setSemantic\}/, 'Semantic edges live in the shared canvas toolbar');
assert.match(atlasHost, /communityId:\s*row\.community_id/, 'File Atlas projects canonical node community ids');
assert.match(atlasHost, /communities:/, 'File Atlas projects evidence-rich community summaries');
assert.match(resultGraph, /setSubgraph\(null\)/, 'Result Graph clears the previous projection while enrichment runs');
assert.doesNotMatch(
	resultGraph,
	/setSubgraph\(baseline\);\s*if \(!resultSubgraphDeps\)/,
	'Result Graph does not paint the baseline before deciding whether enrichment is available',
);
assert.match(canvas, /communityUnavailable/, 'Community mode presents an honest unavailable state');
assert.match(
	canvas,
	/const communityUnavailable = preset === 'community'[\s\S]*?!subgraph\.communities\?\.length/,
	'Community availability is derived from current graph evidence',
);
assert.match(
	canvas,
	/\{hasRenderableGraph && \(\s*<div ref=\{containerRef\}/,
	'an unavailable Community projection does not mount a Cytoscape canvas',
);
assert.match(
	canvas,
	/if \(!container \|\| !subgraph \|\| !surfaceHost \|\| !hasRenderableGraph\) return/,
	'the graph renderer does not construct a fallback graph for an unavailable projection',
);
assert.match(canvas, /data-graph-inspect-mode/, 'the shared canvas exposes press-to-inspect state');
assert.match(canvas, /multiSelected/, 'the shared canvas exposes persistent multi-selection styling');
assert.doesNotMatch(
	canvas,
	/selectionDimmed/,
	'persistent node selection never hides the graph base layer',
);
assert.match(canvas, /multiConnectedEdge/, 'selection emphasizes connected edges on top of the visible base graph');
assert.doesNotMatch(
	canvas,
	/addClass\('dimmed'\)/,
	'hover focus never suppresses the graph base layer',
);
assert.doesNotMatch(canvas, /selector: '[^']*\.dimmed'/, 'the graph has no subtractive hover style');
assert.match(canvas, /highlight\.addClass\('highlighted'\)/, 'hover adds an emphasis layer');
assert.doesNotMatch(canvas, /folderFocusHidden/, 'Folder focus never hides unrelated edges');
assert.doesNotMatch(canvas, /applyReadableEdgeWidths/, 'the renderer does not override authored edge widths after zoom');
assert.doesNotMatch(canvas, /minimumRenderedEdgeWidth/, 'edge visibility is not patched with a screen-space width floor');
assert.doesNotMatch(canvas, /layoutReadyState/, 'the graph canvas is not hidden behind a second layout-ready gate');
assert.doesNotMatch(canvas, /visibility: emptyMessage/, 'the graph canvas is not hidden while layout state catches up');
assert.match(
	canvas,
	/layout: bundle\.folderTree \? \{ name: 'preset' \} : undefined/,
	'only the explicit-position Folder projection bypasses Cytoscape initial layout',
);
assert.match(canvas, /name: 'fcose',[\s\S]*?animate: true,[\s\S]*?animationDuration: 500/, 'Constellation keeps the proven layout lifecycle');

console.log('graph-shared-surface-contract: passed');
