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
	header,
	/communityAvailable/,
	'Vault Search explicitly opts into the Community projection',
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
assert.match(canvas, /onMouseEnter: cancelCardClose/, 'anchored graph cards keep a pointer corridor from node to card');
assert.match(
	canvas,
	/communityAiState\[hoveredLabel\.id\]\?\.generating/,
	'a streaming community explanation keeps its card open after the action button reflows',
);
assert.match(
	canvas,
	/nodeAiState\[hoveredLabel\.path\]\?\.generating/,
	'a streaming ordinary-node explanation keeps its anchored card open',
);
assert.match(canvas, /handleNodeExplain/, 'ordinary graph nodes expose an explicit AI explanation action');
assert.match(canvas, /nodeExplanationUi\.title/, 'ordinary graph nodes retain template-backed AI output beside their existing summary');
assert.doesNotMatch(
	canvas,
	/if \(cancelled\) return;/,
	'hovering away must not permanently cancel the cached community or node explanation load',
);

const semanticIndex = canvas.indexOf('label="Semantic edges"');
const nodesIndex = canvas.indexOf('<span>Nodes</span>');
const mermaidIndex = canvas.indexOf('title="Copy graph as Mermaid"');
const imageIndex = canvas.indexOf('title="Copy graph as image"');
const fullscreenIndex = canvas.indexOf("title={fullscreen ? 'Exit graph fullscreen' : 'View graph fullscreen'}");
assert.ok(
	semanticIndex >= 0 && semanticIndex < nodesIndex && nodesIndex < mermaidIndex && mermaidIndex < imageIndex && imageIndex < fullscreenIndex,
	'canvas controls remain ordered: Semantic edges, Nodes, Copy Mermaid, Copy image, Fullscreen',
);

assert.match(
	toolbar,
	/typeof semantic === 'boolean' && onSemanticChange/,
	'other Result Browser hosts retain the optional outer semantic control',
);
for (const label of ['Constellation', 'Community', 'Links →', 'Links ↓', 'Folders', 'Orbit']) {
	assert.ok(toolbar.includes(label), `graph toolbar must include the ${label} control`);
}
assert.match(toolbar, /iconOnly: true/, 'the vertical Links control must stay compact without repeating the Links label');
assert.match(toolbar, /keyTip: keyTips\['flow-lr'\]/, 'horizontal Links must expose its own Key Tip');
assert.match(toolbar, /keyTip: keyTips\['flow-tb'\]/, 'vertical Links must expose its own Key Tip');
assert.match(
	toolbar,
	/communityAvailable \? communityControls : standardControls/,
	'shared graph hosts without community evidence retain their standard layout controls',
);

console.log('result-graph-canvas-toolbar: passed');
