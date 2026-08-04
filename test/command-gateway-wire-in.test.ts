// B1 CommandGateway wire-in — palette bindings + manifest coverage.
//
// Verifies:
//   1. Every command id in PALETTE_COMMAND_MANIFESTS is produced by
//      composeCommandGatewayBindings (no drift).
//   2. Each binding dispatched through a real CommandGateway invokes
//      the corresponding action closure exactly once, and returns a
//      CapabilityRunResult with matching commandId.
//   3. Bindings are ordered the same as the manifest map so the
//      Obsidian command palette displays commands in the intended
//      sequence.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { CommandGateway } from '@/service/capabilities/CommandGateway';
import {
	composeCommandGatewayBindings,
	type PaletteCommandActions,
} from '@/app/commands/gateway/composeCommandGatewayBindings';
import { PALETTE_COMMAND_MANIFESTS } from '@/app/commands/gateway/manifests';

const EXPECTED_PALETTE_COMMAND_IDS = [
	'peak-open-command-center',
	'peak-open-ai-control-center',
	'peak-open-my-content',
	'peak-open-settings',
	'peak-harness-setup-wizard',
	'peak-quick-search',
	'peak-file-atlas-open',
	'peak-usage-dashboard',
	'peak-open-chat-studio',
	'peak-open-document-composer',
] as const;

function makeCounter(): { fn: () => void; count: () => number } {
	let n = 0;
	return {
		fn: () => { n += 1; },
		count: () => n,
	};
}

function makeActions(recorder: Record<string, () => void>): PaletteCommandActions {
	return {
		openCommandCenter: recorder.openCommandCenter,
		openAIControlCenter: recorder.openAIControlCenter,
		openMyContent: recorder.openMyContent,
		openSettingsModal: recorder.openSettingsModal,
		openHarnessSetupWizard: recorder.openHarnessSetupWizard,
		openQuickSearch: recorder.openQuickSearch,
		openFileAtlas: recorder.openFileAtlas,
		openUsageDashboard: recorder.openUsageDashboard,
		openChatStudio: recorder.openChatStudio,
		openDocumentComposer: recorder.openDocumentComposer,
	};
}

function testManifestCoverageMatchesBindings(): void {
	const dummy = makeActions({
		openSettingsModal: () => {},
		openCommandCenter: () => {},
		openAIControlCenter: () => {},
		openMyContent: () => {},
		openHarnessSetupWizard: () => {},
		openQuickSearch: () => {},
		openFileAtlas: () => {},
		openUsageDashboard: () => {},
		openChatStudio: () => {},
		openDocumentComposer: () => {},
	});
	const bindings = composeCommandGatewayBindings(dummy);
	const manifestIds = Object.keys(PALETTE_COMMAND_MANIFESTS);
	const bindingIds = bindings.map((b) => b.commandId);
	assert.deepStrictEqual(
		manifestIds,
		[...EXPECTED_PALETTE_COMMAND_IDS],
		'global command palette must stay limited to the ten owner-approved entry points',
	);
	assert.deepStrictEqual(
		bindingIds,
		manifestIds,
		'binding order must match PALETTE_COMMAND_MANIFESTS key order',
	);
	for (const b of bindings) {
		const m = PALETTE_COMMAND_MANIFESTS[b.commandId];
		assert.ok(m, `manifest missing for '${b.commandId}'`);
		assert.strictEqual(b.manifest.id, m.id);
		assert.strictEqual(b.manifest.title, m.title);
	}
	console.log('PASS: manifestCoverageMatchesBindings');
}

async function testDispatchInvokesActionExactlyOnce(): Promise<void> {
	const counters: Record<string, ReturnType<typeof makeCounter>> = {
		openCommandCenter: makeCounter(),
		openAIControlCenter: makeCounter(),
		openMyContent: makeCounter(),
		openSettingsModal: makeCounter(),
		openHarnessSetupWizard: makeCounter(),
		openQuickSearch: makeCounter(),
		openFileAtlas: makeCounter(),
		openUsageDashboard: makeCounter(),
		openChatStudio: makeCounter(),
		openDocumentComposer: makeCounter(),
	};
	const actions = makeActions(
		Object.fromEntries(Object.entries(counters).map(([k, c]) => [k, c.fn])) as Record<string, () => void>,
	);
	const gateway = new CommandGateway();
	for (const binding of composeCommandGatewayBindings(actions)) {
		gateway.register(binding);
	}

	// Map commandId → action key. Order matches composeCommandGatewayBindings.
	const commandToAction: Array<[string, keyof typeof counters]> = [
		['peak-open-command-center', 'openCommandCenter'],
		['peak-open-ai-control-center', 'openAIControlCenter'],
		['peak-open-my-content', 'openMyContent'],
		['peak-open-settings', 'openSettingsModal'],
		['peak-harness-setup-wizard', 'openHarnessSetupWizard'],
		['peak-quick-search', 'openQuickSearch'],
		['peak-file-atlas-open', 'openFileAtlas'],
		['peak-usage-dashboard', 'openUsageDashboard'],
		['peak-open-chat-studio', 'openChatStudio'],
		['peak-open-document-composer', 'openDocumentComposer'],
	];

	for (const [commandId, actionKey] of commandToAction) {
		const before = counters[actionKey]!.count();
		const dispatch = await gateway.dispatch(commandId);
		assert.strictEqual(dispatch.commandId, commandId);
		assert.strictEqual(dispatch.result.session.status, 'completed');
		assert.ok(dispatch.result.artifact, 'CapabilityRunResult must include artifact');
		assert.strictEqual(
			counters[actionKey]!.count() - before,
			1,
			`action '${actionKey}' must fire exactly once for '${commandId}'`,
		);
	}

	// Non-target actions untouched by other dispatches.
	for (const key of Object.keys(counters)) {
		assert.strictEqual(counters[key]!.count(), 1, `action '${key}' fired more than once`);
	}
	console.log('PASS: dispatchInvokesActionExactlyOnce');
}

async function testUnknownCommandFailsLoud(): Promise<void> {
	const gateway = new CommandGateway();
	await assert.rejects(
		gateway.dispatch('peak-not-a-command'),
		/no binding/i,
	);
	console.log('PASS: unknownCommandFailsLoud');
}

function testMainTsWiresGateway(): void {
	// Boundary check: main.ts constructs CommandGateway and iterates the
	// composed bindings. If someone re-adds a raw `this.addCommand({ id,
	// name, callback: openXxx })` we want the audit to fire.
	const mainSource = fs.readFileSync(path.resolve(process.cwd(), 'main.ts'), 'utf8');
	assert.ok(
		mainSource.includes('new CommandGateway()'),
		'main.ts must construct CommandGateway',
	);
	assert.ok(
		mainSource.includes('composeCommandGatewayBindings'),
		'main.ts must import composeCommandGatewayBindings',
	);
	assert.ok(
		mainSource.includes('AppContext.setCommandGateway('),
		'main.ts must publish the gateway on AppContext',
	);
	assert.ok(
		mainSource.includes('commandGateway.dispatch(binding.commandId)'),
		'palette callback must go through gateway.dispatch()',
	);
	assert.strictEqual(
		mainSource.match(/this\.addCommand\(/g)?.length,
		1,
		'main.ts must register commands only through the approved gateway binding loop',
	);
	console.log('PASS: mainTsWiresGateway');
}

async function run(): Promise<void> {
	testManifestCoverageMatchesBindings();
	await testDispatchInvokesActionExactlyOnce();
	await testUnknownCommandFailsLoud();
	testMainTsWiresGateway();
	console.log('command-gateway-wire-in: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
