import * as React from 'react';
import { useStore } from 'zustand';
import { FileText, RefreshCw } from 'lucide-react';
import {
	sectionBlockIds,
	DEFAULT_TRANSACTION_CONFIG,
	type ComposerActionDescriptor,
	type ComposerBlock,
	type ComposerContextSnapshot,
	type ComposerDocumentSnapshot,
	type ComposerStateSource,
	type DocumentComposerState,
	type SelectionGuardReason,
} from '@/core/composer';
import {
	buildInsertBelowOps,
	buildMoveBlockOps,
	buildToggleTaskOps,
	headingTextStart,
	listItemContentStart,
	partitionSourceRange,
	pasteUrlIntoSelection,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import {
	DEFAULT_COMPOSER_CONFIG,
	type ComposerConfig,
} from '@/ui/view/composer/config/composerConfig';
import { createComposerFoldStore, type ComposerFoldStore } from './foldStore';
import { BlockKindView } from './blocks/BlockKindView';
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
import { EasyCopyMenu } from './chrome/EasyCopyMenu';
import { CommentPanel, CommentCountChip } from './chrome/CommentPanel';
import { BlockHistoryPanel } from './chrome/BlockHistoryPanel';
import { SelectionToolbar } from './chrome/SelectionToolbar';
import { LinkPreviewLayer } from './chrome/LinkPreviewLayer';
import { UndoRedoBar } from './chrome/UndoRedoBar';
import { TransactionNotice } from './chrome/TransactionNotice';
import { DisplayStateSwitch, type ComposerDisplayState } from './chrome/DisplayStateSwitch';
import { mapDomRangeToSource } from './chrome/selectionMapping';

/**
 * Peak Composer — document host + shared editing chrome (WP1 host, WP4 chrome).
 *
 * Renders the parsed snapshot block-by-block with the WP4 editing chrome:
 * structural rail (30×30 disclosure + drag), single flattened 28px-capsule
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
	/** Typing-burst window override; defaults to the transaction config value. */
	burstWindowMs?: number;
	/** Host callback for opening links from the preview popover. */
	onOpenLink?: (kind: 'vault' | 'external', target: string) => void;
	/** Optional revalidate handler surfaced on the stale banner. */
	onRevalidate?: () => void;
}

interface PanelState {
	blockId: string;
	panel: BlockPanelKind;
	range?: { from: number; to: number };
}

interface DragState {
	blockId: string;
	dropIndex: number | null;
}

const EMPTY_RUNTIME: ComposerChromeRuntime = {};

export function ComposerRoot({
	source,
	config = DEFAULT_COMPOSER_CONFIG,
	runtime = EMPTY_RUNTIME,
	burstWindowMs = DEFAULT_TRANSACTION_CONFIG.burstWindowMs,
	onOpenLink,
	onRevalidate,
}: ComposerRootProps): React.ReactElement {
	const subscribe = React.useCallback((cb: () => void) => source.subscribe(cb), [source]);
	const getSnapshot = React.useCallback(() => source.getState(), [source]);
	const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const [foldStore] = React.useState(createComposerFoldStore);

	const [flushers] = React.useState(() => new Set<() => Promise<void>>());
	const chromeValue = React.useMemo<ComposerChromeValue>(
		() => ({
			runtime,
			projection: resolveProjection(runtime),
			config,
			snapshot: state.snapshot,
			burstWindowMs,
			registerFlusher: (flush) => {
				flushers.add(flush);
				return () => flushers.delete(flush);
			},
			flushAll: async () => {
				await Promise.all([...flushers].map((f) => f()));
			},
			onOpenLink,
		}),
		[runtime, config, state.snapshot, burstWindowMs, flushers, onOpenLink],
	);

	return (
		<ComposerChromeProvider value={chromeValue}>
			<div className="peak-design-root peak-composer-root">
				<ComposerBody state={state} config={config} foldStore={foldStore} onRevalidate={onRevalidate} />
			</div>
		</ComposerChromeProvider>
	);
}

interface BodyProps {
	state: DocumentComposerState;
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
	onRevalidate?: () => void;
}

function ComposerBody({ state, config, foldStore, onRevalidate }: BodyProps): React.ReactElement {
	const { strings } = config;
	if (state.status === 'empty') return <StateBanner title={strings.emptyTitle} hint={strings.emptyHint} />;
	if (state.status === 'missing') return <StateBanner title={strings.missingTitle} hint={strings.missingHint} />;
	if (state.status === 'error') return <StateBanner title={strings.errorTitle} hint={state.error ?? ''} tone="error" />;
	if (!state.snapshot) return <StateBanner title={strings.loading} hint="" />;
	return <ComposerDocument state={state} config={config} foldStore={foldStore} onRevalidate={onRevalidate} />;
}

function ComposerDocument({ state, config, foldStore, onRevalidate }: BodyProps): React.ReactElement {
	const chrome = useComposerChrome();
	const { runtime, projection } = chrome;
	const hub = runtime.hub;
	const snapshot = state.snapshot as ComposerDocumentSnapshot;
	const containerRef = React.useRef<HTMLDivElement | null>(null);

	const [displayState, setDisplayState] = React.useState<ComposerDisplayState>(hub ? 'work' : 'clean');
	const [panel, setPanel] = React.useState<PanelState | null>(null);
	const [drag, setDrag] = React.useState<DragState | null>(null);
	const [insertDraftAfter, setInsertDraftAfter] = React.useState<string | null>(null);
	const [hasSelection, setHasSelection] = React.useState(false);
	const [guard, setGuard] = React.useState<string | null>(null);
	const guardTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const editing = displayState !== 'clean' && Boolean(hub);

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

	// ── paste URL over a selection (§7.5) ──────────────────────────────────────
	const onPaste = async (ev: React.ClipboardEvent<HTMLDivElement>) => {
		if (!editing || !hub) return;
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

	return (
		<div
			ref={containerRef}
			className="pk-composer-shell"
			data-display-state={displayState}
			data-has-selection={hasSelection || undefined}
			data-dragging={drag ? 'true' : undefined}
			onPaste={(ev) => void onPaste(ev)}
		>
			<ComposerHeader
				state={state}
				config={config}
				displayState={displayState}
				onDisplayState={setDisplayState}
				canEdit={Boolean(hub)}
			/>
			{state.status === 'stale' && <StaleBanner strings={config.strings} onRevalidate={onRevalidate} />}
			<div className="pk-composer-blocks">
				{visibleBlocks.map((b, i) => (
					<React.Fragment key={b.blockId}>
						<ComposerBlockRow
							block={b}
							snapshot={snapshot}
							config={config}
							foldStore={foldStore}
							editing={editing}
							panel={panel?.blockId === b.blockId ? panel : null}
							setPanel={setPanel}
							onInsertBelow={hub && editing ? () => setInsertDraftAfter(b.blockId) : undefined}
							onDragStart={hub && editing ? startDrag(b.blockId) : undefined}
							dropBefore={drag?.dropIndex === i}
							onInvoke={invoke}
						/>
						{insertDraftAfter === b.blockId && (
							<InsertDraftRow blockId={b.blockId} onDone={() => setInsertDraftAfter(null)} />
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
					onComment={(blockId, range) => setPanel({ blockId, panel: 'comment', range })}
					onInvoke={(d, snap) => invoke(d, snap)}
				/>
			)}
			<LinkPreviewLayer containerRef={containerRef} />
			{guard && (
				<div className="pk-guard-toast" role="alert" data-chrome="true">
					{guard}
				</div>
			)}
			<TransactionNotice />
			{hub && <UndoRedoBar containerRef={containerRef} />}
		</div>
	);
}

// ── header ──────────────────────────────────────────────────────────────────

function ComposerHeader({
	state,
	config,
	displayState,
	onDisplayState,
	canEdit,
}: {
	state: DocumentComposerState;
	config: ComposerConfig;
	displayState: ComposerDisplayState;
	onDisplayState: (s: ComposerDisplayState) => void;
	canEdit: boolean;
}): React.ReactElement {
	const name = (state.filePath ?? '').split('/').pop() ?? config.strings.displayText;
	const count = state.snapshot?.blocks.length ?? 0;
	return (
		<div className="pk-composer-header" data-chrome="true">
			<FileText size={15} className="pk-composer-header__icon" />
			<span className="pk-composer-header__title">{name}</span>
			<span className="pk-composer-header__meta">{`${count} ${config.strings.blocksSuffix}`}</span>
			{canEdit ? (
				<DisplayStateSwitch value={displayState} onChange={onDisplayState} />
			) : (
				<span className="pk-composer-header__badge">{config.strings.readOnlyBadge}</span>
			)}
		</div>
	);
}

// ── block row ───────────────────────────────────────────────────────────────

const TEXT_EDIT_KINDS = new Set(['paragraph', 'heading', 'quote', 'callout']);

function ComposerBlockRow({
	block,
	snapshot,
	config,
	foldStore,
	editing,
	panel,
	setPanel,
	onInsertBelow,
	onDragStart,
	dropBefore,
	onInvoke,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
	editing: boolean;
	panel: PanelState | null;
	setPanel: (p: PanelState | null) => void;
	onInsertBelow?: () => void;
	onDragStart?: (ev: React.PointerEvent<HTMLButtonElement>) => void;
	dropBefore?: boolean;
	onInvoke: (d: ComposerActionDescriptor, snap: ComposerContextSnapshot, instruction?: string) => void;
}): React.ReactElement {
	const chrome = useComposerChrome();
	const folded = useStore(foldStore, (s) => s.folded.has(block.blockId));
	const bodyRef = React.useRef<HTMLDivElement | null>(null);
	const isHeading = block.kind === 'heading';
	const showSummary = !isHeading && folded;
	const raw = block.renderModel.raw;
	const aiSnapshot = makeBlockSnapshot(snapshot, block);

	const openPanel = (kind: BlockPanelKind) => {
		if (panel?.panel === kind) setPanel(null);
		else setPanel({ blockId: block.blockId, panel: kind });
	};

	return (
		<div
			className="pk-composer-block"
			data-kind={block.kind}
			data-block-id={block.blockId}
			data-folded={folded}
			data-drop-before={dropBefore || undefined}
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
				{editing && (
					<BlockActionRow
						snapshot={aiSnapshot}
						onInsertBelow={onInsertBelow}
						onOpenPanel={openPanel}
						openPanel={panel?.panel ?? null}
						writeDisabledReason={chrome.runtime.hub ? undefined : config.chrome.actions.disabledNoRuntime}
						onInvoke={(d, instruction) => onInvoke(d, aiSnapshot, instruction)}
					/>
				)}
				<CommentCountChip blockId={block.blockId} />
				{showSummary ? (
					<div className="pk-composer-summary">{block.renderModel.text || config.strings.emptyPreview}</div>
				) : (
					<BlockBody block={block} snapshot={snapshot} editing={editing} />
				)}
				{panel?.panel === 'copy' && (
					<EasyCopyMenu markdown={raw} blockKind={block.kind} rasterTargetRef={bodyRef} onClose={() => setPanel(null)} />
				)}
				{panel?.panel === 'comment' && (
					<CommentPanel blockId={block.blockId} range={panel.range} onClose={() => setPanel(null)} />
				)}
				{panel?.panel === 'history' && (
					<BlockHistoryPanel
						blockId={block.blockId}
						onLocate={() => bodyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
						onClose={() => setPanel(null)}
					/>
				)}
			</div>
		</div>
	);
}

// ── block body dispatch (editable vs read-only) ─────────────────────────────

function BlockBody({
	block,
	snapshot,
	editing,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
}): React.ReactElement {
	if (block.kind === 'list' || block.kind === 'task') {
		return <EditableListBody block={block} snapshot={snapshot} editing={editing} />;
	}
	if (TEXT_EDIT_KINDS.has(block.kind)) {
		return <EditableTextBody block={block} snapshot={snapshot} editing={editing} />;
	}
	return <BlockKindView block={block} />;
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
	const textStart = isHeading ? headingTextStart(snapshot.sourceText, block.source) : block.source.from;
	const text = snapshot.sourceText.slice(textStart, block.source.to);
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
			editable={editing}
			resolveRange={resolveRange}
			className={className}
		/>
	);
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

/** Ephemeral insert-below draft: nothing commits until real content flushes. */
function InsertDraftRow({ blockId, onDone }: { blockId: string; onDone: () => void }): React.ReactElement {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const [value, setValue] = React.useState('');
	const commit = async () => {
		const text = value.trim();
		if (!text || !hub || !chrome.snapshot) {
			onDone();
			return;
		}
		const built = buildInsertBelowOps(chrome.snapshot, blockId, text);
		if (built) {
			try {
				await hub.commit({
					origin: 'direct',
					label: chrome.config.chrome.actions.insertBelow,
					operations: built.operations,
					target: built.target,
					expectedBlockDelta: built.expectedBlockDelta,
				});
			} catch {
				// conflict — surfaced via staleness
			}
		}
		onDone();
	};
	return (
		<div className="pk-insert-draft" data-chrome="true">
			<input
				autoFocus
				className="pk-insert-draft__input"
				placeholder={chrome.config.chrome.actions.insertDraftPlaceholder}
				value={value}
				onChange={(ev) => setValue(ev.target.value)}
				onBlur={() => void commit()}
				onKeyDown={(ev) => {
					if (ev.key === 'Enter') void commit();
					if (ev.key === 'Escape') onDone();
				}}
			/>
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
