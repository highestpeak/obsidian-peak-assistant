import assert from 'assert';
import type { PluginCommandPort } from '@/core/ports/PluginCommandPort';
import type { PluginCommandGatewayAuditPort } from '@/core/ports/PluginCommandGatewayAuditPort';
import type {
	PluginCommandDescriptor,
	PluginCommandExecutionObservation,
	PluginCommandGatewayAuditReceipt,
	PluginCommandGatewayConfig,
	PluginCommandGatewaySettings,
} from '@/core/types/plugin-command-gateway';
import { OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME } from '@/core/types/plugin-command-gateway';
import { PluginCommandGatewayRuntime } from '@/service/command-gateway/PluginCommandGatewayRuntime';
import { DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG } from '@/service/command-gateway/PluginCommandGatewayDefaults';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';

const SAFE: PluginCommandDescriptor = {
	commandId: 'calendar:open-week',
	commandName: 'Open weekly calendar',
	pluginId: 'calendar',
	pluginName: 'Calendar',
	pluginVersion: '1.0.0',
	sourceHash: 'safe-v1',
	availability: 'available',
	interaction: 'unknown',
};
const EDIT: PluginCommandDescriptor = {
	commandId: 'periodic-notes:create-weekly',
	commandName: 'Create weekly note',
	pluginId: 'periodic-notes',
	pluginName: 'Periodic Notes',
	pluginVersion: '2.0.0',
	sourceHash: 'edit-v1',
	availability: 'available',
	interaction: 'unknown',
};
const DESTRUCTIVE: PluginCommandDescriptor = {
	commandId: 'bulk-tools:delete-all',
	commandName: 'Delete all generated notes',
	pluginId: 'bulk-tools',
	pluginName: 'Bulk Tools',
	pluginVersion: '3.0.0',
	sourceHash: 'destroy-v1',
	availability: 'available',
	interaction: 'unknown',
};
const MODAL: PluginCommandDescriptor = {
	commandId: 'quickadd:open-capture',
	commandName: 'Open capture modal',
	pluginId: 'quickadd',
	pluginName: 'QuickAdd',
	pluginVersion: '1.0.0',
	sourceHash: 'modal-v1',
	availability: 'available',
	interaction: 'unknown',
};

class FakeCommandPort implements PluginCommandPort {
	descriptors: PluginCommandDescriptor[] = [SAFE, EDIT, DESTRUCTIVE, MODAL];
	executed: string[] = [];

	async discover(): Promise<readonly PluginCommandDescriptor[]> {
		return this.descriptors;
	}

	async preflight(commandId: string) {
		const found = this.descriptors.find((entry) => entry.commandId === commandId);
		if (found?.availability === 'conditional') {
			return { commandId, availability: 'unavailable' as const, reason: 'active-editor-required' };
		}
		return found
			? { commandId, availability: found.availability }
			: { commandId, availability: 'unavailable' as const, reason: 'missing' };
	}

	async execute(commandId: string): Promise<PluginCommandExecutionObservation> {
		this.executed.push(commandId);
		const before = {
			activeFilePath: 'Inbox.md',
			activeLeafType: 'markdown',
			openModalCount: 0,
			vaultFileCount: 1,
			files: { 'Inbox.md': { mtime: 1, size: 10 } },
		};
		const after = commandId === EDIT.commandId
			? {
					activeFilePath: 'Weekly/2026-W31.md',
					activeLeafType: 'markdown',
					openModalCount: 0,
					vaultFileCount: 2,
					files: {
						'Inbox.md': { mtime: 1, size: 10 },
						'Weekly/2026-W31.md': { mtime: 2, size: 20 },
					},
				}
			: before;
		return {
			invoked: true,
			before,
			after,
			changedPaths: commandId === EDIT.commandId ? ['Weekly/2026-W31.md'] : [],
			changedPathCount: commandId === EDIT.commandId ? 1 : 0,
			changedPathsTruncated: false,
			activeFileChanged: before.activeFilePath !== after.activeFilePath,
			activeLeafChanged: false,
			modalCountDelta: 0,
			vaultFileCountDelta: after.vaultFileCount - before.vaultFileCount,
			observableChange: before !== after,
			summary: before === after ? 'no-observable-change' : 'active-file, vault-files:1, changed-paths:1',
		};
	}
}

class FakeAuditPort implements PluginCommandGatewayAuditPort {
	receipts: PluginCommandGatewayAuditReceipt[] = [];
	throwOnAppend = false;

	async append(receipt: PluginCommandGatewayAuditReceipt): Promise<void> {
		if (this.throwOnAppend) throw new Error('disk full');
		this.receipts.push(receipt);
	}

	async listRecent(limit: number): Promise<readonly PluginCommandGatewayAuditReceipt[]> {
		return this.receipts.slice(-limit).reverse();
	}

	async drain(): Promise<void> {}
}

function curatorFinding(commandId: string) {
	return {
		commandId,
		recommend: true,
		risk: commandId === EDIT.commandId ? 'edit' : 'read',
		purpose: commandId === EDIT.commandId ? 'planning' : 'navigation',
		summary: `Curated ${commandId}`,
		evidence: ['Command name and plugin identity'],
		requiresActiveEditor: false,
		interaction: 'direct',
		expectedObservation: commandId === EDIT.commandId ? 'vault' : 'workspace',
		toolDescription: `Execute ${commandId}`,
		confirmation: commandId === EDIT.commandId ? 'per-run' : 'none',
		skillName: `Skill ${commandId}`,
		skillDescription: `Use ${commandId}`,
		skillInstructions: `Invoke only when the user requests ${commandId}.`,
	};
}

function createHarness(
	curateResponse?: unknown,
	options: {
		queryStructured?: () => Promise<unknown>;
		config?: PluginCommandGatewayConfig;
	} = {},
) {
	const commandPort = new FakeCommandPort();
	const auditPort = new FakeAuditPort();
	let gatewaySettings: PluginCommandGatewaySettings = { reviews: {}, findings: {} };
	let now = 100;
	const runtime = new PluginCommandGatewayRuntime({
		commandPort,
		auditPort,
		aiServiceManager: {
			async queryStructured() {
				if (options.queryStructured) return options.queryStructured();
				return curateResponse ?? {
					findings: [
						curatorFinding(SAFE.commandId),
						curatorFinding(EDIT.commandId),
						curatorFinding('invented:command'),
					],
				};
			},
		} as any,
		templateManager: {
			async loadJson(): Promise<PluginCommandGatewayConfig> {
				return options.config ?? DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG;
			},
		} as any,
		getSettings: () => ({ pluginCommandGateway: gatewaySettings }) as any,
		persistSettings: async (next) => {
			gatewaySettings = next;
		},
		now: () => ++now,
	});
	return {
		runtime,
		commandPort,
		auditPort,
		getSettings: () => gatewaySettings,
	};
}

function toolCtx() {
	return {
		loopId: 'golden-loop',
		stepIndex: 0,
		tier: 'fast' as const,
		signal: new AbortController().signal,
	};
}

async function testDefaultOffAndSystemBlock(): Promise<void> {
	const harness = createHarness();
	const snapshot = await harness.runtime.refresh();
	assert.strictEqual(snapshot.approvedCount, 0);
	assert.strictEqual((await harness.runtime.getToolDefinitions()).length, 0);
	const destructive = snapshot.commands.find((item) => item.descriptor.commandId === DESTRUCTIVE.commandId);
	assert.strictEqual(destructive?.effectiveRisk, 'destructive');
	assert.strictEqual(destructive?.systemBlocked, true);
	const modal = snapshot.commands.find((item) => item.descriptor.commandId === MODAL.commandId);
	assert.strictEqual(modal?.effectiveRisk, 'edit');
	assert.strictEqual(modal?.descriptor.interaction, 'modal');
	assert.strictEqual(modal?.systemBlocked, true);
	await assert.rejects(
		() => harness.runtime.review(MODAL.commandId, {
			decision: 'allow',
			risk: 'edit',
			purpose: 'capture',
		}),
		/modal-only/,
	);
	console.log('PASS: defaultOffAndSystemBlock');
}

async function testTemplaterCommandsUseActionVerbFallbacks(): Promise<void> {
	const harness = createHarness();
	harness.commandPort.descriptors.push(
		{
			...SAFE,
			commandId: 'templater-obsidian:jump-to-next-cursor-location',
			commandName: 'Jump to next cursor location',
			pluginId: 'templater-obsidian',
			pluginName: 'Templater',
			sourceHash: 'templater-jump-v1',
		},
		{
			...EDIT,
			commandId: 'templater-obsidian:replace-in-file-templater',
			commandName: 'Replace templates in the active file',
			pluginId: 'templater-obsidian',
			pluginName: 'Templater',
			sourceHash: 'templater-replace-v1',
		},
	);
	const snapshot = await harness.runtime.refresh();
	const jump = snapshot.commands.find((entry) => entry.descriptor.commandId.endsWith('jump-to-next-cursor-location'));
	const replace = snapshot.commands.find((entry) => entry.descriptor.commandId.endsWith('replace-in-file-templater'));
	assert.strictEqual(jump?.effectiveRisk, 'read');
	assert.strictEqual(jump?.systemBlocked, false);
	assert.strictEqual(replace?.effectiveRisk, 'edit');
	assert.strictEqual(replace?.systemBlocked, false);
	console.log('PASS: templaterCommandsUseActionVerbFallbacks');
}

async function testCuratorNeverAuthorizes(): Promise<void> {
	const harness = createHarness();
	const snapshot = await harness.runtime.curate();
	assert.strictEqual(snapshot.approvedCount, 0);
	assert.strictEqual(harness.getSettings().reviews[SAFE.commandId], undefined);
	assert.ok(harness.getSettings().findings[SAFE.commandId]);
	assert.strictEqual(harness.getSettings().findings['invented:command'], undefined);
	console.log('PASS: curatorNeverAuthorizes');
}

async function testCuratorCannotDowngradeModalBoundary(): Promise<void> {
	const harness = createHarness({
		findings: [curatorFinding(MODAL.commandId)],
	});
	const snapshot = await harness.runtime.curate();
	const modal = snapshot.commands.find((item) => item.descriptor.commandId === MODAL.commandId);
	assert.strictEqual(modal?.finding?.interaction, 'direct');
	assert.strictEqual(modal?.descriptor.interaction, 'modal');
	assert.strictEqual(modal?.systemBlocked, true);
	await assert.rejects(
		() => harness.runtime.review(MODAL.commandId, {
			decision: 'allow',
			risk: 'read',
			purpose: 'capture',
		}),
		/modal-only/,
	);
	console.log('PASS: curatorCannotDowngradeModalBoundary');
}

async function testMalformedCuratorOutputDoesNotPersist(): Promise<void> {
	const harness = createHarness({
		findings: [{ commandId: SAFE.commandId, recommend: true }],
	});
	await assert.rejects(() => harness.runtime.curate());
	assert.deepStrictEqual(harness.getSettings(), {
		reviews: {},
		findings: {},
	});
	console.log('PASS: malformedCuratorOutputDoesNotPersist');
}

async function testUnifiedScanKeepsDeterministicFallback(): Promise<void> {
	const harness = createHarness({
		findings: [{ commandId: SAFE.commandId, recommend: true }],
	});
	const phases: string[] = [];
	const result = await harness.runtime.scan((progress) => phases.push(progress.phase));
	assert.strictEqual(result.explanationStatus, 'fallback');
	assert.match(result.warning ?? '', /curation/);
	assert.strictEqual(result.snapshot.commands.length, 4);
	assert.strictEqual(result.snapshot.approvedCount, 0);
	assert.deepStrictEqual(harness.getSettings(), { reviews: {}, findings: {} });
	assert.strictEqual(phases[0], 'discovering');
	assert.ok(phases.includes('checking'));
	assert.ok(phases.includes('explaining'));
	assert.strictEqual(phases.at(-1), 'complete');
	console.log('PASS: unifiedScanKeepsDeterministicFallback');
}

async function testScanTimesOutWithoutHidingDeterministicFacts(): Promise<void> {
	const config: PluginCommandGatewayConfig = {
		...DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG,
		curation: {
			...DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG.curation,
			batchTimeoutMs: 1,
		},
	};
	const harness = createHarness(undefined, {
		config,
		queryStructured: () => new Promise(() => {}),
	});
	let deterministicCount = 0;
	const result = await harness.runtime.scan((progress) => {
		if (progress.snapshot) deterministicCount = progress.snapshot.commands.length;
	});
	assert.strictEqual(deterministicCount, 4);
	assert.strictEqual(result.explanationStatus, 'fallback');
	assert.match(result.warning ?? '', /timeout/);
	assert.strictEqual(result.snapshot.commands.length, 4);
	console.log('PASS: scanTimesOutWithoutHidingDeterministicFacts');
}

async function testContextualCommandCanBeReviewedButStillPreflightsStrictly(): Promise<void> {
	const harness = createHarness();
	const contextual: PluginCommandDescriptor = {
		...SAFE,
		commandId: 'editor-tools:open-current-heading',
		commandName: 'Open current heading',
		pluginId: 'editor-tools',
		pluginName: 'Editor Tools',
		sourceHash: 'editor-context-v1',
		availability: 'conditional',
		availabilityReason: 'active-editor-required',
	};
	harness.commandPort.descriptors.push(contextual);
	await harness.runtime.allowMany([contextual.commandId]);
	const compiled = await harness.runtime.compileApprovedSkill();
	assert.ok(compiled.approvedCommands[contextual.commandId]);
	const [tool] = await harness.runtime.getToolDefinitions();
	const result = await tool!.execute({ commandId: contextual.commandId }, toolCtx());
	assert.strictEqual(result.ok, false);
	assert.match(result.error ?? '', /active-editor-required/);
	assert.deepStrictEqual(harness.commandPort.executed, []);
	console.log('PASS: contextualCommandCanBeReviewedButStillPreflightsStrictly');
}

async function testBulkAllowIsAtomicAndFailClosed(): Promise<void> {
	const harness = createHarness();
	await harness.runtime.curate();
	const allowed = await harness.runtime.allowMany([SAFE.commandId, EDIT.commandId]);
	assert.strictEqual(allowed.approvedCount, 2);
	assert.strictEqual(harness.getSettings().reviews[SAFE.commandId]?.decision, 'allow');
	assert.strictEqual(harness.getSettings().reviews[EDIT.commandId]?.decision, 'allow');

	const blockedHarness = createHarness();
	await blockedHarness.runtime.curate();
	await assert.rejects(
		() => blockedHarness.runtime.allowMany([SAFE.commandId, DESTRUCTIVE.commandId]),
		/command-risk-blocked/,
	);
	assert.deepStrictEqual(blockedHarness.getSettings().reviews, {});
	console.log('PASS: bulkAllowIsAtomicAndFailClosed');
}

async function testCompilePermissionAndGoldenRun(): Promise<void> {
	const harness = createHarness();
	await harness.runtime.curate();
	await harness.runtime.review(SAFE.commandId, {
		decision: 'allow',
		risk: 'read',
		purpose: 'navigation',
	});
	await harness.runtime.review(EDIT.commandId, {
		decision: 'allow',
		risk: 'edit',
		purpose: 'planning',
	});
	const compiled = await harness.runtime.compileApprovedSkill();
	assert.strictEqual(compiled.quarantine, 'strict');
	assert.deepStrictEqual(compiled.allowedTools, [OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME]);
	assert.deepStrictEqual(
		Object.keys(compiled.approvedCommands).sort(),
		[SAFE.commandId, EDIT.commandId].sort(),
	);
	assert.strictEqual(compiled.approvedCommands[SAFE.commandId]?.risk, 'read');
	assert.strictEqual(compiled.approvedCommands[EDIT.commandId]?.risk, 'edit');
	const [tool] = await harness.runtime.getToolDefinitions();
	assert.ok(tool);
	assert.strictEqual(tool.name, OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME);
	assert.strictEqual(tool.kind, 'edit', 'mixed catalog must use conservative edit permission');

	const readMode = new PermissionGuard({ mode: 'read' });
	const decision = readMode.check(tool, { commandId: EDIT.commandId });
	assert.strictEqual(decision.decision, 'deny');

	const result = await tool.execute({ commandId: EDIT.commandId }, toolCtx());
	assert.strictEqual(result.ok, true);
	assert.deepStrictEqual(harness.commandPort.executed, [EDIT.commandId]);
	assert.strictEqual(harness.auditPort.receipts.length, 1);
	const receipt = harness.auditPort.receipts[0]!;
	assert.strictEqual(receipt.status, 'completed');
	assert.strictEqual(receipt.compiledSkillId, compiled.skillId);
	assert.strictEqual(receipt.curationHash, compiled.approvedCommands[EDIT.commandId]?.curationHash);
	assert.strictEqual(receipt.purpose, 'planning');
	assert.strictEqual(receipt.confirmation, 'per-run');
	assert.strictEqual(receipt.observation?.changedPaths[0], 'Weekly/2026-W31.md');
	assert.ok(receipt.events.some((event) => event.type === 'artifact'));
	assert.ok(
		receipt.events.some(
			(event) => event.type === 'log' && String(event.message).includes('policy-approved'),
		),
	);
	console.log('PASS: compilePermissionAndGoldenRun');
}

async function testStaleApprovalAndDestructiveInjectionFailClosed(): Promise<void> {
	const harness = createHarness();
	await harness.runtime.review(SAFE.commandId, {
		decision: 'allow',
		risk: 'read',
		purpose: 'navigation',
	});
	const [oldTool] = await harness.runtime.getToolDefinitions();
	harness.commandPort.descriptors = [
		{ ...SAFE, pluginVersion: '1.1.0', sourceHash: 'safe-v2' },
		EDIT,
		DESTRUCTIVE,
		MODAL,
	];
	const staleSnapshot = await harness.runtime.refresh();
	assert.strictEqual(staleSnapshot.staleCount, 1);
	assert.strictEqual((await harness.runtime.getToolDefinitions()).length, 0);
	const staleResult = await oldTool!.execute({ commandId: SAFE.commandId }, toolCtx());
	assert.strictEqual(staleResult.ok, false);
	if (!staleResult.ok) assert.match(staleResult.error, /source-changed/);

	const injected = harness.getSettings();
	(injected.reviews as Record<string, any>)[DESTRUCTIVE.commandId] = {
		decision: 'allow',
		risk: 'destructive',
		purpose: 'system',
		sourceHash: DESTRUCTIVE.sourceHash,
		curationHash: 'injected',
		reviewedAt: 1,
	};
	assert.strictEqual((await harness.runtime.getToolDefinitions()).length, 0);
	assert.deepStrictEqual(harness.commandPort.executed, []);
	console.log('PASS: staleApprovalAndDestructiveInjectionFailClosed');
}

async function testChangedCuratorDraftInvalidatesApproval(): Promise<void> {
	const harness = createHarness();
	await harness.runtime.curate();
	await harness.runtime.review(SAFE.commandId, {
		decision: 'allow',
		risk: 'read',
		purpose: 'navigation',
	});
	const before = await harness.runtime.compileApprovedSkill();
	const [oldTool] = await harness.runtime.getToolDefinitions();
	const settings = harness.getSettings();
	const oldFinding = settings.findings[SAFE.commandId]!;
	(settings.findings as Record<string, any>)[SAFE.commandId] = {
		...oldFinding,
		skillInstructions: 'Changed after the user reviewed the original draft.',
	};
	const stale = await harness.runtime.getSnapshot();
	assert.strictEqual(stale.staleCount, 1);
	assert.strictEqual((await harness.runtime.getToolDefinitions()).length, 0);
	const oldResult = await oldTool!.execute({ commandId: SAFE.commandId }, toolCtx());
	assert.strictEqual(oldResult.ok, false);
	if (!oldResult.ok) assert.match(oldResult.error, /draft-changed/);

	await harness.runtime.review(SAFE.commandId, {
		decision: 'allow',
		risk: 'read',
		purpose: 'navigation',
	});
	const after = await harness.runtime.compileApprovedSkill();
	assert.notStrictEqual(after.skillId, before.skillId);
	console.log('PASS: changedCuratorDraftInvalidatesApproval');
}

async function testAuditFailureIsExplicitButNonFatal(): Promise<void> {
	const harness = createHarness();
	await harness.runtime.review(SAFE.commandId, {
		decision: 'allow',
		risk: 'read',
		purpose: 'navigation',
	});
	harness.auditPort.throwOnAppend = true;
	const [tool] = await harness.runtime.getToolDefinitions();
	const result = await tool!.execute({ commandId: SAFE.commandId }, toolCtx());
	assert.strictEqual(result.ok, true);
	if (result.ok) {
		const data = result.data as { auditWarning?: string };
		assert.match(data.auditWarning ?? '', /audit-write-failed/);
	}
	console.log('PASS: auditFailureIsExplicitButNonFatal');
}

async function run(): Promise<void> {
	await testDefaultOffAndSystemBlock();
	await testTemplaterCommandsUseActionVerbFallbacks();
	await testCuratorNeverAuthorizes();
	await testCuratorCannotDowngradeModalBoundary();
	await testMalformedCuratorOutputDoesNotPersist();
	await testUnifiedScanKeepsDeterministicFallback();
	await testScanTimesOutWithoutHidingDeterministicFacts();
	await testContextualCommandCanBeReviewedButStillPreflightsStrictly();
	await testBulkAllowIsAtomicAndFailClosed();
	await testCompilePermissionAndGoldenRun();
	await testStaleApprovalAndDestructiveInjectionFailClosed();
	await testChangedCuratorDraftInvalidatesApproval();
	await testAuditFailureIsExplicitButNonFatal();
	console.log('plugin-command-gateway: all guards passed');
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
