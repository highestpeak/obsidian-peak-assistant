import assert from 'assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PluginCommandReviewItem } from '@/core/types/plugin-command-gateway';
import { PluginCommandGatewayReviewList } from '@/ui/view/command-gateway/PluginCommandGatewayReviewList';
import { groupPluginCommandItems } from '@/ui/view/command-gateway/pluginCommandGatewayReviewModel';
import { DEFAULT_SETTINGS_STRINGS } from '@/ui/view/settings/settingsStrings';

function command(
	commandId: string,
	options: { approved?: boolean; systemBlocked?: boolean } = {},
): PluginCommandReviewItem {
	return {
		descriptor: {
			commandId,
			commandName: commandId,
			pluginId: 'calendar',
			pluginName: 'Calendar',
			pluginVersion: '1.0.0',
			sourceHash: `${commandId}-hash`,
			availability: 'available',
			interaction: options.systemBlocked ? 'modal' : 'direct',
		},
		effectiveRisk: options.systemBlocked ? 'unknown' : 'read',
		effectivePurpose: 'navigation',
		approved: options.approved ?? false,
		stale: false,
		systemBlocked: options.systemBlocked ?? false,
	};
}

const items = [
	command('calendar:allowed', { approved: true }),
	command('calendar:not-allowed'),
	command('calendar:modal', { systemBlocked: true }),
];
const html = renderToStaticMarkup(React.createElement(PluginCommandGatewayReviewList, {
	groups: groupPluginCommandItems(items),
	copy: DEFAULT_SETTINGS_STRINGS.tools.pluginCommands,
	busyKey: null,
	scanning: false,
	selectedCommandId: 'calendar:modal',
	onSelect: () => {},
	onToggle: () => {},
}));

assert.strictEqual((html.match(/role="switch"/g) ?? []).length, 2);
assert.match(html, /aria-checked="true"/);
assert.match(html, /aria-checked="false"/);
assert.match(html, /pk-command-access-toggle__track/);
assert.match(html, /pk-command-access-unavailable/);
assert.match(html, />Interactive only</);
assert.match(html, /aria-expanded="true"/);
assert.match(html, /pk-command-review-row__details/);
assert.match(html, /opens an interactive dialog/);
assert.doesNotMatch(html, /pk-command-access-reason/);
assert.doesNotMatch(html, />Metadata only</);
assert.doesNotMatch(html, />Block</);
assert.doesNotMatch(html, />Purpose</);

console.log('plugin-command-gateway-review-ui: rendered contract passed');
