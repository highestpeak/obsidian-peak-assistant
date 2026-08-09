import assert from 'assert';
import { readFileSync } from 'fs';

const displaySwitch = readFileSync('src/ui/view/composer/chrome/DisplayStateSwitch.tsx', 'utf8');
const undoBar = readFileSync('src/ui/view/composer/chrome/UndoRedoBar.tsx', 'utf8');
const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const config = JSON.parse(readFileSync('templates/config/composer.json', 'utf8'));

assert.match(displaySwitch, /'edit' \| 'clean'/, 'Composer must have exactly edit and clean display states');
assert.doesNotMatch(displaySwitch, /value:\s*'work'/, 'legacy work view cannot remain a visible state');
assert.doesNotMatch(displaySwitch, /value:\s*'all'/, 'review-all cannot remain a visible state');
assert.equal(config.chrome.displayStates.edit, '编辑视图');
assert.equal(config.chrome.displayStates.clean, '纯净阅读');
assert.equal(config.chrome.displayStates.nativeMarkdown, '原生 Markdown');
assert.match(undoBar, /reviewAll/, 'review-all must remain a contextual action');
assert.match(root, /reviewAll/, 'review-all must expand pending candidates without becoming a third mode');
assert.match(
	displaySwitch,
	/value: 'markdown' as const,[\s\S]*?label: s\.nativeMarkdown,[\s\S]*?keyTipKey: PEAK_CONTROL_KEY_TIP_KEYS\.composer\.display\.markdown/,
	'Native Markdown must be the third current-view action',
);
assert.doesNotMatch(
	undoBar,
	/defaultDocumentView|futureLabel|pk-composer-default-view/,
	'the Composer toolbar must not expose future-open policy or a redundant Composer option',
);
assert.equal(config.chrome.defaultDocumentView, undefined);

console.log('composer-display-state-contract: passed');
