import assert from 'assert';
import { readFileSync } from 'fs';

const read = (path: string): string => readFileSync(path, 'utf8');
const root = read('src/ui/view/composer/ComposerRoot.tsx');
const selection = read('src/ui/view/composer/chrome/SelectionToolbar.tsx');
const contextual = read('src/ui/view/composer/chrome/useComposerContextualToolbarNavigation.ts');
const blockActions = read('src/ui/view/composer/chrome/BlockActionRow.tsx');
const table = read('src/ui/view/composer/blocks/table/TableToolbar.tsx');
const image = read('src/ui/view/composer/blocks/image/ImageBlockView.tsx');
const controls = read('src/ui/view/composer/chrome/UndoRedoBar.tsx');
const segmented = read('src/ui/components/primitives/Segmented.tsx');
const sidecar = read('src/ui/view/composer/sidecar/IntelligenceSidecar.tsx');
const brief = read('src/ui/view/composer/sidecar/BriefView.tsx');
const history = read('src/ui/view/composer/sidecar/HistoryView.tsx');
const comments = read('src/ui/view/composer/chrome/CommentPanel.tsx');
const relatedModal = read('src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx');
const historyModal = read('src/ui/view/composer/sidecar/HistoryDetailModal.tsx');

assert.match(root, /usePeakKeyboardSurface\('composer', rootRef, composerKeyboardAdapter\)/);
for (const actionId of [
	'document',
	'selection-toolbar',
	'block-actions',
	'object-toolbar',
	'sidecar-content',
]) {
	assert.ok(root.includes(`${actionId}:`) || root.includes(`'${actionId}':`),
		`missing Composer adapter action ${actionId}`);
}
assert.match(root, /COMPOSER_KEY_TIP_RESOLVERS\[actionId\]/);
assert.match(root, /lastFocusedBlockIdRef/);
assert.match(root, /data-peak-keyboard-zone="cv-document"/);

assert.match(selection, /event\.isComposing \|\| event\.key === 'Process'/);
assert.match(selection, /event\.altKey[\s\S]*?event\.key !== 'F10'/);
assert.match(selection, /useRovingComposite\(toolbarRef/);
assert.match(selection, /orientation: 'horizontal'/);
assert.match(selection, /dismissedLiveRef/);
assert.match(selection, /restoreDomSelectionFromSource\(root, live\)/);
assert.match(selection, /data-composer-contextual-toolbar="selection"/);

assert.match(contextual, /event\.key === 'F10'/);
assert.match(contextual, /currentIndex \+ 1/);
assert.match(contextual, /event\.key !== 'Escape'/);
assert.match(contextual, /origin\?\.isConnected/);

for (const [source, kind] of [
	[blockActions, 'block'],
	[table, 'table'],
	[image, 'image'],
] as const) {
	assert.ok(source.includes(`data-composer-contextual-toolbar="${kind}"`), `${kind} toolbar must register`);
	assert.match(source, /useRovingComposite/);
}
assert.match(blockActions, /querySelector<HTMLElement>\('\[aria-expanded="true"\]'\)/);
assert.match(table, /const closeMenu/);
assert.match(table, /aria-expanded=\{menuOpen\}/);
assert.match(image, /const closeInlinePanels/);
assert.match(image, /panelTriggerRef/);
assert.match(image, /if \(!copyOpen && !renameOpen && !converterOpen && !editOpen\) return/);

assert.match(controls, /PEAK_CONTROL_KEY_TIP_KEYS\.composer\.workspaceBack/);
assert.match(controls, /PEAK_CONTROL_KEY_TIP_KEYS\.composer\.contentWidth/);
assert.match(controls, /PEAK_CONTROL_KEY_TIP_KEYS\.composer\.intelligence/);
assert.match(controls, /intelligenceTriggerRef/);
assert.match(segmented, /useRovingComposite\(rootRef/);
assert.match(segmented, /data-peak-keytip-key=\{opt\.keyTipKey\}/);

assert.match(sidecar, /useRovingComposite\(tabsRef/);
assert.match(sidecar, /PEAK_CONTROL_KEY_TIP_KEYS\.composer\.sidecar\.close/);
assert.match(sidecar, /onKeyDown=\{closeOnUnhandledEscape\}/);
assert.match(brief, /pk-brief-action--primary[\s\S]*?sidecar\.ask[\s\S]*?onAskCopilot/);
assert.match(brief, /pk-brief-action"[\s\S]*?sidecar\.refresh[\s\S]*?onRefreshSuggestions/);
assert.match(brief, /pk-sensing-control[\s\S]*?sidecar\.sensing/);
assert.doesNotMatch(brief, /pk-suggestion-defer[\s\S]{0,240}sidecar\.ask/);
assert.doesNotMatch(brief, /pk-material-detail-action[\s\S]{0,240}sidecar\.refresh/);
assert.match(history, /rememberBy: 'data-history-activity-id'/);
assert.match(history, /rememberBy: 'data-history-source'/);
assert.match(comments, /triggerRef\?\.current/);
assert.match(comments, /event\.defaultPrevented \|\| event\.key !== 'Escape'/);

assert.match(relatedModal, /anchors\[actionId\]/);
assert.match(relatedModal, /usePeakKeyboardSurface\('composer', rootRef, keyboardAdapter\)/);
assert.match(relatedModal, /onCloseAutoFocus/);
assert.match(historyModal, /usePeakKeyboardSurface\('composer', rootRef\)/);
assert.match(historyModal, /PEAK_CONTROL_KEY_TIP_KEYS\.composer\.modal\.close/);
assert.match(historyModal, /onCloseAutoFocus/);

console.log('keyboard-composer-adapter: passed');
