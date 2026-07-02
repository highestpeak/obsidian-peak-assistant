// T4-T6R Vault Lint RunEnvelope runner.
//
// The runner is the first real adopter of `RunEnvelope` and after T5
// the sole driver of UI state through its `onEvent` sink. T6R drops
// the dynamic `getVaultLintRuntime()` lookup the runner used in T6;
// the caller now passes either an explicit `runtime` (production UI
// path) or an explicit `scan` function (tests). The runner has zero
// awareness of how the runtime is composed or stored — that is the
// app layer's job.
//
// Boundary discipline:
//   - The runner does NOT import `VaultLintService`, `AppContext`,
//     `sqliteStoreManager`, the runtime registry, or any zustand
//     store. The companion test enforces that by source-string scan.
//   - It introduces no module-level mutable state, no singleton, no
//     registry. Each `runVaultLintManualScan` call is self-contained.

import {
	InMemoryRunRecorder,
	defaultClock,
	defaultIdFactory,
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
import type { VaultLintRuntime } from './VaultLintRuntime';

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
 * Options accepted by `runVaultLintManualScan`.
 *
 * Either `runtime` (production) or `scan` (tests) must be supplied —
 * the runner refuses to run otherwise. T6R deleted the older
 * service-locator fallback that resolved the runtime via
 * `getVaultLintRuntime()`; the caller is now responsible for
 * threading the app-owned runtime in (UI hook reads it from
 * `ServiceContext.vaultLintRuntime`; service consumers read it from
 * `AppContext.getVaultLintRuntime()`).
 *
 * `clock` / `idFactory` are optional fakes for tests; production
 * uses real `Date.now()` and a process-unique scan id.
 *
 * `recorder` is the rare escape hatch: a caller that already
 * constructed a recorder (e.g. a wrapping orchestrator in T5+) can
 * pass it in. When `recorder` is supplied, `onEvent` is ignored — the
 * caller is expected to have wired its own sink into that recorder.
 */
export interface VaultLintRunOptions {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	/**
	 * Vault Lint engine the runner should drive. Production callers
	 * (UI hook, future scheduled-scan command) pass the app-owned
	 * runtime read from `AppContext.getVaultLintRuntime()` / the
	 * `AppRuntimeRegistry`. The runner intentionally does NOT look
	 * the runtime up itself — that responsibility lives in the app
	 * layer.
	 *
	 * Either `runtime` or `scan` must be supplied. Tests typically
	 * inject `scan` and omit `runtime`.
	 */
	runtime?: VaultLintRuntime;
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

// T3: defaultClock + defaultIdFactory now live in run-envelope/helpers.ts
// (imported above) so future capability runners share the same
// "prefix-<timestamp-base36>-<seq>" id shape.

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
	// T6R: the runner has no fallback runtime lookup. Either an
	// explicit `scan` function (tests) or an explicit `runtime`
	// (production callers) must be supplied. This is the boundary
	// that keeps the runner free of AppContext / registry imports.
	const explicitScan = options?.scan;
	const runtime = options?.runtime;
	if (explicitScan === undefined && runtime === undefined) {
		throw new Error(
			'runVaultLintManualScan: either options.runtime or options.scan must be provided. The runner does not resolve the runtime itself; pass the app-owned Vault Lint runtime in.',
		);
	}
	const scan: (callbacks: VaultLintRunCallbacks) => Promise<LintScanResult> =
		explicitScan ?? ((cb) => runtime!.runFullScan(cb));

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
