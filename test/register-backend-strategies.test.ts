// B3 registerBackendStrategies — verify boot-time backend selection.
//
// The composition helper inspects the ProfileRegistry and registers
// exactly the backends whose preconditions hold. Each guard covers one
// path so `resolveBackendStrategy` in production truly falls through
// to the next candidate instead of dispatching to a dead backend.

import assert from 'assert';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import { registerBackendStrategies, type BackendInvocationInput } from '@/app/composition/registerBackendStrategies';
import type { CapabilityRunContext, CapabilityExecutionOutput } from '@/service/capabilities/CapabilityRunner';

function makeProfile(over: Partial<Profile>): Profile {
	return {
		id: over.id ?? 'p',
		name: over.name ?? 'Profile',
		kind: over.kind ?? 'anthropic',
		enabled: over.enabled ?? true,
		createdAt: over.createdAt ?? 0,
		baseUrl: over.baseUrl ?? '',
		apiKey: over.apiKey ?? null,
		primaryModel: over.primaryModel ?? 'claude-sonnet-4',
		fastModel: over.fastModel ?? 'claude-haiku-4-5',
		customHeaders: over.customHeaders ?? {},
		embeddingEndpoint: over.embeddingEndpoint ?? null,
		embeddingApiKey: over.embeddingApiKey ?? null,
		embeddingModel: over.embeddingModel ?? null,
		icon: over.icon ?? null,
		description: over.description ?? null,
	};
}

function loadRegistry(profiles: Profile[]): ProfileRegistry {
	ProfileRegistry.resetInstance();
	const reg = ProfileRegistry.getInstance();
	reg.load(
		{
			profiles,
			activeAgentConfig: null,
			activeAgentFastConfig: null,
			activeChatConfig: null,
			activeCopilotConfig: null,
			activeEmbeddingConfig: null,
			activeWebSearchConfig: null,
			sdkSettings: { cliPathOverride: null, subprocessPoolSize: 1, warmupOnLoad: false },
		},
		() => { /* no-op persist */ },
	);
	return reg;
}

const okSdkAdapter = async (
	_input: Extract<BackendInvocationInput, { kind: 'sdk-query' }>,
	_ctx: CapabilityRunContext,
): Promise<CapabilityExecutionOutput<unknown>> => ({ result: { via: 'sdk' } });

const okProviderAdapter = async (
	_input: Extract<BackendInvocationInput, { kind: 'provider-stream' }>,
	_ctx: CapabilityRunContext,
): Promise<CapabilityExecutionOutput<unknown>> => ({ result: { via: 'provider' } });

function testNoProvidersRegistersNothing(): void {
	const profileRegistry = loadRegistry([]);
	const strategies = registerBackendStrategies({ profileRegistry });
	assert.strictEqual(strategies['hermes-harness'], undefined);
	assert.strictEqual(strategies['claude-sdk'], undefined);
	assert.strictEqual(strategies['provider-direct'], undefined);
	console.log('PASS: noProvidersRegistersNothing');
}

function testAnthropicKeyRegistersHermesAndSdk(): void {
	const profileRegistry = loadRegistry([
		makeProfile({ id: 'a', kind: 'anthropic', apiKey: 'sk-ant-xxxx' }),
	]);
	const strategies = registerBackendStrategies({
		profileRegistry,
		sdkQueryAdapter: okSdkAdapter,
		providerStreamAdapter: okProviderAdapter,
	});
	assert.ok(strategies['hermes-harness'], 'hermes-harness must register when any provider works');
	assert.ok(strategies['claude-sdk'], 'claude-sdk must register with an anthropic key');
	assert.ok(strategies['provider-direct'], 'provider-direct must register when any provider works');
	console.log('PASS: anthropicKeyRegistersHermesAndSdk');
}

function testOpenAiOnlyKeepsClaudeSdkUnregistered(): void {
	const profileRegistry = loadRegistry([
		makeProfile({ id: 'o', kind: 'openai', apiKey: 'sk-openai-xxxx' }),
	]);
	const strategies = registerBackendStrategies({
		profileRegistry,
		sdkQueryAdapter: okSdkAdapter,
		providerStreamAdapter: okProviderAdapter,
	});
	assert.ok(strategies['hermes-harness']);
	assert.strictEqual(strategies['claude-sdk'], undefined, 'no anthropic key → no claude-sdk backend');
	assert.ok(strategies['provider-direct']);
	console.log('PASS: openAiOnlyKeepsClaudeSdkUnregistered');
}

function testOllamaNeedsNoKey(): void {
	const profileRegistry = loadRegistry([
		makeProfile({ id: 'ol', kind: 'ollama', apiKey: null }),
	]);
	const strategies = registerBackendStrategies({
		profileRegistry,
		providerStreamAdapter: okProviderAdapter,
	});
	assert.ok(strategies['hermes-harness'], 'ollama profile alone should enable hermes-harness');
	assert.ok(strategies['provider-direct'], 'ollama profile alone should enable provider-direct');
	assert.strictEqual(strategies['claude-sdk'], undefined);
	console.log('PASS: ollamaNeedsNoKey');
}

function testDisabledProfileSkipped(): void {
	const profileRegistry = loadRegistry([
		makeProfile({ id: 'a', kind: 'anthropic', apiKey: 'sk-ant-xxxx', enabled: false }),
	]);
	const strategies = registerBackendStrategies({
		profileRegistry,
		sdkQueryAdapter: okSdkAdapter,
	});
	assert.strictEqual(strategies['hermes-harness'], undefined);
	assert.strictEqual(strategies['claude-sdk'], undefined);
	console.log('PASS: disabledProfileSkipped');
}

function testMissingAdapterKeepsBackendUnregistered(): void {
	// Even when Anthropic key is present, claude-sdk must not register
	// unless the composition site provided an sdkQueryAdapter — otherwise
	// dispatching would blow up inside the strategy.
	const profileRegistry = loadRegistry([
		makeProfile({ id: 'a', kind: 'anthropic', apiKey: 'sk-ant-xxxx' }),
	]);
	const strategies = registerBackendStrategies({ profileRegistry });
	assert.ok(strategies['hermes-harness']);
	assert.strictEqual(strategies['claude-sdk'], undefined);
	assert.strictEqual(strategies['provider-direct'], undefined);
	console.log('PASS: missingAdapterKeepsBackendUnregistered');
}

async function testHermesRejectsWrongInputShape(): Promise<void> {
	const profileRegistry = loadRegistry([
		makeProfile({ id: 'ol', kind: 'ollama', apiKey: null }),
	]);
	const strategies = registerBackendStrategies({ profileRegistry });
	const hermes = strategies['hermes-harness']!;
	// Cast to any because the runtime rejects; we're testing the runtime
	// guard, not the type discipline.
	await assert.rejects(
		() => hermes({ kind: 'provider-stream', systemPrompt: '', prompt: '' } as any, {} as CapabilityRunContext),
		/hermes-harness.*unsupported input/i,
	);
	console.log('PASS: hermesRejectsWrongInputShape');
}

async function run(): Promise<void> {
	testNoProvidersRegistersNothing();
	testAnthropicKeyRegistersHermesAndSdk();
	testOpenAiOnlyKeepsClaudeSdkUnregistered();
	testOllamaNeedsNoKey();
	testDisabledProfileSkipped();
	testMissingAdapterKeepsBackendUnregistered();
	await testHermesRejectsWrongInputShape();
	console.log('register-backend-strategies: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
