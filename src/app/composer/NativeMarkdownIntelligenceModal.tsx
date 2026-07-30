import * as React from 'react';
import { Modal, Notice } from 'obsidian';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import {
	DEFAULT_TRANSACTION_CONFIG,
	type ComposerContextSnapshot,
	type ComposerDocumentSnapshot,
} from '@/core/composer';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import {
	DEFAULT_COMPOSER_CONFIG,
	loadComposerConfig,
	type ComposerConfig,
} from '@/ui/view/composer';
import { createDefaultCandidateRendererRegistry } from '@/ui/view/composer/candidates';
import {
	ComposerChromeProvider,
	resolveProjection,
	type ComposerChromeValue,
} from '@/ui/view/composer/chrome/ComposerChromeContext';
import {
	DEFAULT_SIDECAR_CONFIG,
	buildFocusRunContext,
	loadSidecarConfig,
	resolveRelatedFocus,
	type SidecarConfig,
} from '@/ui/view/composer/sidecar';
import { BriefView } from '@/ui/view/composer/sidecar/BriefView';
import { CopilotView } from '@/ui/view/composer/sidecar/CopilotView';
import { HistoryView } from '@/ui/view/composer/sidecar/HistoryView';
import {
	SidecarProvider,
	useSessionProjection,
	useSidecar,
	type SidecarContextValue,
} from '@/ui/view/composer/sidecar/SidecarContext';
import type { ComposerEditingRuntime } from './DocumentComposerController';
import type { DocumentComposerController } from './DocumentComposerController';
import { DEFAULT_COMPOSER_NAVIGATION_STRINGS } from './ComposerNavigationDefaults';
import { Button, IconButton } from '@/ui/components/primitives';
import { History, MessageSquare, Sparkles, X } from 'lucide-react';
import type { NativeMarkdownIntelligenceContext } from './NativeMarkdownIntelligenceContext';

/**
 * Native Markdown companion host for the same app-owned Composer Intelligence
 * runtime. It does not create a second Copilot system: acquiring the document
 * controller reuses the document runtime, candidates, History and Frozen Runs
 * already owned by {@link DocumentComposerRuntime}.
 */
export class NativeMarkdownIntelligenceModal extends Modal {
	private renderer: ReactRenderer | null = null;
	private controller: DocumentComposerController | null = null;
	private controllerSubscription: (() => void) | null = null;
	private closed = true;
	private config: ComposerConfig = DEFAULT_COMPOSER_CONFIG;
	private readonly previouslyFocused: HTMLElement | null;
	private readonly originHostId = `markdown-intelligence-${crypto.randomUUID()}`;

	constructor(
		private readonly appContext: AppContext,
		private readonly filePath: string,
		private readonly initialContext?: NativeMarkdownIntelligenceContext,
		returnFocus?: HTMLElement | null,
	) {
		super(appContext.app);
		this.previouslyFocused = returnFocus
			?? appContext.app.workspace.containerEl.ownerDocument.activeElement as HTMLElement | null;
	}

	async onOpen(): Promise<void> {
		this.closed = false;
		this.contentEl.empty();
		this.modalEl.addClass('pk-native-intelligence-modal');
		this.modalEl.addClass('peak-design-root');
		this.contentEl.addClass('peak-composer-root');
		this.contentEl.setAttribute('data-with-sidecar', 'true');
		if (this.initialContext?.blockId) {
			this.contentEl.setAttribute('data-initial-block-id', this.initialContext.blockId);
		}
		if (this.initialContext?.findingId) {
			this.contentEl.setAttribute('data-initial-finding-id', this.initialContext.findingId);
		}

		const owner = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		if (!owner) {
			new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.intelligenceUnavailable);
			this.close();
			return;
		}

		this.controller = owner.createController(this.originHostId, 'markdown');
		this.controller.start(this.filePath);
		await this.controller.settled();
		if (this.closed) return;

		const editing = this.controller.getRuntime();
		if (!editing?.intelligence) {
			new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.intelligenceBindFailed);
			this.close();
			return;
		}

		this.config = await loadComposerConfig();
		if (this.closed) return;
		this.renderer = new ReactRenderer(this.containerEl);
		this.controllerSubscription = this.controller.subscribe(() => this.renderPanel());
		this.renderPanel();
	}

	onClose(): void {
		this.closed = true;
		this.controllerSubscription?.();
		this.controllerSubscription = null;
		this.controller?.stop();
		this.controller = null;
		const renderer = this.renderer;
		this.renderer = null;
		if (renderer) {
			setTimeout(() => {
				renderer.unmount();
				this.contentEl.empty();
				this.previouslyFocused?.focus();
			}, 0);
			return;
		}
		this.contentEl.empty();
		this.previouslyFocused?.focus();
	}

	private renderPanel(): void {
		if (this.closed || !this.renderer || !this.controller) return;
		const editing = this.controller.getRuntime();
		if (!editing?.intelligence) return;
		const snapshot = editing.session.snapshot;
		this.renderer.render(
			createReactElementWithServices(
				NativeMarkdownIntelligencePanel,
				{
					editing,
					snapshot,
					config: this.config,
					initialContext: this.initialContext,
					onClose: () => this.close(),
					onOpenSource: (path) => {
						void this.appContext.vaultNavigation.openLink(path, {
							sourcePath: snapshot.filePath,
							newLeaf: false,
						});
					},
					onOpenExternal: (url) => {
						this.contentEl.ownerDocument.defaultView?.open(url, '_blank');
					},
					onEscalate: (runId?: string) => {
						const navigation = this.appContext.runtimeRegistry
							.getDocumentComposerRuntime()
							.navigation;
						if (navigation) {
							void navigation.open({
								filePath: snapshot.filePath,
								disposition: 'replace-current',
								reason: 'view-conversion',
								...(runId ? { intelligenceRunId: runId } : {}),
							});
						}
						this.close();
					},
				},
				this.appContext,
			),
		);
	}
}

function NativeMarkdownIntelligencePanel({
	editing,
	snapshot,
	config,
	initialContext,
	onClose,
	onOpenSource,
	onOpenExternal,
	onEscalate,
}: {
	editing: ComposerEditingRuntime;
	snapshot: ComposerDocumentSnapshot;
	config: ComposerConfig;
	initialContext?: NativeMarkdownIntelligenceContext;
	onClose(): void;
	onOpenSource(path: string): void;
	onOpenExternal(url: string): void;
	onEscalate(runId?: string): void;
}): React.ReactElement {
	const [candidateRegistry] = React.useState(createDefaultCandidateRendererRegistry);
	const chromeValue = React.useMemo<ComposerChromeValue>(
		() => ({
			runtime: editing,
			projection: resolveProjection(editing),
			candidateRegistry,
			config,
			snapshot,
			burstWindowMs:
				editing.transactionConfig?.burstWindowMs
				?? DEFAULT_TRANSACTION_CONFIG.burstWindowMs,
			scrollGuardGestureWindowMs:
				editing.transactionConfig?.scrollGuardGestureWindowMs
				?? DEFAULT_TRANSACTION_CONFIG.scrollGuardGestureWindowMs,
			registerFlusher: () => () => undefined,
			flushAll: async () => undefined,
			onOpenLink: (kind, target) => {
				if (kind === 'external') {
					onOpenExternal(target);
					return;
				}
				onOpenSource(target);
			},
		}),
		[candidateRegistry, config, editing, onOpenExternal, onOpenSource, snapshot],
	);
	const intelligence = editing.intelligence!;
	const [includeInitialContext, setIncludeInitialContext] = React.useState(true);
	const effectiveInitialContext = includeInitialContext ? initialContext : undefined;
	const initialBlockId = React.useMemo(
		() => resolveInitialBlockId(snapshot, effectiveInitialContext),
		[effectiveInitialContext, snapshot],
	);
	const [sidecarConfig, setSidecarConfig] = React.useState<SidecarConfig>(DEFAULT_SIDECAR_CONFIG);
	React.useEffect(() => {
		let active = true;
		void loadSidecarConfig().then((loaded) => {
			if (active) setSidecarConfig(loaded);
		});
		return () => {
			active = false;
		};
	}, []);
	const sidecarValue = React.useMemo<SidecarContextValue>(() => ({
		runtime: intelligence,
		workspaceRuntime: editing.workspaceIntelligence,
		documentId: snapshot.documentId,
		documentSnapshot: snapshot,
		hub: editing.hub,
		documentFilePath: snapshot.filePath,
		config: sidecarConfig,
		onOpenSource,
		getFocusedBlockId: () => initialBlockId,
		resolveFocusContext: () => buildNativeFocusRunContext(
			snapshot,
			initialBlockId,
			effectiveInitialContext,
		),
		resolveRelatedFocus: () => resolveRelatedFocus(snapshot, initialBlockId),
		presentationOrigin: effectiveInitialContext?.findingId && initialBlockId
			? {
					kind: 'automatic-suggestion',
					findingId: effectiveInitialContext.findingId,
					blockId: initialBlockId,
				}
			: {
					kind: 'native-editor',
					filePath: snapshot.filePath,
				},
	}), [
		editing,
		effectiveInitialContext,
		initialBlockId,
		intelligence,
		onOpenSource,
		sidecarConfig,
		snapshot,
	]);
	return (
		<ComposerChromeProvider value={chromeValue}>
			<SidecarProvider value={sidecarValue}>
				<NativeIntelligenceWorkspace
					filePath={snapshot.filePath}
					revision={snapshot.revision}
					initialContext={effectiveInitialContext}
					onClearContext={() => setIncludeInitialContext(false)}
					onClose={onClose}
					onEscalate={onEscalate}
				/>
			</SidecarProvider>
		</ComposerChromeProvider>
	);
}

function resolveInitialBlockId(
	snapshot: ComposerDocumentSnapshot,
	context: {
		blockId?: string;
		sourceFrom?: number;
		sourceTo?: number;
	} | undefined,
): string | null {
	if (!context) return null;
	if (context.blockId && snapshot.blocks.some((block) => block.blockId === context.blockId)) {
		return context.blockId;
	}
	if (context.sourceFrom === undefined) return null;
	const sourceTo = context.sourceTo ?? context.sourceFrom;
	const overlapping = snapshot.blocks.find((block) =>
		block.source.to >= context.sourceFrom! && block.source.from <= sourceTo);
	return overlapping?.blockId ?? null;
}

function buildNativeFocusRunContext(
	snapshot: ComposerDocumentSnapshot,
	blockId: string | null,
	context?: NativeMarkdownIntelligenceContext,
): { snapshot: ComposerContextSnapshot; targetQuote: string } {
	if (
		!context?.selectionText
		|| context.sourceFrom === undefined
		|| context.sourceTo === undefined
		|| context.sourceTo <= context.sourceFrom
	) {
		return buildFocusRunContext(snapshot, blockId);
	}
	const block = snapshot.blocks.find((candidate) => candidate.blockId === blockId)
		?? snapshot.blocks.find((candidate) =>
			candidate.source.to >= context.sourceFrom!
			&& candidate.source.from <= context.sourceTo!);
	if (!block) return buildFocusRunContext(snapshot, blockId);
	const from = Math.max(block.source.from, context.sourceFrom);
	const to = Math.min(block.source.to, context.sourceTo);
	if (to <= from) return buildFocusRunContext(snapshot, blockId);
	const targetSource = snapshot.sourceText.slice(from, to);
	return {
		snapshot: {
			documentId: snapshot.documentId,
			revision: snapshot.revision,
			target: {
				kind: 'selection',
				blockId: block.blockId,
				from,
				to,
			},
			targetSource,
			selectionText: targetSource,
			nearby: {
				before: snapshot.sourceText.slice(Math.max(0, from - 400), from),
				after: snapshot.sourceText.slice(to, to + 400),
			},
		},
		targetQuote: targetSource.trim(),
	};
}

function NativeIntelligenceWorkspace({
	filePath,
	revision,
	initialContext,
	onClearContext,
	onClose,
	onEscalate,
}: {
	filePath: string;
	revision: string;
	initialContext?: NativeMarkdownIntelligenceContext;
	onClearContext(): void;
	onClose(): void;
	onEscalate(runId?: string): void;
}): React.ReactElement {
	const { runtime, config } = useSidecar();
	const projection = useSessionProjection(runtime);
	const [tab, setTab] = React.useState<'copilot' | 'history'>('copilot');
	const conversationReady = projection.stage === 'session' || projection.stage === 'review';
	return (
		<div className="pk-native-intelligence-workspace">
			<header className="pk-native-intelligence-head">
				<span>
					<Sparkles aria-hidden />
					<strong>Copilot Intelligence</strong>
					<small>{filePath}</small>
				</span>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onEscalate(projection.activeRunId ?? undefined)}
				>
					Open full Composer
				</Button>
				<IconButton label={config.strings.close} onClick={onClose}>
					<X />
				</IconButton>
			</header>
			<div className="pk-native-intelligence-tabs" role="tablist" aria-label={config.strings.title}>
				<Button
					variant="ghost"
					role="tab"
					aria-selected={tab === 'copilot'}
					onClick={() => setTab('copilot')}
				>
					<MessageSquare />
					{config.strings.tabCopilot}
				</Button>
				<Button
					variant="ghost"
					role="tab"
					aria-selected={tab === 'history'}
					onClick={() => setTab('history')}
				>
					<History />
					{config.strings.tabHistory}
				</Button>
			</div>
			<div className="pk-native-intelligence-context" aria-label="Frozen Copilot context">
				<span>
					<strong>File</strong>
					<small>{filePath}</small>
				</span>
				{initialContext?.selectionText ? (
					<span>
						<strong>Selection</strong>
						<small>{initialContext.selectionText.slice(0, 160)}</small>
						<Button variant="ghost" size="sm" onClick={onClearContext}>
							Remove
						</Button>
					</span>
				) : (
					<span>
						<strong>Heading / cursor</strong>
						<small>{initialContext?.heading ?? 'Current document'}</small>
						{initialContext && (
							<Button variant="ghost" size="sm" onClick={onClearContext}>
								Use whole file
							</Button>
						)}
					</span>
				)}
				<span>
					<strong>Source revision</strong>
					<small>{revision.slice(0, 12)}</small>
				</span>
				<span>
					<strong>Run snapshot</strong>
					<small>{projection.activeRunId ? `Frozen · ${projection.activeRunId}` : 'Freezes on send'}</small>
				</span>
			</div>
			{tab === 'history' ? (
				<div className="pk-native-intelligence-history"><HistoryView /></div>
			) : (
				<div className="pk-native-intelligence-columns">
					<section className="pk-native-intelligence-brief">
						<BriefView />
					</section>
					<section className="pk-native-intelligence-conversation">
						{conversationReady ? (
							<CopilotView />
						) : (
							<div className="pk-native-intelligence-start">
								<Sparkles />
								<strong>Continue with Copilot</strong>
								<span>
									Context is frozen from this Markdown note. Changes still require
									candidate review before writeback.
								</span>
								<Button
									variant="primary"
									onClick={() => runtime.session.openSession(config.strings.askCopilot)}
								>
									{config.strings.askCopilot}
								</Button>
							</div>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
