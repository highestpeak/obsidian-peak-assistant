import assert from 'assert';
import type {
	PluginCommandReviewItem,
	PluginCommandRisk,
} from '@/core/types/plugin-command-gateway';
import {
	filterPluginCommandItems,
	formatPluginCommandCopy,
	groupPluginCommandItems,
	isPluginCommandBulkEligible,
	pluginCommandScanRatio,
	summarizePluginCommandItems,
} from '@/ui/view/command-gateway/pluginCommandGatewayReviewModel';

function item(
	commandId: string,
	risk: PluginCommandRisk,
	options: {
		approved?: boolean;
		systemBlocked?: boolean;
		pluginId?: string;
		availability?: 'available' | 'conditional' | 'unavailable';
	} = {},
): PluginCommandReviewItem {
	const pluginId = options.pluginId ?? commandId.split(':')[0]!;
	return {
		descriptor: {
			commandId,
			commandName: commandId.replace(':', ' '),
			pluginId,
			pluginName: pluginId,
			pluginVersion: '1.0.0',
			sourceHash: `${commandId}-hash`,
			availability: options.availability ?? 'available',
			interaction: 'direct',
		},
		effectiveRisk: risk,
		effectivePurpose: 'other',
		approved: options.approved ?? false,
		stale: false,
		systemBlocked: options.systemBlocked ?? false,
	};
}

const ITEMS = [
	item('calendar:open-week', 'read', { approved: true }),
	item('calendar:open-month', 'read'),
	item('periodic:create-week', 'edit'),
	item('quickadd:open-modal', 'unknown', { systemBlocked: true }),
];

function testFilteringAndSummary(): void {
	const notAllowed = filterPluginCommandItems(ITEMS, {
		query: '',
		pluginId: 'all',
		risk: 'all',
		access: 'not-allowed',
	});
	assert.deepStrictEqual(notAllowed.map((entry) => entry.descriptor.commandId), [
		'calendar:open-month',
		'periodic:create-week',
	]);
	const searched = filterPluginCommandItems(ITEMS, {
		query: 'periodic',
		pluginId: 'all',
		risk: 'edit',
		access: 'all',
	});
	assert.strictEqual(searched.length, 1);
	assert.deepStrictEqual(summarizePluginCommandItems(ITEMS), {
		approved: 1,
		notAllowed: 2,
		unavailable: 1,
	});
	console.log('PASS: filteringAndSummary');
}

function testGroupingAndEligibility(): void {
	const conditional = item('editor-tools:sort-selection', 'edit', {
		availability: 'conditional',
	});
	const groups = groupPluginCommandItems([...ITEMS, conditional]);
	assert.strictEqual(groups.length, 4);
	assert.strictEqual(groups[0]?.eligibleCount, 1);
	assert.strictEqual(isPluginCommandBulkEligible(ITEMS[0]!), false);
	assert.strictEqual(isPluginCommandBulkEligible(ITEMS[2]!), true);
	assert.strictEqual(isPluginCommandBulkEligible(ITEMS[3]!), false);
	assert.strictEqual(isPluginCommandBulkEligible(conditional), true);
	assert.strictEqual(summarizePluginCommandItems([conditional]).notAllowed, 1);
	console.log('PASS: groupingAndEligibility');
}

function testScanProgress(): void {
	assert.strictEqual(pluginCommandScanRatio({ phase: 'discovering', processedCommands: 0, totalCommands: 0, pluginCount: 0 }), null);
	assert.strictEqual(pluginCommandScanRatio({ phase: 'checking', processedCommands: 0, totalCommands: 10, pluginCount: 3 }), null);
	assert.strictEqual(pluginCommandScanRatio({ phase: 'explaining', processedCommands: 0, totalCommands: 10, pluginCount: 3 }), null);
	assert.strictEqual(pluginCommandScanRatio({ phase: 'explaining', processedCommands: 5, totalCommands: 10, pluginCount: 3 }), 0.5);
	assert.strictEqual(pluginCommandScanRatio({ phase: 'complete', processedCommands: 10, totalCommands: 10, pluginCount: 3 }), 1);
	assert.strictEqual(
		formatPluginCommandCopy('{count} commands from {plugin}', { count: 3, plugin: 'Calendar' }),
		'3 commands from Calendar',
	);
	console.log('PASS: scanProgress');
}

testFilteringAndSummary();
testGroupingAndEligibility();
testScanProgress();
