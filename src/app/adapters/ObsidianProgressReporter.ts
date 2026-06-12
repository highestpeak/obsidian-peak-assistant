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
				// Match the legacy IndexProgressTracker behavior: destroy and
				// recreate the Notice on every message change so the position,
				// fade animation, and timeout reset are identical to what
				// users saw before T2A.
				notice?.hide();
				notice = new Notice(next, originalTimeoutMs);
			},
			hide(): void {
				notice?.hide();
				notice = null;
			},
		};
	}
}
