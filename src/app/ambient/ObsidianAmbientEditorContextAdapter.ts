// T8: editor-context adapter. Owns the Obsidian `App.workspace`
// editor-change / file-open subscriptions (formerly
// `service/ambient/AmbientTrigger.ts`) and the active-editor context
// projection (formerly `service/ambient/ContextExtractor.extractContext`).
// Both pieces live here because they need raw Obsidian APIs;
// service-layer code stays Obsidian-free.

import { App, MarkdownView, type EventRef, type TFile } from 'obsidian';
import type {
	AmbientEditorContextPort,
	AmbientSettingsPort,
	AmbientTriggerCallback,
} from '@/service/ambient/ports/AmbientPorts';
import type { AmbientContext } from '@/core/types/ambient';
import {
	extractHeadings,
	extractOutlinks,
	extractParagraphAtLine,
	getCursorSection,
} from '@/service/ambient/ContextExtractor';

export class ObsidianAmbientEditorContextAdapter implements AmbientEditorContextPort {
	private trigger: AmbientEditorTrigger | null = null;
	private fileOpenedAt = 0;

	constructor(
		private readonly app: App,
		private readonly settings: AmbientSettingsPort,
	) {}

	start(onTrigger: AmbientTriggerCallback): void {
		if (this.trigger) return;
		this.trigger = new AmbientEditorTrigger(
			this.app,
			() => this.settings.getSettings(),
			(filePath, triggerType) => {
				this.fileOpenedAt = this.trigger?.getFileOpenedAt() ?? this.fileOpenedAt;
				onTrigger(filePath, triggerType);
			},
		);
		this.trigger.start();
	}

	triggerManual(): void {
		this.trigger?.triggerManual();
	}

	dispose(): void {
		this.trigger?.dispose();
		this.trigger = null;
		this.fileOpenedAt = 0;
	}

	extractContext(filePath?: string): AmbientContext | null {
		const mdView = getMarkdownView(this.app, filePath);
		if (!mdView || !mdView.file) return null;

		const editor = mdView.editor;
		const cursor = editor.getCursor();
		const fullText = editor.getValue();
		const lines = fullText.split('\n');
		const file = mdView.file;

		const currentParagraph = extractParagraphAtLine(lines, cursor.line);
		const cursorSection = getCursorSection(lines, cursor.line);
		const existingOutlinks = extractOutlinks(fullText);
		const documentHeadings = extractHeadings(lines);

		const cache = this.app.metadataCache.getFileCache(file);
		const documentTags = (cache?.frontmatter?.tags as string[] | undefined) ?? [];

		const fileOpenedAt = this.trigger?.getFileOpenedAt() ?? this.fileOpenedAt;

		return {
			currentParagraph: currentParagraph.slice(0, 500),
			cursorSection,
			documentTitle: file.basename,
			documentTags,
			documentHeadings,
			existingOutlinks,
			recentEditDelta: '',
			editSessionDuration: (Date.now() - fileOpenedAt) / 1000,
			filePath: file.path,
			lastModified: file.stat.mtime,
		};
	}
}

// ---------------------------------------------------------------------------
// Editor trigger — moved from service/ambient/AmbientTrigger.ts.
// ---------------------------------------------------------------------------

class AmbientEditorTrigger {
	private charAccumulator = 0;
	private pauseTimer: ReturnType<typeof setTimeout> | null = null;
	private lastTriggerTs = 0;
	private lastFilePath: string | null = null;
	private fileOpenedAt = 0;
	private eventRefs: EventRef[] = [];
	private disposed = false;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => import('@/core/types/ambient').AmbientPushSettings,
		private readonly onTrigger: AmbientTriggerCallback,
	) {}

	start(): void {
		const editorChangeRef = this.app.workspace.on('editor-change', () => {
			if (this.disposed) return;

			const settings = this.getSettings();
			if (!settings.enabled) return;
			this.charAccumulator++;

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
			if (path === this.lastFilePath) return;
			this.lastFilePath = path;
			this.fileOpenedAt = Date.now();
			this.charAccumulator = 0;

			if (this.shouldSkip(path)) return;
			const settings = this.getSettings();
			if (!this.canTrigger(settings.docSwitchCooldownMs)) return;

			this.lastTriggerTs = Date.now();
			this.onTrigger(path, 'doc_switch');
		});
		this.eventRefs.push(fileOpenRef);
	}

	triggerManual(): void {
		const filePath = this.getManualTriggerFilePath();
		if (!filePath) return;
		if (this.shouldSkip(filePath)) return;
		this.lastTriggerTs = Date.now();
		this.onTrigger(filePath, 'manual');
	}

	getFileOpenedAt(): number {
		return this.fileOpenedAt;
	}

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

	private shouldSkip(path: string): boolean {
		if (!path.endsWith('.md')) return true;
		if (path.includes('Hub-Summaries/')) return true;
		if (path.includes('ChatFolder/AI-Analysis/')) return true;
		return false;
	}

	private canTrigger(cooldownMs: number): boolean {
		return Date.now() - this.lastTriggerTs >= cooldownMs;
	}

	private getManualTriggerFilePath(): string | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) return activeFile.path;

		const markdownLeaf = this.app.workspace
			.getLeavesOfType('markdown')
			.find((leaf) => {
				const view = leaf.view as { file?: TFile | null };
				return Boolean(view.file?.path);
			});
		if (markdownLeaf) {
			const view = markdownLeaf.view as { file?: TFile | null };
			return view.file?.path ?? null;
		}

		return this.lastFilePath;
	}
}

function getMarkdownView(app: App, filePath?: string): MarkdownView | null {
	if (filePath) {
		const leaf = app.workspace
			.getLeavesOfType('markdown')
			.find((candidate) => {
				const view = candidate.view as MarkdownView | undefined;
				return view?.file?.path === filePath;
			});
		if (leaf) return leaf.view as MarkdownView;
	}

	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (!filePath) return activeView;
	if (activeView?.file?.path === filePath) return activeView;

	return activeView;
}
