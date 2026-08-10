import assert from 'assert';
import { readFileSync } from 'fs';

const read = (path: string): string => readFileSync(path, 'utf8');

const header = read('src/ui/view/quick-search/components/ResultPaneHeader.tsx');
const resultGraph = read('src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx');
const canvas = read('src/ui/component/graph/AtlasGraphCanvasImpl.tsx');
const toolbar = read('src/ui/component/result-browser/toolbar/ResultBrowserToolbar.tsx');

assert.doesNotMatch(
	header,
	/semantic=\{|onSemanticChange=\{/,
	'Vault Search outer graph header must not own the semantic-edge switch',
);

assert.match(
	resultGraph,
	/onSemanticChange=\{setShowSemantic\}/,
	'Vault Search Result Graph must wire its controlled semantic state into the canvas',
);

assert.match(
	canvas,
	/label="Semantic edges"/,
	'the canvas must present Semantic edges as a labelled graph-layer control',
);
assert.match(
	canvas,
	/<span>Nodes<\/span>/,
	'the canvas node navigator must be visibly named Nodes instead of reusing an unexplained List icon',
);
assert.match(canvas, /title="Copy graph as Mermaid"/, 'Mermaid remains a direct, titled export action');
assert.match(canvas, /title="Copy graph as image"/, 'image remains a direct, titled export action');

const semanticIndex = canvas.indexOf('label="Semantic edges"');
const nodesIndex = canvas.indexOf('<span>Nodes</span>');
const mermaidIndex = canvas.indexOf('title="Copy graph as Mermaid"');
const imageIndex = canvas.indexOf('title="Copy graph as image"');
assert.ok(
	semanticIndex >= 0 && semanticIndex < nodesIndex && nodesIndex < mermaidIndex && mermaidIndex < imageIndex,
	'canvas controls remain ordered: Semantic edges, Nodes, Copy Mermaid, Copy image',
);

assert.match(
	toolbar,
	/typeof semantic === 'boolean' && onSemanticChange/,
	'other Result Browser hosts retain the optional outer semantic control',
);

console.log('result-graph-canvas-toolbar: passed');
