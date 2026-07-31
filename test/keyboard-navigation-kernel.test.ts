import assert from 'assert';
import {
	isPeakEditorTarget,
	isUnmodifiedQuestionMark,
	shouldIgnoreApplicationKey,
} from '@/ui/keyboard/keyboardGuards';
import { resolveRovingKeyIntent } from '@/ui/keyboard/useRovingComposite';
import { findDirectionalGraphNode } from '@/ui/keyboard/graphKeyboardNavigation';
import {
	KEYBOARD_MAP_DEFINITIONS,
	PEAK_KEYBOARD_SURFACE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

function fakeTarget(editor: boolean): EventTarget {
	return {
		closest: () => editor ? {} : null,
	} as unknown as EventTarget;
}

assert.deepStrictEqual(resolveRovingKeyIntent('ArrowDown', 'vertical', 5), {
	kind: 'move',
	delta: 1,
});
assert.deepStrictEqual(resolveRovingKeyIntent('ArrowRight', 'vertical', 5), {
	kind: 'none',
});
assert.deepStrictEqual(resolveRovingKeyIntent('Home', 'horizontal', 5), {
	kind: 'first',
});
assert.deepStrictEqual(resolveRovingKeyIntent('PageDown', 'both', 7), {
	kind: 'page',
	delta: 7,
});
assert.deepStrictEqual(resolveRovingKeyIntent('F10', 'both', 7), {
	kind: 'context',
});

assert.strictEqual(isPeakEditorTarget(fakeTarget(true)), true);
assert.strictEqual(isPeakEditorTarget(fakeTarget(false)), false);
assert.strictEqual(
	shouldIgnoreApplicationKey({
		isComposing: false,
		key: '?',
		target: fakeTarget(true),
	}, false),
	true,
	'plain editor input must own printable keys',
);
assert.strictEqual(
	shouldIgnoreApplicationKey({
		isComposing: false,
		key: 'F6',
		target: fakeTarget(true),
	}, false),
	false,
	'F6 must remain the explicit application navigation key inside editors',
);
assert.strictEqual(
	shouldIgnoreApplicationKey({
		isComposing: true,
		key: 'F6',
		target: fakeTarget(false),
	}, false),
	true,
	'IME composition must win over surface navigation',
);
assert.strictEqual(
	isUnmodifiedQuestionMark({
		key: '?',
		metaKey: false,
		ctrlKey: false,
		altKey: false,
	} as KeyboardEvent),
	true,
);
assert.strictEqual(
	isUnmodifiedQuestionMark({
		key: '?',
		metaKey: true,
		ctrlKey: false,
		altKey: false,
	} as KeyboardEvent),
	false,
);

const graphPoints = [
	{ id: 'centre', x: 0, y: 0 },
	{ id: 'right-aligned', x: 30, y: 2 },
	{ id: 'right-diagonal', x: 20, y: 30 },
	{ id: 'left', x: -10, y: 0 },
	{ id: 'down', x: 1, y: 25 },
];
assert.strictEqual(
	findDirectionalGraphNode(graphPoints[0], graphPoints, 'right'),
	'right-aligned',
);
assert.strictEqual(
	findDirectionalGraphNode(graphPoints[0], graphPoints, 'left'),
	'left',
);
assert.strictEqual(
	findDirectionalGraphNode(graphPoints[0], graphPoints, 'down'),
	'down',
);

assert.deepStrictEqual(
	Object.keys(PEAK_KEYBOARD_SURFACE_LABELS).sort(),
	['ai-search', 'chat-studio', 'file-atlas', 'vault-search'],
	'phase 1 must expose exactly the four non-Composer surfaces',
);
assert.ok(
	KEYBOARD_MAP_DEFINITIONS.some((entry) =>
		entry.id === 'focus-next-zone' && entry.binding === 'F6'),
);
assert.ok(
	KEYBOARD_MAP_DEFINITIONS.some((entry) =>
		entry.id === 'show-keyboard-map' && entry.binding === '?'),
);
assert.ok(
	KEYBOARD_MAP_DEFINITIONS.some((entry) =>
		entry.commandId === 'peak-focus-chat-studio' && entry.binding === ''),
	'unbound global commands must not display invented default bindings',
);

console.log('keyboard-navigation-kernel: passed');
