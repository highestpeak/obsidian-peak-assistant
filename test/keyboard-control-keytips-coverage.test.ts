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
].join('\n');

assertReferences(search, 'PEAK_CONTROL_KEY_TIP_KEYS.search', [
	'vaultTab',
	'aiTab',
	'aiWorkspace',
	'refine',
	'view[id]',
	'density[d]',
	'graphPreset',
	'graphSemantic',
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
	'actions.copy',
	'actions.export',
	'actions.saveGraph',
	'actions.openSaved',
	'actions.synthesize',
	'actions.continue',
	'actions.openChat',
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
	'preset',
	'filters',
	'flatten',
	'expandAll',
	'collapseAll',
	'graphScope.oneHop',
	'graphScope.twoHop',
	'graphScope.ai',
	'graphLayout',
	'semantic',
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

console.log('keyboard-control-keytips-coverage: passed');
