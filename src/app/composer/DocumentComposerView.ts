import {
	IconName,
	Menu,
	Notice,
	Scope,
	WorkspaceLeaf,
	type ViewStateResult,
} from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import {
	normalizeComposerViewState,
	type ComposerDisplayMode,
	type ComposerStateSource,
	type ComposerViewStateV2,
	type DocumentComposerState,
} from '@/core/composer';
import { ComposerRoot, loadComposerConfig, type ComposerConfig } from '@/ui/view/composer';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from './viewType';
import type { DocumentComposerController } from './DocumentComposerController';
import { DEFAULT_COMPOSER_NAVIGATION_STRINGS } from './ComposerNavigationDefaults';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';

export { DOCUMENT_COMPOSER_VIEW_TYPE };

/** Static empty source used before the runtime binds (early startup restore). */
const EMPTY_STATE: DocumentComposerState = { status: 'empty', filePath: null, snapshot: null };
const EMPTY_SOURCE: ComposerStateSource = {
	getState: () => EMPTY_STATE,
	subscribe: () => () => undefined,
};

/**
 * Peak Composer — standalone main-area document host (WP1).
 *
 * Extends the shared React ItemView host. Owns one lifecycle controller (from
 * the app-owned runtime) that binds the versioned leaf file state and drives the
 * read-only {@link ComposerRoot}. CodeMirror is never touched; the Chat Studio
 * input `Composer` is a different component (handoff §2.3 / §4.3).
 */
export class DocumentComposerView extends ReactItemViewHost {
	protected readonly viewType = DOCUMENT_COMPOSER_VIEW_TYPE;
	protected readonly displayText = 'Composer';
	protected readonly icon: IconName = 'file-text';
	protected readonly rootClasses = ['peak-design-root', 'peak-composer-root-host'] as const;

	private controller: DocumentComposerController | null = null;
	private config: ComposerConfig = DEFAULT_COMPOSER_CONFIG;
	private viewState: ComposerViewStateV2 | null = null;
	private pendingRawState: unknown = null;
	private controllerSubscription: (() => void) | null = null;
	private readonly originHostId = `composer-leaf-${crypto.randomUUID()}`;
	private revealSequence = 0;
	private pendingReveal: { id: number; location: DocumentSourceLocation } | null = null;
	private lastFocusedSourceOffset: number | null = null;
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
		await super.onClose();
	}

	/** Vault file currently bound to this product view, for workspace file navigators. */
	getSourceFilePath(): string | null {
		return this.viewState?.filePath ?? this.controller?.getState().filePath ?? null;
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
		return this.viewState ? { ...this.viewState } : {};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.pendingRawState = state;
		const runtime = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		const normalized = normalizeComposerViewState(
			state,
			runtime?.navigation?.getLegacyActiveMarkdownPath(),
		);
		if (normalized) {
			if (this.viewState?.filePath !== normalized.filePath) {
				this.lastFocusedSourceOffset = null;
			}
			this.viewState = normalized;
			if (this.controller) this.controller.bindFile(normalized.filePath);
			else if (runtime) this.ensureController(runtime);
			this.requestHeaderRefresh();
			this.getReactRenderer()?.render(this.renderElement());
		}
		await super.setState(state, result);
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
		const source: ComposerStateSource = controller ?? EMPTY_SOURCE;
		const onRevalidate = controller ? () => controller.revalidate() : undefined;
		const runtimeSource = controller ? { getRuntime: () => controller.getRuntime() } : undefined;
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
				defaultDocumentView: runtime?.navigation?.getDefaultView() ?? 'markdown',
				onDefaultDocumentViewChange: runtime?.navigation
					? async (view) => {
						await runtime.navigation!.setDefaultView(view);
						this.getReactRenderer()?.render(this.renderElement());
					}
					: undefined,
				onConvertCurrentView: runtime?.navigation
					? async (view) => {
						try {
							await runtime.navigation!.convertLeaf(this.leaf, view);
						} catch {
							new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.conversionFailed);
						}
					}
					: undefined,
				initialIntelligenceOpen: runtime?.getIntelligenceManualOpen() ?? false,
				onIntelligenceManualOpenChange: runtime
					? async (open) => {
						await runtime.setIntelligenceManualOpen(open);
					}
					: undefined,
				onOpenLink: (kind, target) => this.openLink(kind, target),
				revealRequest: this.pendingReveal ?? undefined,
			},
			this.appContext,
		);
	}

	private requestHeaderRefresh(): void {
		this.app.workspace.trigger('layout-change');
	}

	private ensureController(
		runtime: NonNullable<
			ReturnType<AppContext['runtimeRegistry']['tryGetDocumentComposerRuntime']>
		>,
	): void {
		if (this.controller || !this.viewState) return;
		this.controller = runtime.createController(this.originHostId);
		this.controllerSubscription = this.controller.subscribe((state) => {
			if (!state.filePath || this.viewState?.filePath === state.filePath) return;
			this.viewState = { ...this.viewState, filePath: state.filePath };
			this.requestHeaderRefresh();
		});
		this.controller.start(this.viewState.filePath);
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
