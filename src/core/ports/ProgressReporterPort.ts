// T2A first port boundary: progress notification surface.
//
// This file must stay dependency-light. It must not import obsidian,
// AppContext, any zustand store, any UI module, any storage adapter, or any
// other runtime singleton.
//
// Service consumers receive a ProgressReporterPort via constructor injection
// or an options field. The app layer (main.ts via AppContext) owns the
// lifetime of the concrete reporter implementation.

export interface ProgressHandle {
	/**
	 * Replace the current message. The handle's original timeout (the one
	 * passed to `show`) is preserved.
	 */
	setMessage(message: string): void;
	/** Close the underlying notification. Safe to call multiple times. */
	hide(): void;
}

export interface ProgressReporterPort {
	/**
	 * Open a progress notification. `timeoutMs === 0` keeps it visible until
	 * `hide()` is called explicitly (matches `new Notice(msg, 0)`).
	 */
	show(message: string, timeoutMs?: number): ProgressHandle;
	/** Optional structured failure channel used by durable progress workspaces. */
	recordFailure?(failure: { stage: string; path?: string; message: string }): void;
}
