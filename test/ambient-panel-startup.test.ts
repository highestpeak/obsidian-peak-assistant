import assert from 'assert';
import {
	markAmbientPushPanelAutoOpened,
	shouldAutoOpenAmbientPushPanel,
} from '@/service/ambient/ambientPanelStartup';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from '@/core/types/ambient';

assert.strictEqual(
	shouldAutoOpenAmbientPushPanel(undefined),
	true,
	'Missing ambient settings should auto-open once for legacy/default users',
);

const opened = markAmbientPushPanelAutoOpened(undefined);
assert.strictEqual(opened.autoOpenedPanel, true, 'mark should persist the first auto-open');
assert.strictEqual(
	shouldAutoOpenAmbientPushPanel(opened),
	false,
	'Panel should not auto-open again after the first successful startup open',
);

assert.strictEqual(
	shouldAutoOpenAmbientPushPanel({ ...DEFAULT_AMBIENT_PUSH_SETTINGS, enabled: false }),
	false,
	'Disabled ambient push should not auto-open the panel',
);

const custom = markAmbientPushPanelAutoOpened({
	...DEFAULT_AMBIENT_PUSH_SETTINGS,
	maxPushItems: 12,
});
assert.strictEqual(custom.maxPushItems, 12, 'mark should preserve existing ambient settings');

console.log('ambient-panel-startup tests passed');
