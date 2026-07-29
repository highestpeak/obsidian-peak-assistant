import assert from 'assert';
import { z } from 'zod';
import { streamText } from 'ai';
import { createPresetProfile } from '@/core/profiles/presets';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { modelRegistry } from '@/core/providers/model-registry';
import { createLanguageModel } from '@/core/providers/vercel/provider-factory';
import { testProviderConnection } from '@/core/providers/testProviderConnection';
import {
	querySimulatorSdk,
	resolveSimulatorIntent,
	SIMULATOR_MODEL_ID,
} from '@/core/providers/simulator';
import { defaultTierBindings } from '@/service/agents/harness/tier/bindings';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { ok } from '@/service/agents/harness/tool/types';
import { DEFAULT_HARNESS_SETTINGS } from '@/core/config/settingsTypes';
import { DEFAULT_SDK_SETTINGS } from '@/core/profiles/types';
import type { SimulatorScenarioId } from '@/core/profiles/types';
import type { TierBinding } from '@/service/agents/harness/tier/types';

const LIST = 'mcp__vault__vault_list_folders';
const READ_FOLDER = 'mcp__vault__vault_read_folder';
const READ_NOTE = 'mcp__vault__vault_read_note';
const SUBMIT = 'mcp__vault__vault_submit_plan';

function simulatorProfile(scenario: SimulatorScenarioId = 'happy-path') {
	return createPresetProfile('simulator', {
		id: 'sim-profile',
		simulatorConfig: { scenario, speed: 'instant', strict: true },
	});
}

function resultMessage(toolName: string, value: unknown) {
	return {
		role: 'tool',
		content: [{
			type: 'tool-result',
			toolCallId: `result-${toolName}`,
			toolName,
			output: { type: 'json', value: { ok: true, data: value } },
		}],
	};
}

async function collectSdkText(profile = simulatorProfile(), prompt = '## This Section\n- **Title**: Test section\n## Evidence for This Section') {
	let text = '';
	for await (const message of querySimulatorSdk(profile, {
		prompt,
		systemPrompt: '',
	})) {
		const event = (message as any).event;
		if (event?.delta?.type === 'text_delta') text += event.delta.text;
	}
	return text;
}

async function run() {
	const profile = simulatorProfile();

	assert.equal(profile.apiKey, null);
	assert.equal(profile.baseUrl, '');
	assert.equal(profile.primaryModel, SIMULATOR_MODEL_ID);
	assert.equal(modelRegistry.getModelsForProvider('simulator')[0]?.id, SIMULATOR_MODEL_ID);

	const connected = await testProviderConnection({
		request: async () => {
			throw new Error('Simulator connection test must not perform HTTP.');
		},
	}, profile);
	assert.equal(connected, true);

	const first = resolveSimulatorIntent({
		prompt: [],
		availableTools: [LIST, READ_FOLDER, READ_NOTE, SUBMIT],
		config: profile.simulatorConfig!,
	});
	assert.deepEqual(first, { kind: 'tool-call', toolName: LIST, input: { maxDepth: 2 } });

	const afterFolders = resolveSimulatorIntent({
		prompt: [resultMessage(LIST, {
			folders: [{ path: 'Projects', mdCount: 2 }],
			totalMdFiles: 2,
		})],
		availableTools: [LIST, READ_FOLDER, READ_NOTE, SUBMIT],
		config: profile.simulatorConfig!,
	});
	assert.equal(afterFolders.kind, 'tool-call');
	assert.equal(afterFolders.kind === 'tool-call' ? afterFolders.toolName : '', READ_FOLDER);

	const afterFolderRead = resolveSimulatorIntent({
		prompt: [
			resultMessage(LIST, {
				folders: [{ path: 'Projects', mdCount: 2 }],
				totalMdFiles: 2,
			}),
			resultMessage(READ_FOLDER, {
				files: [
					{ path: 'Projects/Alpha.md', basename: 'Alpha' },
					{ path: 'Projects/Beta.md', basename: 'Beta' },
				],
			}),
		],
		availableTools: [LIST, READ_FOLDER, READ_NOTE, SUBMIT],
		config: profile.simulatorConfig!,
	});
	assert.equal(afterFolderRead.kind, 'tool-call');
	assert.deepEqual(
		afterFolderRead.kind === 'tool-call' ? afterFolderRead.input : {},
		{ path: 'Projects/Alpha.md', maxChars: 2500 },
	);

	const afterNoteRead = resolveSimulatorIntent({
		prompt: [
			resultMessage(LIST, {
				folders: [{ path: 'Projects', mdCount: 2 }],
				totalMdFiles: 2,
			}),
			resultMessage(READ_FOLDER, {
				files: [
					{ path: 'Projects/Alpha.md', basename: 'Alpha' },
					{ path: 'Projects/Beta.md', basename: 'Beta' },
				],
			}),
			resultMessage(READ_NOTE, { path: 'Projects/Alpha.md', bodyPreview: 'Alpha body' }),
		],
		availableTools: [LIST, READ_FOLDER, READ_NOTE, SUBMIT],
		config: profile.simulatorConfig!,
	});
	assert.equal(afterNoteRead.kind, 'tool-call');
	assert.equal(afterNoteRead.kind === 'tool-call' ? afterNoteRead.toolName : '', SUBMIT);
	assert.deepEqual(
		afterNoteRead.kind === 'tool-call' ? afterNoteRead.input.selected_paths : [],
		['Projects/Alpha.md', 'Projects/Beta.md'],
	);

	const planningFailure = resolveSimulatorIntent({
		prompt: [],
		availableTools: [LIST, SUBMIT],
		config: {
			scenario: 'planning-failure',
			speed: 'instant',
			strict: true,
		},
	});
	assert.equal(planningFailure.kind, 'error');

	const escalation = resolveSimulatorIntent({
		prompt: [],
		availableTools: ['escalate', LIST, SUBMIT],
		config: {
			scenario: 'escalation-request',
			speed: 'instant',
			strict: true,
		},
	});
	assert.equal(escalation.kind === 'tool-call' ? escalation.toolName : '', 'escalate');

	const emptyVault = resolveSimulatorIntent({
		prompt: [],
		availableTools: [LIST, SUBMIT],
		config: {
			scenario: 'empty-vault',
			speed: 'instant',
			strict: true,
		},
	});
	assert.equal(emptyVault.kind === 'tool-call' ? emptyVault.toolName : '', SUBMIT);
	assert.deepEqual(emptyVault.kind === 'tool-call' ? emptyVault.input.selected_paths : null, []);

	const recovery = resolveSimulatorIntent({
		prompt: [],
		availableTools: [LIST, READ_NOTE, SUBMIT],
		config: {
			scenario: 'vault-tool-recovery',
			speed: 'instant',
			strict: true,
		},
	});
	assert.equal(recovery.kind === 'tool-call' ? recovery.toolName : '', READ_NOTE);
	assert.equal(recovery.kind === 'tool-call' ? recovery.input.maxChars : null, 1);

	const model = createLanguageModel(profile, SIMULATOR_MODEL_ID);
	const streamed = streamText({ model, prompt: 'plain request without AI Search tools' });
	await assert.rejects(async () => {
		for await (const _chunk of streamed.fullStream) {
			// Drain the stream so strict-mode classification errors surface.
		}
	}, /strict mode could not classify/i);

	const sectionText = await collectSdkText();
	assert(sectionText.includes('local AI Search Simulator'));
	const summaryText = await collectSdkText(
		profile,
		'## Research Plan\nTest\n## Generated Section Content\n### One\nBody\n## Evidence Sources Referenced',
	);
	assert(summaryText.includes('Executive summary'));

	await assert.rejects(
		async () => collectSdkText(
			simulatorProfile('report-partial-failure'),
			'## This Section\n- **Title**: Representative notes and evidence\n## Evidence for This Section',
		),
		/representative-evidence section failed/i,
	);
	await assert.rejects(
		async () => collectSdkText(simulatorProfile('report-total-failure')),
		/report generation failed/i,
	);

	const registry = ProfileRegistry.getInstance();
	ProfileRegistry.resetInstance();
	const freshRegistry = ProfileRegistry.getInstance();
	freshRegistry.load({
		profiles: [profile],
		activeAgentConfig: null,
		activeAgentFastConfig: null,
		activeChatConfig: null,
		activeCopilotConfig: null,
		activeEmbeddingConfig: null,
		activeWebSearchConfig: null,
		sdkSettings: DEFAULT_SDK_SETTINGS,
	}, () => undefined);
	const harness = {
		...DEFAULT_HARNESS_SETTINGS,
		localDeepConfig: { profileId: profile.id, modelId: SIMULATOR_MODEL_ID },
		onlineConfig: null,
	};
	const bindings = defaultTierBindings(harness);
	assert.equal(bindings.fast?.providerId, profile.id);
	assert.equal(bindings.research?.providerId, profile.id);
	assert.equal(bindings.stronger?.providerId, profile.id);

	let submitted: Record<string, unknown> | null = null;
	const tools: ToolDef[] = [
		{
			name: LIST,
			description: 'list',
			inputSchema: z.object({ maxDepth: z.number() }),
			source: 'mcp',
			kind: 'read',
			execute: async () => ok({
				folders: [{ path: 'Projects', mdCount: 2 }],
				totalMdFiles: 2,
			}),
		},
		{
			name: READ_FOLDER,
			description: 'folder',
			inputSchema: z.object({ folder: z.string(), recursive: z.boolean() }),
			source: 'mcp',
			kind: 'read',
			execute: async () => ok({
				files: [
					{ path: 'Projects/Alpha.md', basename: 'Alpha' },
					{ path: 'Projects/Beta.md', basename: 'Beta' },
				],
			}),
		},
		{
			name: READ_NOTE,
			description: 'note',
			inputSchema: z.object({ path: z.string(), maxChars: z.number().min(100) }),
			source: 'mcp',
			kind: 'read',
			execute: async (input) => ok({ path: (input as any).path, bodyPreview: 'Alpha body' }),
		},
		{
			name: SUBMIT,
			description: 'submit',
			inputSchema: z.object({ selected_paths: z.array(z.string()) }).passthrough(),
			source: 'mcp',
			kind: 'meta',
			execute: async (input) => {
				submitted = input as Record<string, unknown>;
				return ok({ approved: true });
			},
		},
	];
	const loop = await runAgentLoop({
		loopId: 'simulator-provider-test',
		systemPrompt: 'Use the tools.',
		initialMessages: [{ role: 'user', content: 'Summarize my vault.' }],
		tools,
		tierController: new TierController({
			bindings,
			policy: { preferred: 'research', allowEscalation: true },
		}),
		budget: { maxSteps: 6, maxToolCalls: 8 },
		treatBareTextAsFinal: false,
		stopWhen: (step) => step.toolResults.some((item) => item.toolName === SUBMIT && item.ok),
	});
	assert.equal(loop.finishReason, 'stop');
	assert.deepEqual((submitted as any)?.selected_paths, ['Projects/Alpha.md', 'Projects/Beta.md']);

	submitted = null;
	const recoveryProfile = simulatorProfile('vault-tool-recovery');
	const recoveryBinding: TierBinding = {
		tier: 'research',
		providerId: recoveryProfile.id,
		modelId: recoveryProfile.primaryModel,
		resolve: () => createLanguageModel(recoveryProfile, recoveryProfile.primaryModel),
		capabilities: {
			toolCalling: true,
			parallelToolCalls: false,
			structuredOutput: true,
			thinking: false,
			maxContextTokens: 200_000,
		},
		estimatedSingleStepP: 1,
	};
	const recoveredLoop = await runAgentLoop({
		loopId: 'simulator-tool-recovery-test',
		systemPrompt: 'Use the tools.',
		initialMessages: [{ role: 'user', content: 'Summarize my vault.' }],
		tools,
		tierController: new TierController({
			bindings: { research: recoveryBinding },
			policy: { preferred: 'research', allowEscalation: false },
		}),
		budget: { maxSteps: 7, maxToolCalls: 8 },
		treatBareTextAsFinal: false,
		stopWhen: (step) => step.toolResults.some((item) => item.toolName === SUBMIT && item.ok),
	});
	assert.equal(recoveredLoop.finishReason, 'stop');
	assert.deepEqual((submitted as any)?.selected_paths, ['Projects/Alpha.md', 'Projects/Beta.md']);

	ProfileRegistry.resetInstance();
	void registry;
	console.log('AI Search Simulator provider tests passed');
}

void run();
