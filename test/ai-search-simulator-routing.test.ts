import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { startSimulatorSidecar } from './helpers/simulatorSidecar';
import { createPresetProfile } from '@/core/profiles/presets';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { runHarnessText } from '@/service/agents/harness/HarnessModelRunner';

const ROOT = process.cwd();

async function run(): Promise<void> {
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
		await verifyHarnessRoute(profile);
		verifyResearchBinding(profile);
		verifySourceBoundaries();
	} finally {
		ProfileRegistry.resetInstance();
		await sidecar.stop();
	}
	console.log('AI Search Simulator Harness routing tests passed');
}

async function verifyHarnessRoute(
	profile: ReturnType<typeof createPresetProfile>,
): Promise<void> {
	const { text } = await runHarnessText({
		loopId: 'simulator-harness-routing',
		profile,
		modelId: profile.primaryModel,
		prompt: [
			'## This Section',
			'Section title: Peak Harness route',
			'## Evidence for This Section',
		].join('\n'),
		systemPrompt: 'Generate the requested report section.',
		maxSteps: 1,
	});
	assert(text.includes('flowchart LR'));
	assert(text.length > 700);
}

function verifyResearchBinding(
	profile: ReturnType<typeof createPresetProfile>,
): void {
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
	}, () => undefined);
	registry.setTierConfigs({
		fast: null,
		research: { profileId: profile.id, modelId: profile.primaryModel },
		stronger: null,
	});
	assert.equal(registry.resolveSlot('research')?.profile.kind, 'simulator');
	assert.equal(registry.getActiveAgentProfile()?.kind, 'openrouter');
}

function verifySourceBoundaries(): void {
	const providerSource = readSource('src/core/providers/simulator/client.ts');
	assert(providerSource.includes('createOpenAI'));
	assert(providerSource.includes('provider.chat(modelId)'));

	const reportSource = readSource('src/service/agents/report/ReportOrchestrator.ts');
	assert(reportSource.includes("resolveSlot('research')"));
	assert(reportSource.includes('runHarnessText'));
	assert(reportSource.includes('streamHarnessModel'));

	const vaultSearchSource = readSource('src/service/agents/VaultSearchAgent.ts');
	assert(vaultSearchSource.includes('allowEscalation: harnessSettings.allowEscalation'));
	assert(vaultSearchSource.includes('escalationThreshold: harnessSettings.autoEscalateScoreBelow'));
	assert(vaultSearchSource.includes('maxEscalationsPerLoop: harnessSettings.maxEscalationsPerLoop'));

	const packageJson = JSON.parse(readSource('package.json')) as {
		dependencies?: Record<string, string>;
		scripts?: Record<string, string>;
	};
	assert.equal(packageJson.dependencies?.['@anthropic-ai/claude-agent-sdk'], undefined);
	assert.equal(packageJson.scripts?.['copy-sdk'], undefined);
	assert.equal(packageJson.scripts?.simulator, 'node tools/ai-search-simulator/server.mjs');
}

function readSource(relativePath: string): string {
	return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

void run();
