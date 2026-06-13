// T5/T6R Vault Lint Runtime Closure Wave — UI projection hook.
//
// This hook is the new single source of truth for Vault X-Ray runtime
// state. Before T5 the UI read `currentScan` / `isScanning` / progress
// from `useVaultLintStore`, which `VaultLintService.runFullScan` wrote
// in reverse direction. After T5 the runtime state is projected from
// the `RunEnvelope` event trace the runner produces.
//
// T6R: the Vault Lint runtime is read from `ServiceContext`, which
// reads it from the app-owned `AppRuntimeRegistry`. The hook never
// touches a service-layer singleton or calls `getVaultLintRuntime()`
// (that function no longer exists). The runner is invoked with the
// runtime as an explicit option.
//
// Per-mount state (`useState`) is intentional: the trace belongs to the
// current scan attempt only. When the panel unmounts the trace is
// discarded; persistence still lives in `VaultLintRepo` (last scan
// result, dismissals) — that path is unaffected.

import { useCallback, useMemo, useRef, useState } from 'react';
import { runVaultLintManualScan } from '@/service/lint/VaultLintRun';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type {
	RunEvent,
	RunStatus,
} from '@/service/run-envelope';
import type { LintScanResult } from '@/service/lint/types';

export interface VaultLintProgressView {
	phase: string;
	label?: string;
	processed?: number;
	total?: number;
}

export interface VaultLintRunState {
	/** True while the current scan is queued or running. */
	isScanning: boolean;
	/** Result of the last completed scan in this mount, or null. */
	currentScan: LintScanResult | null;
	/** Most recent progress event, or null if no scan has reported one. */
	progress: VaultLintProgressView | null;
	/** Error message from the most recent failed scan in this mount. */
	error: string | null;
	/** Full event trace for the current/last scan attempt. */
	events: readonly RunEvent[];
	/** Kick off a scan. Resolves when the scan is complete (or rejected). */
	startScan: () => Promise<void>;
}

function deriveLatestStatus(events: readonly RunEvent[]): RunStatus | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'status') return event.status;
	}
	return null;
}

function deriveLatestProgress(events: readonly RunEvent[]): VaultLintProgressView | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'progress') {
			return {
				phase: event.phase,
				...(event.label !== undefined ? { label: event.label } : {}),
				...(event.processed !== undefined ? { processed: event.processed } : {}),
				...(event.total !== undefined ? { total: event.total } : {}),
			};
		}
	}
	return null;
}

/**
 * UI hook that projects Vault X-Ray runtime state from the RunEnvelope
 * trace of the most recent `runVaultLintManualScan` invocation in this
 * component mount.
 *
 * Concurrency: a `scanTokenRef` guards against the case where the user
 * fires a second scan before the first finishes. When that happens the
 * new scan's events overwrite the trace and the stale completion of the
 * first invocation is ignored.
 */
export function useVaultLintRunState(): VaultLintRunState {
	const { vaultLintRuntime } = useServiceContext();
	const [events, setEvents] = useState<readonly RunEvent[]>([]);
	const [currentScan, setCurrentScan] = useState<LintScanResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const scanTokenRef = useRef(0);

	const startScan = useCallback(async () => {
		const token = ++scanTokenRef.current;
		setEvents([]);
		setCurrentScan(null);
		setError(null);
		if (!vaultLintRuntime) {
			setError(
				'Vault Lint runtime is not ready yet — wait for plugin initialization to finish and try again.',
			);
			return;
		}
		try {
			const out = await runVaultLintManualScan({
				runtime: vaultLintRuntime,
				onEvent: (_event, snapshot) => {
					if (token !== scanTokenRef.current) return;
					setEvents(snapshot);
				},
			});
			if (token !== scanTokenRef.current) return;
			setCurrentScan(out.result);
		} catch (e) {
			if (token !== scanTokenRef.current) return;
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [vaultLintRuntime]);

	const latestStatus = useMemo(() => deriveLatestStatus(events), [events]);
	const isScanning = latestStatus === 'queued' || latestStatus === 'running';
	const progress = useMemo(() => deriveLatestProgress(events), [events]);

	return {
		isScanning,
		currentScan,
		progress,
		error,
		events,
		startScan,
	};
}
