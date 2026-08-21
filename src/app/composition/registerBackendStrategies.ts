// B3 Backend live strategies — populate BackendStrategyRegistry at boot.
//
// Composition site helper: inspect the currently-configured
// providers/profiles and register one BackendStrategy per BackendKind
// that is *actually* available. Unregistered backends are simply
// skipped — `resolveBackendStrategy` walks `[preferred, ...fallback]`
// and falls through to the next candidate, so palette commands and
// capabilities do not need to know which backends are live.
//
// Backends and their pre-flight conditions:
//   - `hermes-harness`   → runAgentLoop. Registers if any profile with
//                          an apiKey (or ollama, which needs no key)
//                          is present — the loop can then pick a model.
//   - `provider-direct`  → MultiProviderChatService.streamText. Same
//                          precondition as hermes-harness (any working
//                          provider).
//
// Strategy execute bodies expect a *discriminated input*: capability
// adapters (Wave 1 B2.* nodes) construct the payload matching the
// backend they picked and hand it to `runCapability(execute)`. If a
// caller reaches a strategy without a matching payload the strategy
// fails loud (`unsupported backend input`) — that surfaces a bug in
// the composition site, not a silent no-op.
//
// Boundary discipline: this file lives at `src/app/composition/` where
// app-shell composition is legal; it does not import from `@/ui/*`,
// but does depend on the service layer since it owns runtime wiring.

import type { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import type {
	BackendStrategy,
	BackendStrategyRegistry,
} from '@/service/capabilities/BackendStrategyRegistry';
import type {
	CapabilityExecutionOutput,
	CapabilityRunContext,
} from '@/service/capabilities/CapabilityRunner';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import type { AgentLoopConfig } from '@/service/agents/harness/loop/types';

/** Discriminated union of payloads that reach the backend strategies. */
export type BackendInvocationInput =
	| {
		readonly kind: 'agent-loop';
		readonly config: AgentLoopConfig;
	}
	| {
		readonly kind: 'provider-stream';
		readonly systemPrompt: string;
		readonly prompt: string;
		readonly profileId?: string;
	};

export interface BackendCompositionDeps {
	readonly profileRegistry: ProfileRegistry;
	/**
	 * Delegate for `provider-direct` — same shape rationale as above,
	 * usually points at `MultiProviderChatService.streamText`.
	 */
	readonly providerStreamAdapter?: (
		input: Extract<BackendInvocationInput, { kind: 'provider-stream' }>,
		ctx: CapabilityRunContext,
	) => Promise<CapabilityExecutionOutput<unknown>>;
}

function hasWorkingProvider(profileRegistry: ProfileRegistry): boolean {
	return profileRegistry
		.getAllProfiles()
		.some((p) => profileHasCredential(p));
}

function profileHasCredential(profile: Profile): boolean {
	if (!profile.enabled) return false;
	// ollama runs locally; no key required.
	if (profile.kind === 'ollama' || profile.kind === 'lmstudio') return true;
	return typeof profile.apiKey === 'string' && profile.apiKey.length > 0;
}

function buildHermesHarnessStrategy(): BackendStrategy<BackendInvocationInput, unknown> {
	return async (input, _ctx) => {
		if (input.kind !== 'agent-loop') {
			throw new Error(
				`hermes-harness backend received unsupported input '${input.kind}'. Expected { kind: 'agent-loop', config }.`,
			);
		}
		const result = await runAgentLoop(input.config);
		return {
			result,
			artifactTitle: `agent-loop:${input.config.loopId}`,
			artifactContentType: 'application/vnd.peak.agent-loop-result+json',
		};
	};
}

/**
 * Populate a registry with the strategies that boot-time conditions
 * currently allow. Returned map is a fresh `Partial<Record<...>>`;
 * caller mutates or replaces at will.
 */
export function registerBackendStrategies(
	deps: BackendCompositionDeps,
): BackendStrategyRegistry {
	const registry: BackendStrategyRegistry = {};

	const anyProvider = hasWorkingProvider(deps.profileRegistry);

	if (anyProvider) {
		registry['hermes-harness'] = buildHermesHarnessStrategy() as BackendStrategy;
	}

	if (anyProvider && deps.providerStreamAdapter) {
		registry['provider-direct'] = (async (input, ctx) => {
			if ((input as BackendInvocationInput).kind !== 'provider-stream') {
				throw new Error(
					`provider-direct backend received unsupported input '${(input as BackendInvocationInput).kind}'. Expected { kind: 'provider-stream', systemPrompt, prompt, profileId? }.`,
				);
			}
			return deps.providerStreamAdapter!(
				input as Extract<BackendInvocationInput, { kind: 'provider-stream' }>,
				ctx,
			);
		}) as BackendStrategy;
	}

	return registry;
}
