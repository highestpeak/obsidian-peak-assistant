// Copy a DebugRun to the clipboard as a Markdown / JSON receipt.
//
// The caller looks up the run via `DebugTracePort.getRun(runId)` and hands
// it here. This helper knows nothing about Obsidian; the Notice / clipboard
// call is done by the UI layer via injected callbacks so this file stays
// service-layer.

import type {
	DebugFormatterOptions,
	DebugRun,
	DebugTracePort,
} from '@/core/debug-trace';
import { formatDebugRun } from '@/core/debug-trace';
import type { DebugTraceSettings } from '@/core/config/settingsTypes';

export interface CopyDebugRunDeps {
	readonly port: DebugTracePort;
	readonly settings: DebugTraceSettings;
	readonly writeClipboard: (text: string) => Promise<void> | void;
	readonly notify?: (message: string) => void;
}

export interface CopyDebugRunResult {
	readonly ok: boolean;
	readonly reason?: string;
	readonly bytes?: number;
	readonly run?: DebugRun;
}

/**
 * Look up a DebugRun by runId and copy its receipt to the clipboard.
 *
 * Fails gracefully when:
 *   - Debug tracing is off (settings.mode='off')
 *   - The run isn't in the recorder's retention buffer
 *
 * Returns a result so the caller can surface reason strings in its own UI.
 */
export async function copyDebugRun(
	runId: string,
	deps: CopyDebugRunDeps,
): Promise<CopyDebugRunResult> {
	if (deps.settings.mode === 'off') {
		deps.notify?.('Debug tracing is off. Enable it in Settings → Advanced.');
		return { ok: false, reason: 'debug-tracing-off' };
	}
	const run = deps.port.getRun(runId);
	if (!run) {
		deps.notify?.('No debug trace found for this run.');
		return { ok: false, reason: 'run-not-found' };
	}
	const opts: DebugFormatterOptions = {
		format: deps.settings.copyFormat,
		includeRawIfAvailable:
			deps.settings.mode === 'raw' && deps.settings.includeRawContent,
	};
	const { markdown, json } = formatDebugRun(run, opts);
	// Markdown is the primary body; `both` glues JSON into the Markdown
	// appendix so a single clipboard write is enough. `json` alone writes the
	// JSON string.
	const body =
		deps.settings.copyFormat === 'json'
			? (json ?? '')
			: (markdown ?? '');
	await deps.writeClipboard(body);
	deps.notify?.('Debug trace copied to clipboard.');
	return { ok: true, bytes: body.length, run };
}
