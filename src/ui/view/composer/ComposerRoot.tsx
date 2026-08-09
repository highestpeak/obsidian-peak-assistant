import * as React from 'react';
import { useStore } from 'zustand';
import { RefreshCw } from 'lucide-react';
import {
	COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	COMPOSER_METADATA_SUGGESTION_RENDERER_ID,
	COMPOSER_STREAMING_TEXT_RENDERER_ID,
	sectionBlockIds,
	DEFAULT_TRANSACTION_CONFIG,
	initialIntelligencePresentationState,
	reduceIntelligencePresentation,
	type ComposerActionDescriptor,
	type ComposerBlock,
	type ComposerCandidate,
	type ComposerCandidateRuntimePort,
	type ComposerContextSnapshot,
	type ComposerDocumentSnapshot,
	type ComposerDisplayMode,
	type ComposerInvocationPlacement,
	type ComposerResultEnvelope,
	type ComposerStateSource,
	type DocumentComposerState,
	type IntelligencePresentationIntent,
	type IntelligencePresentationOrigin,
	type SelectionGuardReason,
	composerTargetBlockId,
	stubComposerCapabilityProjection,
} from '@/core/composer';
import type { ComposerListItemPatchPayload } from '@/core/schemas/composer';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import {
	buildCommentSourceRef,
	buildIndentListItemOps,
	buildInsertListItemOps,
	buildMoveBlockOps,
	buildToggleTaskOps,
	createUnitActionSnapshot,
	POLISH_CAPABILITY_ID,
	CODE_EXPLAIN_CAPABILITY_ID,
	MERMAID_EXPLAIN_CAPABILITY_ID,
	SUGGEST_PROPERTIES_CAPABILITY_ID,
	headingTextStart,
	listItemContentStart,
	listItemOwnContentEnd,
	matchBlocks,
	originalTextForTextPatchCandidate,
	partitionSourceRange,
	pasteUrlIntoSelection,
	type ComposerHistoryActivity,
	type ComposerHistoryTransactionResolver,
	type HiddenSourceRange,
	type ResolvedComposerSourceLocation,
	type DirectListItemKind,
	resolveComposerSourceLocation,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import {
	DEFAULT_COMPOSER_CONFIG,
	type ComposerConfig,
} from '@/ui/view/composer/config/composerConfig';
import { createComposerFoldStore, type ComposerFoldStore } from './foldStore';
import { BlockKindView } from './blocks/BlockKindView';
import { isChartBlock } from './blocks/chart/ChartBlockView';
import { CalloutBlockView } from './blocks/callout/CalloutBlockView';
import {
	AddFrontmatterEntry,
	type FrontmatterCandidatePort,
} from './blocks/frontmatter';
import {
	ComposerCandidateHost,
	createDefaultCandidateRendererRegistry,
	DEFAULT_CANDIDATE_UI_STRINGS,
	loadCandidateUiStrings,
	type CandidateRendererRegistry,
} from './candidates';
import { registerImageCandidateRenderers, ImageBlockView } from './blocks/image';
import {
	ComposerChromeProvider,
	resolveProjection,
	useComposerChrome,
	type ComposerChromeRuntime,
	type ComposerChromeValue,
} from './chrome/ComposerChromeContext';
import { BlockRail, CollectionActionHandle } from './chrome/BlockRail';
import { BlockActionRow, type BlockPanelKind } from './chrome/BlockActionRow';
import { EditableText } from './chrome/EditableText';
import { forwardBlockClickToEditable } from './chrome/focusForwarding';
import { EasyCopyMenu } from './chrome/EasyCopyMenu';
import {
	CommentAnchorMarker,
	CommentHighlightLayer,
	CommentRail,
	type CommentDraftTarget,
} from './chrome/CommentPanel';
import { BlockHistoryPanel } from './chrome/BlockHistoryPanel';
import { SelectionToolbar } from './chrome/SelectionToolbar';
import { useCrossBlockTextSelection } from './chrome/useCrossBlockTextSelection';
import { LinkPreviewLayer } from './chrome/LinkPreviewLayer';
import { InlineStyleLayer } from './chrome/InlineStyleLayer';
import { UndoRedoBar } from './chrome/UndoRedoBar';
import { ComposerFindBar, type ComposerFindBarHandle } from './chrome/ComposerFindBar';
import { TransactionNotice } from './chrome/TransactionNotice';
import { BlockFindingPanel } from './chrome/BlockFindingPanel';
import { NewBlockDraft } from './chrome/NewBlockDraft';
import {
	ComposerSurfaceProvider,
	useComposerSurfaceCoordinatorState,
	useComposerSurfaces,
} from './chrome/ComposerSurfaceCoordinator';
import type { ComposerDisplayState } from './chrome/DisplayStateSwitch';
import { mapDomRangeToSource } from './chrome/selectionMapping';
import { firstClipboardImage } from './chrome/pasteImage';
import { containComposerEscape } from './escapeContainment';
import { IntelligenceSidecar } from './sidecar';
import { buildFocusRunContext, resolveRelatedFocus } from './sidecar/focusContext';
import { HistoryDetailModal } from './sidecar/HistoryDetailModal';
import {
	DEFAULT_SIDECAR_CONFIG,
	loadSidecarConfig,
	type SidecarConfig,
} from './sidecar/sidecarConfig';
import { restoreGenerationReview } from './generationHistory';
import type { IntelligenceRuntime, SuggestionFinding } from '@/service/composer';

/**
 * Peak Composer — document host + shared editing chrome (WP1 host, WP4 chrome).
 *
 * Renders the parsed snapshot block-by-block with the WP4 editing chrome:
 * structural rail (30×30 disclosure + drag), single flattened compact-capsule
 * action row, per-block contenteditable text editing (burst → hub), selection
 * toolbar, Easy Copy, comments, link previews, the three document display
 * states and the permanent bottom Undo/Redo pair. All document mutation flows
 * through the injected transaction hub; with no runtime the host degrades to
 * the WP1 read-only view (disabled — never fake — affordances).
 */
export interface ComposerRootProps {
	source: ComposerStateSource;
	config?: ComposerConfig;
	/** App-composed editing runtime (session + hub + ports). Absent ⇒ read-only. */
	runtime?: ComposerChromeRuntime;
	/**
	 * Reactive runtime provider (the Obsidian view): re-read on every state change
	 * so the runtime rebinds when the active document (session + hub) switches,
	 * without remounting the chrome mid-document. Takes precedence over `runtime`.
	 */
	runtimeSource?: { getRuntime(): ComposerChromeRuntime | undefined };
	/** Typing-burst window override; defaults to the transaction config value. */
	burstWindowMs?: number;
	/** INT-1 scroll-guard user-gesture window; defaults to the transaction config. */
	scrollGuardGestureWindowMs?: number;
	/** Host callback for opening links from the preview popover. */
	onOpenLink?: (kind: 'vault' | 'external', target: string) => void;
	/** Optional revalidate handler surfaced on the stale banner. */
	onRevalidate?: () => void;
	/**
	 * App-owned Intelligence Sidecar runtime (WP9). When provided, the Sidecar is
	 * mounted in the right column (or a narrow-viewport drawer). Absent ⇒ no
	 * sidecar (harness / read-only host).
	 */
	intelligence?: IntelligenceRuntime;
	/** Reactive intelligence provider (rebinds on document switch, mirrors runtimeSource). */
	intelligenceSource?: { getIntelligence(): IntelligenceRuntime | undefined };
	/** Versioned leaf-local display state (`work`/`all` migrate to `edit`). */
	initialDisplayMode?: ComposerDisplayMode;
	onDisplayModeChange?: (mode: ComposerDisplayMode) => void;
	/** Convert this leaf to Obsidian's Native Markdown view. */
	onOpenNativeMarkdown?: () => void | Promise<void>;
	/** Last explicit workspace-level Intelligence open/close preference. */
	initialIntelligenceOpen?: boolean;
	onIntelligenceManualOpenChange?: (open: boolean) => void | Promise<void>;
	/** One-shot Native modal → Composer Review/History handoff. */
	initialIntelligenceRunId?: string;
	/** One-shot app-owned location reveal for this bound Composer leaf. */
	revealRequest?: { id: number; location: DocumentSourceLocation };
}

interface PanelState {
	blockId: string;
	panel: BlockPanelKind;
	pinned: boolean;
	range?: { from: number; to: number };
	unitId?: string;
	initialTypeId?: string;
}

interface DragState {
	blockId: string;
	dropIndex: number | null;
}

const EMPTY_RUNTIME: ComposerChromeRuntime = {};

export function ComposerRoot({
	source,
	config = DEFAULT_COMPOSER_CONFIG,
	runtime: runtimeProp = EMPTY_RUNTIME,
	runtimeSource,
	burstWindowMs,
	scrollGuardGestureWindowMs,
	onOpenLink,
	onRevalidate,
	intelligence: intelligenceProp,
	intelligenceSource,
	initialDisplayMode = 'edit',
	onDisplayModeChange,
	onOpenNativeMarkdown,
	initialIntelligenceOpen = false,
	onIntelligenceManualOpenChange,
	initialIntelligenceRunId,
	revealRequest,
}: ComposerRootProps): React.ReactElement {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const subscribe = React.useCallback((cb: () => void) => source.subscribe(cb), [source]);
	const getSnapshot = React.useCallback(() => source.getState(), [source]);
	const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const [foldStore] = React.useState(createComposerFoldStore);
	const processedRevealId = React.useRef<number | null>(null);
	// The default streaming-text card + the three WP7 image cards (asset / caption /
	// layout), registered by stable renderer id after the default set so image
	// candidates dispatch without touching the candidates barrel (harness included).
	const [candidateRegistry] = React.useState<CandidateRendererRegistry>(() => {
		const registry = createDefaultCandidateRendererRegistry();
		registerImageCandidateRenderers(registry);
		return registry;
	});

	// Re-read the reactive runtime each render (rebinds on document switch); the
	// static prop is the harness path. Identity is stable within one document, so
	// commits do not remount the chrome — only a session switch rebinds it.
	const runtime = runtimeSource?.getRuntime() ?? runtimeProp;
	const resolvedBurstWindowMs =
		burstWindowMs ?? runtime.transactionConfig?.burstWindowMs ?? DEFAULT_TRANSACTION_CONFIG.burstWindowMs;
	const resolvedScrollGuardGestureWindowMs =
		scrollGuardGestureWindowMs
		?? runtime.transactionConfig?.scrollGuardGestureWindowMs
		?? DEFAULT_TRANSACTION_CONFIG.scrollGuardGestureWindowMs;

	React.useEffect(() => {
		if (!revealRequest || !state.snapshot) return;
		if (processedRevealId.current === revealRequest.id) return;
		const resolved = resolveComposerSourceLocation(state.snapshot, revealRequest.location);
		processedRevealId.current = revealRequest.id;
		if (!resolved) return;
		unfoldForDocumentLocation(foldStore, state.snapshot.blocks, resolved.block.blockId);
		const root = rootRef.current;
		const win = root?.ownerDocument.defaultView;
		if (!root || !win) return;
		win.requestAnimationFrame(() => {
			win.requestAnimationFrame(() => {
				locateAndFlashComposerLocation(root, resolved);
			});
		});
	}, [foldStore, revealRequest, state.snapshot]);

	const [flushers] = React.useState(() => new Set<() => Promise<void>>());
	const chromeValue = React.useMemo<ComposerChromeValue>(
		() => ({
			runtime,
			projection: state.snapshot
				? resolveProjection(runtime)
				: stubComposerCapabilityProjection,
			candidateRegistry,
			config,
			snapshot: state.snapshot,
			burstWindowMs: resolvedBurstWindowMs,
			scrollGuardGestureWindowMs: resolvedScrollGuardGestureWindowMs,
			registerFlusher: (flush) => {
				flushers.add(flush);
				return () => flushers.delete(flush);
			},
			flushAll: async () => {
				await Promise.all([...flushers].map((f) => f()));
			},
			onOpenLink,
		}),
		[
			runtime,
			candidateRegistry,
			config,
			state.snapshot,
			resolvedBurstWindowMs,
			resolvedScrollGuardGestureWindowMs,
			flushers,
			onOpenLink,
		],
	);

	const intelligence = intelligenceSource?.getIntelligence() ?? intelligenceProp;
	const [activeCommentId, setActiveCommentId] = React.useState<string | null>(null);
	const [intelligencePresentation, setIntelligencePresentation] = React.useState(
		() => initialIntelligencePresentationState(initialIntelligenceOpen),
	);
	const intelligenceMotionTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const applyIntelligenceIntent = React.useCallback((intent: IntelligencePresentationIntent) => {
		setIntelligencePresentation((current) => {
			const next = reduceIntelligencePresentation(current, intent);
			if (intelligenceMotionTimer.current) clearTimeout(intelligenceMotionTimer.current);
			if (next.animate) {
				intelligenceMotionTimer.current = setTimeout(() => {
					setIntelligencePresentation((latest) => ({ ...latest, animate: false }));
					intelligenceMotionTimer.current = null;
				}, 300);
			}
			return next;
		});
		if (intent.kind !== 'manual-set') return;
		void onIntelligenceManualOpenChange?.(intent.open);
	}, [onIntelligenceManualOpenChange]);
	const setManualIntelligenceOpen = React.useCallback(
		(open: boolean) => applyIntelligenceIntent({ kind: 'manual-set', open }),
		[applyIntelligenceIntent],
	);
	const openContextualIntelligence = React.useCallback(
		(origin: IntelligencePresentationOrigin) =>
			applyIntelligenceIntent({ kind: 'contextual-open', origin }),
		[applyIntelligenceIntent],
	);
	React.useEffect(() => {
		setActiveCommentId(null);
		setIntelligencePresentation(initialIntelligencePresentationState(initialIntelligenceOpen));
	}, [initialIntelligenceOpen, state.snapshot?.documentId]);
	const openedIntelligenceRunRef = React.useRef<string | null>(null);
	React.useEffect(() => {
		if (!initialIntelligenceRunId || !intelligence) return;
		if (openedIntelligenceRunRef.current === initialIntelligenceRunId) return;
		openedIntelligenceRunRef.current = initialIntelligenceRunId;
		openContextualIntelligence({
			kind: 'history-deep-link',
			runId: initialIntelligenceRunId,
		});
	}, [initialIntelligenceRunId, intelligence, openContextualIntelligence]);
	React.useEffect(() => () => {
		if (intelligenceMotionTimer.current) clearTimeout(intelligenceMotionTimer.current);
	}, []);
	// Sidecar controls legitimately take DOM focus. Preserve the last body block so
	// that clicking a Brief action does not silently downgrade its document context
	// to the whole note.
	const lastFocusedBlockIdRef = React.useRef<string | null>(null);
	const locateBlock = React.useCallback((blockId: string) => {
		return locateAndFlashComposerBlock(rootRef.current, blockId);
	}, []);

	// WP9 §12.2 — resolve the REAL focused block from chrome focus so a Copilot run
	// freezes the block the user is on (not a document-level fallback). The DOM
	// lookup lives here (the chrome owns focus); the snapshot assembly is the pure
	// `buildFocusRunContext` (keeps the intelligence layer DOM-free).
	const currentSnapshot = state.snapshot ?? runtime.session?.snapshot ?? null;
	const getFocusedBlockId = React.useCallback((): string | null => {
		const rootEl = rootRef.current;
		const active = rootEl?.ownerDocument.activeElement;
		if (!(active instanceof HTMLElement) || !rootEl?.contains(active)) return lastFocusedBlockIdRef.current;
		const blockId = active.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null;
		if (blockId) lastFocusedBlockIdRef.current = blockId;
		return blockId ?? lastFocusedBlockIdRef.current;
	}, []);
	const resolveFocusContext = React.useCallback(
		(focusedBlockId: string | null) => buildFocusRunContext(currentSnapshot, focusedBlockId),
		[currentSnapshot],
	);
	const resolveFocus = React.useCallback(
		(focusedBlockId: string | null) => resolveRelatedFocus(currentSnapshot, focusedBlockId),
		[currentSnapshot],
	);
	const restoreGeneration = React.useCallback(
		(runId: string): boolean => {
			const workspace = runtime.workspaceIntelligence;
			const run = workspace?.projection().runs.find((item) => item.runId === runId);
			if (!run) return false;
			return restoreGenerationReview(runtime, run);
		},
		[runtime],
	);
	const updateBriefFocus = React.useCallback(() => {
		if (!intelligence) return;
		const focus = resolveFocus(getFocusedBlockId());
		intelligence.updateBriefFocus({ anchorId: focus.anchorId, label: focus.label });
	}, [getFocusedBlockId, intelligence, resolveFocus]);
	const onComposerBodyFocusCapture = React.useCallback(() => {
		const rootEl = rootRef.current;
		const active = rootEl?.ownerDocument.activeElement;
		if (!(active instanceof HTMLElement)) return;
		const blockId = active.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null;
		if (!blockId) return;
		lastFocusedBlockIdRef.current = blockId;
		updateBriefFocus();
	}, [updateBriefFocus]);
	React.useEffect(() => {
		updateBriefFocus();
	}, [updateBriefFocus]);
	const surfaces = useComposerSurfaceCoordinatorState();

	return (
		<ComposerChromeProvider value={chromeValue}>
			<ComposerSurfaceProvider value={surfaces}>
				<div
					ref={rootRef}
					className="peak-design-root peak-composer-root"
					data-with-sidecar={intelligence ? 'true' : undefined}
					data-composer-active-surface={surfaces.active?.kind}
					onKeyDown={containComposerEscape}
				>
					<div className="pk-composer-main" onFocusCapture={onComposerBodyFocusCapture}>
						<ComposerBody
							state={state}
							config={config}
							foldStore={foldStore}
							onRevalidate={onRevalidate}
							intelligence={intelligence}
							intelligenceOpen={intelligencePresentation.open}
							onIntelligenceManualOpen={setManualIntelligenceOpen}
							onIntelligenceContextualOpen={openContextualIntelligence}
							activeCommentId={activeCommentId}
							onActiveComment={setActiveCommentId}
							initialDisplayMode={initialDisplayMode}
							onDisplayModeChange={onDisplayModeChange}
							onOpenNativeMarkdown={onOpenNativeMarkdown}
						/>
					</div>
					{intelligence && currentSnapshot && (
						<IntelligenceSidecar
							runtime={intelligence}
							workspaceRuntime={runtime.workspaceIntelligence}
							hub={runtime.hub}
							documentId={currentSnapshot.documentId}
							documentSnapshot={currentSnapshot}
							documentFilePath={currentSnapshot.filePath}
							open={intelligencePresentation.open}
							motion={intelligencePresentation.animate ? 'user' : 'none'}
							presentationOrigin={intelligencePresentation.origin}
							onPresentationOriginChange={openContextualIntelligence}
							onOpenChange={(open) => setManualIntelligenceOpen(open)}
							onLocate={locateBlock}
							onLocateComment={(commentId, blockId) => {
								setActiveCommentId(commentId);
								locateBlock(blockId);
							}}
							onOpenSource={(path) => onOpenLink?.('vault', path)}
							getFocusedBlockId={getFocusedBlockId}
							resolveFocusContext={resolveFocusContext}
							resolveRelatedFocus={resolveFocus}
							onRestoreGeneration={restoreGeneration}
						/>
					)}
				</div>
			</ComposerSurfaceProvider>
		</ComposerChromeProvider>
	);
}

interface BodyProps {
	state: DocumentComposerState;
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
	onRevalidate?: () => void;
	intelligence?: IntelligenceRuntime;
	intelligenceOpen?: boolean;
	onIntelligenceManualOpen?: (open: boolean) => void;
	onIntelligenceContextualOpen?: (origin: IntelligencePresentationOrigin) => void;
	activeCommentId?: string | null;
	onActiveComment?: (commentId: string | null) => void;
	initialDisplayMode?: ComposerDisplayMode;
	onDisplayModeChange?: (mode: ComposerDisplayMode) => void;
	onOpenNativeMarkdown?: () => void | Promise<void>;
}

function ComposerBody(props: BodyProps): React.ReactElement {
	const { state, config, foldStore, onRevalidate } = props;
	const { strings } = config;
	if (state.status === 'empty') return <StateBanner title={strings.emptyTitle} hint={strings.emptyHint} />;
	if (state.status === 'missing') return <StateBanner title={strings.missingTitle} hint={strings.missingHint} />;
	if (state.status === 'error') return <StateBanner title={strings.errorTitle} hint={state.error ?? ''} tone="error" />;
	if (!state.snapshot) return <StateBanner title={strings.loading} hint="" />;
	return <ComposerDocument {...props} />;
}

function ComposerDocument({
	state,
	config,
	foldStore,
	onRevalidate,
	intelligence,
	intelligenceOpen = false,
	onIntelligenceManualOpen = () => undefined,
	onIntelligenceContextualOpen = () => undefined,
	activeCommentId = null,
	onActiveComment = () => undefined,
	initialDisplayMode = 'edit',
	onDisplayModeChange,
	onOpenNativeMarkdown,
}: BodyProps): React.ReactElement {
	const chrome = useComposerChrome();
	const { runtime, projection } = chrome;
	const hub = runtime.hub;
	const snapshot = state.snapshot as ComposerDocumentSnapshot;
	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const workspaceRef = React.useRef<HTMLDivElement | null>(null);
	const findBarRef = React.useRef<ComposerFindBarHandle | null>(null);
	const findRestoreFocusRef = React.useRef<HTMLElement | null>(null);
	const [findOpen, setFindOpen] = React.useState(false);

	const [displayState, setDisplayState] = React.useState<ComposerDisplayState>(
		hub ? initialDisplayMode : 'clean',
	);
	const [panel, setPanel] = React.useState<PanelState | null>(null);
	const [historyActivity, setHistoryActivity] = React.useState<ComposerHistoryActivity | null>(null);
	const [historySidecarConfig, setHistorySidecarConfig] = React.useState<SidecarConfig>(
		DEFAULT_SIDECAR_CONFIG,
	);
	const [commentDraft, setCommentDraft] = React.useState<CommentDraftTarget | null>(null);
	const [commentRailOpen, setCommentRailOpen] = React.useState(false);
	const [drag, setDrag] = React.useState<DragState | null>(null);
	const [hasSelection, setHasSelection] = React.useState(false);
	const documentSurfaces = useComposerSurfaces();
	const canClaimDocumentSurface = documentSurfaces.canClaim;
	const claimDocumentSurface = documentSurfaces.claim;
	const releaseDocumentSurface = documentSurfaces.release;
	const selectionSurfaceId = React.useId();
	const [guard, setGuard] = React.useState<string | null>(null);
	const [invokeErrors, setInvokeErrors] = React.useState<Record<string, string>>({});
	const [reviewAll, setReviewAll] = React.useState(false);
	const guardTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const setCommentSurfaceOpen = React.useCallback((open: boolean) => {
		setCommentRailOpen(open);
		if (open) return;
		setCommentDraft(null);
		onActiveComment(null);
	}, [onActiveComment]);
	const setDisplayStateWithComments = React.useCallback((next: ComposerDisplayState) => {
		setDisplayState(next);
		onDisplayModeChange?.(next);
		if (next === 'clean') setCommentSurfaceOpen(false);
	}, [onDisplayModeChange, setCommentSurfaceOpen]);
	React.useEffect(() => {
		if (!hasSelection) {
			releaseDocumentSurface(selectionSurfaceId);
			return;
		}
		if (!canClaimDocumentSurface('selection', selectionSurfaceId)) return;
		claimDocumentSurface({
			id: selectionSurfaceId,
			kind: 'selection',
			ownerId: snapshot.documentId,
		});
	}, [
		canClaimDocumentSurface,
		claimDocumentSurface,
		hasSelection,
		releaseDocumentSurface,
		selectionSurfaceId,
		snapshot.documentId,
	]);
	React.useEffect(
		() => () => releaseDocumentSurface(selectionSurfaceId),
		[releaseDocumentSurface, selectionSurfaceId],
	);

	React.useEffect(() => {
		if (!hub) return;
		setDisplayState(initialDisplayMode);
		setCommentSurfaceOpen(false);
		setHistoryActivity(null);
	}, [hub, initialDisplayMode, snapshot.documentId]);
	React.useEffect(() => {
		setFindOpen(false);
		findRestoreFocusRef.current = null;
	}, [snapshot.documentId]);
	const closeFind = React.useCallback(() => {
		setFindOpen(false);
		const restore = findRestoreFocusRef.current;
		findRestoreFocusRef.current = null;
		const ownerWindow = containerRef.current?.ownerDocument.defaultView;
		if (!restore || !ownerWindow) return;
		ownerWindow.requestAnimationFrame(() => {
			if (!restore.isConnected) return;
			restore.focus({ preventScroll: true });
		});
	}, []);
	React.useEffect(() => {
		const root = containerRef.current;
		const ownerWindow = root?.ownerDocument.defaultView;
		if (!root || !ownerWindow) return;
		const openFind = async (event: KeyboardEvent) => {
			if ((!event.metaKey && !event.ctrlKey) || event.altKey) return;
			if (event.key.toLocaleLowerCase() !== 'f') return;
			if (!ownsComposerFindShortcut(root)) return;
			event.preventDefault();
			event.stopPropagation();
			if (findOpen) {
				findBarRef.current?.focusAndSelect();
				return;
			}
			const active = root.ownerDocument.activeElement;
			findRestoreFocusRef.current = active instanceof HTMLElement ? active : null;
			await chrome.flushAll();
			setFindOpen(true);
		};
		const onKeyDown = (event: KeyboardEvent) => void openFind(event);
		ownerWindow.addEventListener('keydown', onKeyDown, true);
		return () => ownerWindow.removeEventListener('keydown', onKeyDown, true);
	}, [chrome, findOpen, snapshot.documentId]);
	React.useEffect(() => {
		let alive = true;
		void loadSidecarConfig().then((loaded) => {
			if (alive) setHistorySidecarConfig(loaded);
		});
		return () => {
			alive = false;
		};
	}, []);
	const historyTransactionResolver = React.useMemo<
		ComposerHistoryTransactionResolver | undefined
	>(
		() => hub
			? {
					preview: (historyId) => hub.historyPreview(historyId),
					transaction: (historyId) => hub.historyTransaction(historyId),
				}
			: undefined,
		[hub],
	);

	React.useEffect(() => {
		if (!panel) return;
		const root = containerRef.current;
		const doc = root?.ownerDocument;
		if (!root || !doc) return;
		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target || typeof target.closest !== 'function') return;
			const owner = target.closest<HTMLElement>('[data-composer-surface-owner]');
			if (owner?.dataset.composerSurfaceOwner === panel.blockId) return;
			setPanel(null);
		};
		doc.addEventListener('pointerdown', closeOnOutsidePointer);
		return () => doc.removeEventListener('pointerdown', closeOnOutsidePointer);
	}, [panel]);

	const editing = displayState === 'edit' && Boolean(hub);
	useCrossBlockTextSelection(containerRef, editing);
	// Comments are an on-demand reading layer, not editing chrome. Clean mode
	// enters with the rail closed; the toolbar can still open existing threads
	// without enabling source edits or new selection comments.
	const commentSurfaceVisible = commentRailOpen;

	const showGuard = (reason: SelectionGuardReason) => {
		const g = config.chrome.selection.guards;
		let message = g.emptySelection;
		if (reason === 'code-block-rich-format') message = g.codeBlockRichFormat;
		if (reason === 'cross-structure-link') message = g.crossStructureLink;
		if (reason === 'semantic-inline-html-format') message = g.semanticInlineHtmlFormat;
		setGuard(message);
		if (guardTimer.current) clearTimeout(guardTimer.current);
		guardTimer.current = setTimeout(() => setGuard(null), 3200);
	};

	const invoke = (
		descriptor: ComposerActionDescriptor,
		snap: ComposerContextSnapshot,
		instruction?: string,
		placement?: ComposerInvocationPlacement,
	) => {
		const blockId = composerTargetBlockId(snap.target);
		try {
			const options = instruction !== undefined || placement !== undefined
				? {
						...(instruction !== undefined ? { instruction } : {}),
						...(placement !== undefined ? { placement } : {}),
					}
				: undefined;
			projection.invoke(descriptor.capabilityId, snap, options);
			if (blockId) {
				setInvokeErrors((current) => {
					if (!(blockId in current)) return current;
					const next = { ...current };
					delete next[blockId];
					return next;
				});
			}
		} catch (error) {
			if (!blockId) return;
			const message = error instanceof Error ? error.message : String(error);
			setInvokeErrors((current) => ({ ...current, [blockId]: message }));
		}
	};

	// ── drag reorder (owner-scoped pointer capture, drop commits moveBlock) ──
	const startDrag = (blockId: string) => (ev: React.PointerEvent<HTMLButtonElement>) => {
		if (!hub) return;
		const activeHub = hub;
		ev.preventDefault();
		const rootEl = containerRef.current;
		if (!rootEl) return;
		const doc = rootEl.ownerDocument;
		const trigger = ev.currentTarget;
		const startX = ev.clientX;
		const startY = ev.clientY;
		let dragStarted = false;
		trigger.dataset.dragMoved = 'false';

		const indexAt = (clientY: number): number => {
			const rows = Array.from(rootEl.querySelectorAll<HTMLElement>('.pk-composer-block'));
			for (let i = 0; i < rows.length; i++) {
				const r = rows[i].getBoundingClientRect();
				if (clientY < r.top + r.height / 2) return i;
			}
			return rows.length;
		};
		const move = (pe: PointerEvent) => {
			if (!dragStarted) {
				const distance = Math.hypot(pe.clientX - startX, pe.clientY - startY);
				if (distance < config.chrome.blockDragThresholdPx) return;
				dragStarted = true;
				trigger.dataset.dragMoved = 'true';
				setDrag({ blockId, dropIndex: indexAt(pe.clientY) });
				return;
			}
			setDrag({ blockId, dropIndex: indexAt(pe.clientY) });
		};
		function cleanup(): void {
			doc.removeEventListener('pointermove', move);
			doc.removeEventListener('pointerup', up);
			doc.removeEventListener('pointercancel', cancel);
		}
		async function up(pe: PointerEvent): Promise<void> {
			cleanup();
			if (!dragStarted) return;
			const index = indexAt(pe.clientY);
			setDrag(null);
			const built = buildMoveBlockOps(snapshot, blockId, index);
			if (!built) return;
			try {
				await activeHub.commit({
					origin: 'direct',
					label: config.chrome.actions.drag,
					operations: built.operations,
					target: built.target,
					expectedBlockDelta: built.expectedBlockDelta,
				});
			} catch {
				// conflict — surfaced via lifecycle staleness
			}
		}
		function cancel(): void {
			cleanup();
			if (dragStarted) setDrag(null);
		}
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
		doc.addEventListener('pointercancel', cancel);
	};

	// ── paste bitmap → image coordinator (WP7), else URL over a selection (§7.5) ─
	const onPaste = async (ev: React.ClipboardEvent<HTMLDivElement>) => {
		if (!editing || !hub) return;
		// A pasted bitmap runs the image coordinator's atomic attachment transaction.
		// `getAsFile()` must run synchronously inside the event, so detect BEFORE any
		// await. When no coordinator is composed (harness), fall through to native —
		// never preventDefault a paste we cannot service.
		const imageCoordinator = chrome.runtime.imageCoordinator;
		const image = imageCoordinator ? firstClipboardImage(ev.clipboardData.items) : null;
		if (image && imageCoordinator) {
			const file = image.file as unknown as File;
			ev.preventDefault();
			await chrome.flushAll();
			const blockId = focusedBlockId(containerRef.current);
			try {
				const buffer = await file.arrayBuffer();
				await imageCoordinator.beginPaste({
					bytes: new Uint8Array(buffer),
					mimeType: image.mimeType,
					...(file.name ? { rawName: file.name } : {}),
					insertion: { kind: 'after-block', blockId },
				});
			} catch {
				// Attachment save failed — surfaced via the coordinator's own error path.
			}
			return;
		}
		const text = ev.clipboardData.getData('text/plain').trim();
		if (!/^https?:\/\/\S+$/.test(text)) return; // ordinary text paste stays native
		const rootEl = containerRef.current;
		const domSel = rootEl?.ownerDocument.getSelection();
		if (!rootEl || !domSel || domSel.rangeCount === 0 || domSel.isCollapsed) return;
		const mapped = mapDomRangeToSource(rootEl, domSel.getRangeAt(0));
		if (!mapped || mapped.from === mapped.to) return;
		ev.preventDefault();
		await chrome.flushAll();
		const selection = partitionSourceRange(snapshot, mapped.from, mapped.to);
		const result = pasteUrlIntoSelection(selection, text);
		if (!result.ok) {
			showGuard(result.reason);
			return;
		}
		domSel.removeAllRanges();
		try {
			await hub.commit({ origin: 'direct', label: result.label, operations: result.operations });
		} catch {
			// conflict — surfaced via lifecycle staleness
		}
	};

	const folded = useStore(foldStore, (s) => s.folded);
	const hidden = React.useMemo(() => hiddenBySections(snapshot.blocks, folded), [snapshot.blocks, folded]);
	const visibleBlocks = snapshot.blocks.filter((b) => !hidden.has(b.blockId));
	const findings = useComposerFindings(intelligence);
	const reviewCandidates = useDocumentCandidates(runtime.candidateRuntime);
	React.useEffect(() => {
		if (reviewCandidates.length >= 2) return;
		setReviewAll(false);
	}, [reviewCandidates.length]);

	// INT-1: keep the edited block's React subtree (and its focused
	// contenteditable DOM node) mounted through a burst commit — see
	// useStableBlockKeys. Without it, blockId churn remounts every row, dropping
	// caret/focus and collapsing scroll to the document bottom.
	const stableKey = useStableBlockKeys(snapshot.blocks);
	// Belt-and-suspenders: snap back any large unexplained scroll jump while the
	// keyboard is inside this document so a commit-driven caret-reveal can never
	// scroll the active editor out of view.
	useEditingScrollGuard(containerRef, chrome.scrollGuardGestureWindowMs);

	return (
		<>
			<UndoRedoBar
				containerRef={containerRef}
				displayState={displayState}
				onDisplayState={setDisplayStateWithComments}
				canEdit={Boolean(hub)}
				readOnlyLabel={config.strings.readOnlyBadge}
				commentOpen={commentSurfaceVisible}
				onCommentOpen={setCommentSurfaceOpen}
				intelligenceAvailable={Boolean(intelligence)}
				intelligenceOpen={intelligenceOpen}
				onIntelligenceOpen={onIntelligenceManualOpen}
				onOpenNativeMarkdown={onOpenNativeMarkdown
					? () => {
							void onOpenNativeMarkdown();
						}
					: undefined}
				reviewCandidateCount={reviewCandidates.length}
				reviewAll={reviewAll}
				onReviewAll={setReviewAll}
			/>
			<div ref={workspaceRef} className="pk-composer-workspace">
			<div
				ref={containerRef}
				className="pk-composer-shell"
				data-display-state={displayState}
				data-has-selection={hasSelection || undefined}
				data-dragging={drag ? 'true' : undefined}
				onPaste={(ev) => void onPaste(ev)}
			>
			<ComposerFindBar
				ref={findBarRef}
				open={findOpen}
				sourceText={snapshot.sourceText}
				revision={snapshot.revision}
				rootRef={containerRef}
				strings={config.chrome.find}
				onClose={closeFind}
				onReveal={(match) => {
					const target = snapshot.blocks.find(
						(block) => block.source.from <= match.from && block.source.to >= match.to,
					);
					if (!target) return;
					unfoldForDocumentLocation(foldStore, snapshot.blocks, target.blockId);
				}}
			/>
			{state.status === 'stale' && <StaleBanner strings={config.strings} onRevalidate={onRevalidate} />}
			<AddFrontmatterEntry editing={editing} />
			<div className="pk-composer-blocks">
				{visibleBlocks.map((b, i) => {
					const previousBlock = visibleBlocks[i - 1];
					return (
						<React.Fragment key={stableKey(b.blockId)}>
						<ComposerBlockRow
							block={b}
							previousBlock={previousBlock}
							snapshot={snapshot}
							config={config}
							foldStore={foldStore}
							editing={editing}
							displayState={displayState}
							reviewAll={reviewAll}
							invokeError={invokeErrors[b.blockId]}
							findings={findings.filter((finding) => composerTargetBlockId(finding.target) === b.blockId)}
							onAskFinding={(finding) => {
								if (!intelligence) return;
								intelligence.session.selectSurface('copilot');
								intelligence.session.openSession(finding.body?.title ?? finding.reason, []);
								const blockId = composerTargetBlockId(finding.target);
								if (!blockId) return;
								onIntelligenceContextualOpen({
									kind: 'automatic-suggestion',
									findingId: finding.findingId,
									blockId,
								});
							}}
							onConfirmFinding={(finding) => intelligence?.findings.consume(finding.findingId)}
							onDismissFinding={(finding) => intelligence?.findings.dismiss(finding.findingId, 'body')}
							panel={panel?.blockId === b.blockId ? panel : null}
							setPanel={setPanel}
							onInsertBelow={
								hub && editing
									? () => setPanel({
											blockId: b.blockId,
											panel: 'insert-draft',
											pinned: true,
											initialTypeId: 'markdown',
										})
									: undefined
							}
							onSelectInsertType={(typeId) =>
								setPanel({ blockId: b.blockId, panel: 'insert-draft', pinned: true, initialTypeId: typeId })
							}
							onDragStart={hub && editing ? startDrag(b.blockId) : undefined}
							dropBefore={drag?.dropIndex === i}
							onInvoke={invoke}
							activeCommentId={activeCommentId}
							onActiveComment={(commentId) => {
								if (commentId) setCommentRailOpen(true);
								onActiveComment(commentId);
							}}
							onOpenComment={() => {
								setPanel(null);
								setCommentRailOpen(true);
								setCommentDraft({ blockId: b.blockId });
							}}
							onViewHistory={intelligence
								? () => {
										intelligence.session.selectSurface('history');
										onIntelligenceManualOpen(true);
										setPanel(null);
									}
								: undefined}
							onOpenHistoryActivity={(activity) => {
								setPanel(null);
								setHistoryActivity(activity);
							}}
						/>
						{panel?.blockId === b.blockId && panel.panel === 'insert-draft' && (
							<div data-composer-surface-owner={b.blockId}>
								<NewBlockDraft
									blockId={b.blockId}
									initialTypeId={panel.initialTypeId}
									onDone={() => setPanel(null)}
								/>
							</div>
						)}
						</React.Fragment>
					);
				})}
				{drag?.dropIndex === visibleBlocks.length && <div className="pk-drop-indicator" data-chrome="true" />}
			</div>
			{editing && (
				<SelectionToolbar
					containerRef={containerRef}
					editingEnabled={editing}
					onVisibleChange={setHasSelection}
					onGuard={showGuard}
					onComment={(blockId, range) => {
						setPanel(null);
						setCommentRailOpen(true);
						setCommentDraft({ blockId, range });
					}}
					onInvoke={(d, snap) => invoke(d, snap)}
				/>
			)}
			<LinkPreviewLayer containerRef={containerRef} />
			<InlineStyleLayer containerRef={containerRef} enabled={editing} />
			<CommentHighlightLayer
				shellRef={containerRef}
				activeCommentId={activeCommentId}
				draftTarget={commentDraft}
				visible={commentSurfaceVisible}
			/>
			{guard && (
				<div className="pk-guard-toast" role="alert" data-chrome="true">
					{guard}
				</div>
			)}
			<TransactionNotice />
			{historyActivity && (
				<HistoryDetailModal
					activity={historyActivity}
					snapshot={snapshot}
					transactionResolver={historyTransactionResolver}
					strings={historySidecarConfig.strings}
					onClose={() => setHistoryActivity(null)}
					onLocate={(blockId) => {
						return locateAndFlashComposerBlock(containerRef.current, blockId);
					}}
					onRestore={(runId) => {
						const run = runtime.workspaceIntelligence
							?.projection()
							.runs.find((candidate) => candidate.runId === runId);
						return run ? restoreGenerationReview(runtime, run) : false;
					}}
					onRollback={async (historyId) => {
						await hub?.rollback(historyId);
						setHistoryActivity(null);
					}}
				/>
			)}
			</div>
			<CommentRail
				shellRef={containerRef}
				workspaceRef={workspaceRef}
				draftTarget={commentDraft}
				activeCommentId={activeCommentId}
				open={commentSurfaceVisible}
				onOpenChange={setCommentSurfaceOpen}
				onDraftClose={() => setCommentDraft(null)}
				onActiveComment={onActiveComment}
				onLocate={(blockId) => {
					const block = containerRef.current?.querySelector<HTMLElement>(
						`[data-block-id="${CSS.escape(blockId)}"]`,
					);
					markScrollIntent(scrollerOf(containerRef.current));
					block?.scrollIntoView({ block: 'center', behavior: 'smooth' });
				}}
				onAskCopilot={intelligence
					? (comment) => {
							intelligence.session.selectSurface('copilot');
							intelligence.session.openSession(
								config.chrome.comment.copilotTaskTitle,
								[],
								[buildCommentSourceRef(comment)],
							);
							onActiveComment(comment.commentId);
							onIntelligenceContextualOpen({
								kind: 'comment-handoff',
								commentId: comment.commentId,
								blockId: comment.anchor.blockId,
							});
						}
					: undefined}
			/>
			</div>
		</>
	);
}

// ── block row ───────────────────────────────────────────────────────────────

const TEXT_EDIT_KINDS = new Set(['paragraph', 'heading', 'quote', 'callout']);

interface ComposerUnitActionAnchor {
	unitId: string;
	from: number;
	to: number;
	depth?: number;
}

interface ComposerUnitActions {
	activeUnitId: string | null;
	collectionAnchorUnitId: string | null;
	collectionActive: boolean;
	onPointerEnter: (anchor: ComposerUnitActionAnchor) => void;
	onPointerLeave: () => void;
	onFocus: (anchor: ComposerUnitActionAnchor) => void;
	renderBefore?: (anchor: ComposerUnitActionAnchor) => React.ReactNode;
	render: (anchor: ComposerUnitActionAnchor) => React.ReactNode;
}

function ComposerBlockRow({
	block,
	previousBlock,
	snapshot,
	config,
	foldStore,
	editing,
	displayState,
	reviewAll,
	invokeError,
	findings,
	onAskFinding,
	onConfirmFinding,
	onDismissFinding,
	panel,
	setPanel,
	onInsertBelow,
	onSelectInsertType,
	onDragStart,
	dropBefore,
	onInvoke,
	activeCommentId,
	onActiveComment,
	onOpenComment,
	onViewHistory,
	onOpenHistoryActivity,
}: {
	block: ComposerBlock;
	previousBlock?: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
	editing: boolean;
	displayState: ComposerDisplayState;
	reviewAll: boolean;
	invokeError?: string;
	findings: readonly SuggestionFinding[];
	onAskFinding(finding: SuggestionFinding): void;
	onConfirmFinding(finding: SuggestionFinding): void;
	onDismissFinding(finding: SuggestionFinding): void;
	panel: PanelState | null;
	setPanel: React.Dispatch<React.SetStateAction<PanelState | null>>;
	onInsertBelow?: () => void;
	onSelectInsertType: (typeId: string) => void;
	onDragStart?: (ev: React.PointerEvent<HTMLButtonElement>) => void;
	dropBefore?: boolean;
	onInvoke: (
		d: ComposerActionDescriptor,
		snap: ComposerContextSnapshot,
		instruction?: string,
		placement?: ComposerInvocationPlacement,
	) => void;
	activeCommentId: string | null;
	onActiveComment: (commentId: string | null) => void;
	onOpenComment: () => void;
	onViewHistory?: () => void;
	onOpenHistoryActivity: (activity: ComposerHistoryActivity) => void;
}): React.ReactElement {
	const chrome = useComposerChrome();
	const folded = useStore(foldStore, (s) => s.folded.has(block.blockId));
	const blockRef = React.useRef<HTMLDivElement | null>(null);
	const bodyRef = React.useRef<HTMLDivElement | null>(null);
	const isHeading = block.kind === 'heading';
	const showSummary = !isHeading && folded;
	const raw = block.renderModel.raw;
	const aiSnapshot = makeBlockSnapshot(snapshot, block);
	const unitized =
		block.kind === 'list' ||
		block.kind === 'task' ||
		(block.kind === 'paragraph' && block.units.length > 1);
	const collectionFollowsUnit = unitized;
	const [collectionActionAnchor, setCollectionActionAnchor] =
		React.useState<ComposerUnitActionAnchor | null>(null);
	const [collectionActionAnchorTop, setCollectionActionAnchorTop] = React.useState<number | null>(null);
	const [collectionActionPlacement, setCollectionActionPlacement] =
		React.useState<'before' | 'after'>('after');
	const [collectionActionPinned, setCollectionActionPinned] = React.useState(false);
	const pinnedCollectionViewportY = React.useRef<number | null>(null);
	React.useEffect(() => {
		setCollectionActionAnchor((current) =>
			current
				? collectionActionAnchorForUnit(block, snapshot, current.unitId)
				: null,
		);
	}, [block, snapshot]);
	React.useEffect(() => {
		setCollectionActionPinned(false);
		setCollectionActionAnchor(null);
		setCollectionActionAnchorTop(null);
		pinnedCollectionViewportY.current = null;
	}, [block.blockId]);
	const candidateRuntime = chrome.runtime.candidateRuntime;
	const candidates = useBlockCandidates(candidateRuntime, block.blockId);
	const newestActiveCandidate = activeCandidateOf(candidates);
	const [selectedCandidateId, setSelectedCandidateId] = React.useState<string | null>(null);
	React.useEffect(() => {
		if (!newestActiveCandidate) {
			setSelectedCandidateId(null);
			return;
		}
		if (newestActiveCandidate.status === 'streaming') {
			setSelectedCandidateId(newestActiveCandidate.candidateId);
			return;
		}
		setSelectedCandidateId((current) =>
			current && candidates.some((candidate) => candidate.candidateId === current)
				? current
				: newestActiveCandidate.candidateId,
		);
	}, [candidates, newestActiveCandidate]);
	const candidate =
		candidates.find((item) => item.candidateId === selectedCandidateId)
		?? newestActiveCandidate;
	const candidateId = candidate?.candidateId ?? null;
	const hasInlineCandidate = Boolean(candidateRuntime && candidates.length > 0);
	const showInlineCandidate = displayState === 'edit' && hasInlineCandidate;
	const visibleCandidates = reviewAll
		? candidates
		: candidate ? [candidate] : [];
	const listItemCandidates = visibleCandidates.filter(
		(item) =>
			candidateRuntime?.rendererIdFor(item.candidateId) ===
			COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	);
	const inPlaceCandidates = visibleCandidates.filter(
		(item) =>
			candidateRuntime?.candidateEffectFor?.(item.candidateId) === 'rewrite' &&
			candidateRuntime.rendererIdFor(item.candidateId) !==
				COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	);
	const belowCandidates = visibleCandidates.filter(
		(item) => {
			const effect = candidateRuntime?.candidateEffectFor?.(item.candidateId);
			return (
				(effect === 'insert' || effect === 'transform') &&
				candidateRuntime?.rendererIdFor(item.candidateId) ===
					COMPOSER_STREAMING_TEXT_RENDERER_ID
			);
		},
	);
	const frontmatterCandidate: FrontmatterCandidatePort | undefined =
		showInlineCandidate && candidateRuntime && candidate && block.kind === 'frontmatter' &&
		candidateRuntime.rendererIdFor(candidate.candidateId) === COMPOSER_METADATA_SUGGESTION_RENDERER_ID
			? { runtime: candidateRuntime, candidate }
			: undefined;
	const imageCandidate =
		showInlineCandidate &&
		block.kind === 'image' &&
		candidateRuntime &&
		candidate &&
		candidateRuntime.rendererIdFor(candidate.candidateId)?.startsWith('composer.renderer.image');
	const replacesBlockBody =
		showInlineCandidate &&
		inPlaceCandidates.length > 0 &&
		!frontmatterCandidate &&
		!imageCandidate;
	const spacing = blockSpacingRole(block, previousBlock);
	const ownPanel = panel?.blockId === block.blockId ? panel : null;
	const frontmatterLibraryOpen = ownPanel?.panel === 'vault-library';
	const surfaces = useComposerSurfaces();
	const {
		active: activeSurface,
		canClaim: canClaimSurface,
		claim: claimSurface,
		release: releaseSurface,
	} = surfaces;
	const actionSurfaceId = React.useId();
	const actionOpenTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const actionCloseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const [actionRowVisible, setActionRowVisible] = React.useState(false);
	const [activeUnitAction, setActiveUnitAction] = React.useState<ComposerUnitActionAnchor | null>(null);
	const clearActionOpen = () => {
		if (!actionOpenTimer.current) return;
		clearTimeout(actionOpenTimer.current);
		actionOpenTimer.current = null;
	};
	const clearActionClose = () => {
		if (!actionCloseTimer.current) return;
		clearTimeout(actionCloseTimer.current);
		actionCloseTimer.current = null;
	};
	React.useLayoutEffect(() => {
		if (!collectionFollowsUnit || !collectionActionAnchor) {
			setCollectionActionAnchorTop(null);
			return;
		}
		const blockElement = blockRef.current;
		const row = collectionAnchorElement(blockElement, collectionActionAnchor.unitId);
		const ownerWindow = blockElement?.ownerDocument.defaultView;
		if (!blockElement || !row || !ownerWindow) {
			setCollectionActionAnchorTop(null);
			return;
		}
		const update = () => {
			const blockRect = blockElement.getBoundingClientRect();
			const rowRect = row.getBoundingClientRect();
			setCollectionActionAnchorTop(Math.max(
				0,
				rowRect.top - blockRect.top + (rowRect.height - 30) / 2,
			));
			const scroller = scrollerOf(blockElement);
			const scrollerRect = scroller?.getBoundingClientRect();
			const viewportTop = Math.max(0, scrollerRect?.top ?? 0);
			const viewportBottom = Math.min(
				ownerWindow.innerHeight,
				scrollerRect?.bottom ?? ownerWindow.innerHeight,
			);
			const below = viewportBottom - rowRect.bottom;
			const above = rowRect.top - viewportTop;
			setCollectionActionPlacement(
				below >= config.chrome.collectionActionFlipSpacePx || below >= above
					? 'after'
					: 'before',
			);
		};
		update();
		const resizeObserver = ownerWindow.ResizeObserver
			? new ownerWindow.ResizeObserver(update)
			: null;
		resizeObserver?.observe(blockElement);
		resizeObserver?.observe(row);
		return () => resizeObserver?.disconnect();
	}, [
		collectionActionAnchor?.unitId,
		collectionFollowsUnit,
		config.chrome.collectionActionFlipSpacePx,
		snapshot.revision,
	]);
	const showActionRow = (immediate = false, unit: ComposerUnitActionAnchor | null = null) => {
		clearActionClose();
		if (ownPanel?.panel === 'insert-draft') return;
		if (ownPanel?.pinned) return;
		if (!canClaimSurface('block-actions', actionSurfaceId)) return;
		if (unit && collectionFollowsUnit && !collectionActionPinned) {
			setCollectionActionAnchor(unit);
		}
		setActiveUnitAction(unit);
		const reveal = () => {
			actionOpenTimer.current = null;
			if (!canClaimSurface('block-actions', actionSurfaceId)) return;
			claimSurface({ id: actionSurfaceId, kind: 'block-actions', ownerId: block.blockId });
			setActionRowVisible(true);
		};
		if (immediate) {
			clearActionOpen();
			reveal();
			return;
		}
		if (actionOpenTimer.current) return;
		actionOpenTimer.current = setTimeout(reveal, config.chrome.surfacePreviewOpenDelayMs);
	};
	const hideActionRow = () => {
		clearActionOpen();
		if (ownPanel?.pinned || collectionActionPinned) return;
		clearActionClose();
		actionCloseTimer.current = setTimeout(() => {
			actionCloseTimer.current = null;
			setActionRowVisible(false);
			setActiveUnitAction(null);
			if (!collectionActionPinned) {
				setCollectionActionAnchor(null);
				setCollectionActionAnchorTop(null);
			}
			releaseSurface(actionSurfaceId);
		}, config.chrome.surfacePreviewCloseDelayMs);
	};
	const closeActionRowImmediately = (clearCollectionAnchor = false) => {
		clearActionOpen();
		clearActionClose();
		setActionRowVisible(false);
		setActiveUnitAction(null);
		if (clearCollectionAnchor) {
			setCollectionActionAnchor(null);
			setCollectionActionAnchorTop(null);
		}
		releaseSurface(actionSurfaceId);
	};
	React.useEffect(() => {
		if (!ownPanel) {
			if (actionRowVisible) {
				claimSurface({
					id: actionSurfaceId,
					kind: 'block-actions',
					ownerId: block.blockId,
				});
			}
			return;
		}
		if (ownPanel.panel === 'insert-draft') {
			clearActionOpen();
			clearActionClose();
			setActionRowVisible(false);
			releaseSurface(actionSurfaceId);
			return;
		}
		clearActionOpen();
		clearActionClose();
		setActionRowVisible(true);
		claimSurface({
			id: actionSurfaceId,
			kind: ownPanel.pinned || ownPanel.panel === 'instruction' ? 'draft' : 'menu',
			ownerId: block.blockId,
		});
	}, [
		actionRowVisible,
		actionSurfaceId,
		block.blockId,
		claimSurface,
		ownPanel,
		releaseSurface,
	]);
	React.useEffect(() => {
		if (!activeSurface || activeSurface.id === actionSurfaceId) return;
		if (!actionRowVisible || canClaimSurface('block-actions', actionSurfaceId)) return;
		setActionRowVisible(false);
	}, [actionRowVisible, actionSurfaceId, activeSurface, canClaimSurface]);
	React.useEffect(() => () => {
		clearActionOpen();
		clearActionClose();
		releaseSurface(actionSurfaceId);
	}, [actionSurfaceId, releaseSurface]);
	React.useEffect(() => {
		if (!collectionActionPinned) return;
		const blockElement = blockRef.current;
		const ownerDocument = blockElement?.ownerDocument;
		if (!blockElement || !ownerDocument) return;
		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target || typeof target.closest !== 'function') return;
			if (target.closest('[data-collection-handle="true"], .pk-block-action-row')) return;
			setCollectionActionPinned(false);
			pinnedCollectionViewportY.current = null;
			closeActionRowImmediately(true);
		};
		ownerDocument.addEventListener('pointerdown', closeOnOutsidePointer, true);
		return () => ownerDocument.removeEventListener('pointerdown', closeOnOutsidePointer, true);
	}, [collectionActionPinned]);
	React.useEffect(() => {
		if (!collectionActionPinned || !collectionFollowsUnit) return;
		const blockElement = blockRef.current;
		const scroller = scrollerOf(blockElement);
		const ownerWindow = blockElement?.ownerDocument.defaultView;
		if (!blockElement || !scroller || !ownerWindow) return;
		let frame: number | null = null;
		const updateAnchor = () => {
			frame = null;
			const viewportY = pinnedCollectionViewportY.current;
			if (viewportY === null) return;
			const next = closestVisibleCollectionAnchor(
				blockElement,
				block,
				snapshot,
				scroller,
				viewportY,
			);
			if (!next) {
				setCollectionActionPinned(false);
				pinnedCollectionViewportY.current = null;
				closeActionRowImmediately(true);
				return;
			}
			setCollectionActionAnchor((current) =>
				current?.unitId === next.unitId ? current : next,
			);
		};
		const onScroll = () => {
			if (frame !== null) return;
			frame = ownerWindow.requestAnimationFrame(updateAnchor);
		};
		scroller.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			scroller.removeEventListener('scroll', onScroll);
			if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
		};
	}, [block, collectionActionPinned, collectionFollowsUnit, snapshot]);
	const actionRowDisplayed =
		actionRowVisible &&
		(!activeSurface || activeSurface.id === actionSurfaceId);
	const collectionActionActive = unitized && actionRowDisplayed && !activeUnitAction;
	const collectionItemCount = block.units.filter((unit) => unit.unitKind === 'list-item').length;
	const paragraphCollection = block.kind === 'paragraph';
	const collectionScopeLabel = paragraphCollection
		? config.chrome.actions.paragraphScope
		: config.chrome.actions.collectionScope.replace(
				'{count}',
				String(collectionItemCount),
			);
	const collectionHandleLabel = paragraphCollection
		? config.chrome.actions.paragraphHandle
		: config.chrome.actions.collectionHandle;
	const unitScopeLabel = paragraphCollection
		? config.chrome.actions.lineScope
		: config.chrome.actions.unitScope;
	const renderUnitAction = (
		anchor: ComposerUnitActionAnchor,
		placement: 'before' | 'after' = 'after',
	): React.ReactNode => {
		if (!editing || showInlineCandidate) return null;
		if (
			collectionFollowsUnit &&
			collectionActionActive &&
			collectionActionAnchor?.unitId === anchor.unitId
		) {
			if (placement !== collectionActionPlacement || !blockActionRow) return null;
			return (
				<div
					className="pk-composer-unit-action-slot"
					data-unit-collection-action-for={anchor.unitId}
					data-collection-placement={collectionActionPlacement}
					style={anchor.depth === undefined
						? undefined
						: { '--pk-composer-row-depth': anchor.depth } as React.CSSProperties}
					onPointerEnter={clearActionClose}
					onPointerLeave={hideActionRow}
				>
					{blockActionRow}
				</div>
			);
		}
		if (placement === 'before' || activeUnitAction?.unitId !== anchor.unitId) return null;
		const unitSnapshot = createUnitActionSnapshot(snapshot, block, anchor);
		const unitPanel = ownPanel?.unitId === anchor.unitId ? ownPanel : null;
		return (
			<div
				className="pk-composer-unit-action-slot"
				data-unit-action-for={anchor.unitId}
				style={anchor.depth === undefined
					? undefined
					: { '--pk-composer-row-depth': anchor.depth } as React.CSSProperties}
				onPointerEnter={() => showActionRow(true, anchor)}
				onPointerLeave={hideActionRow}
			>
				<BlockActionRow
					snapshot={aiSnapshot}
					variant="unit-ai"
					scopeLabel={unitScopeLabel}
					scopeKind="unit"
					instructionCapabilityId={POLISH_CAPABILITY_ID}
					hiddenQuickCapabilityIds={hiddenQuickCapabilities(block.kind)}
					onOpenPanel={(kind) => {
						if (kind !== 'instruction') return;
						if (unitPanel?.panel === kind && unitPanel.pinned) {
							setPanel(null);
							return;
						}
						setPanel({
							blockId: block.blockId,
							panel: kind,
							pinned: true,
							unitId: anchor.unitId,
							range: { from: anchor.from, to: anchor.to },
						});
					}}
					onPreviewPanel={() => undefined}
					openPanel={unitPanel?.panel ?? null}
					panelPinned={unitPanel?.pinned ?? false}
					writeDisabledReason={chrome.runtime.hub ? undefined : config.chrome.actions.disabledNoRuntime}
					onInvoke={(descriptor, instruction) => onInvoke(
						descriptor,
						instruction !== undefined ? unitSnapshot : aiSnapshot,
						instruction,
					)}
				/>
			</div>
		);
	};
	const unitActions: ComposerUnitActions | undefined = unitized
		? {
				activeUnitId: activeUnitAction?.unitId ?? null,
				collectionAnchorUnitId: collectionActionAnchor?.unitId ?? null,
				collectionActive: collectionActionActive,
				onPointerEnter: (anchor) => {
					if (collectionFollowsUnit && !collectionActionPinned) {
						setCollectionActionAnchor(anchor);
					}
					if (collectionActionActive) {
						clearActionClose();
						return;
					}
					showActionRow(false, anchor);
				},
				onPointerLeave: collectionActionActive ? clearActionClose : hideActionRow,
				onFocus: (anchor) => {
					if (collectionFollowsUnit && !collectionActionPinned) {
						setCollectionActionAnchor(anchor);
					}
					showActionRow(true, anchor);
				},
				renderBefore: (anchor) => renderUnitAction(anchor, 'before'),
				render: renderUnitAction,
			}
		: undefined;

	const openPanel = (kind: BlockPanelKind) => {
		if (kind === 'comment') {
			onOpenComment();
			return;
		}
		if (ownPanel?.panel === kind && ownPanel.pinned) setPanel(null);
		else setPanel({ blockId: block.blockId, panel: kind, pinned: true });
	};
	const previewPanel = (kind: BlockPanelKind, open: boolean) => {
		setPanel((current) => {
			if (open) {
				if (current?.pinned) return current;
				return { blockId: block.blockId, panel: kind, pinned: false };
			}
			if (
				current?.blockId === block.blockId &&
				current.panel === kind &&
				!current.pinned
			) return null;
			return current;
		});
	};
	const blockActionRow = (
		<>
			{editing && !showInlineCandidate && (
				!activeUnitAction ? (
					<BlockActionRow
						snapshot={aiSnapshot}
						scopeLabel={collectionFollowsUnit ? collectionScopeLabel : undefined}
						scopeKind={collectionFollowsUnit ? 'collection' : undefined}
						onInsertBelow={onInsertBelow}
						onSelectInsertType={onSelectInsertType}
						copySurface={(dismissPreview) => (
							<div data-composer-surface-owner={block.blockId}>
								<EasyCopyMenu
									markdown={raw}
									blockKind={block.kind}
									rasterTargetRef={bodyRef}
									onClose={() => {
										dismissPreview();
										setPanel(null);
									}}
								/>
							</div>
						)}
						historySurface={(dismissPreview) => (
							<div data-composer-surface-owner={block.blockId}>
								<BlockHistoryPanel
									blockId={block.blockId}
									onClose={() => {
										dismissPreview();
										setPanel(null);
									}}
									onViewAll={onViewHistory
										? () => {
												dismissPreview();
												onViewHistory();
											}
										: undefined}
									onOpenActivity={(activity) => {
										dismissPreview();
										onOpenHistoryActivity(activity);
									}}
								/>
							</div>
						)}
						onOpenPanel={openPanel}
						onPreviewPanel={previewPanel}
						openPanel={ownPanel?.panel ?? null}
						panelPinned={ownPanel?.pinned ?? false}
						writeDisabledReason={chrome.runtime.hub
							? undefined
							: config.chrome.actions.disabledNoRuntime}
						hiddenQuickCapabilityIds={hiddenQuickCapabilities(block.kind)}
						onInvoke={(d, instruction) => onInvoke(d, aiSnapshot, instruction)}
					/>
				) : null
			)}
		</>
	);
	const showCollectionActions = (immediate: boolean) => {
		if (!collectionActionAnchor) return;
		showActionRow(immediate, null);
	};
	const previewCollectionActions = () => {
		if (collectionActionPinned) {
			clearActionClose();
			return;
		}
		showCollectionActions(true);
	};
	const toggleCollectionActions = (event: React.MouseEvent<HTMLButtonElement>) => {
		if (event.currentTarget.dataset.dragMoved === 'true') {
			event.currentTarget.dataset.dragMoved = 'false';
			return;
		}
		if (collectionActionPinned) {
			setCollectionActionPinned(false);
			pinnedCollectionViewportY.current = null;
			closeActionRowImmediately(true);
			return;
		}
		const row = collectionActionAnchor
			? collectionAnchorElement(blockRef.current, collectionActionAnchor.unitId)
			: null;
		pinnedCollectionViewportY.current = row?.getBoundingClientRect().top ?? null;
		setCollectionActionPinned(true);
		showCollectionActions(true);
	};
	const beginCollectionDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
		setCollectionActionPinned(false);
		pinnedCollectionViewportY.current = null;
		closeActionRowImmediately();
		onDragStart?.(event);
	};
	const collectionAnchorStyle = collectionActionAnchorTop === null
		? undefined
		: {
				'--pk-composer-collection-anchor-top': `${collectionActionAnchorTop}px`,
			} as React.CSSProperties;

	return (
		<div
			ref={blockRef}
			className="pk-composer-block"
			data-kind={block.kind}
			data-block-id={block.blockId}
			data-folded={folded}
			data-level={block.kind === 'heading' ? block.renderModel.level ?? 1 : undefined}
			data-spacing={spacing}
			data-unitized={unitized ? 'true' : undefined}
			data-drop-before={dropBefore || undefined}
			data-action-row-visible={actionRowDisplayed || undefined}
			data-collection-action-active={collectionActionActive || undefined}
			data-collection-anchor-unit={collectionFollowsUnit ? collectionActionAnchor?.unitId : undefined}
			style={collectionAnchorStyle}
			// FIX-1 F2: a mousedown in the row's dead zone (right of the text edge,
			// rail gutter padding, run gaps) targets this WRAPPER, so the browser
			// never focuses the contenteditable leaf — typing then goes to the
			// workspace. Forward such clicks: focus the nearest leaf and place the
			// caret at the closest text position (line-end for past-the-edge clicks).
			onMouseDown={editing ? (ev) => forwardBlockClickToEditable(ev.currentTarget, ev) : undefined}
			onPointerEnter={editing ? () => {
				if (unitized) {
					clearActionClose();
					return;
				}
				showActionRow(false);
			} : undefined}
			onPointerLeave={editing ? hideActionRow : undefined}
			onFocusCapture={editing && !unitized ? () => showActionRow(true) : undefined}
			onMouseLeave={() => {
				if (ownPanel?.panel === 'instruction') setPanel(null);
			}}
			onKeyDown={(event) => {
				if (event.key !== 'Escape' || event.defaultPrevented || !collectionActionPinned) return;
				event.preventDefault();
				setCollectionActionPinned(false);
				pinnedCollectionViewportY.current = null;
				closeActionRowImmediately(true);
			}}
		>
			<BlockRail
				folded={folded}
				foldLabel={foldLabel(config, isHeading, folded)}
				dragLabel={config.chrome.actions.drag}
				onToggle={() => foldStore.getState().toggle(block.blockId)}
				onDragStart={onDragStart}
				dragDisabledReason={onDragStart ? undefined : config.chrome.actions.disabledNoRuntime}
				hideDrag={editing && unitized}
			/>
			{editing && collectionFollowsUnit && collectionActionAnchorTop !== null ? (
				<CollectionActionHandle
					label={collectionHandleLabel}
					accessibleLabel={`${collectionScopeLabel} — ${config.chrome.actions.drag}`}
					pinned={collectionActionPinned}
					onPointerEnter={previewCollectionActions}
					onPointerLeave={hideActionRow}
					onFocusCapture={previewCollectionActions}
					onBlurCapture={hideActionRow}
					onPointerDown={onDragStart ? beginCollectionDrag : undefined}
					onClick={toggleCollectionActions}
				/>
			) : null}
			<div className="pk-composer-block__body" ref={bodyRef}>
				<BlockFindingPanel
					findings={findings}
					strings={config.chrome.findings}
					onAskCopilot={onAskFinding}
					onConfirm={onConfirmFinding}
					onDismiss={onDismissFinding}
				/>
				<CommentAnchorMarker
					blockId={block.blockId}
					activeCommentId={activeCommentId}
					onActivate={onActiveComment}
				/>
				{replacesBlockBody ? (
					<div className="pk-composer-candidate-slot pk-composer-candidate-slot--in-place" data-chrome="true">
						{inPlaceCandidates.map((visibleCandidate) => (
							<ComposerCandidateHost
								key={visibleCandidate.candidateId}
								runtime={candidateRuntime!}
								candidateId={visibleCandidate.candidateId}
								registry={chrome.candidateRegistry}
								resolveOriginalText={(c) => originalTextForTextPatchCandidate(snapshot, c)}
							/>
						))}
					</div>
				) : showSummary ? (
					<div className="pk-composer-summary">{block.renderModel.text || config.strings.emptyPreview}</div>
				) : (
					<BlockBody
						block={block}
						snapshot={snapshot}
						editing={editing}
						frontmatterLibraryOpen={frontmatterLibraryOpen}
						frontmatterCandidate={frontmatterCandidate}
						listItemCandidates={showInlineCandidate ? listItemCandidates : []}
						candidateRuntime={candidateRuntime}
						candidateRegistry={chrome.candidateRegistry}
						aiSnapshot={aiSnapshot}
						unitActions={unitActions}
						onInvoke={onInvoke}
						onFrontmatterLibraryOpenChange={(open) => {
							if (open === frontmatterLibraryOpen) return;
							openPanel('vault-library');
						}}
					/>
					)}
					{showInlineCandidate && belowCandidates.length > 0 ? (
						<div className="pk-composer-candidate-slot pk-composer-candidate-slot--below" data-chrome="true">
							{belowCandidates.map((visibleCandidate) => (
								<ComposerCandidateHost
									key={visibleCandidate.candidateId}
									runtime={candidateRuntime!}
									candidateId={visibleCandidate.candidateId}
									registry={chrome.candidateRegistry}
								/>
							))}
						</div>
					) : null}
					{imageCandidate ? (
						<div className="pk-composer-candidate-slot pk-composer-candidate-slot--image" data-chrome="true">
							{visibleCandidates.map((visibleCandidate) => (
								<ComposerCandidateHost
									key={visibleCandidate.candidateId}
									runtime={candidateRuntime!}
									candidateId={visibleCandidate.candidateId}
									registry={chrome.candidateRegistry}
									resolveOriginalText={(c) => originalTextForTextPatchCandidate(snapshot, c)}
								/>
							))}
						</div>
					) : null}
					{showInlineCandidate && reviewAll && (frontmatterCandidate || imageCandidate) ? (
						<div className="pk-composer-candidate-slot pk-composer-candidate-slot--review-all" data-chrome="true">
							{visibleCandidates
								.filter((visibleCandidate) => visibleCandidate.candidateId !== candidateId)
								.map((visibleCandidate) => (
									<ComposerCandidateHost
										key={visibleCandidate.candidateId}
										runtime={candidateRuntime!}
										candidateId={visibleCandidate.candidateId}
										registry={chrome.candidateRegistry}
										resolveOriginalText={(c) => originalTextForTextPatchCandidate(snapshot, c)}
									/>
								))}
						</div>
					) : null}
					{showInlineCandidate && !reviewAll && candidates.length > 1 ? (
						<CollapsedCandidateList
							candidates={candidates.filter((item) => item.candidateId !== candidateId)}
							runtime={candidateRuntime!}
							onSelect={setSelectedCandidateId}
						/>
					) : null}
					{editing && invokeError ? (
						<div className="pk-composer-invoke-error" role="alert" data-chrome="true">
							{invokeError}
						</div>
					) : null}
					{!collectionFollowsUnit ? blockActionRow : null}
			</div>
		</div>
	);
}

function useComposerFindings(runtime?: IntelligenceRuntime): readonly SuggestionFinding[] {
	const subscribe = React.useCallback(
		(notify: () => void) => runtime?.findings.subscribe(() => notify()) ?? (() => undefined),
		[runtime],
	);
	const getSnapshot = React.useCallback(
		() => runtime?.findings.list() ?? EMPTY_FINDINGS,
		[runtime],
	);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const EMPTY_FINDINGS: readonly SuggestionFinding[] = [];

function hiddenQuickCapabilities(kind: ComposerBlock['kind']): readonly string[] | undefined {
	if (kind === 'frontmatter') return [SUGGEST_PROPERTIES_CAPABILITY_ID];
	if (kind === 'code') return [CODE_EXPLAIN_CAPABILITY_ID];
	if (kind === 'mermaid') return [MERMAID_EXPLAIN_CAPABILITY_ID];
	if (isTextActionBlock(kind)) return [POLISH_CAPABILITY_ID];
	return undefined;
}

function blockSpacingRole(block: ComposerBlock, previous?: ComposerBlock): string {
	if (isChartBlock(block)) return 'chart';
	if (block.kind === 'heading') return (block.renderModel.level ?? 1) === 1 ? 'title' : 'heading';
	if (block.kind === 'paragraph') {
		if (previous?.kind === 'heading' && (previous.renderModel.level ?? 1) === 1) return 'lead';
		if (previous?.kind === 'paragraph') return 'detail';
		return 'paragraph';
	}
	if (block.kind === 'list') return 'list';
	if (block.kind === 'task') return 'task';
	if (block.kind === 'math') return 'math';
	if (block.kind === 'quote') return 'quote';
	if (block.kind === 'callout') return 'callout';
	if (block.kind === 'table') return 'table';
	return 'object';
}

function isTextActionBlock(kind: ComposerBlock['kind']): boolean {
	return kind === 'paragraph' ||
		kind === 'heading' ||
		kind === 'list' ||
		kind === 'task' ||
		kind === 'quote' ||
		kind === 'callout';
}

/**
 * Pending (non-terminal) candidates anchored to this block.
 * Subscribes to the candidate runtime so a freshly-invoked candidate appears
 * under the correct block and disappears on accept / discard.
 */
function useBlockCandidates(
	runtime: ComposerCandidateRuntimePort | undefined,
	blockId: string,
): ComposerCandidate[] {
	const [candidates, setCandidates] = React.useState<ComposerCandidate[]>([]);
	React.useEffect(() => {
		if (!runtime) {
			setCandidates([]);
			return;
		}
		return runtime.subscribe((nextCandidates) => {
			const matches = nextCandidates.filter(
				(c) =>
					anchorBlockOf(c) === blockId &&
					c.status !== 'accepted' &&
					c.status !== 'discarded',
			);
			setCandidates(matches);
		});
	}, [runtime, blockId]);
	return candidates;
}

function useDocumentCandidates(
	runtime: ComposerCandidateRuntimePort | undefined,
): ComposerCandidate[] {
	const [candidates, setCandidates] = React.useState<ComposerCandidate[]>([]);
	React.useEffect(() => {
		if (!runtime) {
			setCandidates([]);
			return;
		}
		return runtime.subscribe((next) => {
			setCandidates(next.filter((candidate) =>
				candidate.status !== 'accepted' && candidate.status !== 'discarded'));
		});
	}, [runtime]);
	return candidates;
}

function activeCandidateOf(candidates: readonly ComposerCandidate[]): ComposerCandidate | null {
	if (candidates.length === 0) return null;
	const streaming = [...candidates].reverse().find((candidate) => candidate.status === 'streaming');
	return streaming ?? candidates[candidates.length - 1];
}

function CollapsedCandidateList({
	candidates,
	runtime,
	onSelect,
}: {
	candidates: readonly ComposerCandidate[];
	runtime: ComposerCandidateRuntimePort;
	onSelect(candidateId: string): void;
}): React.ReactElement | null {
	const [strings, setStrings] = React.useState(DEFAULT_CANDIDATE_UI_STRINGS);
	React.useEffect(() => {
		let active = true;
		void loadCandidateUiStrings().then((loaded) => {
			if (active) setStrings(loaded);
		});
		return () => {
			active = false;
		};
	}, []);
	if (candidates.length === 0) return null;
	return (
		<div className="pk-composer-candidate-collapsed-list" data-chrome="true">
			{candidates.map((candidate) => {
				const action = runtime.candidateLabelFor?.(candidate.candidateId) ?? strings.draftActionFallback;
				const status = candidate.status === 'streaming'
					? strings.streaming
					: candidate.status === 'failed'
						? strings.failed
						: candidate.status === 'cancelled'
							? strings.cancelled
							: candidate.status === 'stale'
								? strings.stale
								: strings.draftTitle;
				return (
					<Button
						key={candidate.candidateId}
						variant="ghost"
						size="sm"
						className="pk-composer-candidate-collapsed"
						onClick={() => onSelect(candidate.candidateId)}
					>
						<span>{action}</span>
						<small>{status}</small>
					</Button>
				);
			})}
		</div>
	);
}

function anchorBlockOf(candidate: ComposerCandidate): string | null {
	if (candidate.anchorBlockId) return candidate.anchorBlockId;
	const t = candidate.target;
	return t.kind === 'document' ? null : t.blockId;
}

// ── block body dispatch (editable vs read-only) ─────────────────────────────

function BlockBody({
	block,
	snapshot,
	editing,
	frontmatterLibraryOpen,
	frontmatterCandidate,
	listItemCandidates,
	candidateRuntime,
	candidateRegistry,
	aiSnapshot,
	unitActions,
	onInvoke,
	onFrontmatterLibraryOpenChange,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
	frontmatterLibraryOpen: boolean;
	frontmatterCandidate?: FrontmatterCandidatePort;
	listItemCandidates: readonly ComposerCandidate[];
	candidateRuntime?: ComposerCandidateRuntimePort;
	candidateRegistry: CandidateRendererRegistry;
	aiSnapshot: ComposerContextSnapshot;
	unitActions?: ComposerUnitActions;
	onInvoke: (
		d: ComposerActionDescriptor,
		snapshot: ComposerContextSnapshot,
		instruction?: string,
		placement?: ComposerInvocationPlacement,
	) => void;
	onFrontmatterLibraryOpenChange(open: boolean): void;
}): React.ReactElement {
	if (block.kind === 'list' || block.kind === 'task') {
		return (
			<EditableListBody
				block={block}
				snapshot={snapshot}
				editing={editing}
				listItemCandidates={listItemCandidates}
				candidateRuntime={candidateRuntime}
				candidateRegistry={candidateRegistry}
				aiSnapshot={aiSnapshot}
				unitActions={unitActions}
				onInvoke={onInvoke}
			/>
		);
	}
	if (block.kind === 'callout') {
		return <CalloutBlockView block={block} snapshot={snapshot} editing={editing} />;
	}
	if (
		block.kind === 'paragraph' &&
		block.units.filter((unit) => unit.unitKind === 'paragraph-line').length > 1
	) {
		return (
			<EditableParagraphLinesBody
				block={block}
				snapshot={snapshot}
				editing={editing}
				unitActions={unitActions}
			/>
		);
	}
	if (TEXT_EDIT_KINDS.has(block.kind)) {
		return <EditableTextBody block={block} snapshot={snapshot} editing={editing} />;
	}
	// WP7 — image blocks carry an object toolbar (caption / AI 改图) wired to the
	// image coordinator; the read-only dispatcher keeps a verbatim ref fallback.
	if (block.kind === 'image') {
		return <ImageBlockView block={block} editing={editing} />;
	}
	if (block.kind !== 'frontmatter') return <BlockKindView block={block} editing={editing} />;
	return (
		<BlockKindView
			block={block}
			editing={editing}
			frontmatterLibraryOpen={frontmatterLibraryOpen}
			frontmatterCandidate={frontmatterCandidate}
			onFrontmatterLibraryOpenChange={onFrontmatterLibraryOpenChange}
		/>
	);
}

function EditableParagraphLinesBody({
	block,
	snapshot,
	editing,
	unitActions,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
	unitActions?: ComposerUnitActions;
}): React.ReactElement {
	const lines = block.units.filter((unit) => unit.unitKind === 'paragraph-line');
	return (
		<div className="pk-composer-paragraph-lines" data-block-id={block.blockId}>
			{lines.map((line) => {
				const anchor = { unitId: line.unitId, from: line.from, to: line.to };
				return (
					<React.Fragment key={line.unitId}>
						{unitActions?.renderBefore?.(anchor)}
						<div
							className="pk-composer-paragraph__line"
							data-unit-id={line.unitId}
							data-unit-action-active={unitActions?.activeUnitId === line.unitId || undefined}
							data-unit-collection-anchor={(
								unitActions?.collectionActive &&
								unitActions.collectionAnchorUnitId === line.unitId
							) || undefined}
							onPointerEnter={() => unitActions?.onPointerEnter(anchor)}
							onPointerLeave={unitActions?.onPointerLeave}
							onFocusCapture={() => unitActions?.onFocus(anchor)}
						>
							<EditableText
								blockId={block.blockId}
								unitId={line.unitId}
								text={snapshot.sourceText.slice(line.from, line.to)}
								sourceFrom={line.from}
								editable={editing}
								resolveRange={() => {
									const current = locateBlock(snapshot, block.blockId);
									const currentLine = current?.units.find(
										(unit) => unit.unitId === line.unitId && unit.unitKind === 'paragraph-line',
									);
									if (!current || !currentLine) return null;
									return {
										from: currentLine.from,
										to: currentLine.to,
										current: snapshot.sourceText.slice(currentLine.from, currentLine.to),
										target: {
											kind: 'unit' as const,
											blockId: current.blockId,
											unitId: currentLine.unitId,
										},
									};
								}}
								className="pk-composer-prose pk-composer-paragraph__line-text"
							/>
						</div>
						{unitActions?.render(anchor)}
					</React.Fragment>
				);
			})}
		</div>
	);
}

function EditableTextBody({
	block,
	snapshot,
	editing,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
}): React.ReactElement {
	const isHeading = block.kind === 'heading';
	const isQuote = block.kind === 'quote';
	const textStart = isHeading ? headingTextStart(snapshot.sourceText, block.source) : block.source.from;
	const text = snapshot.sourceText.slice(textStart, block.source.to);
	const hiddenSourceRanges = isQuote ? quoteMarkerRanges(snapshot.sourceText, block.source.from, block.source.to) : undefined;
	const blockId = block.blockId;
	// Resolve against the CURRENT snapshot at flush time — ids/offsets shift per
	// commit, so re-locate by the stable kind-ordinal prefix (matchBlocks fallback).
	const resolveRange = () => {
		const current = locateBlock(snapshot, blockId);
		if (!current) return null;
		const from = isHeading ? headingTextStart(snapshot.sourceText, current.source) : current.source.from;
		return {
			from,
			to: current.source.to,
			current: snapshot.sourceText.slice(from, current.source.to),
			target: { kind: 'block' as const, blockId: current.blockId },
		};
	};
	const className = isHeading
		? `pk-composer-heading pk-heading-${block.renderModel.level ?? 1}`
		: blockBodyClass(block.kind);
	return (
		<EditableText
			blockId={block.blockId}
			text={text}
			sourceFrom={textStart}
			hiddenSourceRanges={hiddenSourceRanges}
			editable={editing}
			resolveRange={resolveRange}
			className={className}
		/>
	);
}

function quoteMarkerRanges(sourceText: string, from: number, to: number): HiddenSourceRange[] {
	const ranges: HiddenSourceRange[] = [];
	let cursor = from;
	while (cursor < to) {
		const lineEnd = sourceText.indexOf('\n', cursor);
		const end = lineEnd >= 0 && lineEnd < to ? lineEnd : to;
		const line = sourceText.slice(cursor, end);
		const marker = /^>\s?/.exec(line);
		if (marker) ranges.push({ from: cursor, to: cursor + marker[0].length });
		if (lineEnd < 0 || lineEnd >= to) break;
		cursor = lineEnd + 1;
	}
	return ranges;
}

function EditableListBody({
	block,
	snapshot,
	editing,
	listItemCandidates,
	candidateRuntime,
	candidateRegistry,
	aiSnapshot,
	unitActions,
	onInvoke,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
	listItemCandidates: readonly ComposerCandidate[];
	candidateRuntime?: ComposerCandidateRuntimePort;
	candidateRegistry: CandidateRendererRegistry;
	aiSnapshot: ComposerContextSnapshot;
	unitActions?: ComposerUnitActions;
	onInvoke: (
		d: ComposerActionDescriptor,
		snapshot: ComposerContextSnapshot,
		instruction?: string,
		placement?: ComposerInvocationPlacement,
	) => void;
}): React.ReactElement {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const listRef = React.useRef<HTMLDivElement | null>(null);
	const pendingFocusIndexRef = React.useRef<number | null>(null);
	const pendingIndentIndexRef = React.useRef<number | null>(null);
	const allItems = block.units.filter((u) => u.unitKind === 'list-item');
	const items = allItems.filter((u) => !u.parentUnitId);
	const candidatesAt = (index: number): readonly ComposerCandidate[] =>
		listItemCandidates.filter(
			(candidate) => listItemInsertionIndex(candidate, items.length) === index,
		);
	const renderCandidatesAt = (index: number): React.ReactElement[] => {
		if (!candidateRuntime) return [];
		return candidatesAt(index).map((candidate) => (
			<div
				key={candidate.candidateId}
				className="pk-composer-list__candidate-row"
				data-chrome="true"
			>
				<ComposerCandidateHost
					runtime={candidateRuntime}
					candidateId={candidate.candidateId}
					registry={candidateRegistry}
				/>
			</div>
		));
	};
	const insertListItem = async (index: number, kind: DirectListItemKind) => {
		if (!hub) return;
		await chrome.flushAll();
		const currentSnapshot = chrome.runtime.session?.snapshot ?? snapshot;
		const currentBlockId =
			matchBlocks(snapshot.blocks, currentSnapshot.blocks)
				.find((match) => match.oldBlockId === block.blockId)
				?.newBlockId
			?? block.blockId;
		const built = buildInsertListItemOps(currentSnapshot, currentBlockId, index, kind);
		if (!built) return;
		pendingFocusIndexRef.current = index;
		try {
			await hub.commit({
				origin: 'direct',
				label: chrome.config.chrome.actions.insertBelow,
				operations: built.operations,
				target: built.target,
				expectedBlockDelta: built.expectedBlockDelta,
			});
		} catch {
			pendingFocusIndexRef.current = null;
		}
	};
	const indentListItem = async (itemIndex: number, outdent: boolean) => {
		if (!hub) return;
		await chrome.flushAll();
		const currentSnapshot = chrome.runtime.session?.snapshot ?? snapshot;
		const currentBlockId =
			matchBlocks(snapshot.blocks, currentSnapshot.blocks)
				.find((match) => match.oldBlockId === block.blockId)
				?.newBlockId
			?? block.blockId;
		const currentBlock = currentSnapshot.blocks.find(
			(candidate) => candidate.blockId === currentBlockId,
		);
		const currentItems = currentBlock?.units.filter((unit) => unit.unitKind === 'list-item') ?? [];
		const currentUnit = currentItems[itemIndex];
		if (!currentUnit) return;
		const built = buildIndentListItemOps(
			currentSnapshot,
			currentBlockId,
			currentUnit.unitId,
			outdent,
		);
		if (!built?.handled) return;
		if (built.operations.length === 0) return;
		pendingIndentIndexRef.current = itemIndex;
		try {
			await hub.commit({
				origin: 'direct',
				label: chrome.config.chrome.actions.directEdit,
				operations: built.operations,
				target: built.target,
				expectedBlockDelta: built.expectedBlockDelta,
			});
		} catch {
			pendingIndentIndexRef.current = null;
		}
	};
	React.useLayoutEffect(() => {
		const index = pendingFocusIndexRef.current;
		const indentIndex = pendingIndentIndexRef.current;
		const root = listRef.current;
		const ownerWindow = root?.ownerDocument.defaultView;
		if (
			(index === null || index === undefined)
			&& (indentIndex === null || indentIndex === undefined)
		) return;
		if (!root || !ownerWindow) return;
		const frame = ownerWindow.requestAnimationFrame(() => {
			const rows = Array.from(
				root.querySelectorAll<HTMLElement>('.pk-composer-list__row'),
			);
			const topRows = rows.filter((row) => row.dataset.listTopLevel === 'true');
			const row = indentIndex === null || indentIndex === undefined
				? topRows[index ?? 0]
				: rows[indentIndex];
			const editable = row?.querySelector<HTMLElement>('.pk-composer-editable');
			if (!editable) return;
			pendingFocusIndexRef.current = null;
			pendingIndentIndexRef.current = null;
			editable.focus();
			const selection = editable.ownerDocument.getSelection();
			if (!selection) return;
			selection.selectAllChildren(editable);
			selection.collapseToEnd();
		});
		return () => ownerWindow.cancelAnimationFrame(frame);
	}, [allItems.length, items.length, snapshot.revision]);
	const toggle = async (unitId: string) => {
		if (!hub) return;
		const built = buildToggleTaskOps(snapshot, block.blockId, unitId);
		if (!built) return;
		try {
			await hub.commit({
				origin: 'direct',
				label: chrome.config.chrome.actions.directEdit,
				operations: built.operations,
				target: built.target,
				expectedBlockDelta: built.expectedBlockDelta,
			});
		} catch {
			// conflict — surfaced via staleness
		}
	};
	return (
		<div ref={listRef} className="pk-composer-list" data-block-id={block.blockId}>
			{allItems.map((unit, itemIndex) => {
				const topIndex = items.findIndex((candidate) => candidate.unitId === unit.unitId);
				const topLevel = topIndex >= 0;
				const depth = listItemDepth(unit, allItems);
				const contentStart = listItemContentStart(snapshot.sourceText, unit);
				const contentEnd = listItemOwnContentEnd(snapshot.sourceText, unit, allItems);
				const slice = snapshot.sourceText.slice(unit.from, contentStart);
				const checkbox = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(slice);
				const text = snapshot.sourceText.slice(contentStart, contentEnd);
				const actionAnchor = {
					unitId: unit.unitId,
					from: contentStart,
					to: contentEnd,
					depth,
				};
				return (
					<React.Fragment key={unit.unitId}>
						{topLevel ? renderCandidatesAt(topIndex) : null}
						{unitActions?.renderBefore?.(actionAnchor)}
						<div
							className="pk-composer-list__row"
							data-unit-id={unit.unitId}
							data-list-top-level={topLevel ? 'true' : 'false'}
							data-list-depth={depth}
							data-unit-action-active={unitActions?.activeUnitId === unit.unitId || undefined}
							data-unit-collection-anchor={(
								unitActions?.collectionActive &&
								unitActions.collectionAnchorUnitId === unit.unitId
							) || undefined}
							style={{ '--pk-composer-row-depth': depth } as React.CSSProperties}
							onPointerEnter={() => unitActions?.onPointerEnter(actionAnchor)}
							onPointerLeave={unitActions?.onPointerLeave}
							onFocusCapture={() => unitActions?.onFocus(actionAnchor)}
						>
							{checkbox ? (
								<input
									type="checkbox"
									className="pk-composer-task-check"
									checked={checkbox[2] !== ' '}
									disabled={!editing || !hub}
									onChange={() => void toggle(unit.unitId)}
								/>
							) : (
								<span className="pk-composer-list__bullet" aria-hidden>
									•
								</span>
							)}
							<EditableText
								blockId={block.blockId}
								unitId={unit.unitId}
								text={text}
								sourceFrom={contentStart}
								editable={editing}
								resolveRange={() => {
									const current = locateBlock(snapshot, block.blockId);
									const u = current?.units.find((x) => x.unitId === unit.unitId);
									if (!current || !u) return null;
									const currentItems = current.units.filter(
										(candidate) => candidate.unitKind === 'list-item',
									);
									const from = listItemContentStart(snapshot.sourceText, u);
									const to = listItemOwnContentEnd(
										snapshot.sourceText,
										u,
										currentItems,
									);
									return {
										from,
										to,
										current: snapshot.sourceText.slice(from, to),
										target: { kind: 'unit' as const, blockId: current.blockId, unitId: u.unitId },
									};
								}}
								className="pk-composer-list__text"
								onInsertParagraph={
									editing && hub && topLevel
										? () => insertListItem(topIndex + 1, checkbox ? 'task' : 'list')
										: undefined
								}
								onIndentListItem={
									editing && hub
										? (outdent) => {
												void indentListItem(itemIndex, outdent);
												return true;
											}
										: undefined
								}
							/>
						</div>
						{unitActions?.render(actionAnchor)}
					</React.Fragment>
				);
			})}
			{renderCandidatesAt(items.length)}
		</div>
	);
}

function listItemDepth(
	unit: ComposerBlock['units'][number],
	items: readonly ComposerBlock['units'][number][],
): number {
	let depth = 0;
	let parentId = unit.parentUnitId;
	const seen = new Set<string>();
	while (parentId && !seen.has(parentId)) {
		seen.add(parentId);
		depth += 1;
		parentId = items.find((candidate) => candidate.unitId === parentId)?.parentUnitId;
	}
	return depth;
}

function collectionAnchorElement(
	blockElement: HTMLElement | null,
	unitId: string,
): HTMLElement | null {
	if (!blockElement) return null;
	return blockElement.querySelector<HTMLElement>(
		`:is(.pk-composer-list__row, .pk-composer-paragraph__line)[data-unit-id="${CSS.escape(unitId)}"]`,
	);
}

function collectionActionAnchorForUnit(
	block: ComposerBlock,
	snapshot: ComposerDocumentSnapshot,
	unitId: string,
): ComposerUnitActionAnchor | null {
	if (block.kind === 'paragraph') {
		const unit = block.units.find(
			(candidate) => candidate.unitKind === 'paragraph-line' && candidate.unitId === unitId,
		);
		return unit
			? { unitId: unit.unitId, from: unit.from, to: unit.to }
			: null;
	}
	if (block.kind !== 'list' && block.kind !== 'task') return null;
	const items = block.units.filter((unit) => unit.unitKind === 'list-item');
	const unit = items.find((candidate) => candidate.unitId === unitId);
	if (!unit) return null;
	return {
		unitId: unit.unitId,
		from: listItemContentStart(snapshot.sourceText, unit),
		to: listItemOwnContentEnd(snapshot.sourceText, unit, items),
		depth: listItemDepth(unit, items),
	};
}

function closestVisibleCollectionAnchor(
	blockElement: HTMLElement,
	block: ComposerBlock,
	snapshot: ComposerDocumentSnapshot,
	scroller: HTMLElement,
	viewportY: number,
): ComposerUnitActionAnchor | null {
	const viewport = scroller.getBoundingClientRect();
	const blockRect = blockElement.getBoundingClientRect();
	if (blockRect.bottom <= viewport.top || blockRect.top >= viewport.bottom) return null;
	const rows = Array.from(
		blockElement.querySelectorAll<HTMLElement>(
			':is(.pk-composer-list__row, .pk-composer-paragraph__line)[data-unit-id]',
		),
	).filter((row) => {
		const rect = row.getBoundingClientRect();
		return rect.bottom > viewport.top && rect.top < viewport.bottom;
	});
	let closest: HTMLElement | null = null;
	let closestDistance = Number.POSITIVE_INFINITY;
	for (const row of rows) {
		const distance = Math.abs(row.getBoundingClientRect().top - viewportY);
		if (distance >= closestDistance) continue;
		closest = row;
		closestDistance = distance;
	}
	const unitId = closest?.dataset.unitId;
	return unitId ? collectionActionAnchorForUnit(block, snapshot, unitId) : null;
}

function listItemInsertionIndex(candidate: ComposerCandidate, itemCount: number): number {
	const envelope = candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (envelope?.resultKind !== 'list-item-patch') return itemCount;
	const index = (envelope.payload as ComposerListItemPatchPayload).insertionIndex;
	if (!Number.isInteger(index)) return itemCount;
	return Math.max(0, Math.min(itemCount, index));
}

// ── shared bits ─────────────────────────────────────────────────────────────

function StaleBanner({
	strings,
	onRevalidate,
}: {
	strings: ComposerConfig['strings'];
	onRevalidate?: () => void;
}): React.ReactElement {
	return (
		<div className="pk-composer-stale" role="status">
			<span className="pk-composer-stale__title">{strings.staleTitle}</span>
			<span className="pk-composer-stale__hint">{strings.staleHint}</span>
			{onRevalidate && (
				<Button variant="secondary" size="sm" onClick={onRevalidate} className="pk-composer-stale__action">
					<RefreshCw size={13} />
					{strings.revalidate}
				</Button>
			)}
		</div>
	);
}

function StateBanner({
	title,
	hint,
	tone,
}: {
	title: string;
	hint: string;
	tone?: 'error';
}): React.ReactElement {
	return (
		<div className="pk-composer-state" data-tone={tone}>
			<span className="pk-composer-state__title">{title}</span>
			{hint && <span className="pk-composer-state__hint">{hint}</span>}
		</div>
	);
}

function foldLabel(config: ComposerConfig, isHeading: boolean, folded: boolean): string {
	const s = config.strings;
	if (isHeading) return folded ? s.expandSection : s.collapseSection;
	return folded ? s.expandBlock : s.collapseBlock;
}

function blockBodyClass(kind: string): string {
	if (kind === 'quote' || kind === 'callout') return 'pk-composer-quote';
	return 'pk-composer-prose';
}

/**
 * INT-1 — stable React keys across revisions.
 *
 * Block ids track content + position (WP1), so they change on every commit.
 * Keying rows by blockId therefore remounts the just-edited block on each burst
 * commit: the focused contenteditable is torn down (focus falls to <body>) and
 * the mass DOM churn collapses the scroll container to the document bottom
 * (measured 0 → 2292). Migrate a persistent key across revisions via
 * `matchBlocks` (fingerprint → kind-ordinal) so a surviving block reuses the
 * same React key — its subtree, DOM node, focus and caret all survive the
 * commit. New blocks mint a fresh key; removed blocks release theirs.
 *
 * Deriving-from-props during render is intentional (React's blessed alternative
 * to a synced effect); it is idempotent per `blocks` identity (early return when
 * the reference is unchanged), so StrictMode double-invocation is safe.
 */
function useStableBlockKeys(blocks: readonly ComposerBlock[]): (blockId: string) => string {
	const ref = React.useRef<{ prevBlocks: readonly ComposerBlock[]; keyByBlockId: Map<string, string>; seq: number }>({
		prevBlocks: [],
		keyByBlockId: new Map(),
		seq: 0,
	});
	const st = ref.current;
	if (st.prevBlocks !== blocks) {
		const nextMap = new Map<string, string>();
		let seq = st.seq;
		for (const match of matchBlocks(st.prevBlocks, blocks)) {
			const carried = match.oldBlockId ? st.keyByBlockId.get(match.oldBlockId) : undefined;
			nextMap.set(match.newBlockId, carried ?? `pk-block-${seq++}`);
		}
		ref.current = { prevBlocks: blocks, keyByBlockId: nextMap, seq };
	}
	return (blockId: string) => ref.current.keyByBlockId.get(blockId) ?? blockId;
}

/** The scrolling ancestor of the shell (`.peak-composer-root`, `overflow:auto`). */
function scrollerOf(shell: HTMLElement | null): HTMLElement | null {
	return shell?.closest<HTMLElement>('.peak-composer-root') ?? null;
}

/**
 * INT-1 — intentional programmatic scrolls (locate / history "定位" etc.) mark
 * their scroller here so the editing scroll-guard lets them through even while
 * a contenteditable owns the keyboard.
 */
const scrollIntentAt = new WeakMap<Element, number>();

function markScrollIntent(el: Element | null): void {
	if (!el) return;
	const win = el.ownerDocument.defaultView ?? window;
	scrollIntentAt.set(el, win.performance.now());
}

const historyLocateFlashCleanup = new WeakMap<HTMLElement, () => void>();

function locateAndFlashComposerBlock(shell: HTMLElement | null, blockId: string): boolean {
	const block = shell?.querySelector<HTMLElement>(
		`[data-block-id="${CSS.escape(blockId)}"]`,
	);
	if (!block) return false;
	markScrollIntent(scrollerOf(shell));
	block.scrollIntoView({ block: 'center', behavior: 'smooth' });
	flashLocatedComposerBlock(block);
	return true;
}

function unfoldForDocumentLocation(
	foldStore: ComposerFoldStore,
	blocks: readonly ComposerBlock[],
	targetBlockId: string,
): void {
	const folded = foldStore.getState().folded;
	const toUnfold = [targetBlockId];
	for (const block of blocks) {
		if (block.kind !== 'heading' || !folded.has(block.blockId)) continue;
		if (sectionBlockIds(blocks, block.blockId).includes(targetBlockId)) {
			toUnfold.push(block.blockId);
		}
	}
	foldStore.getState().unfold(toUnfold);
}

function locateAndFlashComposerLocation(
	shell: HTMLElement,
	location: ResolvedComposerSourceLocation,
): boolean {
	const block = shell.querySelector<HTMLElement>(
		`.pk-composer-block[data-block-id="${CSS.escape(location.block.blockId)}"]`,
	);
	if (!block) return false;
	const frontmatter = location.frontmatterKey
		? block.querySelector<HTMLElement>(
				`[data-frontmatter-key="${CSS.escape(location.frontmatterKey)}"]`,
			)
		: null;
	const unit = location.unit
		? block.querySelector<HTMLElement>(
				`[data-unit-id="${CSS.escape(location.unit.unitId)}"]`,
			)
		: null;
	const exactLink = Array.from(
		block.querySelectorAll<HTMLElement>('[data-src-link-from]'),
	).find((element) => (
		Number(element.dataset.srcLinkFrom) === location.sourceFrom
			&& Number(element.dataset.srcLinkTo) === location.sourceTo
	));
	const exactRuns = Array.from(
		block.querySelectorAll<HTMLElement>('[data-src-text-from]'),
	).filter((element) => Number(element.dataset.srcTextFrom) === location.sourceFrom);
	const target = frontmatter ?? exactLink ?? exactRuns.at(-1) ?? unit ?? block;
	markScrollIntent(scrollerOf(shell));
	target.scrollIntoView({ block: 'center', behavior: 'smooth' });
	flashDocumentLocation(target);
	return true;
}

const documentLocationFlashCleanup = new WeakMap<HTMLElement, () => void>();

function flashDocumentLocation(target: HTMLElement): void {
	documentLocationFlashCleanup.get(target)?.();
	target.classList.remove('pk-document-reveal-flash');
	void target.offsetWidth;
	const cleanup = () => {
		target.classList.remove('pk-document-reveal-flash');
		target.removeEventListener('animationend', cleanup);
		documentLocationFlashCleanup.delete(target);
	};
	documentLocationFlashCleanup.set(target, cleanup);
	target.addEventListener('animationend', cleanup);
	target.classList.add('pk-document-reveal-flash');
}

function flashLocatedComposerBlock(block: HTMLElement): void {
	historyLocateFlashCleanup.get(block)?.();
	block.classList.remove('pk-history-locate-flash');
	void block.offsetWidth;
	const cleanup = () => {
		block.classList.remove('pk-history-locate-flash');
		block.removeEventListener('animationend', cleanup);
		historyLocateFlashCleanup.delete(block);
	};
	historyLocateFlashCleanup.set(block, cleanup);
	block.addEventListener('animationend', cleanup);
	block.classList.add('pk-history-locate-flash');
}

/**
 * INT-1 — snap back a commit-driven caret-reveal while editing.
 *
 * `matchBlocks`-stable keys keep the edited leaf mounted (focus + caret survive
 * a burst commit) and block-relative run keys stop downstream blocks from
 * churning their DOM. What remains is a single NATIVE caret-reveal the browser
 * fires on the reparse re-render: it jumps the scroll container to the document
 * bottom (measured 120 → 2592), driven by the user agent (not any JS scroll
 * API), and it fires before any commit-keyed effect can arm — so a timing-armed
 * hold is inherently racy.
 *
 * The guard therefore discriminates by SCROLL BUDGET + caret visibility, not by
 * timing alone (the reveal starts ~11ms after the triggering keystroke/wheel and
 * completes in ~135ms — inside any usable gesture window):
 *
 *   - a wheel gesture authorizes about the distance it asked for (`deltaY` plus
 *     slack); momentum keeps emitting wheel events, so real scrolling keeps its
 *     budget topped up — while the reveal's ~2200px burn exhausts a keystroke's
 *     zero budget immediately;
 *   - a scrollbar drag / touch drag authorizes freely between pointer/touch
 *     down-in-gutter and up;
 *   - an intent-marked programmatic scroll (locate) authorizes its animation;
 *   - everything else, while a contenteditable in this shell owns the keyboard,
 *     is snapped back IF the caret was already visible at the anchor — the
 *     spurious reveal's exact signature (it scrolls to the document bottom with
 *     the caret mid-viewport); a legitimate caret-reveal (typing/arrowing past
 *     the fold) has the caret OUTSIDE the anchored viewport and passes.
 *
 * Passive reading (no editable focused) is never touched.
 */
function useEditingScrollGuard(
	shellRef: React.RefObject<HTMLElement | null>,
	gestureWindowMs: number,
): void {
	const lastTop = React.useRef(0);
	const budget = React.useRef(0);
	const budgetAt = React.useRef(-Infinity);
	const freeScroll = React.useRef(false); // scrollbar/touch drag in progress
	const restoring = React.useRef(false);

	React.useEffect(() => {
		// Resolve the scroller inside the effect (the shell ref is null on first
		// render, so a render-time lookup would miss it).
		const scroller = scrollerOf(shellRef.current);
		const shell = shellRef.current;
		if (!scroller || !shell) return;
		const win = shell.ownerDocument.defaultView ?? window;
		const doc = shell.ownerDocument;
		lastTop.current = scroller.scrollTop;

		// Budget slack: wheel hardware/OS acceleration can deliver more pixels than
		// deltaY nominally asked for; 3× keeps real scrolling smooth while staying
		// orders of magnitude below the reveal's full-document burn.
		const BUDGET_SLACK = 3;
		const onWheel = (ev: WheelEvent) => {
			const now = win.performance.now();
			// Stale budget evaporates after the gesture window (prevents slow
			// accumulation across unrelated wheel ticks minutes apart).
			if (now - budgetAt.current >= Math.max(0, gestureWindowMs)) budget.current = 0;
			budget.current += (Math.abs(ev.deltaY) + Math.abs(ev.deltaX)) * BUDGET_SLACK;
			budgetAt.current = now;
		};
		const endFreeScroll = () => {
			freeScroll.current = false;
		};
		const onPointerDown = (ev: PointerEvent) => {
			// Scrollbar drag: the pointer lands in the scroller's own gutter (right of
			// / below the client box). Content clicks stay unmarked.
			const r = scroller.getBoundingClientRect();
			const inVGutter = ev.clientX >= r.left + scroller.clientWidth;
			const inHGutter = ev.clientY >= r.top + scroller.clientHeight;
			if (ev.target === scroller && (inVGutter || inHGutter)) {
				freeScroll.current = true;
				doc.addEventListener('pointerup', endFreeScroll, { once: true });
			}
		};
		const onTouchStart = () => {
			freeScroll.current = true;
			doc.addEventListener('touchend', endFreeScroll, { once: true });
		};
		const isEditing = (): boolean => {
			const active = shell.ownerDocument.activeElement;
			return active instanceof HTMLElement && shell.contains(active) && active.isContentEditable;
		};
		/**
		 * Would the caret already be visible with the container at `top`? The INT-1
		 * reveal scrolls to the document bottom although the caret is mid-viewport;
		 * a legitimate reveal always has the caret outside the anchored viewport.
		 * Fail-open: no measurable caret rect ⇒ never fight what we cannot judge.
		 */
		const caretVisibleAt = (top: number): boolean => {
			const sel = shell.ownerDocument.getSelection();
			if (!sel || sel.rangeCount === 0) return false;
			const range = sel.getRangeAt(0);
			let rect = range.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) {
				const rects = range.getClientRects();
				if (rects.length > 0) rect = rects[0];
				else {
					const node = sel.anchorNode;
					const el = node instanceof Element ? node : node?.parentElement;
					if (!el) return false;
					rect = el.getBoundingClientRect();
				}
			}
			const scrollerRect = scroller.getBoundingClientRect();
			const caretDocTop = rect.top - scrollerRect.top + scroller.scrollTop;
			return caretDocTop >= top && caretDocTop + rect.height <= top + scroller.clientHeight;
		};
		const onScroll = () => {
			if (restoring.current) {
				restoring.current = false;
				lastTop.current = scroller.scrollTop;
				return;
			}
			const now = win.performance.now();
			const window_ = Math.max(0, gestureWindowMs);
			const delta = Math.abs(scroller.scrollTop - lastTop.current);
			// Authorized sources, in order: active scrollbar/touch drag; un-expired
			// wheel budget covering this delta; intent-marked programmatic scroll
			// (extended while its smooth animation keeps producing events).
			const recentIntent = now - (scrollIntentAt.get(scroller) ?? -Infinity) < window_;
			const budgetFresh = now - budgetAt.current < window_;
			let authorized = freeScroll.current || recentIntent;
			if (!authorized && budgetFresh && budget.current >= delta) {
				budget.current -= delta;
				budgetAt.current = now; // scrolling continues the gesture
				authorized = true;
			}
			// While editing, an unauthorized scroll whose caret was already visible
			// at the anchor is the spurious caret-reveal — snap back (frame-by-frame:
			// the reveal animates over ~16 small deltas, so every event snaps).
			// Authorized scrolls, passive reading, and true out-of-view reveals
			// track normally.
			if (!authorized && isEditing() && caretVisibleAt(lastTop.current)) {
				restoring.current = true;
				scroller.scrollTop = lastTop.current;
				return;
			}
			if (recentIntent) scrollIntentAt.set(scroller, now);
			lastTop.current = scroller.scrollTop;
		};

		scroller.addEventListener('scroll', onScroll, { passive: true });
		scroller.addEventListener('wheel', onWheel, { passive: true });
		scroller.addEventListener('touchstart', onTouchStart, { passive: true });
		scroller.addEventListener('pointerdown', onPointerDown, { passive: true });
		return () => {
			scroller.removeEventListener('scroll', onScroll);
			scroller.removeEventListener('wheel', onWheel);
			scroller.removeEventListener('touchstart', onTouchStart);
			scroller.removeEventListener('pointerdown', onPointerDown);
			doc.removeEventListener('pointerup', endFreeScroll);
			doc.removeEventListener('touchend', endFreeScroll);
		};
	}, [shellRef, gestureWindowMs]);
}

/**
 * The block id currently holding keyboard focus inside this shell, or null. A
 * pasted image inserts AFTER this block (null ⇒ append at document end).
 */
function focusedBlockId(container: HTMLElement | null): string | null {
	if (!container) return null;
	const active = container.ownerDocument.activeElement;
	if (!(active instanceof HTMLElement) || !container.contains(active)) return null;
	return active.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null;
}

/** Locate a block in the (possibly newer) snapshot by id or kind-ordinal prefix. */
function locateBlock(snapshot: ComposerDocumentSnapshot, blockId: string): ComposerBlock | undefined {
	const exact = snapshot.blocks.find((b) => b.blockId === blockId);
	if (exact) return exact;
	const prefix = blockId.split('-').slice(0, -1).join('-') + '-';
	return snapshot.blocks.find((b) => b.blockId.startsWith(prefix));
}

function makeBlockSnapshot(snapshot: ComposerDocumentSnapshot, block: ComposerBlock): ComposerContextSnapshot {
	return {
		documentId: snapshot.documentId,
		revision: snapshot.revision,
		target: { kind: 'block', blockId: block.blockId },
		targetSource: snapshot.sourceText.slice(block.source.from, block.source.to),
		nearby: {
			before: snapshot.sourceText.slice(Math.max(0, block.source.from - 400), block.source.from),
			after: snapshot.sourceText.slice(block.source.to, block.source.to + 400),
		},
	};
}

function ownsComposerFindShortcut(root: HTMLElement): boolean {
	const composerRoot = root.closest<HTMLElement>('.peak-composer-root');
	if (!composerRoot) return false;
	// A modal is a separate keyboard layer. In particular, Command Center owns
	// Mod+F while it is open; the active Composer leaf behind it must not open a
	// second find bar for the same key event.
	if (root.ownerDocument.querySelector('.modal-container .peak-command-center')) return false;
	const active = root.ownerDocument.activeElement;
	if (active && composerRoot.contains(active)) return true;
	const leaf = composerRoot.closest<HTMLElement>('.workspace-leaf');
	return Boolean(leaf?.classList.contains('mod-active'));
}

/** Block ids hidden because their owning heading section is folded. */
function hiddenBySections(blocks: readonly ComposerBlock[], folded: ReadonlySet<string>): Set<string> {
	const hidden = new Set<string>();
	for (const b of blocks) {
		if (b.kind !== 'heading' || !folded.has(b.blockId)) continue;
		for (const id of sectionBlockIds(blocks, b.blockId)) hidden.add(id);
	}
	return hidden;
}
