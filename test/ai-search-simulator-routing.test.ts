import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createPresetProfile } from '@/core/profiles/presets';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { DEFAULT_SDK_SETTINGS } from '@/core/profiles/types';

const ROOT = process.cwd();

async function run() {
	const profile = createPresetProfile('simulator', {
		id: 'sim-routing',
		simulatorConfig: {
			scenario: 'happy-path',
			speed: 'instant',
			strict: true,
		},
	});

	let nodeProbeReached = false;
	const originalRequire = (globalThis as any).require;
	(globalThis as any).require = (...args: unknown[]) => {
		nodeProbeReached = true;
		return originalRequire(...args);
	};
	let text = '';
	try {
		for await (const message of queryWithProfile({} as any, 'test-plugin', profile, {
			prompt: [
				'## This Section',
				'- **Title**: Routing verification',
				'## Evidence for This Section',
			].join('\n'),
			systemPrompt: '',
			maxTurns: 1,
		})) {
			const delta = (message as any)?.event?.delta;
			if (delta?.type === 'text_delta') text += delta.text;
		}
	} finally {
		(globalThis as any).require = originalRequire;
	}
	assert(text.includes('local AI Search Simulator'));
	assert.equal(nodeProbeReached, false, 'Simulator SDK route must return before Node/Claude SDK probing');

	ProfileRegistry.resetInstance();
	const registry = ProfileRegistry.getInstance();
	registry.load({
		profiles: [
			createPresetProfile('openrouter', { id: 'real', apiKey: 'not-used' }),
			profile,
		],
		activeAgentConfig: { profileId: 'real', modelId: 'anthropic/claude-sonnet-4-6' },
		activeAgentFastConfig: null,
		activeChatConfig: { profileId: 'real', modelId: 'anthropic/claude-sonnet-4-6' },
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

	const reportSource = fs.readFileSync(
		path.join(ROOT, 'src/service/agents/report/ReportOrchestrator.ts'),
		'utf8',
	);
	const requireProfileBody = reportSource.match(
		/private requireProfile\(\): Profile \{([\s\S]*?)\n    \}/,
	)?.[1] ?? '';
	assert(requireProfileBody.includes("resolveSlot('research')"));
	assert(!requireProfileBody.includes('getActiveAgentProfile'));

	const vaultSearchSource = fs.readFileSync(
		path.join(ROOT, 'src/service/agents/VaultSearchAgent.ts'),
		'utf8',
	);
	assert(vaultSearchSource.includes('allowEscalation: harnessSettings.allowEscalation'));
	assert(vaultSearchSource.includes('escalationThreshold: harnessSettings.autoEscalateScoreBelow'));
	assert(vaultSearchSource.includes('maxEscalationsPerLoop: harnessSettings.maxEscalationsPerLoop'));

	const setupSource = fs.readFileSync(
		path.join(ROOT, 'src/ui/view/settings/tabs/AISetupTab.tsx'),
		'utf8',
	);
	assert(setupSource.includes('createBuiltInSimulatorProfile'));
	assert(setupSource.includes("profile.kind === 'simulator'"));

	ProfileRegistry.resetInstance();
	console.log('AI Search Simulator routing tests passed');
}

void run();
