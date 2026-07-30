import {
	App,
	MarkdownView,
	Notice,
	TFile,
	type EventRef,
	type WorkspaceLeaf,
	type ViewState,
} from 'obsidian';
import {
	normalizeComposerViewState,
	type ComposerOpenRequest,
	type ComposerViewStateV2,
	type DefaultDocumentView,
} from '@/core/composer';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from './viewType';
import {
	DEFAULT_COMPOSER_NAVIGATION_STRINGS,
	type ComposerNavigationStrings,
} from './ComposerNavigationDefaults';
import {
	HostOpenConversionRegistry,
	HostOpenSuppressionRegistry,
	selectHostOpenedLeaf,
} from './ComposerHostOpenPolicy';
import { NativeMarkdownComposerAffordance } from './NativeMarkdownComposerAffordance';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import { selectDocumentLocationLeaf } from './DocumentLocationPolicy';
import { revealMarkdownLocation } from './DocumentLocationReveal';
import {
	captureNativeMarkdownIntelligenceContext,
	type NativeMarkdownIntelligenceContext,
} from './NativeMarkdownIntelligenceContext';

export interface ComposerDocumentRouterOptions {
	getDefaultView(): DefaultDocumentView;
	setDefaultView(view: DefaultDocumentView): Promise<void>;
	openIntelligenceCompanion?(
		filePath: string,
		context: NativeMarkdownIntelligenceContext,
		returnFocus?: HTMLElement | null,
	): void | Promise<void>;
	strings?: ComposerNavigationStrings;
}

export interface ComposerLocationRevealRequest {
	filePath: string;
	location: DocumentSourceLocation;
	disposition: ComposerOpenRequest['disposition'];
	reason: ComposerOpenRequest['reason'];
}

interface ComposerLeafConversionOptions {
	/**
	 * Explicit view switches preserve unsaved editor data. A host `file-open`
	 * has already asked MarkdownView to load the new file, so calling save()
	 * again inside that lifecycle is unsafe and unnecessary.
	 */
	preserveMarkdownBuffer?: boolean;
	/** Host conversions become obsolete when a newer file-open owns the leaf. */
	isCurrent?: () => boolean;
}

class ComposerLeafRetentionError extends Error {
	constructor() {
		super('Composer conversion did not retain the current leaf');
		this.name = 'ComposerLeafRetentionError';
	}
}

class ComposerLeafBindingChangedError extends Error {
	constructor() {
		super('Composer conversion changed the bound file');
		this.name = 'ComposerLeafBindingChangedError';
	}
}

class ComposerHostConversionSupersededError extends Error {
	constructor() {
		super('Composer host conversion was superseded');
		this.name = 'ComposerHostConversionSupersededError';
	}
}

/**
 * The single app-owned Markdown/Composer navigation policy. It only uses
 * Obsidian's public View/Workspace APIs and guards its own transitions so the
 * host `file-open` bridge cannot recursively convert them.
 */
export class ComposerDocumentRouter {
	private readonly guardedLeaves = new Set<WorkspaceLeaf>();
	private readonly hostOpenConversions = new HostOpenConversionRegistry<WorkspaceLeaf>();
	private readonly hostOpenSuppressions = new HostOpenSuppressionRegistry();
	private readonly refs: EventRef[] = [];
	private readonly strings: ComposerNavigationStrings;
	private readonly nativeAffordance: NativeMarkdownComposerAffordance;

	constructor(
		private readonly app: App,
		private readonly options: ComposerDocumentRouterOptions,
	) {
		this.strings = options.strings ?? DEFAULT_COMPOSER_NAVIGATION_STRINGS;
		this.nativeAffordance = new NativeMarkdownComposerAffordance(this.app, {
			label: this.strings.openCurrentInComposer,
			conversionFailed: this.strings.conversionFailed,
			convert: (leaf) => this.convertLeaf(leaf, 'composer'),
		});
		this.refs.push(
			this.app.workspace.on('file-open', (file) => {
				void this.onHostFileOpen(file);
			}),
			this.app.workspace.on('file-menu', (menu, file, _source, leaf) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				if (!leaf || !(leaf.view instanceof MarkdownView)) return;
				menu.addItem((item) => {
					item
						.setTitle(this.strings.openInComposer)
						.setIcon('panels-top-left')
						.onClick(() => {
							void this.convertLeaf(leaf, 'composer').catch(() => {
								new Notice(this.strings.conversionFailed);
							});
						});
				});
				if (this.options.openIntelligenceCompanion) {
					const markdownView = leaf.view;
					const returnFocus = markdownView.containerEl.ownerDocument
						.activeElement as HTMLElement | null;
					const nativeContext = captureNativeMarkdownIntelligenceContext(markdownView);
					menu.addItem((item) => {
						item
							.setTitle(this.strings.openIntelligence)
							.setIcon('sparkles')
							.onClick(() => {
								void markdownView.save().then(() =>
									this.options.openIntelligenceCompanion?.(
										file.path,
										nativeContext,
										returnFocus,
									));
							});
					});
				}
			}),
		);
	}

	getDefaultView(): DefaultDocumentView {
		return this.options.getDefaultView();
	}

	async setDefaultView(view: DefaultDocumentView): Promise<void> {
		await this.options.setDefaultView(view);
	}

	/** One-time legacy restore fallback. It is never used as an ongoing follower. */
	getLegacyActiveMarkdownPath(): string | null {
		const file = this.app.workspace.getActiveFile();
		return file?.extension === 'md' ? file.path : null;
	}

	async open(request: ComposerOpenRequest): Promise<WorkspaceLeaf | null> {
		const file = this.app.vault.getAbstractFileByPath(request.filePath);
		if (!(file instanceof TFile) || file.extension !== 'md') return null;

		const targetView = request.view ?? this.getDefaultView();
		if (request.disposition === 'reuse-existing') {
			const existing =
				this.findExistingLeaf(file.path, undefined, targetView)
				?? this.findExistingLeaf(file.path);
			if (existing) {
				if (documentViewForLeaf(existing) !== targetView) {
					await this.convertLeaf(existing, targetView);
				}
				await this.app.workspace.revealLeaf(existing);
				return existing;
			}
		}

		const leaf = this.resolveTargetLeaf(request.disposition);
		if (!leaf) return null;
		await this.withGuard(leaf, async () => {
			if (targetView === 'composer') {
				await leaf.setViewState({
					type: DOCUMENT_COMPOSER_VIEW_TYPE,
					state: composerState(file.path, request.intelligenceRunId),
					active: true,
				});
				return;
			}
			await this.withHostOpenSuppressed(file.path, () =>
				leaf.openFile(file, { active: true }),
			);
		});
		await this.app.workspace.revealLeaf(leaf);
		return leaf;
	}

	/**
	 * Reveal a source location without converting an existing document leaf.
	 * New targets preserve the current document View for replace/reuse opens and
	 * use the configured default for explicit new tabs/splits.
	 */
	async revealLocation(request: ComposerLocationRevealRequest): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(request.filePath);
		if (!(file instanceof TFile) || file.extension !== 'md') return false;
		const activeLeaf = this.app.workspace.activeLeaf;
		const activeView = activeLeaf ? documentViewForLeaf(activeLeaf) : null;
		const preferredView = activeView ?? this.getDefaultView();
		const createsNewLeaf =
			request.disposition === 'new-tab' || request.disposition === 'split';
		const candidates = [
			...this.app.workspace.getLeavesOfType('markdown'),
			...this.app.workspace.getLeavesOfType(DOCUMENT_COMPOSER_VIEW_TYPE),
		].map((leaf) => ({
			leaf,
			path: filePathForLeaf(leaf),
			view: documentViewForLeaf(leaf),
			active: leaf === activeLeaf,
		}));
		let leaf = createsNewLeaf
			? null
			: selectDocumentLocationLeaf(candidates, file.path, preferredView);
		if (!leaf) {
			const targetView = createsNewLeaf ? this.getDefaultView() : preferredView;
			leaf = await this.open({
				filePath: file.path,
				view: targetView,
				disposition: request.disposition,
				reason: request.reason,
			});
		}
		if (!leaf) return false;
		await this.app.workspace.revealLeaf(leaf);
		if (leaf.view instanceof MarkdownView) {
			return revealMarkdownLocation(leaf.view, request.location);
		}
		const composer = leaf.view as {
			getSourceFilePath?: () => string | null;
			revealSourceLocation?: (location: DocumentSourceLocation) => boolean;
		};
		if (composer.getSourceFilePath?.() !== file.path) return false;
		return composer.revealSourceLocation?.(request.location) ?? false;
	}

	async convertLeaf(
		leaf: WorkspaceLeaf,
		target: DefaultDocumentView,
		options: ComposerLeafConversionOptions = {},
	): Promise<void> {
		const original = leaf.getViewState();
		const filePath = filePathForLeaf(leaf);
		if (!filePath) throw new Error('Current leaf has no Markdown file binding');
		if (target === 'composer' && original.type === DOCUMENT_COMPOSER_VIEW_TYPE) return;
		if (target === 'markdown' && original.type === 'markdown') return;

		try {
			this.assertConversionCurrent(options);
			if (
				leaf.view instanceof MarkdownView
				&& options.preserveMarkdownBuffer !== false
			) {
				await leaf.view.save();
			}
			await this.withGuard(leaf, async () => {
				if (target === 'composer') {
					await leaf.setViewState({
						type: DOCUMENT_COMPOSER_VIEW_TYPE,
						state: composerState(filePath),
						active: true,
					});
					return;
				}
				await this.withHostOpenSuppressed(filePath, () =>
					leaf.setViewState({
						type: 'markdown',
						state: { file: filePath, mode: 'source' },
						active: true,
					}),
				);
			});
			this.assertConversionCurrent(options);
			await this.app.workspace.revealLeaf(leaf);
			this.assertConversionCurrent(options);
			this.verifyConversion(leaf, target, filePath);
		} catch (error) {
			if (this.canRestoreOriginal(leaf, filePath, options)) {
				await this.withGuard(leaf, () => {
					if (original.type !== 'markdown') return leaf.setViewState(original);
					return this.withHostOpenSuppressed(filePath, () => leaf.setViewState(original));
				});
			}
			throw error;
		}
	}

	dispose(): void {
		this.nativeAffordance.dispose();
		for (const ref of this.refs) this.app.workspace.offref(ref);
		this.refs.length = 0;
		this.guardedLeaves.clear();
	}

	private async onHostFileOpen(file: TFile | null): Promise<void> {
		if (!file || file.extension !== 'md') return;
		if (this.hostOpenSuppressions.consume(file.path)) return;
		if (this.getDefaultView() !== 'composer') return;

		// `file-open` gives us the file but not the leaf, and activeLeaf may still
		// point at the previous view while Obsidian is completing `openFile`.
		// Resolve the real Markdown leaf only after the host lifecycle settles.
		await waitForHostFileOpenToSettle(this.app);
		if (this.getDefaultView() !== 'composer') return;
		const leaf = this.resolveHostOpenedMarkdownLeaf(file.path);
		if (!leaf) return;

		const token = this.hostOpenConversions.begin(leaf, file.path);
		try {
			await this.convertHostOpenedLeaf(
				leaf,
				file.path,
				() => this.hostOpenConversions.isCurrent(token),
			);
		} catch (error) {
			if (
				error instanceof ComposerHostConversionSupersededError
				|| error instanceof ComposerLeafBindingChangedError
			) return;
			console.error('[Peak Composer] default document view conversion failed', {
				filePath: file.path,
				error,
			});
			new Notice(this.strings.conversionFailed);
		} finally {
			this.hostOpenConversions.finish(token);
		}
	}

	private async convertHostOpenedLeaf(
		leaf: WorkspaceLeaf,
		filePath: string,
		isCurrent: () => boolean,
	): Promise<void> {
		try {
			await this.convertLeaf(leaf, 'composer', {
				preserveMarkdownBuffer: false,
				isCurrent,
			});
			return;
		} catch (error) {
			if (!(error instanceof ComposerLeafRetentionError)) throw error;
		}

		// The first transition can still lose to a host write already queued
		// behind `file-open`. convertLeaf has restored Markdown at this point;
		// wait for that lifecycle, re-resolve the leaf, and retry exactly once.
		await waitForHostFileOpenToSettle(this.app);
		if (!isCurrent()) throw new ComposerHostConversionSupersededError();
		const retryLeaf = this.resolveHostOpenedMarkdownLeaf(filePath);
		if (!retryLeaf) throw new ComposerLeafRetentionError();
		if (retryLeaf !== leaf) throw new ComposerLeafBindingChangedError();
		await this.convertLeaf(retryLeaf, 'composer', {
			preserveMarkdownBuffer: false,
			isCurrent,
		});
	}

	private resolveHostOpenedMarkdownLeaf(filePath: string): WorkspaceLeaf | null {
		const activeLeaf = this.app.workspace.activeLeaf;
		const candidates = this.app.workspace.getLeavesOfType('markdown').map((leaf) => ({
			leaf,
			filePath:
				leaf.view instanceof MarkdownView
					? leaf.view.file?.path ?? null
					: null,
			active: leaf === activeLeaf,
		}));
		return selectHostOpenedLeaf(candidates, filePath);
	}

	private findExistingLeaf(
		filePath: string,
		exclude?: WorkspaceLeaf,
		targetView?: DefaultDocumentView,
	): WorkspaceLeaf | null {
		const candidates =
			targetView === 'markdown'
				? this.app.workspace.getLeavesOfType('markdown')
				: targetView === 'composer'
					? this.app.workspace.getLeavesOfType(DOCUMENT_COMPOSER_VIEW_TYPE)
					: [
						...this.app.workspace.getLeavesOfType('markdown'),
						...this.app.workspace.getLeavesOfType(DOCUMENT_COMPOSER_VIEW_TYPE),
					];
		return candidates.find((leaf) => leaf !== exclude && filePathForLeaf(leaf) === filePath) ?? null;
	}

	private resolveTargetLeaf(disposition: ComposerOpenRequest['disposition']): WorkspaceLeaf | null {
		if (disposition === 'replace-current') return this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(false);
		if (disposition === 'split') return this.app.workspace.getLeaf('split');
		if (disposition === 'new-tab') return this.app.workspace.getLeaf('tab');
		return this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(false);
	}

	private verifyConversion(
		leaf: WorkspaceLeaf,
		target: DefaultDocumentView,
		filePath: string,
	): void {
			if (target === 'composer') {
				if (leaf.getViewState().type !== DOCUMENT_COMPOSER_VIEW_TYPE) {
					throw new ComposerLeafRetentionError();
			}
			const bound = filePathForLeaf(leaf);
			if (bound !== filePath) throw new ComposerLeafBindingChangedError();
			return;
		}
		if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== filePath) {
			throw new Error('Markdown conversion changed the bound file');
		}
	}

	private assertConversionCurrent(options: ComposerLeafConversionOptions): void {
		if (options.isCurrent && !options.isCurrent()) {
			throw new ComposerHostConversionSupersededError();
		}
	}

	private canRestoreOriginal(
		leaf: WorkspaceLeaf,
		filePath: string,
		options: ComposerLeafConversionOptions,
	): boolean {
		if (options.isCurrent && !options.isCurrent()) return false;
		const currentPath = filePathForLeaf(leaf);
		return currentPath === null || currentPath === filePath;
	}

	private async withGuard<T>(leaf: WorkspaceLeaf, action: () => Promise<T>): Promise<T> {
		this.guardedLeaves.add(leaf);
		try {
			return await action();
		} finally {
			this.guardedLeaves.delete(leaf);
		}
	}

	private async withHostOpenSuppressed<T>(
		filePath: string,
		action: () => Promise<T>,
	): Promise<T> {
		const token = this.hostOpenSuppressions.begin(filePath);
		try {
			return await action();
		} finally {
			// Keep the token alive beyond the state-write promise. Obsidian may
			// emit `file-open` on a later paint after `setViewState()` resolves.
			await waitForHostFileOpenToSettle(this.app);
			this.hostOpenSuppressions.release(token);
		}
	}
}

function waitForHostFileOpenToSettle(app: App): Promise<void> {
	const win = app.workspace.containerEl.ownerDocument.defaultView;
	if (!win) return Promise.resolve();
	return new Promise((resolve) => {
		// `file-open` is emitted before WorkspaceLeaf.openFile() has necessarily
		// completed its final Markdown state write. rAF alone can run before the
		// host's queued timer continuation, so cross one macrotask boundary first.
		win.setTimeout(() => {
			win.requestAnimationFrame(() => {
				win.requestAnimationFrame(() => resolve());
			});
		}, 0);
	});
}

function composerState(
	filePath: string,
	intelligenceRunId?: string,
): ComposerViewStateV2 {
	return {
		version: 2,
		filePath,
		displayMode: 'edit',
		...(intelligenceRunId ? { intelligenceRunId } : {}),
	};
}

function filePathForLeaf(leaf: WorkspaceLeaf): string | null {
	if (leaf.view instanceof MarkdownView) return leaf.view.file?.path ?? null;
	if (leaf.getViewState().type !== DOCUMENT_COMPOSER_VIEW_TYPE) return null;
	const sourcePath = (leaf.view as { getSourceFilePath?: () => string | null }).getSourceFilePath?.();
	if (sourcePath) return sourcePath;
	return normalizeComposerViewState(leaf.getViewState().state)?.filePath ?? null;
}

function documentViewForLeaf(leaf: WorkspaceLeaf): DefaultDocumentView | null {
	if (leaf.view instanceof MarkdownView) return 'markdown';
	if (leaf.getViewState().type === DOCUMENT_COMPOSER_VIEW_TYPE) return 'composer';
	return null;
}

export function composerViewStateForPath(filePath: string): ViewState {
	return {
		type: DOCUMENT_COMPOSER_VIEW_TYPE,
		state: composerState(filePath),
		active: true,
	};
}
