import assert from 'assert';
import {
	createCommandCenterCustomizeIntent,
} from '../src/ui/view/command-center/commandCenterCustomizeIntent';
import type { ResolvedCommandCenterItem } from '../src/core/command-center';

const item: ResolvedCommandCenterItem = {
	id: 'setup-wizard',
	action: { kind: 'peak-command', commandId: 'peak-harness-setup-wizard' },
	shortLabel: 'Morning setup',
	aliases: [],
	display: 'full',
	pinnedToHome: true,
	order: 0,
	groupId: 'home',
	groupLabel: 'Home',
	fullLabel: 'Setup Wizard',
	sourceLabel: 'Peak Assistant',
	layer: 'command',
	available: true,
	hotkey: null,
};

assert.deepStrictEqual(
	createCommandCenterCustomizeIntent(item, 'peak-assistant'),
	{
		groupId: 'peak-assistant',
		itemId: 'setup-wizard',
		actionKey: 'peak:peak-harness-setup-wizard',
		catalogScope: 'commands',
		query: 'Setup Wizard',
		sourceLabel: 'Peak Assistant',
	},
	'Customize must target the source-group item and search by the canonical label even after a local rename',
);

assert.strictEqual(
	createCommandCenterCustomizeIntent({
		...item,
		action: { kind: 'vault-target', path: 'Plans/Today.md' },
		fullLabel: 'Today',
		layer: 'destination',
	}, 'navigation').catalogScope,
	'documents',
);

console.log('command-center-customize-intent: passed');
