import assert from 'assert';
import { readFileSync } from 'fs';
import {
	isStandaloneKeyTipModifier,
	keyTipSelectionKey,
} from '@/ui/keyboard/keyboardGuards';
import { resolveRovingKeyIntent } from '@/ui/keyboard/useRovingComposite';
import { findDirectionalGraphNode } from '@/ui/keyboard/graphKeyboardNavigation';
import {
	PEAK_KEY_TIP_ACTIVATION,
	PEAK_CONTROL_KEY_TIP_KEYS,
	PEAK_KEYBOARD_SURFACE_LABELS,
	PEAK_KEY_TIP_DEFINITIONS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

function modifierEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
	return {
		key: 'Alt',
		altKey: true,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		repeat: false,
		getModifierState: () => false,
		...overrides,
	} as KeyboardEvent;
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

assert.strictEqual(isStandaloneKeyTipModifier(modifierEvent()), true);
assert.strictEqual(isStandaloneKeyTipModifier(modifierEvent({ repeat: true })), false);
assert.strictEqual(isStandaloneKeyTipModifier(modifierEvent({ ctrlKey: true })), false);
assert.strictEqual(isStandaloneKeyTipModifier(modifierEvent({ shiftKey: true })), false);
assert.strictEqual(
	isStandaloneKeyTipModifier(modifierEvent({ getModifierState: (key) => key === 'AltGraph' })),
	false,
	'AltGraph must remain available for text entry',
);
assert.strictEqual(keyTipSelectionKey(modifierEvent({ key: 'q', altKey: false })), 'Q');
assert.strictEqual(keyTipSelectionKey(modifierEvent({ key: 'q', altKey: true })), null);
assert.strictEqual(keyTipSelectionKey(modifierEvent({ key: '?', altKey: false })), null);

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
	'Key Tips must expose exactly the four non-Composer surfaces',
);
assert.deepStrictEqual(
	PEAK_KEY_TIP_DEFINITIONS['vault-search'].map((tip) => tip.key),
	['Q', 'R'],
);
assert.deepStrictEqual(
	PEAK_KEY_TIP_DEFINITIONS['file-atlas'].map((tip) => tip.key),
	['F', 'I', 'S'],
);
assert.deepStrictEqual(PEAK_KEY_TIP_ACTIVATION, {
	holdDelayMs: 180,
	gesture: 'press-or-tap',
});
assert.ok(
	PEAK_KEY_TIP_DEFINITIONS['chat-studio'].some((tip) =>
		tip.key === 'Q' && tip.zoneId === 'cs-composer'),
);
const template = JSON.parse(readFileSync('templates/config/keyboard-navigation.json', 'utf8')) as {
	keyTips: typeof PEAK_KEY_TIP_DEFINITIONS;
	controlKeys: typeof PEAK_CONTROL_KEY_TIP_KEYS;
};
assert.deepStrictEqual(
	template.keyTips,
	PEAK_KEY_TIP_DEFINITIONS,
	'compiled Key Tips must mirror the product-owned template',
);
assert.deepStrictEqual(
	template.controlKeys,
	PEAK_CONTROL_KEY_TIP_KEYS,
	'compiled control Key Tips must mirror the product-owned template',
);
assert.strictEqual(PEAK_CONTROL_KEY_TIP_KEYS.search.vaultTab, 'V');
assert.strictEqual(PEAK_CONTROL_KEY_TIP_KEYS.search.inspector.close, 'X');
assert.strictEqual(PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphScope.ai, 'A');
assert.strictEqual(PEAK_CONTROL_KEY_TIP_KEYS.chatStudio.composer.send, 'E');

console.log('keyboard-navigation-kernel: passed');
