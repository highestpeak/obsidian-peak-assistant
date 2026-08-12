import assert from 'assert';
import { readFileSync } from 'fs';

const read = (path: string): string => readFileSync(path, 'utf8');

const resultGraph = read('src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx');
const canvas = read('src/ui/component/graph/AtlasGraphCanvasImpl.tsx');
const workspaceControl = read('src/ui/component/graph-workspace/GraphWorkspaceControl.tsx');
const projectionControl = read('src/ui/component/graph-workspace/GraphProjectionControl.tsx');
const workspaceConfig = JSON.parse(read('templates/config/graph-workspace.json')) as {
	labels: {
		physicalProjections: Record<string, string>;
	};
};

assert.match(
	workspaceControl,
	/<GraphProjectionControl/,
	'the shared workspace control must own the graph projection switch',
);

assert.match(
	resultGraph,
	/onSemanticChange=\{setShowSemantic\}/,
	'Vault Search Result Graph must wire its controlled semantic state into the canvas',
);

assert.match(
	canvas,
	/label=\{semanticLayerLabel\}/,
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
assert.match(canvas, /onPointerDown:[\s\S]*?inspectPinnedRef/, 'interactive detail cards pin only after deliberate pointer input');
assert.match(
	canvas,
	/const \[hoverSummary, setHoverSummary\]/,
	'plain node hover owns a lightweight summary independently from the Shift inspect card',
);
assert.match(
	canvas,
	/setHoverSummary\(\{ label: anchor\.label, path: anchor\.path \}\)/,
	'node mouseover immediately publishes the full-path hover summary without waiting for Inspect',
);
assert.match(
	canvas,
	/data-peak-graph-hover-summary[\s\S]*?\{hoverSummary\.path \|\| title\}/,
	'the bottom hover summary renders the complete path as its primary large label',
);
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

const semanticIndex = canvas.indexOf('label={semanticLayerLabel}');
const nodesIndex = canvas.indexOf('<span>Nodes</span>');
const mermaidIndex = canvas.indexOf('title="Copy graph as Mermaid"');
const imageIndex = canvas.indexOf('title="Copy graph as image"');
const fullscreenIndex = canvas.indexOf("title={fullscreen ? 'Exit graph fullscreen' : 'View graph fullscreen'}");
assert.ok(
	semanticIndex >= 0 && semanticIndex < nodesIndex && nodesIndex < mermaidIndex && mermaidIndex < imageIndex && imageIndex < fullscreenIndex,
	'canvas controls remain ordered: Semantic edges, Nodes, Copy Mermaid, Copy image, Fullscreen',
);

for (const label of ['Constellation', 'Community', 'Flow →', '↓', 'Folders', 'Orbit']) {
	assert.ok(
		Object.values(workspaceConfig.labels.physicalProjections).includes(label),
		`graph workspace config must include the ${label} control`,
	);
}
assert.match(
	projectionControl,
	/config\.labels\.physicalProjections\[option as AtlasGraphPreset\]/,
	'projection labels must come from the shared template-backed workspace config',
);
assert.match(workspaceControl, /data-graph-workspace-scope-extension/, 'graph scopes must expand from the shared primary control');
assert.match(workspaceControl, /graphActive && 'pktw-w-8 pktw-px-0'/, 'Graph activation must compact List, Tree and Graph to icons');

console.log('result-graph-canvas-toolbar: passed');
