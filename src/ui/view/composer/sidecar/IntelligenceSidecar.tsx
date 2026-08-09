import * as React from 'react';
import {
	Check,
	ChevronDown,
	FileText,
	Focus,
	History,
	Layers3,
	MessageSquare,
	Pin,
	Plus,
	Sparkles,
	Square,
	X,
} from 'lucide-react';
import type {
	ComposerWorkspaceIntelligenceRuntime,
	IntelligenceRuntime,
} from '@/service/composer';
import {
	projectComposerHistoryActivities,
	type ComposerHistoryTransactionResolver,
} from '@/service/composer';
import type { ComposerTransactionHub } from '@/service/composer';
import type {
	ComposerDocumentSnapshot,
	ComposerHistoryItem,
	ComposerTransactionProjection,
	IntelligencePresentationOrigin,
} from '@/core/composer';
import {
	Button,
	IconButton,
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import {
	SidecarProvider,
	useBriefProjection,
	useSidecar,
	useSessionProjection,
	useWorkspaceProjection,
	type SidecarContextValue,
	type SidecarFocusContext,
	type SidecarRelatedFocus,
} from './SidecarContext';
import { DEFAULT_SIDECAR_CONFIG, loadSidecarConfig, type SidecarConfig } from './sidecarConfig';
import { CopilotView } from './CopilotView';
import { SensingControl } from './BriefView';
import {
	composerHistoryActivityLabels,
	HistoryView,
} from './HistoryView';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import {
	PEAK_CONTROL_KEY_TIP_KEYS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

export type SidecarMode = 'desktop' | 'drawer';

/**
 * Peak Composer — Intelligence Sidecar shell (WP9, handoff §12.1 / §12.6).
 *
 * Top level is only `Copilot | History` — Ambient is projected into the Copilot
 * brief, never a third tab (§12.1). Wide viewport ⇒ a stable right column; below
 * the configured breakpoint ⇒ a fixed right drawer that slides fully in/out of
 * the viewport, restores on close/reopen and never causes horizontal overflow
 * (§12.6). All width/window queries use the container's ownerDocument /
 * ownerWindow so a detached (popout) Composer works unchanged (CMP-A11Y-02).
 */
export interface IntelligenceSidecarProps {
	/** App-owned intelligence runtime for the current document. */
	runtime: IntelligenceRuntime;
	workspaceRuntime?: ComposerWorkspaceIntelligenceRuntime;
	documentId?: string;
	documentSnapshot?: ComposerDocumentSnapshot;
	/** WP2 hub for the History projection + document locate. */
	hub?: ComposerTransactionHub;
	documentFilePath?: string;
	open: boolean;
	motion?: 'none' | 'user';
	presentationOrigin?: IntelligencePresentationOrigin | null;
	onPresentationOriginChange?: (origin: IntelligencePresentationOrigin) => void;
	onOpenChange: (open: boolean) => void;
	onLocate?: (blockId: string) => void;
	onLocateComment?: (commentId: string, blockId: string) => void;
	onOpenSource?: (path: string) => void;
	/** The real focused block id from chrome focus state, or null (host-provided). */
	getFocusedBlockId?: () => string | null;
	/** Assemble the frozen run context for a focus block (document fallback when null). */
	resolveFocusContext?: (focusedBlockId: string | null) => SidecarFocusContext;
	/** Resolve the related-material focus (query text + anchor) for a focus block. */
	resolveRelatedFocus?: (focusedBlockId: string | null) => SidecarRelatedFocus;
	onRestoreGeneration?: (runId: string) => boolean;
}

export function IntelligenceSidecar({
	runtime,
	workspaceRuntime,
	documentId,
	documentSnapshot,
	hub,
	documentFilePath,
	open,
	motion = 'none',
	presentationOrigin = null,
	onPresentationOriginChange,
	onOpenChange,
	onLocate,
	onLocateComment,
	onOpenSource,
	getFocusedBlockId,
	resolveFocusContext,
	resolveRelatedFocus,
	onRestoreGeneration,
}: IntelligenceSidecarProps): React.ReactElement {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const [config, setConfig] = React.useState<SidecarConfig>(DEFAULT_SIDECAR_CONFIG);
	const [mode, setMode] = React.useState<SidecarMode | null>(null);
	const closeOnUnhandledEscape = (event: React.KeyboardEvent<HTMLElement>): void => {
		if (event.defaultPrevented || event.key !== 'Escape' || !open) return;
		event.preventDefault();
		event.stopPropagation();
		onOpenChange(false);
	};

	React.useEffect(() => {
		let alive = true;
		void loadSidecarConfig().then((cfg) => {
			if (alive) setConfig(cfg);
		});
		return () => {
			alive = false;
		};
	}, []);

	// Track the actual Composer host/root width, not the 430px sidecar column and
	// not ownerWindow.innerWidth. ResizeObserver catches Obsidian split-leaf or
	// native-sidebar changes where the window size itself does not change.
	React.useLayoutEffect(() => {
		const el = rootRef.current;
		const host = findComposerHostElement(el);
		if (!host) return;
		const win = host.ownerDocument.defaultView;
		if (!win) return;
		const check = () => {
			setMode(resolveSidecarHostMode(el, config.narrowBreakpointPx));
		};
		check();
		const ResizeObserverCtor = win?.ResizeObserver;
		const observer = ResizeObserverCtor ? new ResizeObserverCtor(check) : null;
		observer?.observe(host);
		win.addEventListener('resize', check);
		return () => {
			observer?.disconnect();
			win.removeEventListener('resize', check);
		};
	}, [config.narrowBreakpointPx]);

	const ctx: SidecarContextValue = React.useMemo(
		() => ({
			runtime,
			hub,
			workspaceRuntime,
			documentId,
			documentSnapshot,
			config,
			onRestoreGeneration,
			documentFilePath,
			onLocate,
			onLocateComment,
			onOpenSource,
			getFocusedBlockId,
			resolveFocusContext,
			resolveRelatedFocus,
			presentationOrigin,
			onPresentationOriginChange,
		}),
		[
			runtime,
			hub,
			workspaceRuntime,
			documentId,
			documentSnapshot,
			config,
			onRestoreGeneration,
			documentFilePath,
			onLocate,
			onLocateComment,
			onOpenSource,
			getFocusedBlockId,
			resolveFocusContext,
			resolveRelatedFocus,
			presentationOrigin,
			onPresentationOriginChange,
		],
	);

	if (mode === null) {
		return <div ref={rootRef} className="pk-sidecar-anchor" data-measuring="true" aria-hidden="true" />;
	}

	if (mode === 'drawer') {
		return (
			<div
				ref={rootRef}
				className={cn(
					'pk-sidecar-anchor',
					motion === 'user' && 'pk-sidecar-anchor--user-transition',
				)}
				data-sidecar-mode="drawer"
				data-open={open ? 'true' : 'false'}
				data-motion={motion}
				onKeyDown={closeOnUnhandledEscape}
			>
				<div
					className={cn(
						'pk-sidecar-drawer',
						open && 'pk-sidecar-drawer--open',
						motion === 'user' && 'pk-sidecar-drawer--user-transition',
					)}
					data-open={open || undefined}
					aria-hidden={!open}
				>
					<SidecarProvider value={ctx}>
						<SidecarShell
							config={config}
							runtime={runtime}
							workspaceRuntime={workspaceRuntime}
							documentId={documentId}
							onClose={() => onOpenChange(false)}
							closable
						/>
					</SidecarProvider>
				</div>
		</div>
		);
	}

	return (
		<div
			ref={rootRef}
			className={cn(
				'pk-sidecar-anchor',
				motion === 'user' && 'pk-sidecar-anchor--user-transition',
			)}
			data-sidecar-mode="desktop"
			data-open={open ? 'true' : 'false'}
			data-motion={motion}
			onKeyDown={closeOnUnhandledEscape}
		>
			<div
				className={cn(
					'pk-sidecar',
					!open && 'pk-sidecar--closed',
					motion === 'user' && 'pk-sidecar--user-transition',
				)}
				data-open={open || undefined}
				aria-hidden={!open}
			>
				<SidecarProvider value={ctx}>
					<SidecarShell
						config={config}
						runtime={runtime}
						workspaceRuntime={workspaceRuntime}
						documentId={documentId}
						onClose={() => onOpenChange(false)}
						closable
					/>
				</SidecarProvider>
			</div>
		</div>
	);
}

export function resolveSidecarMode(hostWidthPx: number, narrowBreakpointPx: number): SidecarMode {
	return hostWidthPx < narrowBreakpointPx ? 'drawer' : 'desktop';
}

export function resolveSidecarHostMode(el: HTMLElement | null, narrowBreakpointPx: number): SidecarMode {
	const host = findComposerHostElement(el);
	return resolveSidecarMode(host?.getBoundingClientRect().width ?? 0, narrowBreakpointPx);
}

/**
 * Count every committed transaction represented by the History projection.
 * Grouped bursts and AI runs keep their children below a parent row, but the
 * badge must report the actual transaction total rather than just top-level
 * groups. The visited set also makes a malformed cyclic projection harmless.
 */
export function countHistoryTransactions(items: readonly ComposerHistoryItem[]): number {
	const visited = new Set<string>();
	const countItem = (item: ComposerHistoryItem): number => {
		if (visited.has(item.historyId)) return 0;
		visited.add(item.historyId);
		return 1 + (item.children?.reduce((count, child) => count + countItem(child), 0) ?? 0);
	};
	return items.reduce((count, item) => count + countItem(item), 0);
}

function findComposerHostElement(el: HTMLElement | null): HTMLElement | null {
	return el?.closest<HTMLElement>('.peak-composer-root') ?? null;
}

function SidecarShell({
	config,
	runtime,
	workspaceRuntime,
	documentId,
	onClose,
	closable,
}: {
	config: SidecarConfig;
	runtime: IntelligenceRuntime;
	workspaceRuntime?: ComposerWorkspaceIntelligenceRuntime;
	documentId?: string;
	onClose?: () => void;
	closable?: boolean;
}): React.ReactElement {
	const tabsRef = React.useRef<HTMLDivElement | null>(null);
	const { hub, documentSnapshot } = useSidecar();
	const projection = useSessionProjection(runtime);
	const workspaceProjection = useWorkspaceProjection(workspaceRuntime);
	const transactionProjection = useHistoryTransactionProjection(hub);
	const surface = projection.surface;
	const s = config.strings;
	const transactionResolver = React.useMemo<ComposerHistoryTransactionResolver | undefined>(
		() => hub
			? {
					preview: (historyId) => hub.historyPreview(historyId),
					transaction: (historyId) => hub.historyTransaction(historyId),
				}
			: undefined,
		[hub, transactionProjection],
	);
	const historyActivityCount = React.useMemo(
		() => projectComposerHistoryActivities({
			documentId: documentId ?? documentSnapshot?.documentId ?? '',
			runs: workspaceProjection?.runs ?? [],
			receipts: projection.receipts,
			externalRunAliases: projection.externalRunAliases,
			history: transactionProjection?.history ?? [],
			labels: composerHistoryActivityLabels(s),
			transactionResolver,
		}).length,
		[
			documentId,
			documentSnapshot?.documentId,
			workspaceProjection,
			projection.receipts,
			projection.externalRunAliases,
			transactionProjection,
			transactionResolver,
			s,
		],
	);
	useRovingComposite(tabsRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		rememberBy: 'data-peak-focus-id',
	});
	return (
		<div className="pk-sidecar-shell peak-design-root">
			<div className="pk-sidecar-header" data-chrome="true">
				<div className="pk-sidecar-brand">
					<Sparkles size={18} className="pk-sidecar-spark" aria-hidden />
					<div className="pk-sidecar-brand-text">
						<span className="pk-sidecar-title">{s.title}</span>
						<span className="pk-sidecar-subtitle">{s.followingDoc}</span>
					</div>
				</div>
				{closable && (
					<IconButton
						className="pk-sidecar-close"
						label={s.close}
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.sidecar.close}
						data-peak-keytip-label={s.close}
						onClick={onClose}
					>
						<X size={15} />
					</IconButton>
				)}
			</div>
			<div
				ref={tabsRef}
				className="pk-sidecar-tabs"
				role="tablist"
				aria-label={s.title}
				data-peak-keyboard-zone="cv-sidecar-tabs"
				data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cv-sidecar-tabs']}
			>
				<SidecarTab
					active={surface === 'copilot'}
					icon={<MessageSquare size={13} />}
					label={s.tabCopilot}
					onSelect={() => runtime.session.selectSurface('copilot')}
					keyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.composer.sidecar.copilot}
				/>
				<SidecarTab
					active={surface === 'history'}
					icon={<History size={13} />}
					label={s.tabHistory}
					count={historyActivityCount}
					onSelect={() => runtime.session.selectSurface('history')}
					keyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.composer.sidecar.history}
				/>
			</div>
			<div
				className="pk-sidecar-body"
				data-peak-keyboard-zone="cv-sidecar-content"
				data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cv-sidecar-content']}
			>
				<div className="pk-sidecar-body-content">
					{surface === 'copilot' && workspaceRuntime && documentId ? (
						<WorkspaceScopeMenu
							runtime={workspaceRuntime}
							intelligenceRuntime={runtime}
							documentId={documentId}
							config={config}
						/>
					) : null}
					{surface === 'copilot' ? <CopilotView /> : <HistoryView />}
				</div>
			</div>
		</div>
	);
}

function useHistoryTransactionProjection(
	hub: ComposerTransactionHub | undefined,
): ComposerTransactionProjection | null {
	const ref = React.useRef<ComposerTransactionProjection | null>(hub?.projection() ?? null);
	React.useEffect(() => {
		ref.current = hub?.projection() ?? null;
	}, [hub]);
	const subscribe = React.useCallback(
		(notify: () => void) => {
			if (!hub) return () => undefined;
			return hub.subscribe((projection) => {
				ref.current = projection;
				notify();
			});
		},
		[hub],
	);
	const getSnapshot = React.useCallback(() => ref.current, []);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function WorkspaceScopeMenu({
	runtime,
	intelligenceRuntime,
	documentId,
	config,
}: {
	runtime: ComposerWorkspaceIntelligenceRuntime;
	intelligenceRuntime: IntelligenceRuntime;
	documentId: string;
	config: SidecarConfig;
}): React.ReactElement {
	const [projection, setProjection] = React.useState(() => runtime.projection());
	const [open, setOpen] = React.useState(false);
	React.useEffect(() => runtime.subscribe(setProjection), [runtime]);
	const brief = useBriefProjection(intelligenceRuntime);
	const scopeKind = projection.scope?.kind ?? 'document';
	const s = config.strings;
	const scopeOptions = [
		{ kind: 'document' as const, label: s.scopeDocument, icon: FileText },
		{ kind: 'work-segment' as const, label: s.scopeWorkSegment, icon: Layers3 },
		{ kind: 'pinned' as const, label: s.scopePinned, icon: Pin },
	];
	const activeLabel =
		scopeOptions.find((option) => option.kind === scopeKind)?.label
		?? s.scopeDocument;
	const selectScope = (kind: 'document' | 'work-segment' | 'pinned'): void => {
		if (kind === 'document') runtime.setDocumentScope(documentId);
		else if (kind === 'work-segment') runtime.setWorkSegmentScope();
		else runtime.pinDocuments([documentId]);
		setOpen(false);
	};
	return (
		<div className="pk-sidecar-context-bar" data-chrome="true">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="pk-sidecar-scope-trigger"
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.sidecar.scope}
						data-peak-keytip-label={`${s.scopeLabel}: ${activeLabel}`}
						aria-label={`${s.scopeLabel}: ${activeLabel}`}
						aria-haspopup="menu"
						aria-expanded={open}
					>
						<Focus size={13} aria-hidden />
						<span className="pk-sidecar-scope-trigger__prefix">{s.scopeTrigger}</span>
						<span className="pk-sidecar-scope-trigger__value">{activeLabel}</span>
						<ChevronDown size={12} aria-hidden />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="pk-sidecar-scope-menu"
					align="start"
					sideOffset={5}
					role="menu"
					aria-label={s.scopeLabel}
				>
					<span className="pk-sidecar-scope-menu__title">{s.scopeLabel}</span>
					{scopeOptions.map(({ kind, label, icon: Icon }) => (
						<PopoverItem
							key={kind}
							role="menuitemradio"
							aria-checked={scopeKind === kind}
							onClick={() => selectScope(kind)}
						>
							<Icon aria-hidden />
							<span>{label}</span>
							{scopeKind === kind ? <Check className="pk-sidecar-scope-check" aria-hidden /> : null}
						</PopoverItem>
					))}
					<div className="pk-sidecar-scope-menu__separator" role="separator" />
					<PopoverItem
						onClick={() => {
							const followsWorkSegment = projection.scope?.kind === 'work-segment';
							runtime.startNewSegment();
							if (followsWorkSegment) runtime.setWorkSegmentScope();
							setOpen(false);
						}}
					>
						<Plus aria-hidden />
						<span>{s.startNewWorkSegment}</span>
					</PopoverItem>
					{projection.activeSegment && !projection.activeSegment.endedAt ? (
						<PopoverItem
							onClick={() => {
								runtime.endCurrentSegment();
								setOpen(false);
							}}
						>
							<Square aria-hidden />
							<span>{s.endWorkSegment}</span>
						</PopoverItem>
					) : null}
				</PopoverContent>
			</Popover>
			<SensingControl
				runtime={intelligenceRuntime}
				sensingMode={brief.sensingMode}
				autoPrepare={brief.autoPrepare}
				autoPrepareAvailable={brief.autoPrepareAvailable}
				strings={s}
			/>
		</div>
	);
}

function SidecarTab({
	active,
	icon,
	label,
	count = 0,
	onSelect,
	keyTipKey,
}: {
	active: boolean;
	icon: React.ReactNode;
	label: string;
	count?: number;
	onSelect: () => void;
	keyTipKey: string;
}): React.ReactElement {
	return (
		<Button
			variant="ghost"
			size="sm"
			role="tab"
			data-peak-focus-id={label}
			data-peak-keytip-key={keyTipKey}
			data-peak-keytip-label={label}
			aria-selected={active}
			className={cn('pk-sidecar-tab', active && 'pk-sidecar-tab--active')}
			onClick={onSelect}
		>
			<span className="pk-sidecar-tab-icon" aria-hidden>
				{icon}
			</span>
			<span>{label}</span>
			{count > 0 && <b className="pk-sidecar-tab-count">{count}</b>}
		</Button>
	);
}
