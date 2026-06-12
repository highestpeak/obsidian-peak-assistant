// App-layer adapter for ProgressReporterPort. This is the only file that
// translates port calls into Obsidian's `Notice` API. Service-side code must
// not import this file directly; it is wired in `main.ts` via
// `setDefaultProgressReporter(new ObsidianProgressReporter())`.

import { Notice } from 'obsidian';
import type { ProgressHandle, ProgressReporterPort } from '@/service/ports/ProgressReporterPort';

export class ObsidianProgressReporter implements ProgressReporterPort {
	show(message: string, timeoutMs = 0): ProgressHandle {
		// Each handle owns its own Notice and its original timeout, so updates
		// preserve the same auto-hide behavior the caller asked for.
		let notice: Notice | null = new Notice(message, timeoutMs);
		const originalTimeoutMs = timeoutMs;
		return {
			setMessage(next: string): void {
				// Prefer Obsidian's native Notice.setMessage when the running
				// version supports it (flicker-free in-place update). This
				// matches the pre-T2A heuristic used by the legacy
				// IndexInitializer.openPipelineNotice helper, which T2B
				// folds into this adapter so the port can serve pipeline
				// callers without changing user-visible behavior.
				if (notice) {
					const native = notice as Notice & { setMessage?: (text: string) => void };
					if (typeof native.setMessage === 'function') {
						native.setMessage(next);
						return;
					}
					notice.hide();
				}
				notice = new Notice(next, originalTimeoutMs);
			},
			hide(): void {
				notice?.hide();
				notice = null;
			},
		};
	}
}
