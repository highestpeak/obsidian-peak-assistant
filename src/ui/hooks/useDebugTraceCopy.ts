import { useCallback } from 'react';
import { Notice } from 'obsidian';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { copyDebugRun } from '@/service/debug-trace/copyDebugRun';
import { DEFAULT_DEBUG_TRACE_SETTINGS } from '@/core/config/settingsTypes';

/**
 * Copy a DebugRun by runId to the clipboard. Surface-agnostic; each UI hooks
 * this and passes the runId it knows about (chat: assistant message metadata;
 * search: last-search runId ref; ambient: card runId; analyze: report runId).
 *
 * The hook resolves the port + settings from ServiceContext, so callers only
 * need to know the runId. Off-mode and missing-run are surfaced as a Notice.
 */
export function useDebugTraceCopy(): (runId: string | null | undefined) => Promise<void> {
	const { debugTracePort, settings } = useServiceContext();
	return useCallback(
		async (runId: string | null | undefined) => {
			if (!runId) {
				new Notice('No debug trace available for this item.');
				return;
			}
			if (!debugTracePort) {
				new Notice('Debug tracing is not initialised.');
				return;
			}
			await copyDebugRun(runId, {
				port: debugTracePort,
				settings: settings.debugTrace ?? DEFAULT_DEBUG_TRACE_SETTINGS,
				writeClipboard: (text: string) => navigator.clipboard.writeText(text),
				notify: (msg: string) => new Notice(msg),
			});
		},
		[debugTracePort, settings.debugTrace],
	);
}
