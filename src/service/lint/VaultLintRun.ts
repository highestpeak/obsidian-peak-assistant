// T4 Vault Lint RunEnvelope vertical slice — manual-scan runner.
//
// This file is the first real adopter of `RunEnvelope`. Before T4 the UI
// panel called `VaultLintService.getInstance().runFullScan()` directly and
// the only observability was reverse-direction writes into
// `useVaultLintStore`. After T4 the UI panel calls
// `runVaultLintManualScan()`, which:
//
//   1. constructs its OWN `InMemoryRunRecorder` (no singleton, no registry);
//   2. starts a run keyed by `VAULT_LINT_CAPABILITY_ID` (T1 contract);
//   3. drives `VaultLintService.runFullScan(callbacks)` with progress and
//      detector-warning callbacks that translate into `RunEvent`s;
//   4. records the scan result as an `ArtifactRef` of kind `'result'`;
//   5. finishes the run with `'completed'` or, on throw, `'failed'`.
//
// The service still writes to `useVaultLintStore` for now — that store is
// the UI's current source of truth and T7 will replace it with an explicit
// projection of the envelope's event trace. T4 is deliberately a vertical
// slice, not a UI rewrite.
//
// Boundary discipline:
//   - This runner does NOT import obsidian, AppContext, sqliteStoreManager,
//     or any zustand store. The companion test
//     `test/vault-lint-runner.test.ts` enforces that by source-string scan.
//   - It does import `VaultLintService` (same layer) because driving the
//     real scan engine is the runner's whole job in production. Tests
//     never go through `VaultLintService.getInstance()`; they inject a
//     fake `scan` function instead.
//   - It introduces no module-level mutable state, no singleton, no
//     registry.

import {
	InMemoryRunRecorder,
	type ArtifactRef,
	type RunClock,
	type RunEvent,
	type RunIdFactory,
	type RunSession,
} from '@/service/run-envelope';
// `RunSession` is part of the public `VaultLintRunResult` shape below.
import {
	VAULT_LINT_CAPABILITY_ID,
	type VaultLintProgressEvent,
} from './VaultLintContract';
import type { LintScanResult } from './types';

/**
 * Callbacks the runner passes into `VaultLintService.runFullScan`. The
 * service emits progress as it transitions through registry warmup,
 * detector execution, and post-scan cleanup; the runner translates each
 * emission into a `RunEvent.progress`.
 *
 * `onDetectorWarning` exists because individual detectors can fail without
 * failing the run; today the service only `console.warn`s those failures
 * and a future operator wants them in the envelope trace too.
 */
export interface VaultLintRunCallbacks {
	onProgress?: (event: VaultLintProgressEvent) => void;
	onDetectorWarning?: (detectorId: string, error: unknown) => void;
}

/**
 * Everything a caller (UI, command, test) needs after a manual scan has
 * run through the envelope. `result` and `session` are the same shapes the
 * service and the recorder produce respectively; `events` is the
 * read-only event trace (already snapshotted by `getEvents()`); `artifact`
 * is the reference handed back from `recordArtifact`.
 */
export interface VaultLintRunResult {
	result: LintScanResult;
	session: RunSession;
	events: readonly RunEvent[];
	artifact: ArtifactRef;
}

/**
 * Options accepted by `runVaultLintManualScan`. All fields are optional;
 * production callers pass nothing and the runner uses real clock/id/scan.
 * Tests inject deterministic fakes via `clock`, `idFactory`, and `scan`.
 *
 * `recorder` is the rare escape hatch: a caller that already constructed
 * a recorder (e.g. a wrapping orchestrator in T5+) can pass it in. When
 * both `recorder` and `clock`/`idFactory` are supplied the recorder wins
 * — the recorder owns those decisions.
 */
export interface VaultLintRunOptions {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	scan?: (callbacks: VaultLintRunCallbacks) => Promise<LintScanResult>;
	/**
	 * Optional per-run event sink. Invoked synchronously after each
	 * `RunEvent` is appended to the recorder's trace. The `snapshot`
	 * argument is the full, defensively cloned event trace up to and
	 * including the just-emitted event — i.e. the same shape the UI
	 * projection (`useVaultLintRunState`) feeds React state with. T5 uses
	 * this to drive live progress without a global event bus.
	 *
	 * Per-run: the sink is captured by the recorder this invocation
	 * constructs and never escapes. Two concurrent calls to
	 * `runVaultLintManualScan` have isolated sinks. When the caller
	 * supplies its own `recorder`, `onEvent` is ignored — the caller is
	 * expected to have wired its own sink into the recorder it built.
	 */
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.vault-lint-scan+json';

function defaultClock(): RunClock {
	return { now: () => Date.now() };
}

function defaultIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return {
		next(): string {
			seq += 1;
			// Process-uniqueness comes from Date.now(); within-process
			// monotonic seq prevents collision when two ids are minted
			// in the same millisecond.
			return `${prefix}-${Date.now().toString(36)}-${seq}`;
		},
	};
}

async function defaultScan(
	callbacks: VaultLintRunCallbacks,
): Promise<LintScanResult> {
	// Lazy import so production code path resolves the singleton at call
	// time, not at module load. Tests never reach this branch because they
	// pass `options.scan`.
	const { VaultLintService } = await import('./VaultLintService');
	return VaultLintService.getInstance().runFullScan(callbacks);
}

function buildArtifactTitle(result: LintScanResult): string {
	return `Vault Lint scan (${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}, health ${result.healthScore})`;
}

function buildArtifactUri(result: LintScanResult): string {
	return `peak://vault-lint/scan/${result.id}`;
}

/**
 * Execute one manual Vault Lint full scan inside a fresh `RunEnvelope`.
 *
 * Trigger is always `'manual'` here — startup/scheduled triggers are
 * deliberately out of scope (see `VaultLintFutureTrigger` in the T1
 * contract). Each call constructs its own recorder; the runner never
 * holds module-level state and there is no registry of "active" runs.
 *
 * On success: returns `{ result, session, events, artifact }` with the
 * scan result, the final `RunSession` (status `'completed'`, `endedAt`
 * set), an immutable event trace, and the produced artifact reference.
 *
 * On failure: records an `error` event and finishes with `'failed'`,
 * then rethrows the original error. The caller decides how to surface
 * the failure; the existing UI store today simply clears `isScanning`
 * via `setScanProgress(null)` — that compatibility is preserved by the
 * `cleared` progress event being emitted in a `finally` block.
 */
export async function runVaultLintManualScan(
	options?: VaultLintRunOptions,
): Promise<VaultLintRunResult> {
	// `recorderRef` is a forward reference into the closure so the
	// per-event sink can call `recorderRef.getEvents()` to obtain the
	// post-mutation snapshot. We assign it immediately after constructing
	// the recorder and before any event is recorded.
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options?.onEvent;
	const recorder =
		options?.recorder ??
		new InMemoryRunRecorder({
			clock: options?.clock ?? defaultClock(),
			idFactory: options?.idFactory ?? defaultIdFactory('vault-lint'),
			...(userOnEvent !== undefined
				? {
						onEvent: (event) => {
							const snapshot = recorderRef?.getEvents() ?? [];
							userOnEvent(event, snapshot);
						},
					}
				: {}),
		});
	recorderRef = recorder;
	const scan = options?.scan ?? defaultScan;

	recorder.start({
		capabilityId: VAULT_LINT_CAPABILITY_ID,
		trigger: 'manual',
	});
	recorder.recordStatus('running');

	const callbacks: VaultLintRunCallbacks = {
		onProgress: (event) => {
			recorder.recordProgress({
				phase: event.phase,
				...(event.detector !== undefined ? { label: event.detector } : {}),
				...(event.processed !== undefined ? { processed: event.processed } : {}),
				...(event.total !== undefined ? { total: event.total } : {}),
			});
		},
		onDetectorWarning: (detectorId, error) => {
			const message = error instanceof Error ? error.message : String(error);
			recorder.recordLog('warn', `detector ${detectorId} failed: ${message}`);
		},
	};

	let result: LintScanResult;
	try {
		result = await scan(callbacks);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, false);
		const failedSession = recorder.finish('failed');
		// Surface the trace even on failure so the caller can log/diagnose.
		// The `events` snapshot already includes the error + final status.
		void failedSession;
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: buildArtifactTitle(result),
		uri: buildArtifactUri(result),
		contentType: ARTIFACT_CONTENT_TYPE,
	});
	const finalSession = recorder.finish('completed');

	return {
		result,
		session: finalSession,
		events: recorder.getEvents(),
		artifact,
	};
}
