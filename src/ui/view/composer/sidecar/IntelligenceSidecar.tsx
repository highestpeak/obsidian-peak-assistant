import * as React from 'react';
import {
	History,
	Layers3,
	MessageSquare,
	Plus,
	Sparkles,
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
import { TalkView } from './CopilotView';
import { BriefView } from './BriefView';
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
 * The task strip owns explicit task sessions; the second row switches the
 * active task between Suggestions, Talk and History. Wide viewport ⇒ a stable right column; below
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
			<TaskTabs
				runtime={workspaceRuntime}
				documentId={documentId}
				config={config}
				onClose={closable ? onClose : undefined}
			/>
			<div
				ref={tabsRef}
				className="pk-sidecar-tabs"
				role="tablist"
				aria-label={s.title}
				data-peak-keyboard-zone="cv-sidecar-tabs"
				data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cv-sidecar-tabs']}
			>
				<SidecarTab
					active={surface === 'suggestions'}
					icon={<Sparkles size={13} />}
					label={s.tabSuggestions}
					onSelect={() => runtime.session.selectSurface('suggestions')}
					keyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.composer.sidecar.suggestions}
				/>
				<SidecarTab
					active={surface === 'talk'}
					icon={<MessageSquare size={13} />}
					label={s.tabTalk}
					onSelect={() => {
						if (runtime.session.projection().stage === 'brief') {
							runtime.session.openSession(s.tabCopilot);
							return;
						}
						runtime.session.selectSurface('talk');
					}}
					keyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.composer.sidecar.talk}
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
					{surface === 'suggestions' && workspaceRuntime && documentId ? (
						<TaskContextBar
							runtime={workspaceRuntime}
							intelligenceRuntime={runtime}
							documentId={documentId}
							config={config}
						/>
					) : null}
					{surface === 'suggestions' ? <BriefView /> : null}
					{surface === 'talk' ? <TalkView /> : null}
					{surface === 'history' ? <HistoryView /> : null}
				</div>
			</div>
		</div>
	);
}

function TaskTabs({
	runtime,
	documentId,
	config,
	onClose,
}: {
	runtime?: ComposerWorkspaceIntelligenceRuntime;
	documentId?: string;
	config: SidecarConfig;
	onClose?: () => void;
}): React.ReactElement {
	const projection = useWorkspaceProjection(runtime);
	const tasks = projection?.tasks ?? [];
	const activeTaskId = projection?.activeTaskId ?? null;
	return (
		<div className="pk-sidecar-task-header" data-chrome="true">
			<div className="pk-sidecar-task-tabs" role="tablist" aria-label={config.strings.activeTask}>
				{tasks.map((task) => (
					<div
						key={task.taskId}
						className={cn(
							'pk-sidecar-task-tab-shell',
							task.taskId === activeTaskId && 'pk-sidecar-task-tab-shell--active',
						)}
					>
						<Button
							variant="ghost"
							size="sm"
							role="tab"
							aria-selected={task.taskId === activeTaskId}
							className="pk-sidecar-task-tab"
							onClick={() => runtime?.activateTaskSession(task.taskId)}
						>
							<span className="pk-sidecar-task-tab__status" aria-hidden />
							<Layers3 size={13} aria-hidden />
							<span className="pk-sidecar-task-tab__title">{task.title}</span>
						</Button>
						<IconButton
							className="pk-sidecar-task-tab__close"
							label={`${config.strings.close}: ${task.title}`}
							onClick={() => runtime?.closeTaskSession(task.taskId)}
						>
							<X size={11} />
						</IconButton>
					</div>
				))}
			</div>
			<IconButton
				className="pk-sidecar-task-new"
				label={config.strings.newTask}
				onClick={() => runtime?.createTaskSession(config.strings.newTask, documentId ? [documentId] : [])}
			>
				<Plus size={15} />
			</IconButton>
			{onClose ? (
				<IconButton
					className="pk-sidecar-close"
					label={config.strings.close}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.sidecar.close}
					data-peak-keytip-label={config.strings.close}
					onClick={onClose}
				>
					<X size={15} />
				</IconButton>
			) : null}
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

function TaskContextBar({
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
	const projection = useWorkspaceProjection(runtime);
	const brief = useBriefProjection(intelligenceRuntime);
	const s = config.strings;
	const activeTask = projection?.tasks.find((task) => task.taskId === projection.activeTaskId);
	const documentCount = activeTask?.documentIds.length ?? 0;
	const includesCurrent = activeTask?.documentIds.includes(documentId) ?? false;
	return (
		<div className="pk-sidecar-context-bar" data-chrome="true">
			<Button
				variant="ghost"
				size="sm"
				className="pk-sidecar-task-context"
				aria-label={`${s.taskDocuments}: ${documentCount}`}
				onClick={() => {
					if (includesCurrent) return;
					runtime.addDocumentToActiveTask(documentId);
				}}
			>
				<Layers3 size={13} aria-hidden />
				<strong>{documentCount}</strong>
				<span>{includesCurrent ? s.activeTask : s.taskDocuments}</span>
			</Button>
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
