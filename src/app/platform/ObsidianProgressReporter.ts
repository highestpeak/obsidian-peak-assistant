// App-layer adapter for ProgressReporterPort. This is the only file that
// translates port calls into Obsidian's `Notice` API. Service-side code must
// not import this file directly; an instance is owned by the app layer
// (`AppContext.progressReporter`) and passed to service consumers through
// constructor / options injection. The previous transitional
// `setDefaultProgressReporter(...)` module-singleton wiring was retired in
// T11X-F along with the port-side `defaultReporter` global.

import { Notice } from 'obsidian';
import type { ProgressHandle, ProgressReporterPort } from '@/core/ports/ProgressReporterPort';

export interface ObservableProgressSnapshot {
	status: 'idle' | 'running' | 'complete' | 'error' | 'cancelled';
	message: string;
	startedAt: number | null;
	updatedAt: number | null;
	failures: Array<{ stage: string; path?: string; message: string }>;
}

export class ObsidianProgressReporter implements ProgressReporterPort {
	private snapshot: ObservableProgressSnapshot = { status: 'idle', message: '', startedAt: null, updatedAt: null, failures: [] };
	private readonly listeners = new Set<(snapshot: ObservableProgressSnapshot) => void>();

	getSnapshot(): ObservableProgressSnapshot {
		return { ...this.snapshot };
	}

	subscribe(listener: (snapshot: ObservableProgressSnapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.getSnapshot());
		return () => this.listeners.delete(listener);
	}

	markCancelled(): void {
		this.publish({ status: 'cancelled', message: 'Indexing cancelled', updatedAt: Date.now() });
	}

	recordFailure(failure: { stage: string; path?: string; message: string }): void {
		this.publish({ failures: [...this.snapshot.failures, failure], updatedAt: Date.now() });
	}

	private publish(patch: Partial<ObservableProgressSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		const next = this.getSnapshot();
		for (const listener of this.listeners) listener(next);
	}

	show(message: string, timeoutMs = 0): ProgressHandle {
		const thisReporter = this;
		const now = Date.now();
		this.publish({
			status: classifyProgress(message),
			message,
			startedAt: isRunStart(message) ? now : this.snapshot.startedAt,
			updatedAt: now,
			...(isRunStart(message) ? { failures: [] } : {}),
		});
		// Each handle owns its own Notice and its original timeout, so updates
		// preserve the same auto-hide behavior the caller asked for.
		let notice: Notice | null = new Notice(message, timeoutMs);
		const originalTimeoutMs = timeoutMs;
		return {
			setMessage(next: string): void {
				thisReporter.publish({ status: classifyProgress(next), message: next, updatedAt: Date.now() });
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

function classifyProgress(message: string): ObservableProgressSnapshot['status'] {
	const normalized = message.toLowerCase();
	if (normalized.includes('cancel')) return 'cancelled';
	if (normalized.includes('failed') || normalized.includes('failure') || normalized.includes('error')) return 'error';
	if (normalized.includes('indexing complete') || normalized.includes('index complete') || normalized.includes('indexing finished')) return 'complete';
	return 'running';
}

function isRunStart(message: string): boolean {
	const normalized = message.toLowerCase();
	return normalized.includes('building search index') || normalized.includes('step 1/4') || normalized === 'indexing';
}
