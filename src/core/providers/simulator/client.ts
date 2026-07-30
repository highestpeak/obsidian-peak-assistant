/**
 * Thin client configuration for the standalone AI Search Simulator.
 *
 * The response engine and scenarios execute in `tools/ai-search-simulator`.
 * This module contains only the localhost transport contract needed by the
 * production plugin bundle.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import rawClientDefaults from '../../../../templates/config/ai-search-simulator.json';
import type {
	Profile,
	SimulatorProfileConfig,
	SimulatorScenarioId,
	SimulatorSpeed,
} from '@/core/profiles/types';
import { DEFAULT_SIMULATOR_PROFILE_CONFIG } from '@/core/profiles/types';

interface SimulatorClientDefaults {
	endpoint: {
		defaultBaseUrl: string;
		apiKey: string;
		scenarioHeader: string;
		speedHeader: string;
		strictHeader: string;
	};
	scenarios: Array<{
		id: SimulatorScenarioId;
		label: string;
		description: string;
	}>;
	speeds: Array<{
		id: SimulatorSpeed;
		label: string;
		description: string;
	}>;
	ui: {
		providerName: string;
		providerLabel: string;
		providerDescription: string;
		presetDescription: string;
		credentialLabel: string;
		sectionTitle: string;
		endpointLabel: string;
		scenarioLabel: string;
		speedLabel: string;
		strictLabel: string;
		instruction: string;
	};
}

export const SIMULATOR_DEFAULTS = rawClientDefaults as SimulatorClientDefaults;
export const SIMULATOR_MODEL_ID = 'ai-search-simulator';
export const SIMULATOR_SCENARIOS = SIMULATOR_DEFAULTS.scenarios;
export const SIMULATOR_SPEEDS = SIMULATOR_DEFAULTS.speeds;

export function createSimulatorLanguageModel(
	profile: Profile,
	modelId: string,
): LanguageModel {
	const provider = createOpenAI({
		name: 'simulator',
		baseURL: normalizeSimulatorBaseUrl(profile.baseUrl),
		apiKey: SIMULATOR_DEFAULTS.endpoint.apiKey,
		headers: simulatorRequestHeaders(profile.simulatorConfig),
	});
	return provider.chat(modelId) as LanguageModel;
}

export function normalizeSimulatorBaseUrl(baseUrl: string | null | undefined): string {
	let normalized = (baseUrl || SIMULATOR_DEFAULTS.endpoint.defaultBaseUrl).trim();
	while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
	if (normalized.endsWith('/v1')) return normalized;
	return `${normalized}/v1`;
}

export function simulatorHealthUrl(baseUrl: string | null | undefined): string {
	return `${normalizeSimulatorBaseUrl(baseUrl)}/health`;
}

export function simulatorRequestHeaders(
	config: SimulatorProfileConfig | null | undefined,
): Record<string, string> {
	const resolved = {
		...DEFAULT_SIMULATOR_PROFILE_CONFIG,
		...config,
	};
	return {
		[SIMULATOR_DEFAULTS.endpoint.scenarioHeader]: resolved.scenario,
		[SIMULATOR_DEFAULTS.endpoint.speedHeader]: resolved.speed,
		[SIMULATOR_DEFAULTS.endpoint.strictHeader]: String(resolved.strict),
	};
}
