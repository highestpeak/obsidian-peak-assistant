import assert from 'assert';
import { readFileSync } from 'fs';

const read = (path: string): string => readFileSync(path, 'utf8');
const runtime = read('src/app/keyboard/PeakKeyboardRuntime.ts');
const registry = read('src/app/context/AppRuntimeRegistry.ts');
const main = read('main.ts');
const port = read('src/ui/keyboard/KeyboardNavigationPort.ts');
const roving = read('src/ui/keyboard/useRovingComposite.ts');
const search = read('src/ui/view/quick-search/SearchModal.tsx');
const vaultSearch = read('src/ui/view/quick-search/tab-VaultSearch.tsx');
const aiSearch = read('src/ui/view/quick-search/tab-AISearch.tsx');
const aiFooter = read('src/ui/view/quick-search/components/V2Footer.tsx');
const modeHelp = read('src/ui/view/quick-search/components/ModeHelpList.tsx');
const fileAtlas = read('src/ui/view/file-atlas/FileAtlasPanel.tsx');
const fileAtlasGraph = read('src/ui/view/file-atlas/components/FileAtlasGraph.tsx');
const fileRail = read('src/ui/view/file-atlas/components/FileRail.tsx');
const chatStudio = read('src/ui/view/chat-studio-view/ChatStudioView.tsx');
const chatMessages = read('src/ui/view/chat-view/components/messages/MessageListRenderer.tsx');
const styles = `${read('src/styles/tailwind.css')}\n${read('src/styles/peak-components.css')}`;
const templateRegistry = read('src/core/template/TemplateRegistry.ts');
const template = JSON.parse(read('templates/config/keyboard-navigation.json')) as {
	surfaceLabels: Record<string, string>;
	zoneLabels: Record<string, string>;
	a11y: Record<string, string>;
	commands: Record<string, string>;
};

assert.match(main, /composePeakKeyboardRuntime\(appContext\)/);
assert.match(main, /runtimeRegistry\.setKeyboardNavigationRuntime\(keyboardNavigation\)/);
assert.match(registry, /private keyboardNavigationRuntime:/);
assert.match(registry, /runtime\?\.dispose\(\)/);
assert.doesNotMatch(
	runtime,
	/(?:window|document)\.addEventListener\(['"]keydown/,
	'the app runtime must attach key listeners to each surface ownerDocument',
);
assert.match(runtime, /ownerDocument\.addEventListener\('keydown', state\.keydown, true\)/);
assert.match(runtime, /state\.compositionActive \|\| event\.isComposing \|\| event\.key === 'Process'/);
assert.match(runtime, /\[data-peak-keyboard-zone\]/);
assert.match(runtime, /focusNextZone\(event\.shiftKey\)/);
assert.match(runtime, /registerEscapeLayer/);

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
assert.match(fileAtlas, /usePeakKeyboardSurface\('file-atlas'/);
assert.match(chatStudio, /usePeakKeyboardSurface\('chat-studio'/);
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
assert.match(templateRegistry, /KeyboardNavigation: 'config-keyboard-navigation'/);
assert.deepStrictEqual(
	Object.keys(template.surfaceLabels).sort(),
	['ai-search', 'chat-studio', 'file-atlas', 'vault-search'],
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
assert.deepStrictEqual(
	Object.values(template.commands).sort(),
	[
		'peak-focus-ai-search',
		'peak-focus-chat-studio',
		'peak-focus-file-atlas',
		'peak-focus-next-zone',
		'peak-focus-previous-zone',
		'peak-focus-vault-search',
		'peak-return-last-focus',
		'peak-show-keyboard-map',
	].sort(),
);

console.log('keyboard-navigation-surface-contract: passed');
