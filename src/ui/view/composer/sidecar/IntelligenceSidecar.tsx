import * as React from 'react';
import { Sparkles, X, History, MessageSquare } from 'lucide-react';
import type { IntelligenceRuntime } from '@/service/composer';
import type { ComposerTransactionHub } from '@/service/composer';
import type { ComposerHistoryItem } from '@/core/composer';
import { Button } from '@/ui/components/primitives';
import { IconButton } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import {
	SidecarProvider,
	useSidecar,
	useSessionProjection,
	type SidecarContextValue,
	type SidecarFocusContext,
	type SidecarRelatedFocus,
} from './SidecarContext';
import { DEFAULT_SIDECAR_CONFIG, loadSidecarConfig, type SidecarConfig } from './sidecarConfig';
import { CopilotView } from './CopilotView';
import { HistoryView } from './HistoryView';

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
	/** WP2 hub for the History projection + document locate. */
	hub?: ComposerTransactionHub;
	open: boolean;
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
}

export function IntelligenceSidecar({
	runtime,
	hub,
	open,
	onOpenChange,
	onLocate,
	onLocateComment,
	onOpenSource,
	getFocusedBlockId,
	resolveFocusContext,
	resolveRelatedFocus,
}: IntelligenceSidecarProps): React.ReactElement {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const [config, setConfig] = React.useState<SidecarConfig>(DEFAULT_SIDECAR_CONFIG);
	const [mode, setMode] = React.useState<SidecarMode | null>(null);
	const projection = useSessionProjection(runtime);

	React.useEffect(() => {
		if (projection.stage !== 'session') return;
		onOpenChange(true);
	}, [projection.stage, onOpenChange]);

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
			config,
			onLocate,
			onLocateComment,
			onOpenSource,
			getFocusedBlockId,
			resolveFocusContext,
			resolveRelatedFocus,
		}),
		[
			runtime,
			hub,
			config,
			onLocate,
			onLocateComment,
			onOpenSource,
			getFocusedBlockId,
			resolveFocusContext,
			resolveRelatedFocus,
		],
	);

	if (mode === null) {
		return <div ref={rootRef} className="pk-sidecar-anchor" data-measuring="true" aria-hidden="true" />;
	}

	if (mode === 'drawer') {
		return (
			<div
				ref={rootRef}
				className="pk-sidecar-anchor"
				data-sidecar-mode="drawer"
				data-open={open ? 'true' : 'false'}
			>
				<div
					className={cn('pk-sidecar-drawer', open && 'pk-sidecar-drawer--open')}
					data-open={open || undefined}
					aria-hidden={!open}
				>
					<SidecarProvider value={ctx}>
						<SidecarShell config={config} runtime={runtime} onClose={() => onOpenChange(false)} closable />
					</SidecarProvider>
				</div>
		</div>
		);
	}

	return (
		<div
			ref={rootRef}
			className="pk-sidecar-anchor"
			data-sidecar-mode="desktop"
			data-open={open ? 'true' : 'false'}
		>
			<div
				className={cn('pk-sidecar', !open && 'pk-sidecar--closed')}
				data-open={open || undefined}
				aria-hidden={!open}
			>
				<SidecarProvider value={ctx}>
					<SidecarShell config={config} runtime={runtime} onClose={() => onOpenChange(false)} closable />
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

/** Subscribe to the hub's projection while selecting the stable numeric badge. */
function useHistoryTransactionCount(hub: ComposerTransactionHub | undefined): number {
	const subscribe = React.useCallback(
		(notify: () => void) => hub?.subscribe(() => notify()) ?? (() => undefined),
		[hub],
	);
	const getSnapshot = React.useCallback(
		() => (hub ? countHistoryTransactions(hub.projection().history) : 0),
		[hub],
	);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function findComposerHostElement(el: HTMLElement | null): HTMLElement | null {
	return el?.closest<HTMLElement>('.peak-composer-root') ?? null;
}

function SidecarShell({
	config,
	runtime,
	onClose,
	closable,
}: {
	config: SidecarConfig;
	runtime: IntelligenceRuntime;
	onClose?: () => void;
	closable?: boolean;
}): React.ReactElement {
	const { hub } = useSidecar();
	const projection = useSessionProjection(runtime);
	const surface = projection.surface;
	const historyTransactionCount = useHistoryTransactionCount(hub);
	const s = config.strings;
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
					<IconButton className="pk-sidecar-close" label={s.close} onClick={onClose}>
						<X size={15} />
					</IconButton>
				)}
			</div>
			<div className="pk-sidecar-tabs" role="tablist" aria-label={s.title}>
				<SidecarTab
					active={surface === 'copilot'}
					icon={<MessageSquare size={13} />}
					label={s.tabCopilot}
					onSelect={() => runtime.session.selectSurface('copilot')}
				/>
				<SidecarTab
					active={surface === 'history'}
					icon={<History size={13} />}
					label={s.tabHistory}
					count={historyTransactionCount}
					onSelect={() => runtime.session.selectSurface('history')}
				/>
			</div>
			<div className="pk-sidecar-body">
				{surface === 'copilot' ? <CopilotView /> : <HistoryView />}
			</div>
		</div>
	);
}

function SidecarTab({
	active,
	icon,
	label,
	count = 0,
	onSelect,
}: {
	active: boolean;
	icon: React.ReactNode;
	label: string;
	count?: number;
	onSelect: () => void;
}): React.ReactElement {
	return (
			<Button
				variant="ghost"
				size="sm"
				role="tab"
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
