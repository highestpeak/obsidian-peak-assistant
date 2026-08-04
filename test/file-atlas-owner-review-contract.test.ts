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
const atlasBar = source('src/ui/view/file-atlas/components/AtlasBar.tsx');
const panel = source('src/ui/view/file-atlas/FileAtlasPanel.tsx');
const treeModel = source('src/ui/view/file-atlas/atlasTreeModel.ts');
const displayModel = source('src/ui/view/file-atlas/atlasDisplayModel.ts');
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
assert.match(modal, /host\.revealLocation\(path, location\)/);
assert.match(hostAdapter, /openVaultPathAtLocation/);
assert.match(hostAdapter, /getActiveDocumentPath/);
assert.doesNotMatch(hostAdapter, /flashRevealedEditorLine/);
assert.match(css, /\.markdown-source-view \.cm-line\.pk-document-reveal-flash/);
assert.match(css, /@keyframes pkfa-editor-reveal-line-flash/);
assert.match(css, /var\(--interactive-accent\)/);
assert.doesNotMatch(
	css.match(/@keyframes pkfa-editor-reveal-line-flash\s*\{[\s\S]*?\n\}/)?.[0] ?? '',
	/var\(--pk-/,
	'editor reveal feedback must use host-scoped Obsidian tokens, not Peak-root-only tokens',
);

assert.match(inspector, /cardPolicy\.keywords && <KeywordCard/);
assert.match(inspector, /cardPolicy\.statistics && <StatisticsCard/);
assert.match(inspector, /<SourceDetails block=\{block\} config=\{config\} \/>/);
assert.match(inspector, /displayIdentity\(block, config\)/);
assert.match(inspector, /keywordsEmpty/);
assert.match(inspector, /keywords\.map\(/);
assert.doesNotMatch(inspector, /keywordsShowAll|pkfa-kw-toggle/);
assert.match(
	css,
	/\.pkfa-inspector-scroll[\s\S]*?overflow-y:\s*auto[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/,
);
assert.match(css, /\.pkfa-card\s*\{[\s\S]*?flex:\s*0 0 auto/);
assert.match(css, /\.pkfa-preview-render[\s\S]*?max-height:[\s\S]*?overflow:\s*auto/);
assert.doesNotMatch(css, /\.pkfa-kw-list\s*\{[^}]*max-height:/);
assert.match(treeModel, /limit = 8/);
assert.doesNotMatch(inspector, /\{!isGroup && \(/);
assert.match(atlasBar, /cfg\.filterable !== false/);
assert.match(atlasBar, /filterLabel \?\? config\.kinds\[kind\]\.label/);
assert.match(panel, /case 'toggleKind'[\s\S]*?collapsed: new Set\(\)/);
assert.match(panel, /visibleKinds=\{state\.visibleKinds\}/);
assert.match(tree, /isProjectionRow\(block, visibleKinds, showFrontmatterSummary\)/);
assert.match(tree, /displayIdentity\(block, config, \{ ownerContext \}\)/);
assert.match(displayModel, /companionTitle[\s\S]*githubIdentity[\s\S]*decodedSlug/);

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
assert.match(css, /\.pkfa-rail-sort:focus-visible/);
assert.match(css, /\.pkfa-rail-sort\[data-state="open"\]/);
assert.match(
	css,
	/\.peak-file-atlas-modal\.pkfa-root \.pkfa-rail-sort:hover:not\(:disabled\)[\s\S]*?background: var\(--pk-surface-raised\) !important/,
);
assert.match(
	css,
	/\.pkfa-rail-sort-menu\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index: var\(--pk-z-popover\) !important/,
	'sort menu must stay inside File Atlas and above its content',
);
assert.match(css, /grid-template-rows:\s*42px auto 42px auto 46px minmax\(0, 1fr\) auto;/);
assert.match(css, /\[data-subview="graph"\] \.pkfa-content\s*\{[\s\S]*?grid-template-rows:\s*42px auto 42px minmax\(0, 1fr\);/);
assert.match(panel, /className="pkfa-document-context-slot"/);
assert.match(panel, /type: 'select'; id: string \| null/);
assert.match(panel, /dispatch\(\{ type: 'select', id: firstVisibleId \}\)/);
assert.match(panel, /<div className="pkfa-empty-state">\{s\.treeEmpty\}<\/div>/);
assert.match(
	css,
	/\.peak-file-atlas-modal\.pkfa-root \.pkfa-bar-icon-btn\s*\{[\s\S]*?width:\s*30px !important;[\s\S]*?height:\s*30px !important;[\s\S]*?border:\s*1px solid var\(--pk-border\) !important;[\s\S]*?color:\s*var\(--pk-text-secondary\) !important;/,
	'File Atlas icon controls must defeat the Obsidian reset and remain visible',
);

console.log('PASS: File Atlas owner-review interaction and layout contract');
