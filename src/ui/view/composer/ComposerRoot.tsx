import * as React from 'react';
import { useStore } from 'zustand';
import { RefreshCw } from 'lucide-react';
import {
	COMPOSER_METADATA_SUGGESTION_RENDERER_ID,
	sectionBlockIds,
	DEFAULT_TRANSACTION_CONFIG,
	type ComposerActionDescriptor,
	type ComposerBlock,
	type ComposerCandidate,
	type ComposerCandidateRuntimePort,
	type ComposerContextSnapshot,
	type ComposerDocumentSnapshot,
	type ComposerStateSource,
	type DocumentComposerState,
	type SelectionGuardReason,
	composerTargetBlockId,
} from '@/core/composer';
import {
	buildCommentSourceRef,
	buildMoveBlockOps,
	buildToggleTaskOps,
	POLISH_CAPABILITY_ID,
	SUGGEST_PROPERTIES_CAPABILITY_ID,
	headingTextStart,
	listItemContentStart,
	matchBlocks,
	originalTextForTextPatchCandidate,
	partitionSourceRange,
	pasteUrlIntoSelection,
	type HiddenSourceRange,
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
import { BlockRail } from './chrome/BlockRail';
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
import { UndoRedoBar } from './chrome/UndoRedoBar';
import { TransactionNotice } from './chrome/TransactionNotice';
import { BlockFindingPanel } from './chrome/BlockFindingPanel';
import { NewBlockDraft } from './chrome/NewBlockDraft';
import type { ComposerDisplayState } from './chrome/DisplayStateSwitch';
import { mapDomRangeToSource } from './chrome/selectionMapping';
import { firstClipboardImage } from './chrome/pasteImage';
import { containComposerEscape } from './escapeContainment';
import { IntelligenceSidecar } from './sidecar';
import { buildFocusRunContext, resolveRelatedFocus } from './sidecar/focusContext';
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
}

interface PanelState {
	blockId: string;
	panel: BlockPanelKind;
	pinned: boolean;
	range?: { from: number; to: number };
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
}: ComposerRootProps): React.ReactElement {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const subscribe = React.useCallback((cb: () => void) => source.subscribe(cb), [source]);
	const getSnapshot = React.useCallback(() => source.getState(), [source]);
	const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const [foldStore] = React.useState(createComposerFoldStore);
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

	const [flushers] = React.useState(() => new Set<() => Promise<void>>());
	const chromeValue = React.useMemo<ComposerChromeValue>(
		() => ({
			runtime,
			projection: resolveProjection(runtime),
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
	const [intelligenceOpen, setIntelligenceOpen] = React.useState(true);
	React.useEffect(() => {
		setActiveCommentId(null);
	}, [state.snapshot?.documentId]);
	// Sidecar controls legitimately take DOM focus. Preserve the last body block so
	// that clicking a Brief action does not silently downgrade its document context
	// to the whole note.
	const lastFocusedBlockIdRef = React.useRef<string | null>(null);
	const locateBlock = React.useCallback((blockId: string) => {
		const el = rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
		markScrollIntent(rootRef.current); // INT-1 guard: intentional scroll
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}, []);

	// WP9 §12.2 — resolve the REAL focused block from chrome focus so a Copilot run
	// freezes the block the user is on (not a document-level fallback). The DOM
	// lookup lives here (the chrome owns focus); the snapshot assembly is the pure
	// `buildFocusRunContext` (keeps the intelligence layer DOM-free).
	const currentSnapshot = state.snapshot;
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

	return (
		<ComposerChromeProvider value={chromeValue}>
			<div
				ref={rootRef}
					className="peak-design-root peak-composer-root"
					data-with-sidecar={intelligence ? 'true' : undefined}
					onKeyDown={containComposerEscape}
				>
					<div className="pk-composer-main" onFocusCapture={onComposerBodyFocusCapture}>
					<ComposerBody
						state={state}
						config={config}
						foldStore={foldStore}
						onRevalidate={onRevalidate}
						intelligence={intelligence}
						intelligenceOpen={intelligenceOpen}
						onIntelligenceOpen={setIntelligenceOpen}
						activeCommentId={activeCommentId}
						onActiveComment={setActiveCommentId}
					/>
				</div>
				{intelligence && (
					<IntelligenceSidecar
						runtime={intelligence}
						hub={runtime.hub}
						documentFilePath={currentSnapshot.filePath}
						open={intelligenceOpen}
						onOpenChange={setIntelligenceOpen}
						onLocate={locateBlock}
						onLocateComment={(commentId, blockId) => {
							setActiveCommentId(commentId);
							locateBlock(blockId);
						}}
						onOpenSource={(path) => onOpenLink?.('vault', path)}
						getFocusedBlockId={getFocusedBlockId}
						resolveFocusContext={resolveFocusContext}
						resolveRelatedFocus={resolveFocus}
					/>
				)}
			</div>
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
	onIntelligenceOpen?: (open: boolean) => void;
	activeCommentId?: string | null;
	onActiveComment?: (commentId: string | null) => void;
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
	onIntelligenceOpen = () => undefined,
	activeCommentId = null,
	onActiveComment = () => undefined,
}: BodyProps): React.ReactElement {
	const chrome = useComposerChrome();
	const { runtime, projection } = chrome;
	const hub = runtime.hub;
	const snapshot = state.snapshot as ComposerDocumentSnapshot;
	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const workspaceRef = React.useRef<HTMLDivElement | null>(null);

	const [displayState, setDisplayState] = React.useState<ComposerDisplayState>(hub ? 'work' : 'clean');
	const [panel, setPanel] = React.useState<PanelState | null>(null);
	const [commentDraft, setCommentDraft] = React.useState<CommentDraftTarget | null>(null);
	const [commentRailOpen, setCommentRailOpen] = React.useState(true);
	const [drag, setDrag] = React.useState<DragState | null>(null);
	const [hasSelection, setHasSelection] = React.useState(false);
	const [guard, setGuard] = React.useState<string | null>(null);
	const guardTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const setCommentSurfaceOpen = React.useCallback((open: boolean) => {
		setCommentRailOpen(open);
		if (open) return;
		setCommentDraft(null);
		onActiveComment(null);
	}, [onActiveComment]);
	const setDisplayStateWithComments = React.useCallback((next: ComposerDisplayState) => {
		setDisplayState(next);
		if (next === 'clean') setCommentSurfaceOpen(false);
	}, [setCommentSurfaceOpen]);

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

	const editing = displayState !== 'clean' && Boolean(hub);
	useCrossBlockTextSelection(containerRef, editing);
	// Comments are an on-demand reading layer, not editing chrome. Clean mode
	// enters with the rail closed; the toolbar can still open existing threads
	// without enabling source edits or new selection comments.
	const commentSurfaceVisible = commentRailOpen;

	const showGuard = (reason: SelectionGuardReason) => {
		const g = config.chrome.selection.guards;
		const message =
			reason === 'code-block-rich-format'
				? g.codeBlockRichFormat
				: reason === 'cross-structure-link'
					? g.crossStructureLink
					: g.emptySelection;
		setGuard(message);
		if (guardTimer.current) clearTimeout(guardTimer.current);
		guardTimer.current = setTimeout(() => setGuard(null), 3200);
	};

	const invoke = (descriptor: ComposerActionDescriptor, snap: ComposerContextSnapshot, instruction?: string) => {
		try {
			projection.invoke(descriptor.capabilityId, snap, instruction ? { instruction } : undefined);
		} catch {
			// Only a real (mis-wired) port can land here — the stub projects no
			// actions, so nothing invokable renders against it.
		}
	};

	// ── drag reorder (owner-scoped pointer capture, drop commits moveBlock) ──
	const startDrag = (blockId: string) => (ev: React.PointerEvent<HTMLButtonElement>) => {
		if (!hub) return;
		ev.preventDefault();
		const rootEl = containerRef.current;
		if (!rootEl) return;
		const doc = rootEl.ownerDocument;
		setDrag({ blockId, dropIndex: null });

		const indexAt = (clientY: number): number => {
			const rows = Array.from(rootEl.querySelectorAll<HTMLElement>('.pk-composer-block'));
			for (let i = 0; i < rows.length; i++) {
				const r = rows[i].getBoundingClientRect();
				if (clientY < r.top + r.height / 2) return i;
			}
			return rows.length;
		};
		const move = (pe: PointerEvent) => setDrag({ blockId, dropIndex: indexAt(pe.clientY) });
		const up = async (pe: PointerEvent) => {
			doc.removeEventListener('pointermove', move);
			doc.removeEventListener('pointerup', up);
			const index = indexAt(pe.clientY);
			setDrag(null);
			const built = buildMoveBlockOps(snapshot, blockId, index);
			if (!built) return;
			try {
				await hub.commit({
					origin: 'direct',
					label: config.chrome.actions.drag,
					operations: built.operations,
					target: built.target,
					expectedBlockDelta: built.expectedBlockDelta,
				});
			} catch {
				// conflict — surfaced via lifecycle staleness
			}
		};
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
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
				onIntelligenceOpen={onIntelligenceOpen}
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
			{state.status === 'stale' && <StaleBanner strings={config.strings} onRevalidate={onRevalidate} />}
			<AddFrontmatterEntry editing={editing} />
			<div className="pk-composer-blocks">
				{visibleBlocks.map((b, i) => (
					<React.Fragment key={stableKey(b.blockId)}>
						<ComposerBlockRow
							block={b}
							previousBlock={visibleBlocks[i - 1]}
							snapshot={snapshot}
							config={config}
							foldStore={foldStore}
							editing={editing}
							displayState={displayState}
							findings={findings.filter((finding) => composerTargetBlockId(finding.target) === b.blockId)}
							onAskFinding={(finding) => {
								if (!intelligence) return;
								intelligence.session.selectSurface('copilot');
								intelligence.session.openSession(finding.body?.title ?? finding.reason, []);
								onIntelligenceOpen(true);
							}}
							onConfirmFinding={(finding) => intelligence?.findings.consume(finding.findingId)}
							onDismissFinding={(finding) => intelligence?.findings.dismiss(finding.findingId, 'body')}
							panel={panel?.blockId === b.blockId ? panel : null}
							setPanel={setPanel}
							onInsertBelow={
								hub && editing
									? () => setPanel((current) =>
											current?.blockId === b.blockId &&
											current.panel === 'insert-menu' &&
											current.pinned
												? null
												: { blockId: b.blockId, panel: 'insert-menu', pinned: true })
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
				))}
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
						}
					: undefined}
			/>
			</div>
		</>
	);
}

// ── block row ───────────────────────────────────────────────────────────────

const TEXT_EDIT_KINDS = new Set(['paragraph', 'heading', 'quote', 'callout']);

function ComposerBlockRow({
	block,
	previousBlock,
	snapshot,
	config,
	foldStore,
	editing,
	displayState,
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
}: {
	block: ComposerBlock;
	previousBlock?: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
	editing: boolean;
	displayState: ComposerDisplayState;
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
	onInvoke: (d: ComposerActionDescriptor, snap: ComposerContextSnapshot, instruction?: string) => void;
	activeCommentId: string | null;
	onActiveComment: (commentId: string | null) => void;
	onOpenComment: () => void;
}): React.ReactElement {
	const chrome = useComposerChrome();
	const folded = useStore(foldStore, (s) => s.folded.has(block.blockId));
	const bodyRef = React.useRef<HTMLDivElement | null>(null);
	const isHeading = block.kind === 'heading';
	const showSummary = !isHeading && folded;
	const raw = block.renderModel.raw;
	const aiSnapshot = makeBlockSnapshot(snapshot, block);
	const candidateRuntime = chrome.runtime.candidateRuntime;
	const candidate = useBlockCandidate(candidateRuntime, block.blockId);
	const candidateId = candidate?.candidateId ?? null;
	const hasInlineCandidate = Boolean(candidateRuntime && candidateId);
	const showInlineCandidate = displayState === 'all' && hasInlineCandidate;
	const frontmatterCandidate: FrontmatterCandidatePort | undefined =
		candidateRuntime && candidate && block.kind === 'frontmatter' &&
		candidateRuntime.rendererIdFor(candidate.candidateId) === COMPOSER_METADATA_SUGGESTION_RENDERER_ID
			? { runtime: candidateRuntime, candidate }
			: undefined;
	const imageCandidate =
		showInlineCandidate &&
		block.kind === 'image' &&
		candidateRuntime &&
		candidate &&
		candidateRuntime.rendererIdFor(candidate.candidateId)?.startsWith('composer.renderer.image');
	const replacesBlockBody = showInlineCandidate && !frontmatterCandidate && !imageCandidate;
	const spacing = blockSpacingRole(block, previousBlock);
	const ownPanel = panel?.blockId === block.blockId ? panel : null;
	const frontmatterLibraryOpen = ownPanel?.panel === 'vault-library';

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

	return (
		<div
			className="pk-composer-block"
			data-kind={block.kind}
			data-block-id={block.blockId}
			data-folded={folded}
			data-level={block.kind === 'heading' ? block.renderModel.level ?? 1 : undefined}
			data-spacing={spacing}
			data-drop-before={dropBefore || undefined}
			// FIX-1 F2: a mousedown in the row's dead zone (right of the text edge,
			// rail gutter padding, run gaps) targets this WRAPPER, so the browser
			// never focuses the contenteditable leaf — typing then goes to the
			// workspace. Forward such clicks: focus the nearest leaf and place the
			// caret at the closest text position (line-end for past-the-edge clicks).
			onMouseDown={editing ? (ev) => forwardBlockClickToEditable(ev.currentTarget, ev) : undefined}
			onMouseLeave={() => {
				if (ownPanel?.panel === 'instruction') setPanel(null);
			}}
		>
			<BlockRail
				folded={folded}
				foldLabel={foldLabel(config, isHeading, folded)}
				dragLabel={config.chrome.actions.drag}
				onToggle={() => foldStore.getState().toggle(block.blockId)}
				onDragStart={onDragStart}
				dragDisabledReason={onDragStart ? undefined : config.chrome.actions.disabledNoRuntime}
			/>
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
						<ComposerCandidateHost
							runtime={candidateRuntime!}
							candidateId={candidateId!}
							registry={chrome.candidateRegistry}
							resolveOriginalText={(c) => originalTextForTextPatchCandidate(snapshot, c)}
						/>
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
						onFrontmatterLibraryOpenChange={(open) => {
							if (open === frontmatterLibraryOpen) return;
							openPanel('vault-library');
						}}
					/>
					)}
					{imageCandidate ? (
						<div className="pk-composer-candidate-slot pk-composer-candidate-slot--image" data-chrome="true">
							<ComposerCandidateHost
								runtime={candidateRuntime!}
								candidateId={candidateId!}
								registry={chrome.candidateRegistry}
								resolveOriginalText={(c) => originalTextForTextPatchCandidate(snapshot, c)}
							/>
						</div>
					) : null}
					{editing && !hasInlineCandidate && (
					<BlockActionRow
						snapshot={aiSnapshot}
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
									onLocate={() => {
										markScrollIntent(scrollerOf(bodyRef.current)); // INT-1 guard
										bodyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
									}}
									onClose={() => {
										dismissPreview();
										setPanel(null);
									}}
								/>
							</div>
						)}
						onOpenPanel={openPanel}
						onPreviewPanel={previewPanel}
						openPanel={ownPanel?.panel ?? null}
						panelPinned={ownPanel?.pinned ?? false}
						writeDisabledReason={chrome.runtime.hub ? undefined : config.chrome.actions.disabledNoRuntime}
						hiddenQuickCapabilityIds={
							block.kind === 'frontmatter'
								? [SUGGEST_PROPERTIES_CAPABILITY_ID]
								: isTextActionBlock(block.kind)
									? [POLISH_CAPABILITY_ID]
									: undefined
						}
						onInvoke={(d, instruction) => onInvoke(d, aiSnapshot, instruction)}
					/>
				)}
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
 * The id of the pending (non-terminal) candidate anchored to this block, or null.
 * Subscribes to the candidate runtime so a freshly-invoked candidate appears
 * under the correct block and disappears on accept / discard.
 */
function useBlockCandidate(
	runtime: ComposerCandidateRuntimePort | undefined,
	blockId: string,
): ComposerCandidate | null {
	const [candidate, setCandidate] = React.useState<ComposerCandidate | null>(null);
	React.useEffect(() => {
		if (!runtime) {
			setCandidate(null);
			return;
		}
		return runtime.subscribe((candidates) => {
			const match = candidates.find(
				(c) =>
					anchorBlockOf(c) === blockId &&
					c.status !== 'accepted' &&
					c.status !== 'discarded',
			);
			setCandidate(match ?? null);
		});
	}, [runtime, blockId]);
	return candidate;
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
	onFrontmatterLibraryOpenChange,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
	frontmatterLibraryOpen: boolean;
	frontmatterCandidate?: FrontmatterCandidatePort;
	onFrontmatterLibraryOpenChange(open: boolean): void;
}): React.ReactElement {
	if (block.kind === 'list' || block.kind === 'task') {
		return <EditableListBody block={block} snapshot={snapshot} editing={editing} />;
	}
	if (block.kind === 'callout') {
		return <CalloutBlockView block={block} snapshot={snapshot} editing={editing} />;
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
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
}): React.ReactElement {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const items = block.units.filter((u) => u.unitKind === 'list-item' && !u.parentUnitId);
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
		<div className="pk-composer-list" data-block-id={block.blockId}>
			{items.map((unit) => {
				const contentStart = listItemContentStart(snapshot.sourceText, unit);
				const slice = snapshot.sourceText.slice(unit.from, unit.to);
				const checkbox = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(slice);
				const text = snapshot.sourceText.slice(contentStart, unit.to);
				return (
					<div key={unit.unitId} className="pk-composer-list__row">
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
								const from = listItemContentStart(snapshot.sourceText, u);
								return {
									from,
									to: u.to,
									current: snapshot.sourceText.slice(from, u.to),
									target: { kind: 'unit' as const, blockId: current.blockId, unitId: u.unitId },
								};
							}}
							className="pk-composer-list__text"
						/>
					</div>
				);
			})}
		</div>
	);
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

/** Block ids hidden because their owning heading section is folded. */
function hiddenBySections(blocks: readonly ComposerBlock[], folded: ReadonlySet<string>): Set<string> {
	const hidden = new Set<string>();
	for (const b of blocks) {
		if (b.kind !== 'heading' || !folded.has(b.blockId)) continue;
		for (const id of sectionBlockIds(blocks, b.blockId)) hidden.add(id);
	}
	return hidden;
}
