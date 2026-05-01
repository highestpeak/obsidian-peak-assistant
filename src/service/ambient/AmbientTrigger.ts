import type { App, EventRef, TFile } from 'obsidian';
import type { AmbientPushSettings } from './types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from './types';

export type TriggerCallback = (filePath: string, reason: 'writing_pause' | 'doc_switch' | 'manual') => void;

/**
 * Event gateway that listens to editor changes and file-open events,
 * applying debounce, cooldown, and significance filtering before triggering
 * ambient searches.
 */
export class AmbientTrigger {
	private charAccumulator = 0;
	private pauseTimer: ReturnType<typeof setTimeout> | null = null;
	private lastTriggerTs = 0;
	private lastFilePath: string | null = null;
	private fileOpenedAt = 0;
	private eventRefs: EventRef[] = [];
	private disposed = false;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => AmbientPushSettings,
		private readonly onTrigger: TriggerCallback,
	) {}

	/**
	 * Start listening to workspace events.
	 */
	start(): void {
		const editorChangeRef = this.app.workspace.on('editor-change', () => {
			if (this.disposed) return;

			const settings = this.getSettings();
			if (!settings.enabled) return;
			this.charAccumulator++;

			// Reset pause timer on every keystroke
			if (this.pauseTimer) {
				clearTimeout(this.pauseTimer);
				this.pauseTimer = null;
			}

			this.pauseTimer = setTimeout(() => {
				if (this.disposed) return;

				if (
					this.charAccumulator >= settings.minCharDelta &&
					this.canTrigger(settings.triggerCooldownMs)
				) {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && !this.shouldSkip(activeFile.path)) {
						this.charAccumulator = 0;
						this.lastTriggerTs = Date.now();
						this.onTrigger(activeFile.path, 'writing_pause');
					}
				}
			}, settings.writingPauseMs);
		});
		this.eventRefs.push(editorChangeRef);

		const fileOpenRef = this.app.workspace.on('file-open', (file: TFile | null) => {
			if (this.disposed) return;
			if (!file) return;
			if (!this.getSettings().enabled) return;

			const path = file.path;

			// Skip if same file
			if (path === this.lastFilePath) return;
			this.lastFilePath = path;
			this.fileOpenedAt = Date.now();

			// Reset accumulator on file switch
			this.charAccumulator = 0;

			// Skip non-md files and noisy paths
			if (this.shouldSkip(path)) return;

			const settings = this.getSettings();
			if (!this.canTrigger(settings.docSwitchCooldownMs)) return;

			this.lastTriggerTs = Date.now();
			this.onTrigger(path, 'doc_switch');
		});
		this.eventRefs.push(fileOpenRef);
	}

	/**
	 * Force-trigger an ambient search for the current active file.
	 */
	triggerManual(): void {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;
		if (this.shouldSkip(activeFile.path)) return;

		this.lastTriggerTs = Date.now();
		this.onTrigger(activeFile.path, 'manual');
	}

	/**
	 * Return the timestamp when the current file was opened.
	 */
	getFileOpenedAt(): number {
		return this.fileOpenedAt;
	}

	/**
	 * Clean up all event listeners and timers.
	 */
	dispose(): void {
		this.disposed = true;
		if (this.pauseTimer) {
			clearTimeout(this.pauseTimer);
			this.pauseTimer = null;
		}
		for (const ref of this.eventRefs) {
			this.app.workspace.offref(ref);
		}
		this.eventRefs = [];
	}

	/**
	 * Check if a path should be skipped (non-md or noisy directories).
	 */
	private shouldSkip(path: string): boolean {
		if (!path.endsWith('.md')) return true;
		if (path.includes('Hub-Summaries/')) return true;
		if (path.includes('ChatFolder/AI-Analysis/')) return true;
		return false;
	}

	/**
	 * Check if enough time has elapsed since the last trigger.
	 */
	private canTrigger(cooldownMs: number): boolean {
		return Date.now() - this.lastTriggerTs >= cooldownMs;
	}
}
