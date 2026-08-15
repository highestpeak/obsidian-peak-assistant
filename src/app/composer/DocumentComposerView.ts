import {
	IconName,
	Menu,
	Notice,
	Scope,
	TFile,
	WorkspaceLeaf,
	type ViewStateResult,
} from 'obsidian';
import { ReactFileViewHost } from '@/app/ui-host/ReactFileViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import {
	normalizeComposerViewState,
	composerDocumentRenamePath,
	type ComposerDisplayMode,
	type ComposerStateSource,
	type ComposerViewStateV2,
	type DocumentComposerState,
} from '@/core/composer';
import {
	ComposerRoot,
	loadComposerConfig,
	type ComposerChromeRuntime,
	type ComposerConfig,
} from '@/ui/view/composer';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from './viewType';
import type { DocumentComposerController } from './DocumentComposerController';
import { DEFAULT_COMPOSER_NAVIGATION_STRINGS } from './ComposerNavigationDefaults';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import { ObsidianWorkspaceHistoryNavigation } from './ObsidianWorkspaceHistoryNavigation';

export { DOCUMENT_COMPOSER_VIEW_TYPE };

/** Static empty source used only by a genuinely file-unbound Composer leaf. */
const EMPTY_STATE: DocumentComposerState = { status: 'empty', filePath: null, snapshot: null };

/**
 * Peak Composer — standalone main-area document host (WP1).
 *
 * Extends the shared React ItemView host. Owns one lifecycle controller (from
 * the app-owned runtime) that binds the versioned leaf file state and drives the
 * read-only {@link ComposerRoot}. CodeMirror is never touched; the Chat Studio
 * input `Composer` is a different component (handoff §2.3 / §4.3).
 */
export class DocumentComposerView extends ReactFileViewHost {
	protected readonly viewType = DOCUMENT_COMPOSER_VIEW_TYPE;
	protected readonly displayText = 'Composer';
	protected readonly icon: IconName = 'file-text';
	protected readonly rootClasses = ['peak-design-root', 'peak-composer-root-host'] as const;

	private controller: DocumentComposerController | null = null;
	private config: ComposerConfig = DEFAULT_COMPOSER_CONFIG;
	private viewState: ComposerViewStateV2 | null = null;
	private pendingState: DocumentComposerState = EMPTY_STATE;
	/**
	 * Defensive first-paint projection for a restored leaf. A persisted filePath
	 * is already a document binding, even if app composition has not handed this
	 * view its controller yet; it must never regress to "No document open".
	 */
	private readonly pendingSource: ComposerStateSource = {
		getState: () => this.pendingState,
		subscribe: () => () => undefined,
	};
	private pendingRawState: unknown = null;
	private controllerSubscription: (() => void) | null = null;
	private readonly originHostId = `composer-leaf-${crypto.randomUUID()}`;
	private revealSequence = 0;
	private pendingReveal: { id: number; location: DocumentSourceLocation } | null = null;
	private lastFocusedSourceOffset: number | null = null;
	private readonly workspaceNavigation: ObsidianWorkspaceHistoryNavigation;
	private readonly navigationOnlyRuntime: ComposerChromeRuntime;
	private decoratedRuntimeBase: ComposerChromeRuntime | null = null;
	private decoratedRuntime: ComposerChromeRuntime | null = null;
	private readonly onComposerFocusIn = (event: FocusEvent): void => {
		const target = event.target as HTMLElement | null;
		if (!target?.closest) return;
		const projected = target.closest<HTMLElement>('[data-src-text-from]');
		const projectedFrom = Number(projected?.dataset.srcTextFrom);
		if (Number.isFinite(projectedFrom)) {
			this.lastFocusedSourceOffset = projectedFrom;
			return;
		}
		const blockId = target.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;
		const block = this.controller?.getState().snapshot?.blocks.find(
			(candidate) => candidate.blockId === blockId,
		);
		if (block) this.lastFocusedSourceOffset = block.source.from;
	};

	constructor(leaf: WorkspaceLeaf, appContext: AppContext) {
		super(leaf, appContext);
		this.navigation = true;
		this.workspaceNavigation = new ObsidianWorkspaceHistoryNavigation(leaf);
		this.navigationOnlyRuntime = { workspaceNavigation: this.workspaceNavigation };
		this.scope = new Scope(this.app.scope);
		this.scope.register([], 'Escape', () => false);
	}

	async onOpen(): Promise<void> {
		const runtime = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		if (runtime) {
			this.viewState = normalizeComposerViewState(
				this.viewState ?? this.pendingRawState,
				runtime.navigation?.getLegacyActiveMarkdownPath(),
			);
			this.updatePendingState();
			this.ensureController(runtime);
		}
		await super.onOpen();
		this.contentEl.addEventListener('focusin', this.onComposerFocusIn);
		// Load the runtime-editable config, then re-render once resolved.
		void loadComposerConfig().then((cfg) => {
			this.config = cfg;
			this.getReactRenderer()?.render(this.renderElement());
		});
	}

	async onClose(): Promise<void> {
		this.contentEl.removeEventListener('focusin', this.onComposerFocusIn);
		this.controllerSubscription?.();
		this.controllerSubscription = null;
		this.controller?.stop();
		this.controller = null;
		this.decoratedRuntimeBase = null;
		this.decoratedRuntime = null;
		await super.onClose();
	}

	/** Vault file currently bound to this product view, for workspace file navigators. */
	getSourceFilePath(): string | null {
		return this.file?.path
			?? this.controller?.getState().filePath
			?? this.viewState?.filePath
			?? null;
	}

	/** Wait for the current source binding without exposing the controller itself. */
	async whenDocumentSettled(): Promise<void> {
		await this.controller?.settled();
	}

	/** Queue a one-shot source reveal without changing this leaf into Markdown. */
	revealSourceLocation(location: DocumentSourceLocation): boolean {
		if (!this.getSourceFilePath()) return false;
		this.pendingReveal = { id: ++this.revealSequence, location };
		this.getReactRenderer()?.render(this.renderElement());
		return true;
	}

	/** Last focused Composer source line, exposed to File Atlas framing. */
	getCursorLine(): number | null {
		if (this.lastFocusedSourceOffset === null) return null;
		const source = this.controller?.getState().snapshot?.sourceText;
		if (source === undefined) return null;
		return source.slice(0, this.lastFocusedSourceOffset).split('\n').length;
	}

	getDisplayText(): string {
		const path = this.getSourceFilePath();
		if (!path) return this.displayText;
		const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
		return path.slice(slash + 1).replace(/\.md$/i, '') || this.displayText;
	}

	getState(): Record<string, unknown> {
		const filePath = this.getSourceFilePath();
		if (!this.viewState || !filePath) return {};
		const { preparationId: _preparationId, ...persisted } = this.viewState;
		return { ...persisted, filePath };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.pendingRawState = state;
		const runtime = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		const previousFilePath = this.viewState?.filePath ?? null;
		const normalized = normalizeComposerViewState(
			state,
			runtime?.navigation?.getLegacyActiveMarkdownPath(),
		);
		if (normalized) {
			await super.setState({ ...normalized, file: normalized.filePath }, result);
			if (previousFilePath && previousFilePath !== normalized.filePath) {
				result.history = true;
			}
			if (this.viewState?.filePath !== normalized.filePath) {
				this.lastFocusedSourceOffset = null;
			}
			this.viewState = normalized;
			this.updatePendingState();
			if (this.controller) this.controller.bindFile(normalized.filePath, normalized.preparationId);
			else if (runtime) this.ensureController(runtime);
			this.requestHeaderRefresh();
			this.getReactRenderer()?.render(this.renderElement());
			return;
		}
		await super.setState(state, result);
	}

	canAcceptExtension(extension: string): boolean {
		return extension === 'md';
	}

	onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
		super.onPaneMenu(menu, source);
		const runtime = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		if (!runtime?.navigation || !this.getSourceFilePath()) return;
		menu.addItem((item) => {
			item
				.setTitle(DEFAULT_COMPOSER_NAVIGATION_STRINGS.openInMarkdown)
				.setIcon('file-text')
				.onClick(() => {
					void runtime.navigation!.convertLeaf(this.leaf, 'markdown').catch(() => {
						new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.conversionFailed);
					});
				});
		});
	}

	protected renderElement(): React.ReactElement {
		const controller = this.controller;
		const source: ComposerStateSource = controller ?? this.pendingSource;
		const onRevalidate = controller ? () => controller.revalidate() : undefined;
		const runtimeSource = controller ? { getRuntime: () => this.getChromeRuntime() } : undefined;
		const intelligenceSource = controller ? { getIntelligence: () => controller.getIntelligence() } : undefined;
		const runtime = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		return createReactElementWithServices(
			ComposerRoot,
			{
				source,
				config: this.config,
				onRevalidate,
				runtimeSource,
				intelligenceSource,
				initialDisplayMode: this.viewState?.displayMode ?? 'edit',
				onDisplayModeChange: (displayMode: ComposerDisplayMode) => {
					if (!this.viewState || this.viewState.displayMode === displayMode) return;
					this.viewState = { ...this.viewState, displayMode };
				},
				initialContentWidth: runtime?.getContentWidth() ?? 'readable',
				onContentWidthChange: runtime
					? async (width) => {
						await runtime.setContentWidth(width);
					}
					: undefined,
				onOpenNativeMarkdown: runtime?.navigation
					? async () => {
						try {
							await runtime.navigation!.convertLeaf(this.leaf, 'markdown');
						} catch {
							new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.conversionFailed);
						}
					}
					: undefined,
				onRenameDocumentTitle: (title) => this.renameDocumentTitle(title),
				initialIntelligenceOpen: runtime?.getIntelligenceManualOpen() ?? false,
				initialIntelligenceRunId: this.viewState?.intelligenceRunId,
				onIntelligenceManualOpenChange: runtime
					? async (open) => {
						await runtime.setIntelligenceManualOpen(open);
					}
					: undefined,
				onOpenLink: (kind, target) => this.openLink(kind, target),
				onOpenReviewDocument: runtime?.navigation
					? (filePath) => {
							void runtime.navigation!.open({
								filePath,
								view: 'composer',
								disposition: 'replace-current',
								reason: 'view-conversion',
							});
						}
					: undefined,
				revealRequest: this.pendingReveal ?? undefined,
			},
			this.appContext,
		);
	}

	private requestHeaderRefresh(): void {
		this.app.workspace.trigger('layout-change');
	}

	private getChromeRuntime(): ComposerChromeRuntime {
		const base = this.controller?.getRuntime();
		if (!base) return this.navigationOnlyRuntime;
		if (base === this.decoratedRuntimeBase && this.decoratedRuntime) {
			return this.decoratedRuntime;
		}
		this.decoratedRuntimeBase = base;
		this.decoratedRuntime = {
			...base,
			workspaceNavigation: this.workspaceNavigation,
		};
		return this.decoratedRuntime;
	}

	private ensureController(
		runtime: NonNullable<
			ReturnType<AppContext['runtimeRegistry']['tryGetDocumentComposerRuntime']>
		>,
	): void {
		if (this.controller || !this.viewState) return;
		this.controller = runtime.createController(this.originHostId);
		this.controllerSubscription = this.controller.subscribe((state) => {
			const currentViewState = this.viewState;
			if (!state.filePath || !currentViewState || currentViewState.filePath === state.filePath) return;
			this.viewState = { ...currentViewState, filePath: state.filePath };
			this.updatePendingState();
			this.requestHeaderRefresh();
		});
		this.controller.start(this.viewState.filePath, this.viewState.preparationId);
	}

	private updatePendingState(): void {
		this.pendingState = this.viewState ? {
			status: 'loading',
			filePath: this.viewState.filePath,
			snapshot: null,
		} : EMPTY_STATE;
	}

	private async renameDocumentTitle(title: string): Promise<void> {
		const currentPath = this.getSourceFilePath();
		const file = this.file ?? (currentPath
			? this.app.vault.getAbstractFileByPath(currentPath)
			: null);
		if (!(file instanceof TFile)) throw new Error('Composer file binding is unavailable');
		const targetPath = composerDocumentRenamePath(file.path, title);
		if (targetPath === file.path) return;
		await this.app.fileManager.renameFile(file, targetPath);
	}

	private openLink(kind: 'vault' | 'external', target: string): void {
		if (kind === 'external') {
			window.open(target, '_blank');
			return;
		}
		const sourcePath = this.controller?.getState().filePath ?? '';
		void this.appContext.vaultNavigation.openLink(target, { sourcePath, newLeaf: false });
	}
}
