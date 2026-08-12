import assert from 'assert';
import { readFileSync } from 'fs';

const read = (path: string): string => readFileSync(path, 'utf8');

function assertReferences(source: string, prefix: string, references: string[]): void {
	for (const reference of references) {
		assert.ok(
			source.includes(`${prefix}.${reference}`),
			`missing control-level Key Tip wiring for ${prefix}.${reference}`,
		);
	}
}

const search = [
	read('src/ui/view/quick-search/SearchModal.tsx'),
	read('src/ui/component/result-browser/toolbar/ResultBrowserToolbar.tsx'),
	read('src/ui/view/quick-search/components/ResultPaneHeader.tsx'),
	read('src/ui/view/quick-search/components/V2Footer.tsx'),
	read('src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx'),
	read('src/ui/view/quick-search/components/inspector/CommandCenterPinControl.tsx'),
	read('src/ui/view/quick-search/components/inspector/AIGraphSection.tsx'),
	read('src/ui/view/quick-search/components/V2SourcesView.tsx'),
	read('src/ui/component/result-browser/graph/ResultBrowserGraph.tsx'),
	read('src/ui/component/graph/AtlasGraphCanvasImpl.tsx'),
].join('\n');

assertReferences(search, 'PEAK_CONTROL_KEY_TIP_KEYS.search', [
	'vaultTab',
	'aiTab',
	'aiWorkspace',
	'refine',
	'view',
	'density',
	'graphPreset.constellation',
	'graphPreset.community',
	'graphPreset.flowTb',
	'graphPreset.flowLr',
	'graphPreset.folder',
	'graphPreset.orbit',
	'graphSemantic',
	'graphCanvas',
	'clearPinnedHub',
	'inspector.pin',
	'inspector.openAtlas',
	'inspector.close',
	'inspector.connected',
	'inspector.discovered',
	'inspector.aiGraph',
	'inspector.createGraph',
]);
assertReferences(search, 'PEAK_CONTROL_KEY_TIP_KEYS.aiSearch', [
	'web',
	'cancel',
	'newAnalysis',
	'lifecycle[id]',
	'outline',
	'sources',
	'actions.copy',
	'actions.export',
	'actions.saveGraph',
	'actions.openSaved',
	'actions.synthesize',
	'actions.continue',
	'actions.openChat',
]);

const aiSources = read('src/ui/view/quick-search/components/V2SourcesView.tsx');
assertReferences(aiSources, 'SOURCE_KEY_TIPS', [
	'view',
	'density',
	'graphScope.oneHop',
	'graphScope.twoHop',
	'graphScope.ai',
	'copyLinks',
	'graphPreset.constellation',
	'graphPreset.community',
	'graphPreset.flowTb',
	'graphPreset.flowLr',
	'graphPreset.folder',
	'graphPreset.orbit',
	'graphSemantic',
	'graphCanvas',
	'empty.twoHop',
	'empty.ai',
]);

const atlas = [
	read('src/ui/view/file-atlas/FileAtlasPanel.tsx'),
	read('src/ui/view/file-atlas/components/AtlasBar.tsx'),
	read('src/ui/view/file-atlas/components/FileAtlasGraph.tsx'),
	read('src/ui/view/file-atlas/components/FileRail.tsx'),
].join('\n');

assertReferences(atlas, 'PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas', [
	'sort',
	'tree',
	'graph',
	'search',
	'preset.overview',
	'preset.reading',
	'preset.writing',
	'preset.resources',
	'preset.all',
	'filters',
	'flatten',
	'expandAll',
	'collapseAll',
	'graphScope.oneHop',
	'graphScope.twoHop',
	'graphScope.ai',
	'graphLayout.constellation',
	'graphLayout.community',
	'graphLayout.flowTb',
	'graphLayout.flowLr',
	'graphLayout.folder',
	'graphLayout.orbit',
	'semantic',
	'graphCanvas',
]);

const chat = [
	read('src/ui/view/chat-studio-view/ChatStudioView.tsx'),
	read('src/ui/view/project-list-view/ProjectListView.tsx'),
	read('src/ui/view/chat-view/components/Header.tsx'),
	read('src/ui/view/chat-view/components/Composer.tsx'),
	read('src/ui/view/chat-view/components/ConversationIndex.tsx'),
	read('src/ui/view/chat-view/components/composer/ComposerPlusMenu.tsx'),
	read('src/ui/view/chat-view/components/composer/ComposerSourcesPopover.tsx'),
	read('src/ui/view/chat-view/components/composer/ComposerAssistantSelector.tsx'),
	read('src/ui/view/chat-view/components/composer/ComposerModelSelector.tsx'),
].join('\n');

assertReferences(chat, 'PEAK_CONTROL_KEY_TIP_KEYS.chatStudio', [
	'openLeft',
	'closeLeft',
	'newChat',
	'searchVault',
	'header.branch',
	'header.openSource',
	'header.refresh',
	'header.restoreIndex',
	'composer.plus',
	'composer.sources',
	'composer.graph',
	'composer.assistant',
	'composer.model',
	'composer.send',
	'index.collapse',
	'index[value]',
]);

const composer = [
	read('src/ui/view/composer/chrome/UndoRedoBar.tsx'),
	read('src/ui/view/composer/chrome/ComposerReviewNavigation.tsx'),
	read('src/ui/view/composer/chrome/DisplayStateSwitch.tsx'),
	read('src/ui/view/composer/sidecar/IntelligenceSidecar.tsx'),
	read('src/ui/view/composer/sidecar/BriefView.tsx'),
	read('src/ui/view/composer/sidecar/HistoryDetailModal.tsx'),
].join('\n');

assertReferences(composer, 'PEAK_CONTROL_KEY_TIP_KEYS.composer', [
	'workspaceBack',
	'workspaceForward',
	'display.edit',
	'display.clean',
	'display.markdown',
	'reviewDocuments',
	'comments',
	'intelligence',
	'undo',
	'redo',
	'sidecar.close',
	'sidecar.suggestions',
	'sidecar.talk',
	'sidecar.history',
	'sidecar.sensing',
	'sidecar.ask',
	'sidecar.graphs',
	'sidecar.refresh',
	'modal.close',
	'modal.previous',
	'modal.next',
	'modal.locate',
]);

const graphCanvas = read('src/ui/component/graph/AtlasGraphCanvasImpl.tsx');
assert.match(graphCanvas, /data-peak-keytip-key=\{keyTipKeys\?\.nodeList\}/);
assert.match(graphCanvas, /data-peak-keytip-key=\{keyTipKeys\?\.copyMermaid\}/);
assert.match(graphCanvas, /data-peak-keytip-key=\{keyTipKeys\?\.copyImage\}/);

console.log('keyboard-control-keytips-coverage: passed');
