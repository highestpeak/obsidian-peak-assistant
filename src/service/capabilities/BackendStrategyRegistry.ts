// T4 / T9 backend policy → execute strategy dispatch.
//
// The CapabilityRunner is intentionally backend-agnostic: it takes an
// `execute` function and treats it as opaque. That leaves one question
// unanswered: given a `CapabilityManifest.backendPolicy` (preferred +
// fallback list of `BackendKind`), how do we *synthesize* that
// `execute` at the composition site?
//
// This module owns the answer. It provides:
//
//   - `BackendStrategy` — one concrete implementation per BackendKind.
//     A strategy takes the same shape as CapabilityRunner's `execute`.
//   - `BackendStrategyRegistry` — a map (BackendKind → BackendStrategy).
//     The composition site populates it at boot (`AppRuntimeRegistry`)
//     with the backends currently wired up (hermes-harness runner,
//     Claude SDK client, raw provider fanout). Unavailable backends
//     simply do not register — the resolver then skips them via the
//     fallback list.
//   - `resolveBackendStrategy(policy, registry)` — walks
//     `[policy.preferred, ...policy.fallback]` and returns the first
//     registered strategy. Throws when none are available (fail-loud,
//     no silent downgrade).
//   - `composeExecuteFromPolicy(manifest, registry)` — the sugar most
//     callsites want: give me an `execute` function that already knows
//     which backend to call.
//
// Boundary discipline:
//   - No app-shell / UI / Obsidian imports.
//   - No side effects on module load; the composition site owns
//     ordering.

import type { BackendKind, BackendPolicy, CapabilityManifest } from '@/core/types/capability';
import type {
	CapabilityExecutionOutput,
	CapabilityRunContext,
} from './CapabilityRunner';

/**
 * Concrete per-backend runner. Same shape as
 * `CapabilityRunOptions.execute` so the resolved strategy can be handed
 * directly to `runCapability`.
 */
export type BackendStrategy<TInput = unknown, TResult = unknown> = (
	input: TInput,
	ctx: CapabilityRunContext,
) => Promise<CapabilityExecutionOutput<TResult>>;

/**
 * Registry of currently-available backends. A partial map is legal —
 * unregistered `BackendKind`s are simply skipped during resolution.
 */
export type BackendStrategyRegistry = Partial<Record<BackendKind, BackendStrategy>>;

/**
 * Walk `[preferred, ...fallback]` and return the first registered
 * strategy. Throws when none of the requested backends are available.
 * Fail-loud on purpose: silently downgrading to an unrequested backend
 * would violate handbook §3 "No Dual System" (the manifest is the
 * source of truth for backend selection).
 */
export function resolveBackendStrategy<TInput = unknown, TResult = unknown>(
	policy: BackendPolicy,
	registry: BackendStrategyRegistry,
): { strategy: BackendStrategy<TInput, TResult>; backend: BackendKind } {
	const candidates: BackendKind[] = [policy.preferred, ...policy.fallback];
	for (const kind of candidates) {
		const s = registry[kind];
		if (s !== undefined) {
			return { strategy: s as BackendStrategy<TInput, TResult>, backend: kind };
		}
	}
	throw new Error(
		`No backend strategy registered for policy [preferred=${policy.preferred}, fallback=${JSON.stringify(policy.fallback)}]. Registered backends: ${JSON.stringify(Object.keys(registry))}.`,
	);
}

/**
 * Sugar: give the composition site an `execute` function ready to hand
 * to `runCapability({ ..., execute })`. Selection happens *once* at
 * synthesis time — the returned function then always dispatches to the
 * same backend. If policies need to be re-evaluated per invocation,
 * callers should call `resolveBackendStrategy` themselves.
 */
export function composeExecuteFromPolicy<TInput = unknown, TResult = unknown>(
	manifest: CapabilityManifest,
	registry: BackendStrategyRegistry,
): BackendStrategy<TInput, TResult> {
	const { strategy } = resolveBackendStrategy<TInput, TResult>(manifest.backendPolicy, registry);
	return strategy;
}

// ---------------------------------------------------------------------------
// Built-in stub strategies.
// ---------------------------------------------------------------------------
//
// These are intentionally *stubs* — the real hermes-harness /
// claude-sdk / provider-direct wiring lives in AppRuntimeRegistry at
// composition time. Exposing named stubs here gives tests something to
// register that has zero live-provider dependencies, and gives the
// composition site a documented pattern to follow.

/** Stub strategy that echoes input as a JSON string. Useful in tests. */
export function makeEchoStrategy<TInput = unknown>(): BackendStrategy<TInput, TInput> {
	return async (input) => ({ result: input });
}

/** Stub strategy that always throws — mimics an unavailable backend. */
export function makeUnavailableStrategy(reason: string): BackendStrategy {
	return async () => {
		throw new Error(`backend unavailable: ${reason}`);
	};
}
