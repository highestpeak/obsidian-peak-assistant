import * as React from 'react';
import { Sparkles, X, Clock, MessageSquare } from 'lucide-react';
import type { IntelligenceRuntime } from '@/service/composer';
import type { ComposerTransactionHub } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import {
	SidecarProvider,
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
	onLocate?: (blockId: string) => void;
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
	onLocate,
	onOpenSource,
	getFocusedBlockId,
	resolveFocusContext,
	resolveRelatedFocus,
}: IntelligenceSidecarProps): React.ReactElement {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const [config, setConfig] = React.useState<SidecarConfig>(DEFAULT_SIDECAR_CONFIG);
	const [mode, setMode] = React.useState<SidecarMode | null>(null);
	// Drawer open state is preserved across close/reopen for the whole mount.
	const [drawerOpen, setDrawerOpen] = React.useState(false);
	const [desktopOpen, setDesktopOpen] = React.useState(true);

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
		() => ({ runtime, hub, config, onLocate, onOpenSource, getFocusedBlockId, resolveFocusContext, resolveRelatedFocus }),
		[runtime, hub, config, onLocate, onOpenSource, getFocusedBlockId, resolveFocusContext, resolveRelatedFocus],
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
				data-open={drawerOpen ? 'true' : 'false'}
			>
				{!drawerOpen && (
					<SidecarOpenButton
						label={config.strings.title}
						aria-label={config.strings.openDrawer}
						onClick={() => setDrawerOpen(true)}
					/>
				)}
				<div
					className={cn('pk-sidecar-drawer', drawerOpen && 'pk-sidecar-drawer--open')}
					data-open={drawerOpen || undefined}
					aria-hidden={!drawerOpen}
				>
					<SidecarProvider value={ctx}>
						<SidecarShell config={config} runtime={runtime} onClose={() => setDrawerOpen(false)} closable />
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
			data-open={desktopOpen ? 'true' : 'false'}
		>
			{!desktopOpen && (
				<SidecarOpenButton
					label={config.strings.title}
					aria-label={config.strings.openDrawer}
					onClick={() => setDesktopOpen(true)}
				/>
			)}
			<div
				className={cn('pk-sidecar', !desktopOpen && 'pk-sidecar--closed')}
				data-open={desktopOpen || undefined}
				aria-hidden={!desktopOpen}
			>
				<SidecarProvider value={ctx}>
					<SidecarShell config={config} runtime={runtime} onClose={() => setDesktopOpen(false)} closable />
				</SidecarProvider>
			</div>
		</div>
	);
}

export function SidecarOpenButton({
	label,
	'aria-label': ariaLabel,
	onClick,
}: {
	label: string;
	'aria-label': string;
	onClick: () => void;
}): React.ReactElement {
	return (
		<Button
			variant="outline"
			size="sm"
			className="pk-sidecar-open-toggle"
			aria-label={ariaLabel}
			onClick={onClick}
		>
			<Sparkles size={13} aria-hidden />
			<span>{label}</span>
		</Button>
	);
}

export function resolveSidecarMode(hostWidthPx: number, narrowBreakpointPx: number): SidecarMode {
	return hostWidthPx < narrowBreakpointPx ? 'drawer' : 'desktop';
}

export function resolveSidecarHostMode(el: HTMLElement | null, narrowBreakpointPx: number): SidecarMode {
	const host = findComposerHostElement(el);
	return resolveSidecarMode(host?.getBoundingClientRect().width ?? 0, narrowBreakpointPx);
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
	const projection = useSessionProjection(runtime);
	const surface = projection.surface;
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
					<button type="button" className="pk-sidecar-close" aria-label={s.close} onClick={onClose}>
						<X size={15} />
					</button>
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
					icon={<Clock size={13} />}
					label={s.tabHistory}
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
	onSelect,
}: {
	active: boolean;
	icon: React.ReactNode;
	label: string;
	onSelect: () => void;
}): React.ReactElement {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			className={cn('pk-sidecar-tab', active && 'pk-sidecar-tab--active')}
			onClick={onSelect}
		>
			<span className="pk-sidecar-tab-icon" aria-hidden>
				{icon}
			</span>
			<span>{label}</span>
		</button>
	);
}
