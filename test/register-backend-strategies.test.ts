import assert from 'assert';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import {
	registerBackendStrategies,
	type BackendInvocationInput,
} from '@/app/composition/registerBackendStrategies';
import type {
	CapabilityExecutionOutput,
	CapabilityRunContext,
} from '@/service/capabilities/CapabilityRunner';

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
	const registry = ProfileRegistry.getInstance();
	registry.load({
		profiles,
		activeAgentConfig: null,
		activeAgentFastConfig: null,
		activeChatConfig: null,
		activeCopilotConfig: null,
		activeEmbeddingConfig: null,
		activeWebSearchConfig: null,
	}, () => undefined);
	return registry;
}

const okProviderAdapter = async (
	_input: Extract<BackendInvocationInput, { kind: 'provider-stream' }>,
	_ctx: CapabilityRunContext,
): Promise<CapabilityExecutionOutput<unknown>> => ({ result: { via: 'provider' } });

function testNoProvidersRegistersNothing(): void {
	const strategies = registerBackendStrategies({ profileRegistry: loadRegistry([]) });
	assert.strictEqual(strategies['hermes-harness'], undefined);
	assert.strictEqual(strategies['provider-direct'], undefined);
}

function testAnyWorkingProviderRegistersHarness(): void {
	for (const profile of [
		makeProfile({ kind: 'anthropic', apiKey: 'sk-ant' }),
		makeProfile({ kind: 'openai', apiKey: 'sk-openai' }),
		makeProfile({ kind: 'ollama', apiKey: null }),
	]) {
		const strategies = registerBackendStrategies({
			profileRegistry: loadRegistry([profile]),
			providerStreamAdapter: okProviderAdapter,
		});
		assert.ok(strategies['hermes-harness']);
		assert.ok(strategies['provider-direct']);
	}
}

function testDisabledProfileSkipped(): void {
	const strategies = registerBackendStrategies({
		profileRegistry: loadRegistry([
			makeProfile({ apiKey: 'sk-ant', enabled: false }),
		]),
		providerStreamAdapter: okProviderAdapter,
	});
	assert.strictEqual(strategies['hermes-harness'], undefined);
	assert.strictEqual(strategies['provider-direct'], undefined);
}

async function testHarnessRejectsWrongInputShape(): Promise<void> {
	const strategies = registerBackendStrategies({
		profileRegistry: loadRegistry([makeProfile({ kind: 'ollama' })]),
	});
	const harness = strategies['hermes-harness'];
	assert.ok(harness);
	await assert.rejects(
		() => harness!(
			{ kind: 'provider-stream', systemPrompt: '', prompt: '' },
			{} as CapabilityRunContext,
		),
		/hermes-harness.*unsupported input/i,
	);
}

async function run(): Promise<void> {
	testNoProvidersRegistersNothing();
	testAnyWorkingProviderRegistersHarness();
	testDisabledProfileSkipped();
	await testHarnessRejectsWrongInputShape();
	console.log('register-backend-strategies: all guards passed');
}

void run();
