/**
 * A11Y-01 / A11Y-02 / SHELL-03 — source-level structural guards.
 *
 * We can't run React under Node in this harness, so instead of a DOM walk we
 * assert on the source files that own the accessibility contracts:
 *
 *   • NavRow — clickable row must be keyboard operable (role="button",
 *     tabIndex, onKeyDown handling Enter/Space) and the "…" menu button
 *     must carry aria-label + title.
 *   • Chat Studio splitter — role="separator", aria-orientation, aria-label,
 *     aria-valuemin/max/now published on the JSX node.
 *   • Chat header IconButtons — aria-label present on every icon-only button.
 *   • ConversationIndex tabs — role="tab" + aria-selected + roving tabIndex.
 *   • Composer generate/edit dialogs — role="dialog" + aria-modal + Escape
 *     handler bound to ownerDocument (detached-window safety, SHELL-03).
 *
 * If any of these regress the assertions will fire long before a human
 * catches it, and the a11y contract is documented as testable code.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function read(rel: string): string {
	return readFileSync(join(ROOT, rel), 'utf8');
}

function testNavRowKeyboardStructure(): void {
	const src = read('src/ui/view/project-list-view/NavRow.tsx');
	assert.ok(/role="button"/.test(src), 'NavRow row must expose role="button"');
	assert.ok(/tabIndex=\{0\}/.test(src), 'NavRow row must be keyboard-focusable (tabIndex=0)');
	assert.ok(/onKeyDown=/.test(src), 'NavRow row must handle onKeyDown');
	assert.ok(/e\.key === 'Enter'/.test(src) && /e\.key === ' '/.test(src),
		'NavRow onKeyDown must activate on Enter and Space');
	assert.ok(/aria-current=/.test(src), 'selected NavRow must set aria-current for screen readers');
	assert.ok(/aria-label=\{menuLabel\}/.test(src) && /title=\{menuLabel\}/.test(src),
		'NavRow "…" menu button needs both aria-label AND tooltip');
	console.log('PASS: navRowKeyboardStructure');
}

function testSplitterAria(): void {
	const src = read('src/ui/view/chat-studio-view/ChatStudioView.tsx');
	assert.ok(/role="separator"/.test(src), 'splitter must be role="separator"');
	assert.ok(/aria-orientation="vertical"/.test(src),
		'splitter must publish aria-orientation="vertical"');
	assert.ok(/aria-label=\{ariaLabel\}/.test(src), 'splitter must expose an aria-label');
	// Range attributes — regression guard for the SHELL-03 aria-value* completion.
	assert.ok(/aria-valuemin=\{valueMin\}/.test(src),
		'splitter must publish aria-valuemin');
	assert.ok(/aria-valuemax=\{valueMax\}/.test(src),
		'splitter must publish aria-valuemax');
	assert.ok(/aria-valuenow=/.test(src),
		'splitter must publish aria-valuenow');
	// Keyboard nudge is the accessibility half of SHELL-03.
	assert.ok(/ArrowLeft/.test(src) && /ArrowRight/.test(src),
		'splitter must handle ArrowLeft / ArrowRight');
	assert.ok(/'Home'/.test(src) && /'End'/.test(src),
		'splitter must handle Home / End for min/max jump');
	assert.ok(/ownerDocument/.test(src), 'splitter mouse drag must go through ownerDocument');
	console.log('PASS: splitterAria');
}

function testHeaderIconButtonsLabeled(): void {
	const src = read('src/ui/view/chat-view/components/Header.tsx');
	// Every IconButton in the header must carry both a screen-reader label and
	// a hover tooltip. We do a lightweight token check: each `<IconButton` must
	// have `label=` and `title=` before its closing `>`.
	const iconButtonBlocks = src.match(/<IconButton[\s\S]*?>/g) ?? [];
	assert.ok(iconButtonBlocks.length >= 2, 'expected at least 2 IconButton usages in Header');
	for (const block of iconButtonBlocks) {
		assert.ok(/label=/.test(block), `IconButton must have label=: ${block}`);
		assert.ok(/title=/.test(block), `IconButton must have title=: ${block}`);
	}
	console.log('PASS: headerIconButtonsLabeled');
}

function testConversationIndexTabs(): void {
	const src = read('src/ui/view/chat-view/components/ConversationIndex.tsx');
	assert.ok(/role="tablist"/.test(src), 'tabs container must be role="tablist"');
	assert.ok(/role="tab"/.test(src), 'tab buttons must be role="tab"');
	assert.ok(/aria-selected=/.test(src), 'tabs must publish aria-selected');
	assert.ok(/tabIndex=\{tab === value \? 0 : -1\}/.test(src),
		'tabs must implement roving tabIndex');
	assert.ok(/ArrowRight/.test(src) && /ArrowLeft/.test(src),
		'tabs must support ArrowLeft/ArrowRight cycling');
	// Scroll spy must re-observe when messages change (RIGHT-02).
	assert.ok(/messages\.length/.test(src), 'scroll-spy must depend on messages.length so streaming turns are observed');
	console.log('PASS: conversationIndexTabs');
}

function testComposerGenerateDialog(): void {
	const src = read('src/ui/view/chat-view/components/composer/ComposerGenerateActions.tsx');
	// Both forms are dialogs; both must announce role="dialog" + aria-modal.
	const dialogNodes = src.match(/<div[^>]*role="dialog"[^>]*>/g) ?? [];
	assert.ok(dialogNodes.length >= 2,
		'expected at least 2 role="dialog" nodes (generate + edit forms)');
	for (const node of dialogNodes) {
		assert.ok(/aria-modal="true"/.test(node),
			`dialog must set aria-modal="true": ${node}`);
		assert.ok(/aria-label=/.test(node),
			`dialog must have an aria-label: ${node}`);
	}
	// Both forms must listen on ownerDocument (detached-window support).
	const ownerDocEscape = (src.match(/ownerDocument \?\? document/g) ?? []).length;
	assert.ok(ownerDocEscape >= 2,
		'expected ≥2 ownerDocument event bindings for Escape/focus, got ' + ownerDocEscape);
	// Focus restore to trigger on unmount.
	assert.ok(/triggerRef\.current/.test(src),
		'dialogs must capture and restore focus to the trigger element');
	console.log('PASS: composerGenerateDialog');
}

function testInputKeyboardDetachedWindow(): void {
	const src = read('src/ui/view/chat-view/hooks/useInputKeyboard.ts');
	assert.ok(/target\.ownerDocument\.activeElement/.test(src),
		'isFocused must consult the target textarea\'s own ownerDocument');
	assert.ok(/getRootElement\(\)/.test(src) && /ownerDocument\?\.defaultView/.test(src),
		'keydown listener must bind to the editor\'s ownerWindow, not the global window');
	console.log('PASS: inputKeyboardDetachedWindow');
}

function testMessageListLiveRegion(): void {
	const src = read('src/ui/view/chat-view/components/messages/MessageListRenderer.tsx');
	// A11Y-03 — msg-list is a log region with additions-only announcements,
	// not a polite region that re-reads on every stream tick.
	assert.ok(/role="log"/.test(src), 'msg-list must be role="log"');
	assert.ok(/aria-relevant="additions"/.test(src),
		'msg-list must limit announcements to additions only');
	assert.ok(/aria-atomic="false"/.test(src),
		'msg-list must NOT be atomic (would re-read the whole thread)');
	console.log('PASS: messageListLiveRegion');
}

function testAttachmentLightboxDetachedWindow(): void {
	const src = read('src/ui/view/chat-view/components/messages/MessageAttachmentsList.tsx');
	// MSG-02 — the input-image lightbox must be keyboard-driven, bound to the
	// component's ownerDocument (detached-window safety), and announce as a
	// modal dialog for screen readers.
	assert.ok(/role="dialog"/.test(src), 'lightbox needs role="dialog"');
	assert.ok(/aria-modal="true"/.test(src), 'lightbox needs aria-modal="true"');
	assert.ok(/ownerDocument \?\? document/.test(src),
		'lightbox keydown listener must go through the component\'s ownerDocument');
	assert.ok(/onError=/.test(src),
		'broken-image fallback needs onError on <img> so state can flip');
	console.log('PASS: attachmentLightboxDetachedWindow');
}

function run(): void {
	testNavRowKeyboardStructure();
	testSplitterAria();
	testHeaderIconButtonsLabeled();
	testConversationIndexTabs();
	testComposerGenerateDialog();
	testInputKeyboardDetachedWindow();
	testMessageListLiveRegion();
	testAttachmentLightboxDetachedWindow();
	console.log('a11y-structure: all guards passed');
}

run();
