import type {
	SimulatorProfileConfig,
	SimulatorScenarioId,
	SimulatorSpeed,
} from '@/core/profiles/types';
import { SIMULATOR_DEFAULTS } from './SimulatorDefaults';

export type SimulatorResponseIntent =
	| { kind: 'tool-call'; toolName: string; input: Record<string, unknown> }
	| { kind: 'text'; text: string }
	| { kind: 'error'; message: string };

export interface SimulatorRequest {
	prompt: unknown[];
	availableTools: string[];
	config: SimulatorProfileConfig;
}

export interface SimulatorToolResult {
	toolName: string;
	value: unknown;
}

export interface SimulatorScenarioDefinition {
	id: SimulatorScenarioId;
	label: string;
	description: string;
}

export const SIMULATOR_SCENARIOS: readonly SimulatorScenarioDefinition[] =
	SIMULATOR_DEFAULTS.scenarios;

export const SIMULATOR_SPEEDS: ReadonlyArray<{
	id: SimulatorSpeed;
	label: string;
	description: string;
}> = SIMULATOR_DEFAULTS.speeds;

export const SIMULATOR_MODEL_ID = 'ai-search-simulator';
