import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { startSimulatorSidecar } from './helpers/simulatorSidecar';
import { createPresetProfile } from '@/core/profiles/presets';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
	queryWithProfile,
	shutdownPool,
} from '@/service/agents/core/sdkAgentPool';
import { DEFAULT_SDK_SETTINGS } from '@/core/profiles/types';
import { toAgentSdkEnv } from '@/core/profiles/materialize';
import {
	simulatorAgentSdkBaseUrl,
	SIMULATOR_DEFAULTS,
	SIMULATOR_MODEL_ID,
} from '@/core/providers/simulator';

const ROOT = process.cwd();

async function run() {
	const sidecar = await startSimulatorSidecar();
	const profile = createPresetProfile('simulator', {
		id: 'sim-routing',
		baseUrl: sidecar.baseUrl,
		simulatorConfig: {
			scenario: 'happy-path',
			speed: 'instant',
			strict: true,
		},
	});

	try {
		verifyAgentSdkMaterialization(profile);
		await verifyRealAgentSdkRoute(profile);
		verifyResearchBinding(profile);
		verifySourceBoundaries();
	} finally {
		shutdownPool();
		ProfileRegistry.resetInstance();
		await sidecar.stop();
	}
	console.log('AI Search Simulator sidecar routing tests passed');
}

function verifyAgentSdkMaterialization(profile: ReturnType<typeof createPresetProfile>) {
	const env = toAgentSdkEnv(profile, SIMULATOR_MODEL_ID, SIMULATOR_MODEL_ID);
	assert.equal(env.ANTHROPIC_BASE_URL, simulatorAgentSdkBaseUrl(profile.baseUrl));
	assert.equal(env.ANTHROPIC_API_KEY, SIMULATOR_DEFAULTS.endpoint.apiKey);
	assert(env.ANTHROPIC_CUSTOM_HEADERS.includes(
		`${SIMULATOR_DEFAULTS.endpoint.scenarioHeader}: happy-path`,
	));
	assert(env.ANTHROPIC_CUSTOM_HEADERS.includes(
		`${SIMULATOR_DEFAULTS.endpoint.speedHeader}: instant`,
	));
	assert(env.ANTHROPIC_CUSTOM_HEADERS.includes(
		`${SIMULATOR_DEFAULTS.endpoint.strictHeader}: true`,
	));
}

async function verifyRealAgentSdkRoute(profile: ReturnType<typeof createPresetProfile>) {
	loadRegistry(profile, {
		...DEFAULT_SDK_SETTINGS,
		cliPathOverride: path.join(ROOT, 'sdk/cli.js'),
	});
	const app = {
		vault: {
			adapter: { getBasePath: () => ROOT },
		},
	};
	let text = '';
	for await (const message of queryWithProfile(app as any, 'test-plugin', profile, {
		prompt: [
			'## This Section',
			'Section title: Agent SDK route',
			'## Evidence for This Section',
		].join('\n'),
		systemPrompt: 'Generate the requested report section.',
		maxTurns: 1,
	})) {
		const delta = (message as any)?.event?.delta;
		if (delta?.type === 'text_delta') text += delta.text;
	}
	assert(text.includes('local AI Search Simulator'));
}

function verifyResearchBinding(profile: ReturnType<typeof createPresetProfile>) {
	ProfileRegistry.resetInstance();
	const openRouter = createPresetProfile('openrouter', {
		id: 'real',
		apiKey: 'not-used',
	});
	const registry = ProfileRegistry.getInstance();
	registry.load({
		profiles: [openRouter, profile],
		activeAgentConfig: {
			profileId: openRouter.id,
			modelId: 'anthropic/claude-sonnet-4-6',
		},
		activeAgentFastConfig: null,
		activeChatConfig: {
			profileId: openRouter.id,
			modelId: 'anthropic/claude-sonnet-4-6',
		},
		activeCopilotConfig: null,
		activeEmbeddingConfig: null,
		activeWebSearchConfig: null,
		sdkSettings: DEFAULT_SDK_SETTINGS,
	}, () => undefined);
	registry.setTierConfigs({
		fast: null,
		research: { profileId: profile.id, modelId: profile.primaryModel },
		stronger: null,
	});
	assert.equal(registry.resolveSlot('research')?.profile.kind, 'simulator');
	assert.equal(registry.getActiveAgentProfile()?.kind, 'openrouter');
}

function verifySourceBoundaries() {
	const sdkPoolSource = readSource('src/service/agents/core/sdkAgentPool.ts');
	assert(!sdkPoolSource.includes('querySimulatorSdk'));
	assert(!sdkPoolSource.includes("profile.kind === 'simulator'"));

	const providerSource = readSource('src/core/providers/simulator/client.ts');
	assert(providerSource.includes('createOpenAI'));
	assert(providerSource.includes('provider.chat(modelId)'));

	const reportSource = readSource('src/service/agents/report/ReportOrchestrator.ts');
	const requireProfileBody = reportSource.match(
		/private requireProfile\(\): Profile \{([\s\S]*?)\n    \}/,
	)?.[1] ?? '';
	assert(requireProfileBody.includes("resolveSlot('research')"));
	assert(!requireProfileBody.includes('getActiveAgentProfile'));

	const vaultSearchSource = readSource('src/service/agents/VaultSearchAgent.ts');
	assert(vaultSearchSource.includes('allowEscalation: harnessSettings.allowEscalation'));
	assert(vaultSearchSource.includes('escalationThreshold: harnessSettings.autoEscalateScoreBelow'));
	assert(vaultSearchSource.includes('maxEscalationsPerLoop: harnessSettings.maxEscalationsPerLoop'));

	const setupSource = readSource('src/ui/view/settings/tabs/AISetupTab.tsx');
	assert(setupSource.includes('createBuiltInSimulatorProfile'));
	assert(setupSource.includes("profile.kind === 'simulator'"));

	const packageJson = JSON.parse(readSource('package.json')) as {
		scripts?: Record<string, string>;
	};
	assert.equal(packageJson.scripts?.simulator, 'node tools/ai-search-simulator/server.mjs');
	assert.equal(packageJson.scripts?.['dev:simulator'], 'npm-run-all --parallel dev simulator');
}

function loadRegistry(
	profile: ReturnType<typeof createPresetProfile>,
	sdkSettings: typeof DEFAULT_SDK_SETTINGS,
) {
	ProfileRegistry.resetInstance();
	ProfileRegistry.getInstance().load({
		profiles: [profile],
		activeAgentConfig: null,
		activeAgentFastConfig: null,
		activeChatConfig: null,
		activeCopilotConfig: null,
		activeEmbeddingConfig: null,
		activeWebSearchConfig: null,
		sdkSettings,
	}, () => undefined);
	ProfileRegistry.getInstance().setTierConfigs({
		fast: { profileId: profile.id, modelId: profile.fastModel },
		research: { profileId: profile.id, modelId: profile.primaryModel },
		stronger: { profileId: profile.id, modelId: profile.primaryModel },
	});
}

function readSource(relativePath: string): string {
	return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

void run();
