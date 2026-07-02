// T3 RunEnvelope shared helpers.
//
// Lifted from `service/lint/VaultLintRun.ts` where these appeared inline as
// `defaultClock` / `defaultIdFactory`. Future capability runners should
// depend on the shared helpers so:
//
//   1. Every runner uses the same "prefix-<timestamp-base36>-<seq>" id
//      shape. Tests and log inspectors get a single format to grep for.
//   2. Runners that want fake clocks / deterministic id sequences can
//      easily swap; the production defaults live in one place.
//
// Boundary discipline: no imports from `@/app/*`, `@/ui/*`, or `obsidian`.
// The companion test `run-envelope-helpers.test.ts` locks this via source
// scan.

import type { RunClock, RunIdFactory } from './types';

/**
 * Wall-clock provider. Uses `Date.now()`; runners that need monotonic
 * / injected clocks in tests should supply their own.
 */
export function defaultClock(): RunClock {
	return { now: () => Date.now() };
}

/**
 * Prefixed run/artifact id factory.
 *
 * Ids look like `<prefix>-<Date.now() in base36>-<seq>`. Process
 * uniqueness comes from `Date.now()`; within-process monotonic `seq`
 * prevents collision when two ids are minted in the same millisecond.
 *
 * @param prefix short capability tag ("vault-lint", "cascade", ...).
 */
export function defaultIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return {
		next(): string {
			seq += 1;
			return `${prefix}-${Date.now().toString(36)}-${seq}`;
		},
	};
}
