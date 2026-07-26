import * as React from 'react';
import { Sparkles, X, Clock, MessageSquare } from 'lucide-react';
import type { IntelligenceRuntime } from '@/service/composer';
import type { ComposerTransactionHub } from '@/service/composer';
import { cn } from '@/ui/react/lib/utils';
import { SidecarProvider, useSessionProjection, type SidecarContextValue } from './SidecarContext';
import { DEFAULT_SIDECAR_CONFIG, loadSidecarConfig, type SidecarConfig } from './sidecarConfig';
import { CopilotView } from './CopilotView';
import { HistoryView } from './HistoryView';

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
}

export function IntelligenceSidecar({ runtime, hub, onLocate, onOpenSource }: IntelligenceSidecarProps): React.ReactElement {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const [config, setConfig] = React.useState<SidecarConfig>(DEFAULT_SIDECAR_CONFIG);
	const [narrow, setNarrow] = React.useState(false);
	// Drawer open state is preserved across close/reopen for the whole mount.
	const [drawerOpen, setDrawerOpen] = React.useState(false);

	React.useEffect(() => {
		let alive = true;
		void loadSidecarConfig().then((cfg) => {
			if (alive) setConfig(cfg);
		});
		return () => {
			alive = false;
		};
	}, []);

	// Track the container width against the configured breakpoint using the
	// OWNER window (detached-safe). Falls back to matchMedia when available.
	React.useEffect(() => {
		const el = rootRef.current;
		const win = el?.ownerDocument.defaultView ?? window;
		const check = () => setNarrow(win.innerWidth < config.narrowBreakpointPx);
		check();
		win.addEventListener('resize', check);
		return () => win.removeEventListener('resize', check);
	}, [config.narrowBreakpointPx]);

	const ctx: SidecarContextValue = React.useMemo(
		() => ({ runtime, hub, config, onLocate, onOpenSource }),
		[runtime, hub, config, onLocate, onOpenSource],
	);

	if (narrow) {
		return (
			<div ref={rootRef} className="pk-sidecar-anchor" data-narrow="true">
				{!drawerOpen && (
					<button
						type="button"
						className="pk-sidecar-drawer-toggle"
						aria-label={config.strings.openDrawer}
						onClick={() => setDrawerOpen(true)}
					>
						<Sparkles size={16} />
					</button>
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
		<div ref={rootRef} className="pk-sidecar" data-narrow={false}>
			<SidecarProvider value={ctx}>
				<SidecarShell config={config} runtime={runtime} />
			</SidecarProvider>
		</div>
	);
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
