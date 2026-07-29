import assert from 'assert';
import { z } from 'zod';
import { generateText } from 'ai';
import {
	simulatorFetchHttpClient,
	startSimulatorSidecar,
} from './helpers/simulatorSidecar';
import { createPresetProfile } from '@/core/profiles/presets';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { modelRegistry } from '@/core/providers/model-registry';
import { createLanguageModel } from '@/core/providers/vercel/provider-factory';
import { testProviderConnection } from '@/core/providers/testProviderConnection';
import {
	SIMULATOR_MODEL_ID,
	simulatorRequestHeaders,
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

async function run() {
	const sidecar = await startSimulatorSidecar();
	const { baseUrl } = sidecar;

	try {
		await verifyProviderContract(baseUrl);
		await verifyRealAgentLoop(baseUrl);
		await verifyRecoveryFlow(baseUrl);
		await verifyRemainingScenarios(baseUrl);
	} finally {
		ProfileRegistry.resetInstance();
		await sidecar.stop();
	}

	const offlineProfile = simulatorProfile(baseUrl);
	assert.equal(await testProviderConnection(simulatorFetchHttpClient(), offlineProfile), false);
	console.log('AI Search Simulator sidecar provider tests passed');
}

async function verifyProviderContract(baseUrl: string) {
	const profile = simulatorProfile(baseUrl);
	assert.equal(profile.apiKey, null);
	assert.equal(profile.baseUrl, baseUrl);
	assert.equal(profile.primaryModel, SIMULATOR_MODEL_ID);
	assert.equal(modelRegistry.getModelsForProvider('simulator')[0]?.id, SIMULATOR_MODEL_ID);
	assert.equal(await testProviderConnection(simulatorFetchHttpClient(), profile), true);

	const health = await fetch(`${baseUrl}/health`);
	const healthPayload = await health.json() as { protocols?: string[] };
	assert.deepEqual(healthPayload.protocols, ['openai-chat', 'anthropic-messages']);

	const strictModel = createLanguageModel(profile, SIMULATOR_MODEL_ID);
	await assert.rejects(
		() => generateText({
			model: strictModel,
			prompt: 'unclassified request',
			maxRetries: 0,
		}),
		/strict mode could not classify/i,
	);

	const sectionResponse = await anthropicRequest(baseUrl, profile, {
		stream: false,
		messages: [{
			role: 'user',
			content: '## This Section\nSection title: Sidecar report\n## Evidence for This Section',
		}],
	});
	assert.equal(sectionResponse.status, 200);
	const sectionPayload = await sectionResponse.json() as {
		content?: Array<{ text?: string }>;
	};
	assert(sectionPayload.content?.[0]?.text?.includes('local AI Search Simulator'));

	const streamResponse = await anthropicRequest(baseUrl, profile, {
		stream: true,
		messages: [{
			role: 'user',
			content: '## Research Plan\nTest\n## Generated Section Content\n## Evidence Sources Referenced',
		}],
	});
	assert.equal(streamResponse.status, 200);
	const streamBody = await streamResponse.text();
	assert(streamBody.includes('event: content_block_delta'));
	assert(streamBody.includes('Executive summary'));

	const partialProfile = simulatorProfile(baseUrl, 'report-partial-failure');
	const partialResponse = await anthropicRequest(baseUrl, partialProfile, {
		stream: false,
		messages: [{
			role: 'user',
			content: '## This Section\nSection title: Representative notes and evidence\n## Evidence for This Section',
		}],
	});
	assert.equal(partialResponse.status, 500);
	assert((await partialResponse.text()).includes('representative-evidence section failed'));

	const planningFailure = simulatorProfile(baseUrl, 'planning-failure');
	const planningFailureResponse = await fetch(`${baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...simulatorRequestHeaders(planningFailure.simulatorConfig),
		},
		body: JSON.stringify({
			model: SIMULATOR_MODEL_ID,
			stream: false,
			messages: [{ role: 'user', content: 'Summarize my vault.' }],
			tools: [{
				type: 'function',
				function: { name: SUBMIT, parameters: { type: 'object' } },
			}],
		}),
	});
	assert.equal(planningFailureResponse.status, 500);
	assert.match(await planningFailureResponse.text(), /planning request failed/i);
}

async function verifyRealAgentLoop(baseUrl: string) {
	const profile = simulatorProfile(baseUrl);
	loadSimulatorRegistry(profile);
	const bindings = defaultTierBindings({
		...DEFAULT_HARNESS_SETTINGS,
		localDeepConfig: { profileId: profile.id, modelId: SIMULATOR_MODEL_ID },
		onlineConfig: null,
	});
	assert.equal(bindings.fast?.providerId, profile.id);
	assert.equal(bindings.research?.providerId, profile.id);
	assert.equal(bindings.stronger?.providerId, profile.id);

	let submitted: Record<string, unknown> | null = null;
	const loop = await runAgentLoop({
		loopId: 'simulator-sidecar-happy-path',
		systemPrompt: 'Use the tools.',
		initialMessages: [{ role: 'user', content: 'Summarize my vault.' }],
		tools: makeTools((input) => { submitted = input; }),
		tierController: new TierController({
			bindings,
			policy: { preferred: 'research', allowEscalation: true },
		}),
		budget: { maxSteps: 6, maxToolCalls: 8 },
		treatBareTextAsFinal: false,
		stopWhen: (step) => step.toolResults.some((item) => item.toolName === SUBMIT && item.ok),
	});
	assert.equal(loop.finishReason, 'stop');
	assert.deepEqual((submitted as any)?.selected_paths, [
		'Projects/Alpha.md',
		'Projects/Beta.md',
	]);
}

async function verifyRecoveryFlow(baseUrl: string) {
	let submitted: Record<string, unknown> | null = null;
	const profile = simulatorProfile(baseUrl, 'vault-tool-recovery');
	const loop = await runAgentLoop({
		loopId: 'simulator-sidecar-recovery',
		systemPrompt: 'Use the tools.',
		initialMessages: [{ role: 'user', content: 'Summarize my vault.' }],
		tools: makeTools((input) => { submitted = input; }),
		tierController: controllerFor(profile),
		budget: { maxSteps: 7, maxToolCalls: 8 },
		treatBareTextAsFinal: false,
		stopWhen: (step) => step.toolResults.some((item) => item.toolName === SUBMIT && item.ok),
	});
	assert.equal(loop.finishReason, 'stop');
	assert.deepEqual((submitted as any)?.selected_paths, [
		'Projects/Alpha.md',
		'Projects/Beta.md',
	]);
}

async function verifyRemainingScenarios(baseUrl: string) {
	const emptyResponse = await openAIPlanningRequest(
		baseUrl,
		simulatorProfile(baseUrl, 'empty-vault'),
		[LIST, SUBMIT],
	);
	assert.equal(emptyResponse.status, 200);
	const emptyCall = await readOpenAIToolCall(emptyResponse);
	assert.equal(emptyCall.name, SUBMIT);
	assert.deepEqual(JSON.parse(emptyCall.arguments).selected_paths, []);

	const escalationResponse = await openAIPlanningRequest(
		baseUrl,
		simulatorProfile(baseUrl, 'escalation-request'),
		['escalate', LIST, SUBMIT],
	);
	assert.equal(escalationResponse.status, 200);
	assert.equal((await readOpenAIToolCall(escalationResponse)).name, 'escalate');

	const totalFailureResponse = await anthropicRequest(
		baseUrl,
		simulatorProfile(baseUrl, 'report-total-failure'),
		{
			stream: false,
			messages: [{
				role: 'user',
				content: '## This Section\nSection title: Total failure\n## Evidence for This Section',
			}],
		},
	);
	assert.equal(totalFailureResponse.status, 500);
	assert.match(await totalFailureResponse.text(), /report generation failed/i);

	const slowProfile = simulatorProfile(baseUrl, 'slow-streaming');
	const controller = new AbortController();
	const slowRequest = fetch(`${baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...simulatorRequestHeaders(slowProfile.simulatorConfig),
		},
		body: JSON.stringify({
			model: SIMULATOR_MODEL_ID,
			stream: true,
			messages: [{ role: 'user', content: 'Summarize my vault.' }],
			tools: [{
				type: 'function',
				function: { name: SUBMIT, parameters: { type: 'object' } },
			}],
		}),
		signal: controller.signal,
	});
	setTimeout(() => controller.abort(), 50);
	await assert.rejects(slowRequest, /abort/i);
}

function simulatorProfile(
	baseUrl: string,
	scenario: SimulatorScenarioId = 'happy-path',
) {
	return createPresetProfile('simulator', {
		id: `sim-${scenario}`,
		baseUrl,
		simulatorConfig: { scenario, speed: 'instant', strict: true },
	});
}

function makeTools(onSubmit: (input: Record<string, unknown>) => void): ToolDef[] {
	return [
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
			execute: async (input) => ok({
				path: (input as { path: string }).path,
				bodyPreview: 'Alpha body',
			}),
		},
		{
			name: SUBMIT,
			description: 'submit',
			inputSchema: z.object({ selected_paths: z.array(z.string()) }).passthrough(),
			source: 'mcp',
			kind: 'meta',
			execute: async (input) => {
				onSubmit(input as Record<string, unknown>);
				return ok({ approved: true });
			},
		},
	];
}

function controllerFor(profile: ReturnType<typeof simulatorProfile>) {
	const binding: TierBinding = {
		tier: 'research',
		providerId: profile.id,
		modelId: profile.primaryModel,
		resolve: () => createLanguageModel(profile, profile.primaryModel),
		capabilities: {
			toolCalling: true,
			parallelToolCalls: false,
			structuredOutput: true,
			thinking: false,
			maxContextTokens: 200_000,
		},
		estimatedSingleStepP: 1,
	};
	return new TierController({
		bindings: { research: binding },
		policy: { preferred: 'research', allowEscalation: false },
	});
}

function loadSimulatorRegistry(profile: ReturnType<typeof simulatorProfile>) {
	ProfileRegistry.resetInstance();
	ProfileRegistry.getInstance().load({
		profiles: [profile],
		activeAgentConfig: null,
		activeAgentFastConfig: null,
		activeChatConfig: null,
		activeCopilotConfig: null,
		activeEmbeddingConfig: null,
		activeWebSearchConfig: null,
		sdkSettings: DEFAULT_SDK_SETTINGS,
	}, () => undefined);
}

function anthropicRequest(
	baseUrl: string,
	profile: ReturnType<typeof simulatorProfile>,
	body: Record<string, unknown>,
) {
	return fetch(`${baseUrl}/messages`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...simulatorRequestHeaders(profile.simulatorConfig),
		},
		body: JSON.stringify({
			model: SIMULATOR_MODEL_ID,
			max_tokens: 1024,
			...body,
		}),
	});
}

function openAIPlanningRequest(
	baseUrl: string,
	profile: ReturnType<typeof simulatorProfile>,
	toolNames: string[],
) {
	return fetch(`${baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...simulatorRequestHeaders(profile.simulatorConfig),
		},
		body: JSON.stringify({
			model: SIMULATOR_MODEL_ID,
			stream: false,
			messages: [{ role: 'user', content: 'Summarize my vault.' }],
			tools: toolNames.map((name) => ({
				type: 'function',
				function: { name, parameters: { type: 'object' } },
			})),
		}),
	});
}

async function readOpenAIToolCall(response: Response) {
	const payload = await response.json() as {
		choices?: Array<{
			message?: {
				tool_calls?: Array<{
					function?: { name?: string; arguments?: string };
				}>;
			};
		}>;
	};
	const fn = payload.choices?.[0]?.message?.tool_calls?.[0]?.function;
	return {
		name: fn?.name ?? '',
		arguments: fn?.arguments ?? '{}',
	};
}

void run();
