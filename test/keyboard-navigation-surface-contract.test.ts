import assert from 'assert';
import { readFileSync } from 'fs';

const read = (path: string): string => readFileSync(path, 'utf8');
const runtime = read('src/app/keyboard/PeakKeyboardRuntime.ts');
const registry = read('src/app/context/AppRuntimeRegistry.ts');
const main = read('main.ts');
const port = read('src/ui/keyboard/KeyboardNavigationPort.ts');
const roving = read('src/ui/keyboard/useRovingComposite.ts');
const search = read('src/ui/view/quick-search/SearchModal.tsx');
const resultBrowserToolbar = read(
	'src/ui/component/result-browser/toolbar/ResultBrowserToolbar.tsx',
);
const vaultSearch = read('src/ui/view/quick-search/tab-VaultSearch.tsx');
const aiSearch = read('src/ui/view/quick-search/tab-AISearch.tsx');
const aiFooter = read('src/ui/view/quick-search/components/V2Footer.tsx');
const modeHelp = read('src/ui/view/quick-search/components/ModeHelpList.tsx');
const fileAtlas = read('src/ui/view/file-atlas/FileAtlasPanel.tsx');
const fileAtlasGraph = read('src/ui/view/file-atlas/components/FileAtlasGraph.tsx');
const fileRail = read('src/ui/view/file-atlas/components/FileRail.tsx');
const atlasBar = read('src/ui/view/file-atlas/components/AtlasBar.tsx');
const chatStudio = read('src/ui/view/chat-studio-view/ChatStudioView.tsx');
const projectList = read('src/ui/view/project-list-view/ProjectListView.tsx');
const chatHeader = read('src/ui/view/chat-view/components/Header.tsx');
const chatComposer = read('src/ui/view/chat-view/components/Composer.tsx');
const chatIndex = read('src/ui/view/chat-view/components/ConversationIndex.tsx');
const inspector = read('src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx');
const chatMessages = read('src/ui/view/chat-view/components/messages/MessageListRenderer.tsx');
const styles = `${read('src/styles/tailwind.css')}\n${read('src/styles/peak-components.css')}`;
const templateRegistry = read('src/core/template/TemplateRegistry.ts');
const template = JSON.parse(read('templates/config/keyboard-navigation.json')) as {
	activation: Record<string, string>;
	surfaceLabels: Record<string, string>;
	controlKeys: Record<string, unknown>;
	keyTips: Record<string, Array<{
		key: string;
		label: string;
		zoneId: string;
		actionId?: string;
	}>>;
	zoneLabels: Record<string, string>;
	a11y: Record<string, string>;
};

assert.match(main, /composePeakKeyboardRuntime\(\)/);
assert.match(main, /runtimeRegistry\.setKeyboardNavigationRuntime\(keyboardNavigation\)/);
assert.match(registry, /private keyboardNavigationRuntime:/);
assert.match(registry, /runtime\?\.dispose\(\)/);
assert.doesNotMatch(
	runtime,
	/(?:window|document)\.addEventListener\(['"]keydown/,
	'the app runtime must attach key listeners to each surface ownerDocument',
);
assert.match(runtime, /ownerDocument\.addEventListener\('keydown', state\.keydown, true\)/);
assert.match(runtime, /ownerDocument\.addEventListener\('keyup', state\.keyup, true\)/);
assert.match(runtime, /ownerDocument\.addEventListener\('pointerdown', state\.pointerdown, true\)/);
assert.match(runtime, /ownerDocument\.addEventListener\('scroll', state\.reposition, true\)/);
assert.match(runtime, /state\.compositionActive \|\| event\.isComposing \|\| event\.key === 'Process'/);
assert.match(runtime, /\[data-peak-keyboard-zone\]/);
assert.match(runtime, /isStandaloneKeyTipModifier\(event\)/);
assert.match(runtime, /PEAK_KEY_TIP_ACTIVATION\.holdDelayMs/);
assert.match(runtime, /resolveActiveSurface/);
assert.match(runtime, /state\.activeSurface/);
assert.match(runtime, /showKeyTips\(surface\)/);
assert.match(runtime, /MutationObserver/);
assert.match(runtime, /pk-keytip-layer/);
assert.match(runtime, /CONTROL_KEY_TIP_SELECTOR = '\[data-peak-keytip-key\]'/);
assert.match(runtime, /badge\.append\(keycap\)/);
assert.doesNotMatch(runtime, /badge\.append\(keycap, label\)/);
assert.doesNotMatch(runtime, /activateKeyTip/);
assert.match(runtime, /hideKeyTips\(ownerDocument\)/);
assert.match(runtime, /dataset\.peakKeytips = 'visible'/);
assert.doesNotMatch(runtime, /event\.key === 'F6'/);
assert.doesNotMatch(runtime, /KeyboardMap|QuestionMark/);
assert.match(runtime, /registerEscapeLayer/);
assert.match(runtime, /event\.stopImmediatePropagation\(\)/);

assert.match(roving, /item\.tabIndex = item === active \? 0 : -1/);
assert.match(roving, /root\.ownerDocument\.defaultView\?\.MutationObserver/);
assert.match(roving, /MouseEventCtor\('contextmenu'/);
assert.match(roving, /\[rootRef, options\.enabled\]/);
assert.match(chatMessages, /onContextMenu=/);
assert.match(chatMessages, /\.pkchat-msg__action--more/);
assert.match(search, /'ai-search-refine-history'/);
assert.match(aiFooter, /'ai-search-copy-menu'/);
assert.match(aiFooter, /'ai-search-table-of-contents'/);
assert.match(modeHelp, /data-result-browser-row/);

assert.match(search, /usePeakKeyboardSurface\([\s\S]*?'vault-search'[\s\S]*?'ai-search'/);
assert.match(search, /PEAK_CONTROL_KEY_TIP_KEYS\.search\.vaultTab/);
assert.match(search, /PEAK_CONTROL_KEY_TIP_KEYS\.search\.aiTab/);
assert.match(search, /PEAK_CONTROL_KEY_TIP_KEYS\.search\.aiWorkspace/);
assert.match(search, /PEAK_CONTROL_KEY_TIP_KEYS\.search\.refine/);
assert.match(search, /inspectorReturnFocusRef/);
assert.match(search, /event\.key !== 'ArrowLeft' && event\.key !== 'Escape'/);
assert.match(
	search,
	/restoreInspectorFocus\(true\);/,
	'Left and Escape must both close the Inspector before restoring its source row',
);
assert.match(search, /<VaultSearchFooterHints inspectorOpen=\{inspectorOpen\} \/>/);
assert.match(resultBrowserToolbar, /keys=\{inspectorOpen \? '←' : '→'\}/);
assert.match(resultBrowserToolbar, /description=\{inspectorOpen \? 'close inspector' : 'inspector'\}/);
assert.match(fileAtlas, /usePeakKeyboardSurface\('file-atlas'/);
assert.match(fileAtlas, /PEAK_CONTROL_KEY_TIP_KEYS\.fileAtlas\.tree/);
assert.match(fileAtlas, /PEAK_CONTROL_KEY_TIP_KEYS\.fileAtlas\.graph/);
assert.match(fileAtlas, /PEAK_CONTROL_KEY_TIP_KEYS\.fileAtlas\.search/);
assert.match(atlasBar, /PEAK_CONTROL_KEY_TIP_KEYS\.fileAtlas\.filters/);
assert.match(fileAtlasGraph, /PEAK_CONTROL_KEY_TIP_KEYS\.fileAtlas\.graphScope\.ai/);
assert.match(chatStudio, /usePeakKeyboardSurface\('chat-studio'/);
assert.match(chatStudio, /PEAK_CONTROL_KEY_TIP_KEYS\.chatStudio\.openLeft/);
assert.match(projectList, /PEAK_CONTROL_KEY_TIP_KEYS\.chatStudio\.newChat/);
assert.match(chatHeader, /PEAK_CONTROL_KEY_TIP_KEYS\.chatStudio\.header\.restoreIndex/);
assert.match(chatComposer, /PEAK_CONTROL_KEY_TIP_KEYS\.chatStudio\.composer\.send/);
assert.match(chatIndex, /PEAK_CONTROL_KEY_TIP_KEYS\.chatStudio\.index\[value\]/);
assert.match(inspector, /PEAK_CONTROL_KEY_TIP_KEYS\.search\.inspector\.close/);
assert.doesNotMatch(inspector, /<div\s+onClick=\{\(\) => setOpen/);
assert.doesNotMatch(port, /\|\s*'composer'/, 'Composer adapter belongs to phase 2');

for (const zone of [
	'vs-query',
	'vs-results',
	'as-mode-query',
	'as-primary',
	'fa-file-rail',
	'fa-atlas',
	'cs-left-navigation',
	'cs-conversation-index',
]) {
	const sources = `${search}\n${vaultSearch}\n${aiSearch}\n${fileAtlas}\n${fileAtlasGraph}\n${
		fileRail
	}\n${chatStudio}\n${
		read('src/ui/view/chat-view/view-Messages.tsx')
	}`;
	assert.ok(sources.includes(`"${zone}"`), `missing keyboard zone ${zone}`);
}

assert.doesNotMatch(
	search,
	/(?:event|e)\.key === ['"]Tab['"]/,
	'Quick Search must not hijack Tab to switch surfaces',
);
assert.doesNotMatch(
	vaultSearch,
	/(?:window|document|ownerDocument)\.addEventListener\(['"]keydown/,
	'Vault Search list navigation must stay inside the shared composite primitive',
);
assert.match(styles, /focus-visible[\s\S]*?outline:\s*2px solid/);
assert.match(styles, /@media \(forced-colors: active\)/);
assert.match(styles, /\.pk-keyboard-live-region/);
assert.match(styles, /\.pk-keytip-layer/);
assert.match(styles, /\.pk-keytip kbd/);
assert.doesNotMatch(styles, /\.pk-keyboard-map/);
assert.match(templateRegistry, /KeyboardNavigation: 'config-keyboard-navigation'/);
assert.deepStrictEqual(template.activation, {
	macOS: 'Option',
	windowsLinux: 'Alt',
	gesture: 'press-or-tap',
	holdDelayMs: 180,
});
assert.deepStrictEqual(
	Object.keys(template.surfaceLabels).sort(),
	['ai-search', 'chat-studio', 'file-atlas', 'vault-search'],
);
assert.deepStrictEqual(
	Object.keys(template.keyTips).sort(),
	['ai-search', 'chat-studio', 'file-atlas', 'vault-search'],
);
assert.deepStrictEqual(
	Object.keys(template.controlKeys).sort(),
	['aiSearch', 'chatStudio', 'fileAtlas', 'search'],
);
for (const zone of [
	'vs-query',
	'as-mode-query',
	'fa-file-rail',
	'cs-left-navigation',
]) {
	assert.ok(template.zoneLabels[zone], `keyboard config must own label for ${zone}`);
}
assert.ok(template.a11y.graphInstructions);
assert.ok(template.keyTips['vault-search'].some((tip) => tip.key === 'R' && tip.label === 'Results'));
assert.deepStrictEqual(template.keyTips['vault-search'].map((tip) => tip.key), ['Q', 'R']);
assert.deepStrictEqual(template.keyTips['file-atlas'].map((tip) => tip.key), ['F', 'I', 'S']);
assert.ok(template.keyTips['chat-studio'].some((tip) => tip.key === 'Q' && tip.label === 'Chat input'));

console.log('keyboard-navigation-surface-contract: passed');
