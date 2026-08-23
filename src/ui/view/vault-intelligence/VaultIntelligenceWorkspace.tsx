import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
	Activity,
	ArrowLeft,
	ArrowDown,
	ArrowRight,
	BrainCircuit,
	Check,
	ChevronDown,
	ChevronRight,
	CircleAlert,
	Clock3,
	CalendarDays,
	File,
	FileText,
	FolderKanban,
	GitBranch,
	Info,
	ListChecks,
	MessageSquare,
	Pause,
	PenLine,
	Play,
	RefreshCw,
	ScanSearch,
	Search,
	ShieldCheck,
	Sparkles,
	X,
} from 'lucide-react';
import {
	Button as SharedButton,
	type ButtonProps as SharedButtonProps,
} from '@/ui/component/shared-ui/button';
import { AtlasGraphCanvas, type AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import { cn } from '@/ui/react/lib/utils';
import { modelRegistry } from '@/core/providers/model-registry';
import { VaultOperationRouteSelectionError } from '@/core/types/vault-intelligence';
import type {
	VaultMaintenanceTask,
	VaultMaintenanceProposal,
	VaultScanAiOperationPlan,
	VaultScanOperationRouteCandidate,
	VaultScanAiOperationId,
	VaultScanPlan,
	VaultScanScopeMode,
	VaultScanScopeSelector,
} from '@/core/types/vault-intelligence';
import {
	buildVaultIntelligenceGraph,
	createVaultScanPlan,
	toLocalDateKey,
	type VaultActivityDay,
	type VaultIntelligenceObjectSummary,
	type VaultIntelligenceSnapshot,
	type VaultIntelligenceWorkspaceRuntime,
} from './VaultIntelligenceModel';
import { estimateVaultScanOperations, estimateVaultScanText } from './VaultScanEstimate';
import {
	DEFAULT_VAULT_INTELLIGENCE_CONFIG,
	loadVaultIntelligenceConfig,
	type VaultIntelligenceConfig,
} from './VaultIntelligenceDefaults';

type Surface = 'overview' | 'map' | 'queue';
type MapSurface = 'contents' | 'activity';
type Route =
	| { kind: 'surface'; surface: Surface; mapSurface?: MapSurface; mapDate?: string | null; mapExtension?: string | null }
	| { kind: 'setup'; initialSelector?: VaultScanScopeSelector | null }
	| { kind: 'progress' }
	| { kind: 'completed' }
	| { kind: 'map-text'; extension: string | null }
	| { kind: 'task'; taskId: string; origin: 'completed' | 'queue' }
	| { kind: 'proposal'; taskId: string; origin: 'completed' | 'queue' };
type WorkFilter = 'all' | 'choice' | 'review' | 'recovery';
type ActivityRange = 30 | 90 | 183 | 365;
type ActivityMode = 'recorded' | 'themes';
type ActivitySource = 'all' | 'files' | 'chat' | 'project' | 'composer' | 'peak';
type ActivityRangeDrag = {
	kind: 'start' | 'end' | 'window';
	originIndex: number;
	start: number;
	end: number;
};

type VaultReferenceIconName = 'vault' | 'scan' | VaultIntelligenceObjectSummary['id'];

function VaultReferenceIcon({ name, size }: { name: VaultReferenceIconName; size: number }) {
	return <svg
		className="pk-vi-reference-icon"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		{name === 'vault' && <><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" /><path d="m8 9.5 4-2.2 4 2.2v5L12 17l-4-2.5z" /></>}
		{name === 'scan' && <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" /><path d="M8 12h8M12 8v8" /></>}
		{name === 'files' && <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4" /></>}
		{name === 'chats' && <path d="M4 5h16v11H8l-4 4z" />}
		{name === 'projects' && <><path d="M12 12h.01" /><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><path d="M22 13a18.15 18.15 0 0 1-20 0" /><rect width="20" height="14" x="2" y="6" rx="2" /></>}
		{name === 'composer' && <><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></>}
	</svg>;
}

/**
 * Keep the repository's shadcn Button boundary while giving this workspace one
 * stable skin. The former implementation styled `.pk-btn` but rendered a
 * Button that never emitted that class, leaving every geometry rule dead in
 * real Obsidian.
 */
const Button = React.forwardRef<HTMLButtonElement, SharedButtonProps>(({
	className,
	variant,
	size,
	...props
}, ref) => (
	<SharedButton
		ref={ref}
		variant="unstyled"
		size={null}
		className={cn(
			'pk-btn',
			variant === 'ghost' && 'pk-btn--ghost',
			variant === 'outline' && 'pk-btn--secondary',
			variant === 'secondary' && 'pk-btn--secondary',
			variant === 'destructive' && 'pk-btn--danger',
			variant === 'default' && 'pk-btn--primary',
			size === 'sm' && 'pk-btn--sm',
			className,
		)}
		{...props}
	/>
));
Button.displayName = 'VaultIntelligenceButton';

function initialWorkspaceRoute(route: 'overview' | 'map' | 'activity' | 'work-queue' | 'scan-setup' | 'run-progress' | 'completed' | 'map-text'): Route {
	if (route === 'map') return { kind: 'surface', surface: 'map', mapSurface: 'contents' };
	if (route === 'activity') return { kind: 'surface', surface: 'map', mapSurface: 'activity' };
	if (route === 'work-queue') return { kind: 'surface', surface: 'queue' };
	if (route === 'scan-setup') return { kind: 'setup' };
	if (route === 'run-progress') return { kind: 'progress' };
	if (route === 'completed') return { kind: 'completed' };
	if (route === 'map-text') return { kind: 'map-text', extension: null };
	return { kind: 'surface', surface: 'overview' };
}

export interface VaultIntelligenceWorkspaceProps {
	runtime: VaultIntelligenceWorkspaceRuntime;
	/** Deterministic production-render route used by the local parity harness. */
	initialRoute?: 'overview' | 'map' | 'activity' | 'work-queue' | 'scan-setup' | 'run-progress' | 'completed' | 'map-text';
	/** Opens the real production Result Item subtree directly in the parity harness. */
	initialTaskId?: string;
}

export const VaultIntelligenceWorkspace: React.FC<VaultIntelligenceWorkspaceProps> = ({ runtime, initialRoute = 'overview', initialTaskId }) => {
	const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
	const [config, setConfig] = useState(DEFAULT_VAULT_INTELLIGENCE_CONFIG);
	const [route, setRoute] = useState<Route>(() => initialTaskId ? { kind: 'task', taskId: initialTaskId, origin: 'queue' } : initialWorkspaceRoute(initialRoute));
	const mainRef = useRef<HTMLElement>(null);
	const returnFocusTaskIdRef = useRef<string | null>(null);
	useEffect(() => {
		void runtime.refresh();
		void loadVaultIntelligenceConfig().then(setConfig);
	}, [runtime]);
	useEffect(() => {
		const main = mainRef.current;
		if (!main) return;
		main.scrollTop = 0;
		main.scrollLeft = 0;
		if (route.kind !== 'completed' && !(route.kind === 'surface' && route.surface === 'queue')) return;
		const taskId = returnFocusTaskIdRef.current;
		if (!taskId) return;
		window.requestAnimationFrame(() => {
			[...main.querySelectorAll<HTMLElement>('[data-task-id]')].find((element) => element.dataset.taskId === taskId)?.focus();
			returnFocusTaskIdRef.current = null;
		});
	}, [route]);
	const openTask = (taskId: string, origin: 'completed' | 'queue') => {
		returnFocusTaskIdRef.current = taskId;
		setRoute({ kind: 'task', taskId, origin });
	};

	const openPrimary = () => {
		if (snapshot.run.status === 'running' || snapshot.run.status === 'stopping' || snapshot.run.status === 'paused' || snapshot.run.status === 'interrupted') {
			setRoute({ kind: 'progress' });
			return;
		}
		setRoute({ kind: 'setup' });
	};

	return (
		<div className="pk-vi-shell">
			<WorkspaceHeader snapshot={snapshot} route={route} onRoute={setRoute} onPrimary={openPrimary} />
			{snapshot.error && (
				<div className="pk-vi-notice is-error"><CircleAlert size={17} /><span>{snapshot.error}</span></div>
			)}
			<main ref={mainRef} className="pk-vi-main">
				{route.kind === 'surface' && route.surface === 'overview' && (
					<Overview snapshot={snapshot} runtime={runtime} config={config} onRoute={setRoute} />
				)}
				{route.kind === 'surface' && route.surface === 'map' && (
						<VaultMap snapshot={snapshot} runtime={runtime} initialSurface={route.mapSurface ?? 'contents'} initialDate={route.mapDate ?? null} initialExtension={route.mapExtension ?? null} onOpenSetup={(initialSelector) => setRoute({ kind: 'setup', initialSelector })} onOpenTask={(taskId) => openTask(taskId, 'queue')} onOpenMapText={(extension) => setRoute({ kind: 'map-text', extension })} />
				)}
				{route.kind === 'surface' && route.surface === 'queue' && (
					<WorkQueue
						tasks={snapshot.tasks}
						runtime={runtime}
						onOpenTask={(taskId) => openTask(taskId, 'queue')}
					/>
				)}
				{route.kind === 'setup' && (
			<ScanSetup snapshot={snapshot} config={config} initialSelector={route.initialSelector ?? null} onBack={() => setRoute({ kind: 'surface', surface: 'overview' })} onRouteChange={(operationId, candidate) => runtime.selectOperationRoute(operationId, candidate)} onStart={(plan) => {
						setRoute({ kind: 'progress' });
						void runtime.startScan(plan);
					}} />
				)}
				{route.kind === 'progress' && (
					<RunProgress snapshot={snapshot} runtime={runtime} onBack={() => setRoute({ kind: 'surface', surface: 'overview' })} onCompleted={() => setRoute({ kind: 'completed' })} onStartNew={() => setRoute({ kind: 'setup' })} />
				)}
				{route.kind === 'completed' && (
					<Completed snapshot={snapshot} runtime={runtime} onBack={() => setRoute({ kind: 'surface', surface: 'overview' })} onProgress={() => setRoute({ kind: 'progress' })} onOpenTask={(taskId) => openTask(taskId, 'completed')} />
				)}
				{route.kind === 'map-text' && (
					<MapTextWorkspace snapshot={snapshot} runtime={runtime} extension={route.extension} onBack={(extension) => setRoute({ kind: 'surface', surface: 'map', mapSurface: 'contents', mapExtension: extension })} />
				)}
				{route.kind === 'task' && (
					<MaintenanceWorkspace
						task={snapshot.tasks.find((task) => task.id === route.taskId) ?? null}
						config={config}
						communities={uniqueStrings(snapshot.digest?.clusters.map((cluster) => cluster.label) ?? [])}
						proposals={snapshot.proposals}
						runtime={runtime}
						onBack={() => setRoute(route.origin === 'completed' ? { kind: 'completed' } : { kind: 'surface', surface: 'queue' })}
						onOpenProposal={() => setRoute({ kind: 'proposal', taskId: route.taskId, origin: route.origin })}
					/>
				)}
				{route.kind === 'proposal' && (
					<ProposalWorkspace
						task={snapshot.tasks.find((task) => task.id === route.taskId) ?? null}
						proposal={[...snapshot.proposals].reverse().find((proposal) => proposal.taskId === route.taskId && proposal.status !== 'rejected') ?? null}
						runtime={runtime}
						onBack={() => setRoute({ kind: 'task', taskId: route.taskId, origin: route.origin })}
					/>
				)}
			</main>
		</div>
	);
};

function WorkspaceHeader({ snapshot, route, onRoute, onPrimary }: {
	snapshot: VaultIntelligenceSnapshot;
	route: Route;
	onRoute: (route: Route) => void;
	onPrimary: () => void;
}) {
	const currentSurface = route.kind === 'surface' ? route.surface : null;
	const active = snapshot.run.status === 'running' || snapshot.run.status === 'stopping';
	const resumable = snapshot.run.status === 'paused' || snapshot.run.status === 'interrupted';
	const firstSetup = snapshot.lastCompletedRun === null && snapshot.changedCursorAt === null;
	const [scanInfoOpen, setScanInfoOpen] = useState(false);
	const [mapMenuOpen, setMapMenuOpen] = useState(false);
	const scanButtonRef = useRef<HTMLButtonElement>(null);
	const mapButtonRef = useRef<HTMLButtonElement>(null);
	const scanWrapRef = useRef<HTMLDivElement>(null);
	const mapWrapRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!scanInfoOpen && !mapMenuOpen) return;
		const closeOnPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (scanInfoOpen && !scanWrapRef.current?.contains(target)) setScanInfoOpen(false);
			if (mapMenuOpen && !mapWrapRef.current?.contains(target)) setMapMenuOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			if (scanInfoOpen) { setScanInfoOpen(false); scanButtonRef.current?.focus(); }
			if (mapMenuOpen) { setMapMenuOpen(false); mapButtonRef.current?.focus(); }
		};
		window.addEventListener('pointerdown', closeOnPointerDown);
		window.addEventListener('keydown', closeOnEscape);
		return () => { window.removeEventListener('pointerdown', closeOnPointerDown); window.removeEventListener('keydown', closeOnEscape); };
	}, [mapMenuOpen, scanInfoOpen]);
	return (
		<header className="pk-vi-header">
			<div className="pk-vi-title-row">
				<div className="pk-vi-brand">
					<span className="pk-vi-mark"><VaultReferenceIcon name="vault" size={20} /></span>
					<div className="pk-vi-brand-text"><span className="pk-vi-eyebrow">PEAK ASSISTANT</span><span className="pk-vi-title">Vault Intelligence</span></div>
					<div className="pk-vi-header-status">
						{snapshot.lastCompletedRun ? <Button variant="ghost" onClick={() => onRoute({ kind: 'completed' })}>Last scan {formatDateTime(snapshot.lastCompletedRun.completedAt)}<ChevronRight size={13} /></Button> : <span>{firstSetup ? 'First setup' : 'Not prepared'}</span>}
						{snapshot.changedSinceScan !== null && snapshot.changedSinceScan > 0 && <Button variant="ghost" className="pk-vi-change-status" onClick={() => onRoute({ kind: 'setup' })}>· {formatNumber(snapshot.changedSinceScan)} changed <strong>Review plan</strong><ChevronRight size={12} /></Button>}
					</div>
				</div>
			</div>
			<nav className="pk-vi-nav" aria-label="Vault Intelligence pages">
				<Button variant="ghost" className={currentSurface === 'overview' ? 'is-active' : ''} onClick={() => onRoute({ kind: 'surface', surface: 'overview' })}>Overview</Button>
				<div ref={mapWrapRef} className="pk-vi-nav-map" onMouseEnter={() => setMapMenuOpen(true)} onMouseLeave={() => setMapMenuOpen(false)}>
					<Button ref={mapButtonRef} variant="ghost" className={currentSurface === 'map' ? 'is-active' : ''} aria-haspopup="menu" aria-expanded={mapMenuOpen} onFocus={() => setMapMenuOpen(true)} onClick={() => { onRoute({ kind: 'surface', surface: 'map', mapSurface: 'contents' }); setMapMenuOpen(false); }}>Vault map<ChevronDown size={13} /></Button>
					{mapMenuOpen && <div className="pk-vi-nav-map-menu" role="menu" aria-label="Vault map view"><Button variant="ghost" role="menuitem" onClick={() => { onRoute({ kind: 'surface', surface: 'map', mapSurface: 'contents' }); setMapMenuOpen(false); }}>Vault contents</Button><Button variant="ghost" role="menuitem" onClick={() => { onRoute({ kind: 'surface', surface: 'map', mapSurface: 'activity' }); setMapMenuOpen(false); }}>Activity</Button></div>}
				</div>
				<Button variant="ghost" className={currentSurface === 'queue' ? 'is-active' : ''} onClick={() => onRoute({ kind: 'surface', surface: 'queue' })}>Work queue{snapshot.tasks.filter((task) => task.state !== 'verified').length > 0 && <span className="pk-vi-count">{snapshot.tasks.filter((task) => task.state !== 'verified').length}</span>}</Button>
				<div ref={scanWrapRef} className="pk-vi-nav-scan-wrap" onMouseEnter={() => setScanInfoOpen(true)} onMouseLeave={() => setScanInfoOpen(false)}>
					<Button ref={scanButtonRef} className="pk-vi-nav-scan" aria-describedby={scanInfoOpen ? 'pk-vi-scan-help' : undefined} aria-expanded={scanInfoOpen} onFocus={() => setScanInfoOpen(true)} onClick={onPrimary}>{active ? <Activity size={15} /> : resumable ? <Play size={15} /> : <VaultReferenceIcon name="scan" size={15} />}{active ? 'View progress' : resumable ? 'Resume scan' : firstSetup ? 'Prepare Vault' : 'Scan Vault'}</Button>
					{scanInfoOpen && <div id="pk-vi-scan-help" className="pk-vi-scan-info-popover" role="tooltip"><strong>What a Vault scan does</strong><span>Discover and index current Vault objects, then publish review evidence and owner actions.</span><div><small>AI, provider and cost</small><span>The Scan plan shows every enabled AI operation, its selected provider/model and estimated use before it runs.</span></div><div><small>Write boundary</small><span>The Knowledge Index is Peak-owned and rebuildable. Markdown or frontmatter changes require a separate selected diff, Apply, and Verify.</span></div></div>}
				</div>
			</nav>
		</header>
	);
}

function Overview({ snapshot, runtime, config, onRoute }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	onRoute: (route: Route) => void;
}) {
	const openTasks = rankTasks(snapshot.tasks.filter((task) => task.state !== 'verified')).slice(0, 7);
	const hasLastScan = snapshot.lastCompletedRun !== null;
	const hasContinueWork = openTasks.length > 0;
	return (
		<div className="pk-vi-page pk-vi-overview">
			<ObjectInventory snapshot={snapshot} runtime={runtime} config={config} onRoute={onRoute} />
			{hasLastScan && <section className={`pk-vi-card pk-vi-continue${hasContinueWork ? ' has-work' : ' is-scan-only'}`}>
				{hasContinueWork && <div className="pk-vi-card-head"><span className="pk-vi-card-title">Continue work</span><span className="pk-vi-card-head-actions"><small>Top {Math.min(7, openTasks.length)}</small><Button variant="ghost" size="sm" onClick={() => onRoute({ kind: 'surface', surface: 'queue' })}>View all {snapshot.tasks.filter((task) => task.state !== 'verified').length}<ChevronRight size={15} /></Button></span></div>}
				<div className="pk-vi-continue-summary">
					<span><Clock3 size={14} /><small>Since last scan</small></span>
					<span><strong>{snapshot.changedSinceScan !== null ? formatNumber(snapshot.changedSinceScan) : 'No'}</strong><small>{snapshot.changedSinceScan !== null ? 'Vault items changed' : 'Change count unavailable'}</small></span>
					<span><strong>{snapshot.digest && (snapshot.digest.communityLinks?.length ?? 0) > 0 ? formatNumber(snapshot.digest.communityLinks?.length ?? 0) : 'No'}</strong><small>current connections</small></span>
					<span><strong>{snapshot.digest ? formatNumber(snapshot.digest.counts.orphans ?? 0) : '0'}</strong><small>notes need a home</small></span>
					<span><strong>{formatNumber(snapshot.tasks.filter((task) => task.kind === 'content-lifecycle' && task.state !== 'verified').length)}</strong><small>work states need review</small></span>
				</div>
				{hasContinueWork && <CompactTaskList tasks={openTasks} onOpen={(taskId) => onRoute({ kind: 'task', taskId, origin: 'queue' })} />}
			</section>
			}
			<OverviewActivity snapshot={snapshot} runtime={runtime} onOpenActivity={(date) => onRoute({ kind: 'surface', surface: 'map', mapSurface: 'activity', mapDate: date })} />
			<KnowledgeIndexOverview snapshot={snapshot} onReview={() => onRoute({ kind: 'setup' })} />
			{snapshot.loading && <div className="pk-vi-loading"><RefreshCw size={18} className="pk-vi-spin" />Reading current Vault state…</div>}
		</div>
	);
}

function ObjectInventory({ snapshot, runtime, config, onRoute }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	onRoute: (route: Route) => void;
}) {
	const objects = referenceObjectInventory(snapshot.objects);
	return <section className="pk-vi-inventory-strip">{objects.slice(0, 2).map((object) => {
		const presentation = config.inventoryObjects[object.id] ?? DEFAULT_VAULT_INTELLIGENCE_CONFIG.inventoryObjects[object.id];
		const canonicalBreakdown = object.id === 'files'
			? snapshot.fileTypes.map((type) => ({ id: type.extension, label: fileTypeLabel(type.extension), count: type.count }))
			: object.breakdown?.length ? object.breakdown : [{ id: 'canonical', label: canonicalObjectBucketLabel(object.id), count: object.count }];
		const breakdown = object.id === 'files'
			? inventoryPreviewItems(canonicalBreakdown, config.inventoryPreviewTypeLimit, config.inventoryTypeGroups ?? DEFAULT_VAULT_INTELLIGENCE_CONFIG.inventoryTypeGroups)
			: [...canonicalBreakdown].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
		const distributionUnavailable = object.id !== 'files'
			&& (object.breakdownStatus === 'unavailable' || canonicalBreakdown.length === 0);
		const statusLabel = object.id === 'files'
			? snapshot.changedSinceScan === null ? 'Not indexed yet' : `${formatNumber(snapshot.changedSinceScan)} changed`
			: object.count > 0 ? 'Recorded' : 'No records';
		const open = () => object.id === 'files'
			? onRoute({ kind: 'surface', surface: 'map', mapSurface: 'contents' })
			: void runtime.openOwnerSurface(object.id);
		return <div key={object.id} className={`pk-vi-inventory-item is-${object.id} ${object.id === 'files' ? 'is-files' : ''}`}>
			<span className="pk-vi-type-icon"><VaultReferenceIcon name={object.id} size={28} /></span><span className="pk-vi-inventory-value">{formatNumber(object.count)}</span><span className="pk-vi-inventory-label">{object.label}</span>
			<div className="pk-vi-inventory-hover" role="group" aria-label={`${object.label} distribution`}>
				<div className="pk-vi-hover-head"><div><strong>{presentation.title}</strong><DescriptionTooltip text={presentation.description} /></div><small className={distributionUnavailable ? 'is-unavailable' : ''}>{statusLabel}</small></div>
				<InventoryDistribution total={object.count} label={object.label} items={breakdown} colors={config.fileTypeColors} large={object.id === 'files'} unavailable={distributionUnavailable} unavailableTitle={presentation.unavailableTitle} unavailableDescription={presentation.unavailableDescription} />
				<div className="pk-vi-hover-footer"><Button variant="ghost" size="sm" onClick={open}>{object.id === 'files' ? 'Open full file inventory' : `Open ${object.label}`}<ChevronRight size={13} /></Button></div>
			</div>
		</div>;
	})}<PlannedSessionCard />{objects.slice(2).map((object) => {
		const presentation = config.inventoryObjects[object.id] ?? DEFAULT_VAULT_INTELLIGENCE_CONFIG.inventoryObjects[object.id];
		const canonicalBreakdown = object.breakdown?.length ? object.breakdown : [{ id: 'canonical', label: canonicalObjectBucketLabel(object.id), count: object.count }];
		const distributionUnavailable = object.breakdownStatus === 'unavailable' || canonicalBreakdown.length === 0;
		const statusLabel = object.count > 0 ? 'Recorded' : 'No records';
		return <div key={object.id} className={`pk-vi-inventory-item is-${object.id}`}>
			<span className="pk-vi-type-icon"><VaultReferenceIcon name={object.id} size={28} /></span><span className="pk-vi-inventory-value">{formatNumber(object.count)}</span><span className="pk-vi-inventory-label">{object.label}</span>
			<div className="pk-vi-inventory-hover" role="group" aria-label={`${object.label} distribution`}>
				<div className="pk-vi-hover-head"><div><strong>{presentation.title}</strong><DescriptionTooltip text={presentation.description} /></div><small className={distributionUnavailable ? 'is-unavailable' : ''}>{statusLabel}</small></div>
				<InventoryDistribution total={object.count} label={object.label} items={canonicalBreakdown} colors={config.fileTypeColors} large={false} unavailable={distributionUnavailable} unavailableTitle={presentation.unavailableTitle} unavailableDescription={presentation.unavailableDescription} />
				<div className="pk-vi-hover-footer"><span>{object.coverageNote ?? 'Canonical records only.'}</span><Button variant="ghost" size="sm" onClick={() => void runtime.openOwnerSurface(object.id)}>Open {object.label}<ChevronRight size={13} /></Button></div>
			</div>
		</div>;
	})}</section>;
}

function DescriptionTooltip({ text }: { text: string }) {
	return <span className="pk-vi-description-tooltip" tabIndex={0} aria-label={text}><Info size={14} /></span>;
}

function PlannedSessionCard() {
	return <div className="pk-vi-inventory-item is-sessions is-planned">
		<span className="pk-vi-type-icon"><Clock3 size={28} /></span><span className="pk-vi-inventory-value">—</span><span className="pk-vi-inventory-label">Sessions</span>
		<div className="pk-vi-inventory-hover" role="note" aria-label="Sessions availability">
			<div className="pk-vi-hover-head"><div><strong>Sessions</strong><span>A separate future concept; it does not reuse activity sessions or any existing runtime count.</span></div><small className="is-unavailable">Planned</small></div>
			<div className="pk-vi-inventory-unavailable"><strong>Sessions not implemented</strong><span>This card intentionally has no data or action until its own product and persistence contract exists.</span></div>
			<div className="pk-vi-hover-footer"><span>Recorded in the Roadmap and pre-launch scope review.</span></div>
		</div>
	</div>;
}

function canonicalObjectBucketLabel(id: VaultIntelligenceObjectSummary['id']): string {
	if (id === 'chats') return 'Recorded conversations';
	if (id === 'projects') return 'Current projects';
	if (id === 'composer') return 'Recorded workspace events';
	return 'Recorded files';
}

function InventoryDistribution({ total, label, items, colors, large, unavailable, unavailableTitle, unavailableDescription }: {
	total: number;
	label: string;
	items: Array<{ id: string; label: string; count: number }>;
	colors: string[];
	large: boolean;
	unavailable: boolean;
	unavailableTitle: string;
	unavailableDescription: string;
}) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const palette = colors.length > 0 ? colors : DEFAULT_VAULT_INTELLIGENCE_CONFIG.fileTypeColors;
	const rankedItems = [...items].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
	const rankedEntries = rankedItems.map((item, colorIndex) => ({ item, colorIndex }));
	const firstColumnLength = Math.ceil(rankedEntries.length / 2);
	const legendEntries = large
		? Array.from({ length: firstColumnLength }, (_, index) => [rankedEntries[index], rankedEntries[firstColumnLength + index]]).flat().filter((entry): entry is { item: typeof rankedItems[number]; colorIndex: number } => Boolean(entry))
		: rankedEntries;
	const empty = unavailable || rankedItems.length === 0;
	let offset = 0;
	return <div className={`pk-vi-inventory-distribution ${large ? 'is-large' : ''} ${unavailable ? 'is-unavailable' : ''}`}>
		<div className="pk-vi-inventory-pie-panel"><svg className="pk-vi-inventory-pie" viewBox="0 0 100 100" role="img" aria-label={unavailable ? `${label} distribution not available` : `${label} distribution`}>
			{empty && <circle className="pk-vi-pie-empty" cx="50" cy="50" r="49" />}
			{!unavailable && rankedEntries.map(({ item, colorIndex }) => {
			const start = total > 0 ? offset / total : 0;
			offset += item.count;
			const end = total > 0 ? offset / total : 0;
			return <path key={item.id} className={`pk-vi-pie-segment ${activeId && activeId !== item.id ? 'is-muted' : ''}`} d={pieSlicePath(start, end)} style={{ fill: palette[colorIndex % palette.length] }} onMouseEnter={() => setActiveId(item.id)} onMouseLeave={() => setActiveId(null)} />;
		})}</svg><strong>{formatNumber(total)} {label.toLowerCase()}</strong></div>
		<div className="pk-vi-inventory-legend">{unavailable
			? <div className="pk-vi-inventory-unavailable" role="status"><strong>{unavailableTitle}</strong><span>{unavailableDescription}</span></div>
			: legendEntries.map(({ item, colorIndex }) => <div key={item.id} className={`${activeId === item.id ? 'is-active' : ''} ${activeId && activeId !== item.id ? 'is-muted' : ''}`} tabIndex={0} onMouseEnter={() => setActiveId(item.id)} onMouseLeave={() => setActiveId(null)} onFocus={() => setActiveId(item.id)} onBlur={() => setActiveId(null)}><i style={{ background: palette[colorIndex % palette.length] }} /><strong>{item.label}</strong><span><b>{formatNumber(item.count)}</b> · {total > 0 ? `${(item.count / total * 100).toFixed(1)}%` : '0%'}</span></div>)}</div>
	</div>;
}

function inventoryPreviewItems(items: Array<{ id: string; label: string; count: number }>, limit: number, groups: VaultIntelligenceConfig['inventoryTypeGroups']) {
	const groupedExtensions = new Set(groups.flatMap((group) => group.extensions.map((extension) => extension.toLowerCase())));
	const grouped = groups.map((group) => ({
		id: group.id,
		label: group.label,
		count: items
			.filter((item) => group.extensions.includes(item.id.toLowerCase()))
			.reduce((sum, item) => sum + item.count, 0),
	})).filter((group) => group.count > 0);
	const otherCount = items
		.filter((item) => !groupedExtensions.has(item.id.toLowerCase()))
		.reduce((sum, item) => sum + item.count, 0);
	const ranked = (otherCount > 0
		? [...grouped, { id: 'other-formats', label: 'Other formats', count: otherCount }]
		: grouped).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
	const fallbackLimit = DEFAULT_VAULT_INTELLIGENCE_CONFIG.inventoryPreviewTypeLimit;
	const safeLimit = Number.isFinite(limit) ? Math.max(2, Math.floor(limit)) : fallbackLimit;
	if (ranked.length <= safeLimit) return ranked;
	const visible = ranked.slice(0, safeLimit - 1);
	const remaining = ranked.slice(safeLimit - 1);
	return [...visible, {
		id: 'other-formats',
		label: 'Other formats',
		count: remaining.reduce((sum, item) => sum + item.count, 0),
	}].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function referenceObjectInventory(objects: VaultIntelligenceObjectSummary[]): VaultIntelligenceObjectSummary[] {
	const byId = new Map(objects.map((object) => [object.id, object]));
	const fallback: VaultIntelligenceObjectSummary[] = [
		{ id: 'files', label: 'Files', count: 0, detail: 'Vault files visible to Peak', breakdown: [], coverageNote: 'No file inventory has been indexed yet.' },
		{ id: 'chats', label: 'Chats', count: 0, detail: 'Durable Peak conversations', breakdown: [{ id: 'canonical', label: 'Recorded conversations', count: 0 }], breakdownStatus: 'available', coverageNote: 'Conversation type is shown only when Chat Studio publishes it explicitly.' },
		{ id: 'projects', label: 'Projects', count: 0, detail: 'Current Peak projects', breakdown: [{ id: 'canonical', label: 'Current projects', count: 0 }], breakdownStatus: 'available', coverageNote: 'Lifecycle state is shown only when the Project store publishes it explicitly.' },
		{ id: 'composer', label: 'Composer', count: 0, detail: 'Durable Composer activity', breakdown: [{ id: 'canonical', label: 'Recorded workspace events', count: 0 }], breakdownStatus: 'available', coverageNote: 'Result state is shown only when Composer history publishes it explicitly.' },
	];
	const files = byId.get('files') ?? fallback[0];
	const chats = byId.get('chats') ?? fallback[1];
	const projects = byId.get('projects') ?? fallback[2];
	const composer = byId.get('composer') ?? fallback[3];
	return [
		files,
		{
			...chats,
			breakdown: [
				{ id: 'conversations', label: 'Chats', count: chats.count },
				{ id: 'projects', label: 'Projects', count: projects.count },
			],
			breakdownStatus: 'available',
			coverageNote: 'Projects are organized within Chats; they are not a separate Vault Intelligence object card.',
		},
		composer,
	];
}

function OverviewActivity({ snapshot, runtime, onOpenActivity }: { snapshot: VaultIntelligenceSnapshot; runtime: VaultIntelligenceWorkspaceRuntime; onOpenActivity: (date: string | null) => void }) {
	const [range, setRange] = useState<7 | 30 | 365>(365);
	const [rangeOpen, setRangeOpen] = useState(false);
	const [customOpen, setCustomOpen] = useState(false);
	const [customApplied, setCustomApplied] = useState(false);
	const [customError, setCustomError] = useState('');
	const [customStart, setCustomStart] = useState(() => dateOffsetKey(29));
	const [customEnd, setCustomEnd] = useState(() => dateOffsetKey(0));
	const [pinnedDate, setPinnedDate] = useState<string | null>(null);
	const [hoveredDate, setHoveredDate] = useState<string | null>(null);
	const rangeButtonRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!rangeOpen) return;
		const closeOnPointerDown = (event: PointerEvent) => {
			if (rangeButtonRef.current?.parentElement?.contains(event.target as Node)) return;
			setRangeOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setRangeOpen(false);
			rangeButtonRef.current?.focus();
		};
		window.addEventListener('pointerdown', closeOnPointerDown);
		window.addEventListener('keydown', closeOnEscape);
		return () => { window.removeEventListener('pointerdown', closeOnPointerDown); window.removeEventListener('keydown', closeOnEscape); };
	}, [rangeOpen]);
	const records = useMemo(
		() => allRecordedActivity(snapshot),
		[snapshot.recentActivity, snapshot.sourceActivity],
	);
	const mergedDays = mergeRecordedActivity(snapshot.activityDays, records);
	const days = customApplied ? calendarDaysBetween(mergedDays, customStart, customEnd) : calendarDays(mergedDays, range);
	const totalRecords = days.reduce((sum, day) => sum + day.count, 0);
	const max = Math.max(0, ...days.map((day) => day.count));
	const lastDay = days[days.length - 1] ?? null;
	const selectedDate = hoveredDate ?? pinnedDate;
	const selectedDay = days.find((day) => day.date === selectedDate) ?? [...days].reverse().find((day) => day.count > 0) ?? lastDay;
	const selectedRecords = selectedDay ? records.filter((record) => toLocalDateKey(new Date(record.timestamp)) === selectedDay.date) : [];
	const firstWeekday = days[0] ? new Date(`${days[0].date}T12:00:00`).getDay() : 0;
	const months = days.reduce<Array<{ key: string; label: string; column: number }>>((result, day, index) => {
		const date = new Date(`${day.date}T12:00:00`);
		const key = `${date.getFullYear()}-${date.getMonth()}`;
		if (result.some((month) => month.key === key)) return result;
		return [...result, { key, label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date), column: Math.floor((index + firstWeekday) / 7) + 1 }];
	}, []);
	return <section className="pk-vi-card pk-vi-overview-activity">
		<div className="pk-vi-card-head"><div className="pk-vi-overview-activity-title"><span className="pk-vi-card-title">Activity</span><span>{formatNumber(totalRecords)} records</span></div><div className="pk-vi-overview-activity-actions"><div className="pk-vi-overview-range"><Button ref={rangeButtonRef} variant="outline" aria-haspopup="dialog" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}><CalendarDays size={15} />{days[0] && lastDay ? `${formatShortDate(days[0].date)} – ${formatShortDate(lastDay.date)}` : 'No recorded range'}<ChevronDown size={13} /></Button>{rangeOpen && <div className="pk-vi-overview-range-popover" role="dialog" aria-label="Choose activity date range"><div className="pk-vi-overview-range-head"><strong>Date range</strong><Button variant="ghost" onClick={() => { setCustomApplied(false); setRange(365); setPinnedDate(null); setRangeOpen(false); }}>Clear filters</Button></div>{([7, 30, 365] as const).map((option) => <Button key={option} variant="ghost" className={!customApplied && range === option ? 'is-active' : ''} onClick={() => { setRange(option); setCustomApplied(false); setRangeOpen(false); setPinnedDate(null); }}><span>Last {option} days</span>{!customApplied && range === option && <Check size={14} />}</Button>)}<Button variant="ghost" className={customApplied ? 'is-active' : ''} onClick={() => setCustomOpen((open) => !open)}><span>Custom date</span><ChevronRight size={14} /></Button>{customOpen && <div className="pk-vi-custom-range"><div><label><span>Start</span><input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label><span>–</span><label><span>End</span><input type="date" value={customEnd} min={customStart} max={dateOffsetKey(0)} onChange={(event) => setCustomEnd(event.target.value)} /></label></div><div><small>{customError}</small><Button className="pk-vi-primary" size="sm" onClick={() => { if (!customStart || !customEnd || customStart > customEnd) { setCustomError('Choose a valid date range.'); return; } setCustomError(''); setCustomApplied(true); setRangeOpen(false); setPinnedDate(null); }}>Apply</Button></div></div>}</div>}</div><Button variant="ghost" size="sm" onClick={() => onOpenActivity(selectedDay?.date ?? null)}>Open Activity<ChevronRight size={14} /></Button></div></div>
		<div className="pk-vi-overview-activity-body"><div className="pk-vi-overview-heatmap"><div className="pk-vi-overview-heatmap-scroll"><div className="pk-vi-overview-heatmap-calendar"><div className="pk-vi-overview-months" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil((days.length + firstWeekday) / 7))}, 17px)` }}>{months.map((month) => <span key={month.key} style={{ gridColumn: month.column }}>{month.label}</span>)}</div><div className="pk-vi-overview-calendar"><div className="pk-vi-overview-weekdays"><span>Sun</span><span /><span>Tue</span><span /><span>Thu</span><span /><span>Sat</span></div><div className="pk-vi-overview-grid" role="grid" aria-label="Calendar heatmap of explicit Vault activity" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil((days.length + firstWeekday) / 7))}, 17px)` }}>{days.map((day, index) => <Button key={day.date} variant="ghost" size="icon" className={selectedDay?.date === day.date ? 'is-selected' : ''} style={{ gridColumn: Math.floor((index + firstWeekday) / 7) + 1, gridRow: (index + firstWeekday) % 7 + 1, '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} aria-label={`${day.date}, ${day.count} records${pinnedDate === day.date ? ', pinned' : ''}`} aria-pressed={pinnedDate === day.date} onMouseEnter={() => setHoveredDate(day.date)} onMouseLeave={() => setHoveredDate(null)} onFocus={() => setHoveredDate(day.date)} onBlur={() => setHoveredDate(null)} onClick={() => setPinnedDate((current) => current === day.date ? null : day.date)} />)}</div></div></div></div><div className="pk-vi-overview-evidence" aria-live="polite"><strong>{selectedDay ? `${formatLongDate(selectedDay.date)} · ${selectedDay.count} explicit records` : 'No recorded activity'}</strong><div>{selectedRecords.slice(0, 5).map((record) => <ActivityEvidenceRow key={record.id} icon={activityIcon(record.kind)} label={record.label} detail={record.objectPath ?? (record.runId ? `Run ${record.runId}` : 'Peak-owned record')} kind={record.kind} onOpen={() => void openActivityRecord(runtime, record)} />)}{selectedRecords.length === 0 && selectedDay?.files.slice(0, 5).map((file) => <ActivityEvidenceRow key={file.path} icon={<File size={14} />} label={file.path} detail="Vault file modification" kind="file" onOpen={() => void runtime.openFile(file.path)} />)}{selectedDay && selectedDay.count === 0 && <span className="pk-vi-empty">No explicit records for this date.</span>}</div></div><div className="pk-vi-overview-heatmap-footer"><div className="pk-vi-overview-legend"><span>None</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} style={{ '--pk-vi-level': level } as React.CSSProperties} />)}<span>More records</span></div></div></div>
		</div>
	</section>;
}

function KnowledgeIndexOverview({ snapshot, onReview }: { snapshot: VaultIntelligenceSnapshot; onReview: () => void }) {
	const [impactHelpOpen, setImpactHelpOpen] = useState(false);
	const discovered = snapshot.indexReadiness.discovered;
	const ready = snapshot.indexReadiness.searchReady;
	const searchPercent = discovered > 0 && ready !== null ? Math.min(100, Math.max(0, ready / discovered * 100)) : 0;
	// The ring reports searchable-index readiness. Other enrichment values can be
	// legitimately unreported, and must not dilute a real search-readiness value.
	const percent = Math.round(searchPercent);
	const readinessNote = ready !== null && ready > discovered
		? `${formatNumber(ready)} search records exceed ${formatNumber(discovered)} discovered objects. Search baseline needs a rebuild before it can be compared with current Vault contents.`
		: snapshot.indexReadiness.pendingOrExcluded === null
			? 'Pending and excluded counts are not reported.'
			: `${formatNumber(snapshot.indexReadiness.pendingOrExcluded)} pending or excluded by current Index evidence.`;
	return <section className="pk-vi-card pk-vi-index-overview"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Knowledge Index</span><DescriptionTooltip text="Search and machine knowledge maintained by Vault scans" /></div><div><span className={`pk-vi-readiness-state ${snapshot.indexReadiness.isReady ? 'is-ready' : 'is-pending'}`}>{snapshot.indexReadiness.pendingOrExcluded === null ? 'Readiness unavailable' : `${formatNumber(snapshot.indexReadiness.pendingOrExcluded)} updates pending`}</span><Button variant="ghost" size="sm" onClick={onReview}>Review next Index plan<ChevronRight size={14} /></Button></div></div><div className="pk-vi-index-overview-body"><div className="pk-vi-readiness-summary"><div className="pk-vi-readiness-ring" style={{ '--pk-vi-ready': `${percent * 3.6}deg` } as React.CSSProperties}><span>{percent}%</span></div></div><div className="pk-vi-index-meters"><IndexMeter label="Search ready" value={ready} total={discovered} /><IndexMeter label="Vectors ready" value={null} total={discovered} /><IndexMeter label="Summary ready" value={null} total={discovered} /><IndexMeter label="AI Tags ready" value={null} total={discovered} /><small>{readinessNote}</small></div><div className="pk-vi-index-impact"><div className="pk-vi-index-impact-head"><strong>What this Index powers</strong><span className="pk-vi-index-impact-help" tabIndex={0} aria-label="About what this Index powers" onMouseEnter={() => setImpactHelpOpen(true)} onMouseLeave={() => setImpactHelpOpen(false)} onFocus={() => setImpactHelpOpen(true)} onBlur={() => setImpactHelpOpen(false)}><Info size={14} />{impactHelpOpen && <span className="pk-vi-index-impact-tooltip" role="tooltip">One maintained layer is reused across Peak instead of every feature reading the Vault again. Full-text, vectors, summaries, AI Tags, and relationship signals are rebuildable Peak knowledge; your Markdown and frontmatter stay unchanged.</span>}</span></div><div><span><Search size={14} />Vault Search</span><span><Sparkles size={14} />AI Search</span><span><FileText size={14} />File context</span><span><GitBranch size={14} />Vault map</span></div></div></div></section>;
}

function ActivityEvidenceRow({ icon, label, detail, kind, onOpen }: { icon: React.ReactNode; label: string; detail: string; kind: string; onOpen: () => void }) {
	return <Button variant="ghost" className="pk-vi-overview-evidence-row" onClick={onOpen} aria-label={`Open ${label}`}><span className={`is-${kind}`}>{icon}</span><div><strong>{label}</strong><span>{detail}</span></div><small>{kind}</small></Button>;
}

function openActivityRecord(runtime: VaultIntelligenceWorkspaceRuntime, record: VaultIntelligenceSnapshot['recentActivity'][number]): Promise<boolean> {
	if ((record.kind === 'file-change' || record.kind === 'composer') && record.objectPath) return runtime.openFile(record.objectPath);
	if (record.kind === 'chat') return runtime.openOwnerSurface('chats');
	if (record.kind === 'project') return runtime.openOwnerSurface('projects');
	if (record.objectPath) return runtime.openFile(record.objectPath);
	return Promise.resolve(false);
}

function IndexMeter({ label, value, total }: { label: string; value: number | null; total: number }) {
	const percent = value === null || total === 0 ? 0 : Math.min(100, value / total * 100);
	const status = value === null ? 'Not reported' : value >= total ? 'Ready' : `${formatNumber(value)} ready`;
	const detail = value === null
		? `${label} has not been reported by the Index runtime.`
		: `${formatNumber(value)} of ${formatNumber(total)} current Vault objects have this Index output.`;
	return <div className="pk-vi-index-meter"><span>{label}<DescriptionTooltip text={detail} /></span><i><b style={{ width: `${percent}%` }} /></i><strong>{value === null ? status : `${formatNumber(value)} / ${formatNumber(total)}`}</strong></div>;
}

function activityIcon(kind: VaultIntelligenceSnapshot['recentActivity'][number]['kind']) {
	if (kind === 'chat') return <MessageSquare size={14} />;
	if (kind === 'composer') return <PenLine size={14} />;
	if (kind === 'project') return <FolderKanban size={14} />;
	if (kind === 'scan') return <ScanSearch size={14} />;
	if (kind === 'apply' || kind === 'verify') return <Check size={14} />;
	return <File size={14} />;
}

function CompactTaskList({ tasks, onOpen }: { tasks: VaultMaintenanceTask[]; onOpen: (taskId: string) => void }) {
	if (tasks.length === 0) return <div className="pk-vi-empty"><Check size={19} />No unresolved maintenance work.</div>;
	return <div className="pk-vi-compact-tasks">{tasks.map((task) => (
		<Button key={task.id} variant="ghost" className="pk-vi-compact-task" onClick={() => onOpen(task.id)}>
			<span className="pk-vi-task-name"><small>{task.typeLabel}</small><strong>{task.title}</strong></span>
			<span className="pk-vi-task-affected"><strong>{task.affectedLabel}</strong><span>· {task.contextLabel}</span></span>
			<TaskStatus task={task} />
		</Button>
	))}</div>;
}

function VaultMap({ snapshot, runtime, initialSurface, initialDate, initialExtension, onOpenSetup, onOpenTask, onOpenMapText }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	initialSurface: MapSurface;
	initialDate: string | null;
	initialExtension: string | null;
	onOpenSetup: (initialSelector: VaultScanScopeSelector | null) => void;
	onOpenTask: (taskId: string) => void;
	onOpenMapText: (extension: string | null) => void;
}) {
	const [surface, setSurface] = useState<MapSurface>(initialSurface);
	const [selectedExtension, setSelectedExtension] = useState<string | null>(initialExtension);
	useEffect(() => setSurface(initialSurface), [initialSurface]);
	const scanSelection = selectedExtension === null ? null : {
		id: `file-type:${selectedExtension}`,
		kind: 'file-type' as const,
		label: `${fileTypeLabel(selectedExtension)} files`,
		paths: snapshot.availablePaths.filter((path) => pathExtension(path) === selectedExtension),
	};
	return <div className="pk-vi-page">
		<div className="pk-vi-page-head pk-vi-map-head"><div>{surface === 'contents' ? <div className="pk-vi-map-title"><span className="pk-vi-page-title">Vault Content Map</span><DescriptionTooltip text="Explore the current Vault knowledge structure and the verified references between its contents." /></div> : <><span className="pk-vi-page-title">Activity</span><DescriptionTooltip text="Timestamped local evidence by recorded source. Work sessions group real Vault Intelligence receipts; no topic is guessed." /></>}</div>{surface === 'contents' ? <div className="pk-vi-page-actions"><Button variant="ghost" size="sm" className="pk-vi-map-action-pill" onClick={() => onOpenMapText(selectedExtension)}>Manage map text</Button><Button variant="ghost" size="sm" className="pk-vi-map-action-pill" onClick={() => onOpenSetup(scanSelection)}><ScanSearch size={14} />Scan selected type</Button></div> : <span className="pk-vi-map-freshness">{snapshot.indexReadiness.builtAt ? `Index built ${formatDateTime(snapshot.indexReadiness.builtAt)}` : 'No completed Index build'}</span>}</div>
		{surface === 'contents' ? <VaultContents snapshot={snapshot} runtime={runtime} selectedExtension={selectedExtension} onOpenTask={onOpenTask} /> : <ActivityView snapshot={snapshot} runtime={runtime} initialDate={initialDate} />}
	</div>;
}

function VaultContents({ snapshot, runtime, selectedExtension, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	selectedExtension: string | null;
	onOpenTask: (taskId: string) => void;
}) {
	return <div className="pk-vi-map-layout">
		<KnowledgeGraph snapshot={snapshot} runtime={runtime} selectedExtension={selectedExtension} />
		{snapshot.tasks.some((task) => task.kind === 'community-membership' || task.kind === 'community-structure' || task.kind === 'unusual-notes') && (
			<section className="pk-vi-card pk-vi-map-annotation"><div><strong>Structural maintenance is available</strong><span>Evidence is annotated here; decisions and verification stay in Work queue.</span></div><Button variant="ghost" onClick={() => onOpenTask(snapshot.tasks.find((task) => task.kind === 'community-membership' || task.kind === 'community-structure' || task.kind === 'unusual-notes')!.id)}>Open task<ChevronRight size={15} /></Button></section>
		)}
	</div>;
}

function MapTextWorkspace({ snapshot, runtime, extension, onBack }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	extension: string | null;
	onBack: (extension: string | null) => void;
}) {
	const communities = snapshot.digest?.clusters ?? [];
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [showAllHubs, setShowAllHubs] = useState(false);
	const entryFor = (communityId: string) => snapshot.mapTextEntries.find((entry) => entry.communityId === communityId) ?? null;
	const editingCommunity = communities.find((community) => community.id === editingId) ?? null;
	const editingEntry = editingId ? entryFor(editingId) : null;
	const totalVersions = snapshot.mapTextEntries.reduce((total, entry) => total + (entry.revisions?.length ?? 1), 0);
	const openEditor = (communityId: string) => { setEditingId(communityId); setDraft(entryFor(communityId)?.text ?? ''); };
	const hubs = snapshot.digest?.hubs ?? [];
	return <div className="pk-vi-page pk-vi-map-copy-workspace">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: () => onBack(extension) }, { label: 'Vault map', action: () => onBack(extension) }, { label: 'Map text' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Vault map text</span><span className="pk-vi-page-description">View and manage the current descriptions and labels used by the map. Peak versions this text automatically; edit it or restore an earlier version here.</span></div><span className="pk-vi-map-freshness">{totalVersions} current {totalVersions === 1 ? 'version' : 'versions'}</span></div>
		<section className="pk-vi-card pk-vi-map-copy-summary">{[[snapshot.mapTextEntries.length, 'Community descriptions'], [communities.reduce((total, community) => total + community.dominantTopics.length, 0), 'Topic labels'], [hubs.length, 'Hub descriptions'], [totalVersions, 'Current versions']].map(([value, label]) => <span key={String(label)}><strong>{value}</strong><small>{label}</small></span>)}</section>
		<section className="pk-vi-card pk-vi-map-copy-group"><div className="pk-vi-map-copy-head"><div><strong>Community descriptions</strong><small>Shown when someone selects a large area in the Vault map.</small></div><span>Current</span></div>{communities.length === 0 ? <MapCopyEmpty label="No Community descriptions yet" /> : communities.map((community) => { const entry = entryFor(community.id); return <div className="pk-vi-map-copy-row" key={community.id}><div><strong>{community.label}<small>{entry ? 'Updated by Scan' : 'Not described yet'}</small></strong><span>{entry ? 'Current version reflects the latest Community membership and map evidence.' : 'The Community is visible in the map; Peak has not published a description yet.'}</span><p><b>Current description</b><br />{entry?.text || 'Not available'}</p></div><div><Button variant="ghost" size="sm" onClick={() => openEditor(community.id)}>Edit</Button><Button variant="ghost" size="sm" disabled={!entry?.revisions?.length}>Version history</Button></div></div>; })}</section>
		<section className="pk-vi-card pk-vi-map-copy-group"><div className="pk-vi-map-copy-head"><div><strong>Topic labels</strong><small>Names for stable clusters inside existing Communities.</small></div><span>{communities.length ? 'Current' : 'Not available'}</span></div>{communities.length === 0 ? <MapCopyEmpty label="No Topic labels yet" /> : communities.map((community) => <div className="pk-vi-map-copy-row" key={community.id}><div><strong>Inside {community.label}<small>{community.dominantTopics.length} labels · {community.memberCount} files</small></strong><div className="pk-vi-map-copy-labels">{community.dominantTopics.length ? community.dominantTopics.map((topic) => <span key={topic}><b>{topic}</b><small>Current Index topic</small></span>) : <span>Not available</span>}</div></div><div><Button variant="ghost" size="sm" disabled>Edit labels</Button><Button variant="ghost" size="sm" disabled>Version history</Button></div></div>)}</section>
		<section className="pk-vi-card pk-vi-map-copy-group"><div className="pk-vi-map-copy-head"><div><strong>Hub descriptions</strong><small>Short explanations shown when someone selects a highly connected note.</small></div><span>{hubs.length ? 'Current' : 'Not available'}</span></div>{hubs.length === 0 ? <MapCopyEmpty label="No Hub descriptions yet" /> : hubs.slice(0, showAllHubs ? undefined : 2).map((hub) => <div className="pk-vi-map-copy-row" key={hub.path}><div><strong>{hub.path}<small>{hub.incomingCount ?? 0} incoming links</small></strong><p><b>Current description</b><br />Not available</p></div><div><Button variant="ghost" size="sm" disabled>Edit</Button><Button variant="ghost" size="sm" disabled>Version history</Button></div></div>)}{hubs.length > 2 && <div className="pk-vi-map-copy-more"><span>{showAllHubs ? '' : `${hubs.length - 2} lower-traffic Hubs are collapsed to keep this page readable.`}</span><Button variant="ghost" size="sm" onClick={() => setShowAllHubs((current) => !current)}>{showAllHubs ? 'Hide extra Hubs' : `Show ${hubs.length - 2} more`}</Button></div>}</section>
		<footer className="pk-vi-footer-actions pk-vi-map-copy-footer"><span>Peak-owned map text is versioned and managed here. Scan may refresh it, but never creates a generic text-review task.</span><Button className="pk-vi-primary" onClick={() => onBack(extension)}>Done</Button></footer>
		{editingCommunity && <div className="pk-vi-map-copy-editor" role="dialog" aria-label={`Edit ${editingCommunity.label} map text`}><section><div><strong>Edit {editingCommunity.label}</strong><Button variant="ghost" size="sm" aria-label="Close map text editor" onClick={() => setEditingId(null)}><X size={15} /></Button></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a grounded description for this Community…" /><footer><Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button><Button className="pk-vi-primary" onClick={() => { void runtime.saveMapText(editingCommunity.id, draft); setEditingId(null); }}>Save draft</Button></footer></section></div>}
	</div>;
}

function MapCopyEmpty({ label }: { label: string }) { return <div className="pk-vi-map-copy-empty"><strong>{label}</strong><span>Build the Knowledge Index or publish Peak-owned map text to populate this reference-compatible region.</span></div>; }

function KnowledgeGraph({ snapshot, runtime, selectedExtension }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	selectedExtension: string | null;
}) {
	const [preset, setPreset] = useState<AtlasGraphPreset>('constellation');
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [expandedCommunityIds, setExpandedCommunityIds] = useState<Set<string>>(() => new Set());
	const model = useMemo(() => buildVaultIntelligenceGraph(snapshot.digest, {
		extension: selectedExtension,
		expandedCommunityIds,
		communityMembers: snapshot.communityMembers,
	}), [expandedCommunityIds, selectedExtension, snapshot.communityMembers, snapshot.digest]);
	const selected = model?.nodes.find((node) => node.id === selectedNodeId) ?? null;
	const communityCount = snapshot.digest?.clusters.length ?? 0;
	const selectedCommunityId = selected?.path.startsWith('community:') ? selected.communityId ?? null : null;
	const selectedExpanded = selectedCommunityId ? expandedCommunityIds.has(selectedCommunityId) : false;
	const toggleCommunity = (communityId: string) => {
		setExpandedCommunityIds((current) => {
			const next = new Set(current);
			if (next.has(communityId)) next.delete(communityId);
			else next.add(communityId);
			return next;
		});
		void runtime.expandCommunity(communityId);
	};
	return <div className="pk-vi-graph-layout">
		<section className="pk-vi-card pk-vi-graph-card">
			<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Knowledge map{selectedExtension ? ` · .${selectedExtension}` : ''}</span><span className="pk-vi-card-caption">Knowledge communities contain representative Topics and Hubs; lines show verified references.</span></div><div className="pk-vi-segmented pk-vi-graph-presets"><Button variant="ghost" className={preset === 'constellation' ? 'is-active' : ''} onClick={() => setPreset('constellation')}>Constellation</Button><Button variant="ghost" className={preset === 'flow-lr' ? 'is-active' : ''} onClick={() => setPreset('flow-lr')}><ArrowRight size={13} />Flow</Button><Button variant="ghost" className={preset === 'flow-tb' ? 'is-active' : ''} onClick={() => setPreset('flow-tb')}><ArrowDown size={13} />Flow</Button><Button variant="ghost" className={preset === 'orbit' ? 'is-active' : ''} onClick={() => setPreset('orbit')}>Orbit</Button></div></div>
			<div className="pk-vi-graph-canvas"><AtlasGraphCanvas model={model} preset={preset} showSemantic={false} layerLabel="Verified references" showMiniMap emptyLabel="Build the Knowledge Index to see current Communities." onNodeTap={(node) => setSelectedNodeId((current) => current === node.id ? null : node.id)} onNodeDblTap={(node) => { if (node.path.startsWith('community:') && node.communityId) toggleCommunity(node.communityId); else void runtime.openFile(node.path); }} /></div>
			<section className="pk-vi-community-summary" aria-label="Community summary"><div><strong>Community summary</strong><span>{communityCount} {communityCount === 1 ? 'community' : 'communities'}</span></div>{communityCount > 0 ? <div className="pk-vi-community-summary-list">{(snapshot.digest?.clusters ?? []).map((community) => <Button key={community.id} variant="ghost" className={selectedNodeId === `community:${community.id}` ? 'is-active' : ''} onClick={() => setSelectedNodeId(`community:${community.id}`)}><strong>{community.label}</strong><span>{formatNumber(community.memberCount)} notes</span><small>{snapshot.indexReadiness.discovered ? `${Math.round(community.memberCount / snapshot.indexReadiness.discovered * 100)}%` : 'Not available'}</small></Button>)}</div> : <div className="pk-vi-empty">No Communities available until the Knowledge Index is built.</div>}</section>
			<div className="pk-vi-graph-legend"><span><i className="is-community" />Community</span><span><i className="is-topic" />Topic / Hub</span><span><b className="is-contains" />contains</span><span><b className="is-reference" />reference</span></div>
		</section>
		<section className="pk-vi-graph-context" aria-label="Map context">
			<div className="pk-vi-card"><div className="pk-vi-context-label"><GitBranch size={16} />Structure</div><strong>{communityCount > 0 ? `${formatNumber(communityCount)} Communities` : 'No Communities available'}</strong><span>{model ? `${formatNumber(model.nodes.length)} visible nodes · ${formatNumber(model.edges.length)} verified relations` : 'Build the Knowledge Index to derive structure.'}</span></div>
			<div className="pk-vi-card pk-vi-selection-context"><div className="pk-vi-selection"><div className="pk-vi-card-head"><span className="pk-vi-card-title">Selection</span>{selected && <Button variant="ghost" size="sm" onClick={() => setSelectedNodeId(null)}>Clear<X size={14} /></Button>}</div>{selected ? <><span className="pk-vi-selection-type">{String(selected.metadata?.kind ?? selected.role)}</span><strong>{selected.label}</strong><span>{selected.path.startsWith('community:') ? `${selected.constituentCount ?? 0} notes in this Community` : selected.path}</span>{selectedCommunityId && <Button variant="ghost" size="sm" onClick={() => toggleCommunity(selectedCommunityId)}>{selectedExpanded ? 'Collapse members' : 'Expand members'}<ChevronRight size={14} /></Button>}{Array.isArray(selected.metadata?.topics) && <div className="pk-vi-topic-list">{(selected.metadata.topics as string[]).map((topic) => <span key={topic}>{topic}</span>)}</div>}</> : <div className="pk-vi-empty">Select a Community, Topic or Hub to inspect current evidence.</div>}</div><div className="pk-vi-interpretation"><div className="pk-vi-context-label"><Sparkles size={16} />AI interpretation</div><strong>Not generated</strong><span>{selected ? 'No AI claim is stored for this selection. Run an enabled Community analysis to create reviewable evidence.' : 'Select a node first. The map does not invent themes from geometry.'}</span></div></div>
		</section>
	</div>;
}

function ActivityView({ snapshot, runtime, initialDate }: { snapshot: VaultIntelligenceSnapshot; runtime: VaultIntelligenceWorkspaceRuntime; initialDate: string | null }) {
	const [mode, setMode] = useState<ActivityMode>('recorded');
	const [source, setSource] = useState<ActivitySource>('all');
	const [selectedThemeId, setSelectedThemeId] = useState('all');
	const [activityFilterQuery, setActivityFilterQuery] = useState('');
	const [selection, setSelection] = useState({ start: 21, end: 35 });
	const navigatorRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<ActivityRangeDrag | null>(null);
	const records = useMemo(
		() => allRecordedActivity(snapshot),
		[snapshot.recentActivity, snapshot.sourceActivity],
	);
	const calendar = useMemo(() => calendarDays(mergeRecordedActivity(snapshot.activityDays, records), 36), [snapshot.activityDays, records]);
	useEffect(() => {
		if (!initialDate) return;
		const index = calendar.findIndex((day) => day.date === initialDate);
		if (index < 0) return;
		setSelection({ start: Math.max(0, index - 7), end: Math.min(calendar.length - 1, index + 7) });
	}, [calendar, initialDate]);
	const selectedDays = calendar.slice(selection.start, selection.end + 1);
	const selectedDates = new Set(selectedDays.map((day) => day.date));
	const periodRecords = records.filter((record) => selectedDates.has(toLocalDateKey(new Date(record.timestamp))));
	const buckets = bucketRecordedActivity(calendar, records, 36);
	const maxFile = Math.max(1, ...buckets.map((bucket) => bucket.fileCount));
	const maxVault = Math.max(1, ...buckets.map((bucket) => bucket.vaultCount));
	const maxChat = Math.max(1, ...buckets.map((bucket) => bucket.chatCount));
	const maxComposer = Math.max(1, ...buckets.map((bucket) => bucket.composerCount));
	const maxProject = Math.max(1, ...buckets.map((bucket) => bucket.projectCount));
	const sessions = snapshot.activitySessions.filter((session) => selectedDates.has(toLocalDateKey(new Date(session.endedAt)))).slice(0, 5);
	const derivedSessions = buildRecordedSessions(periodRecords).slice(0, 5);
	const themes = snapshot.activityThemes.filter((theme) => theme.citations.some((citation) => periodRecords.some((record) => record.id === citation.recordId)));
	const startDate = selectedDays[0]?.date ?? calendar[0]?.date ?? '';
	const endDate = selectedDays[selectedDays.length - 1]?.date ?? calendar[calendar.length - 1]?.date ?? '';
	const rangeStart = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Date.now() - 35 * 86_400_000;
	const rangeEnd = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Date.now();
	const totalRecords = calendar.reduce((sum, day) => sum + day.count, 0);
	const selectedTotal = selectedDays.reduce((sum, day) => sum + day.count, 0);
	const citedRecordIds = new Set(themes.flatMap((theme) => theme.recordIds));
	const unclassified = Math.max(0, periodRecords.filter((record) => !citedRecordIds.has(record.id)).length);
	const densityMax = Math.max(1, ...buckets.map((bucket) => bucket.fileCount + bucket.chatCount + bucket.projectCount + bucket.composerCount + bucket.vaultCount));
	const sourceOptions: Array<{ id: ActivitySource; label: string }> = [
		{ id: 'all', label: mode === 'recorded' ? 'All record types' : 'All analyzed themes' },
		{ id: 'files', label: 'File edits' },
		{ id: 'chat', label: 'Chat context' },
		{ id: 'project', label: 'Project changes' },
		{ id: 'composer', label: 'Composer activity' },
		{ id: 'peak', label: 'Peak-native revisions' },
	];
	const normalizedFilterQuery = activityFilterQuery.trim().toLocaleLowerCase();
	const visibleSourceOptions = sourceOptions.filter((option) => !normalizedFilterQuery || option.label.toLocaleLowerCase().includes(normalizedFilterQuery));
	const visibleThemes = themes.filter((theme) => (selectedThemeId === 'all' || theme.id === selectedThemeId) && (!normalizedFilterQuery || theme.label.toLocaleLowerCase().includes(normalizedFilterQuery)));
	const sourceLabel = mode === 'recorded'
		? sourceOptions.find((option) => option.id === source)?.label ?? 'All record types'
		: selectedThemeId === 'all'
			? 'All analyzed themes'
			: themes.find((theme) => theme.id === selectedThemeId)?.label ?? 'All analyzed themes';
	const selectedLength = selection.end - selection.start + 1;
	const previousDays = calendar.slice(Math.max(0, selection.start - selectedLength), selection.start);
	const previousDates = new Set(previousDays.map((day) => day.date));
	const previousSessions = snapshot.activitySessions.filter((session) => previousDates.has(toLocalDateKey(new Date(session.endedAt))));
	const comparisonRows = [
		{ label: 'Explicit records', current: selectedTotal, previous: previousDays.reduce((sum, day) => sum + day.count, 0) },
		{ label: 'Active days', current: selectedDays.filter((day) => day.count > 0).length, previous: previousDays.filter((day) => day.count > 0).length },
		{ label: 'Work sessions', current: sessions.length || derivedSessions.length, previous: previousSessions.length },
	];
	const pointerIndex = (clientX: number) => {
		const rect = navigatorRef.current?.getBoundingClientRect();
		if (!rect || rect.width <= 0) return 0;
		return Math.max(0, Math.min(calendar.length - 1, Math.round((clientX - rect.left) / rect.width * (calendar.length - 1))));
	};
	const beginRangeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		const dragTarget = (event.target as HTMLElement).closest<HTMLElement>('[data-range-drag]');
		if (!dragTarget) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = { kind: dragTarget.dataset.rangeDrag as ActivityRangeDrag['kind'], originIndex: pointerIndex(event.clientX), ...selection };
	};
	const moveRangeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		const index = pointerIndex(event.clientX);
		if (drag.kind === 'start') {
			setSelection({ start: Math.min(index, drag.end - 1), end: drag.end });
			return;
		}
		if (drag.kind === 'end') {
			setSelection({ start: drag.start, end: Math.max(index, drag.start + 1) });
			return;
		}
		const width = drag.end - drag.start;
		const delta = index - drag.originIndex;
		const start = Math.max(0, Math.min(calendar.length - 1 - width, drag.start + delta));
		setSelection({ start, end: start + width });
	};
	const endRangeDrag = () => { dragRef.current = null; };
	return <div className="pk-vi-activity-workspace">
		<section className="pk-vi-card pk-vi-activity-explorer">
			<div className="pk-vi-activity-answer-head"><div><strong>{formatNumber(totalRecords)} explicit activity records are available in this period.</strong><span>The default view shows timestamped local evidence. AI work themes are a generated layer, not historical fact.</span></div><div className="pk-vi-activity-mode-switch" role="tablist" aria-label="Activity data layer"><Button variant="ghost" className={mode === 'recorded' ? 'is-active' : ''} role="tab" aria-selected={mode === 'recorded'} onClick={() => { setMode('recorded'); setSource('all'); setActivityFilterQuery(''); }}>Recorded activity</Button><Button variant="ghost" className={mode === 'themes' ? 'is-active' : ''} role="tab" aria-selected={mode === 'themes'} onClick={() => { setMode('themes'); setSelectedThemeId('all'); setActivityFilterQuery(''); }}>AI work themes</Button></div></div>
			<div className="pk-vi-activity-analysis-state" data-mode={mode}><div><i /><strong>{mode === 'recorded' ? 'Recorded locally' : themes.length ? `${themes.length} cited themes` : 'AI analysis not generated'}</strong><span>{mode === 'recorded' ? 'File edits, Chat context, Project changes, Composer activity, and Peak-native revisions.' : 'Themes are Peak-owned annotations generated only from the selected explicit records.'}</span></div><div><span className={`pk-vi-readiness-state ${mode === 'recorded' || themes.length ? 'is-ready' : 'is-pending'}`}>{mode === 'recorded' ? 'Always available' : themes.length ? 'Citations available' : 'Not analyzed'}</span><Button variant="ghost" onClick={() => void runtime.analyzeActivityThemes(rangeStart, rangeEnd)}>Analyze themes</Button></div></div>
			<div className="pk-vi-activity-complete-workspace">
				<div className="pk-vi-activity-chart-pane">
					<div className="pk-vi-activity-toolbar"><div><details className="pk-vi-activity-source-picker"><summary>{sourceLabel}<ChevronDown size={13} /></summary><div><input type="search" value={activityFilterQuery} onChange={(event) => setActivityFilterQuery(event.target.value)} placeholder={mode === 'recorded' ? 'Find a record source' : 'Find an analyzed theme'} aria-label={mode === 'recorded' ? 'Find a record source' : 'Find an analyzed theme'} />{mode === 'recorded' ? visibleSourceOptions.map((option) => <Button key={option.id} variant="ghost" className={source === option.id ? 'is-active' : ''} onClick={() => setSource(option.id)}><span>{option.label}</span>{source === option.id && <Check size={13} />}</Button>) : <><Button variant="ghost" className={selectedThemeId === 'all' ? 'is-active' : ''} onClick={() => setSelectedThemeId('all')}><span>All analyzed themes</span>{selectedThemeId === 'all' && <Check size={13} />}</Button>{themes.filter((theme) => !normalizedFilterQuery || theme.label.toLocaleLowerCase().includes(normalizedFilterQuery)).map((theme) => <Button key={theme.id} variant="ghost" className={selectedThemeId === theme.id ? 'is-active' : ''} onClick={() => setSelectedThemeId(theme.id)}><span>{theme.label}</span>{selectedThemeId === theme.id && <Check size={13} />}</Button>)}</>}</div></details><Button variant="ghost" className={(mode === 'recorded' ? source === 'all' : selectedThemeId === 'all') ? 'is-active' : ''} onClick={() => { setSource('all'); setSelectedThemeId('all'); setActivityFilterQuery(''); }}>Show all</Button></div><span><strong>{formatNumber(selectedTotal)} records</strong><small>selected range</small></span></div>
					<div className="pk-vi-activity-timeline-wrap"><div className="pk-vi-activity-timeline-chart"><div className="pk-vi-activity-lane-axis"><span>{mode === 'recorded' ? 'Recorded source' : 'Analyzed theme'}</span><div>{[0, 7, 14, 21, 28, 35].map((index) => <span key={index}>{calendar[index] ? formatActivityDateKey(calendar[index].date) : '—'}</span>)}</div></div><div className="pk-vi-activity-lane-list">{mode === 'recorded' ? <>
						<ActivityLane label="File edits" detail="Vault file modification timestamps" buckets={buckets} value={(bucket) => bucket.fileCount} max={maxFile} tone="files" muted={source !== 'all' && source !== 'files'} selection={selection} />
						<ActivityLane label="Chat context" detail="Durable conversation records" buckets={buckets} value={(bucket) => bucket.chatCount} max={maxChat} tone="chat" muted={source !== 'all' && source !== 'chat'} selection={selection} />
						<ActivityLane label="Project changes" detail="Durable project state events" buckets={buckets} value={(bucket) => bucket.projectCount} max={maxProject} tone="project" muted={source !== 'all' && source !== 'project'} selection={selection} />
						<ActivityLane label="Composer activity" detail="Durable Composer records" buckets={buckets} value={(bucket) => bucket.composerCount} max={maxComposer} tone="composer" muted={source !== 'all' && source !== 'composer'} selection={selection} />
						<ActivityLane label="Peak-native revisions" detail="Scan, Apply, Verify, and graph receipts" buckets={buckets} value={(bucket) => bucket.vaultCount} max={maxVault} tone="receipts" muted={source !== 'all' && source !== 'peak'} selection={selection} />
					</> : visibleThemes.length ? visibleThemes.map((theme) => <div key={theme.id} className="pk-vi-activity-theme-row"><span><strong>{theme.label}</strong><small>{theme.citations.length} cited records</small></span><div>{theme.citations.slice(0, 8).map((citation) => <i key={citation.recordId} title={citation.objectPath ?? citation.recordId} />)}</div></div>) : <div className="pk-vi-activity-empty-state"><strong>{themes.length ? 'No themes match this filter' : 'No AI work themes yet'}</strong><span>{themes.length ? 'Clear the theme filter to restore every analyzed theme in the selected period.' : 'Recorded activity remains available. Analyze the selected range to add a cited interpretation layer without changing the timeline evidence.'}</span>{themes.length === 0 && <Button className="pk-vi-primary" onClick={() => void runtime.analyzeActivityThemes(rangeStart, rangeEnd)}>Analyze recorded evidence</Button>}</div>}</div></div></div>
					<div className="pk-vi-activity-range-control"><div><strong>Selected time range</strong><span>Drag the window or either handle</span></div><div ref={navigatorRef} className="pk-vi-activity-navigator" onPointerDown={beginRangeDrag} onPointerMove={moveRangeDrag} onPointerUp={endRangeDrag} onPointerCancel={endRangeDrag}>{buckets.map((bucket, index) => { const density = bucket.fileCount + bucket.chatCount + bucket.projectCount + bucket.composerCount + bucket.vaultCount; return <i key={bucket.key} className={index >= selection.start && index <= selection.end ? 'is-in-range' : ''} style={{ height: `${Math.max(3, density / densityMax * 42)}px` }} />; })}<span className="pk-vi-activity-range-window" data-range-drag="window" style={{ left: `${selection.start / calendar.length * 100}%`, width: `${(selection.end - selection.start + 1) / calendar.length * 100}%` }}><Button variant="ghost" aria-label="Change start date" data-range-drag="start" /><Button variant="ghost" aria-label="Change end date" data-range-drag="end" /></span></div></div>
					<div className="pk-vi-activity-selection-summary"><strong>{startDate && endDate ? `${formatActivityDateKey(startDate)} – ${formatActivityDateKey(endDate)}` : 'No date range available'}</strong><span>{formatNumber(selectedTotal)} explicit records · {formatNumber(sessions.length || derivedSessions.length)} work sessions</span></div>
				</div>
				<aside className="pk-vi-activity-period-pane" aria-label="Selected period details"><div className="pk-vi-activity-period-head"><strong>{startDate && endDate ? `Selected period · ${formatActivityDateKey(startDate)} – ${formatActivityDateKey(endDate)}` : 'Selected period · Not available'}</strong><span>Everything here follows the same range shown on the left.</span></div><div className="pk-vi-activity-period-stats"><span><strong>{formatNumber(selectedTotal)}</strong><small>explicit records</small></span><span><strong>{formatNumber(sessions.length || derivedSessions.length)}</strong><small>work sessions</small></span><span><strong>{formatNumber(themes.length)}</strong><small>analyzed themes</small></span><span><strong>{formatNumber(unclassified)}</strong><small>not confidently classified</small></span></div>{mode === 'themes' && <><div className="pk-vi-activity-detail-section"><div><strong>Theme mix</strong><span>AI attributed</span></div>{visibleThemes.length ? <div className="pk-vi-activity-theme-mix">{visibleThemes.map((theme) => <span key={theme.id}><strong>{theme.label}</strong><small>{theme.citations.length}</small><i><b style={{ width: `${Math.max(4, theme.citations.length / Math.max(1, periodRecords.length) * 100)}%` }} /></i></span>)}</div> : <span className="pk-vi-empty">No analyzed themes for this range.</span>}</div><div className="pk-vi-activity-detail-section"><div><strong>Compared with previous equal period</strong><span>{selectedLength} days</span></div><div className="pk-vi-activity-compare">{comparisonRows.map((row) => { const delta = row.current - row.previous; return <span key={row.label}><strong>{row.label}</strong><small className={delta >= 0 ? 'is-up' : 'is-down'}>{delta >= 0 ? '+' : ''}{delta} · previous {row.previous}</small></span>; })}</div></div></>}<div className="pk-vi-activity-detail-section"><div><strong>Work sessions in this period</strong><span>{sessions.length || derivedSessions.length}</span></div><div className="pk-vi-activity-event-list">{sessions.length ? sessions.map((session) => <article key={session.id}><time>{formatActivityDate(session.endedAt)}</time><div><strong>{session.label}</strong><span>{session.recordIds.length} explicit records · {session.reason.replace('-', ' ')}</span><div className="pk-vi-activity-event-kinds">{(session.objectPaths.length ? session.objectPaths.slice(0, 3) : ['Peak-owned records']).map((path) => <i key={path}>{path}</i>)}</div></div></article>) : derivedSessions.length ? derivedSessions.map((session) => <article key={session.key}><time>{formatActivityDate(new Date(`${session.key}T12:00:00`).getTime())}</time><div><strong>{session.summary || 'Recorded work session'}</strong><span>{session.count} explicit records</span><div className="pk-vi-activity-event-kinds"><i>Grouped by recorded date</i></div></div></article>) : <div className="pk-vi-activity-period-empty"><strong>No work sessions yet</strong><span>The selected period is retained; new explicit records will appear here without changing the workspace layout.</span></div>}</div></div></aside>
			</div>
		</section>
	</div>;
}

function WorkQueue({ tasks, runtime, onOpenTask }: { tasks: VaultMaintenanceTask[]; runtime: VaultIntelligenceWorkspaceRuntime; onOpenTask: (taskId: string) => void }) {
	return <div className="pk-vi-page"><div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Work queue</span><span className="pk-vi-page-description">Durable Vault-maintenance follow-up only. If Peak can finish it safely by itself, it does not become a queue item.</span></div></div><WorkSurface tasks={tasks.filter((task) => task.state !== 'verified')} origin="queue" runtime={runtime} onOpenTask={onOpenTask} /></div>;
}

function WorkSurface({ tasks, origin, runtime, onOpenTask }: { tasks: VaultMaintenanceTask[]; origin: 'queue' | 'completed'; runtime: VaultIntelligenceWorkspaceRuntime; onOpenTask: (taskId: string) => void }) {
	const [filter, setFilter] = useState<WorkFilter>('all');
	const [query, setQuery] = useState('');
	const [suggestionInstruction, setSuggestionInstruction] = useState('');
	const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
	const filtered = tasks.filter((task) => {
		if (filter !== 'all' && !taskMatchesWorkFilter(task, filter)) return false;
		const text = `${task.title} ${task.typeLabel} ${task.affectedLabel} ${task.contextLabel}`.toLocaleLowerCase();
		return !query.trim() || text.includes(query.trim().toLocaleLowerCase());
	});
	const count = (workFilter: WorkFilter) => workFilter === 'all' ? tasks.length : tasks.filter((task) => taskMatchesWorkFilter(task, workFilter)).length;
	return <section className="pk-vi-work-surface">
		<div className="pk-vi-work-head"><strong>{tasks.length} maintenance {tasks.length === 1 ? 'task' : 'tasks'} {origin === 'completed' ? 'need you' : 'still need you'}</strong><span className={`pk-vi-work-guidance is-${origin}`}>{origin === 'completed' ? 'This run' : 'Current queue'}</span></div>
		<div className="pk-vi-work-adjust" role="group" aria-label="Refresh evidence-backed task suggestions"><input value={suggestionInstruction} onChange={(event) => setSuggestionInstruction(event.target.value)} placeholder={`Tell Peak what to reconsider across these ${tasks.length} tasks`} aria-label={origin === 'queue' ? 'Adjust Work queue suggestions' : 'Adjust completed Scan follow-up suggestions'} /><Button type="button" disabled={!suggestionInstruction.trim() || refreshingSuggestions || tasks.length === 0} onClick={async () => { setRefreshingSuggestions(true); try { await runtime.refreshTaskSuggestions(tasks.map((task) => task.id), suggestionInstruction); } finally { setRefreshingSuggestions(false); } }}>{refreshingSuggestions ? 'Updating…' : 'Update suggestions'}</Button>{tasks.some((task) => task.suggestionReceipt) && <span>{tasks.some((task) => task.suggestionReceipt?.status === 'running') ? 'The selected Vault Review model is re-reading current evidence. Owner choices remain unchanged.' : tasks.some((task) => task.suggestionReceipt?.status === 'completed') ? 'Suggestion receipts are available on the affected tasks. Existing owner choices were preserved.' : 'Suggestion refresh failed. Open a task to inspect its receipt.'}</span>}</div>
		<div className="pk-vi-work-table-shell"><div className="pk-vi-work-tools"><div className="pk-vi-filter-bar">{([
			['all', 'All'], ['choice', 'Needs your choice'], ['review', 'Ready for review'], ['recovery', 'Needs recovery'],
		] as const).map(([id, label]) => <Button key={id} variant="ghost" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}<span>{count(id)}</span></Button>)}</div><label className="pk-vi-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label></div>
		<div className="pk-vi-work-table"><div className="pk-vi-work-columns"><span>Task</span><span>Affected</span><span>State</span><span /></div>{filtered.map((task) => <Button key={task.id} data-task-id={task.id} variant="ghost" className="pk-vi-work-row" title={taskExitCondition(task)} onClick={() => onOpenTask(task.id)}>
			<span className="pk-vi-task-name"><small>{task.typeLabel}</small><strong>{task.title}</strong></span><span className="pk-vi-task-affected"><strong>{task.affectedLabel}</strong><span>· {task.contextLabel}</span></span><TaskStatus task={task} /><ChevronRight size={17} />
		</Button>)}{filtered.length === 0 && <div className="pk-vi-work-empty"><span className="pk-vi-empty-mark"><Check size={20} /></span><div><strong>{tasks.length === 0 ? 'No unresolved maintenance work' : 'No tasks match this view'}</strong><span>{tasks.length === 0 ? 'The queue intentionally stays empty until a Scan creates evidence-backed owner work.' : 'Change the filter or search query to see another part of the queue.'}</span></div></div>}</div></div>
	</section>;
}

function ScanSetup({ snapshot, config, initialSelector, onBack, onRouteChange, onStart }: {
	snapshot: VaultIntelligenceSnapshot;
	config: VaultIntelligenceConfig;
	initialSelector: VaultScanScopeSelector | null;
	onBack: () => void;
	onRouteChange: VaultIntelligenceWorkspaceRuntime['selectOperationRoute'];
	onStart: (plan: VaultScanPlan) => void;
}) {
	const [scopeMode, setScopeMode] = useState<VaultScanScopeMode>(initialSelector ? 'selected' : snapshot.changedCursorAt ? 'changed' : 'entire');
	const [selectedPaths, setSelectedPaths] = useState<string[]>(initialSelector?.paths ?? []);
	const [selectors, setSelectors] = useState<VaultScanScopeSelector[]>(initialSelector ? [initialSelector] : []);
	const [pathQuery, setPathQuery] = useState('');
	const [scopePickerOpen, setScopePickerOpen] = useState(false);
	const [scopePickerKind, setScopePickerKind] = useState<'all' | 'files' | 'folders'>('all');
	const allChecks = config.checkGroups.flatMap((group) => group.checks);
	const displayedCheckGroups = [...config.checkGroups].sort(
		(left, right) => (left.displayOrder ?? 99) - (right.displayOrder ?? 99),
	);
	const [selectedCheckKeys, setSelectedCheckKeys] = useState(() => new Set(allChecks.map((check) => check.checkId)));
	const [operations, setOperations] = useState<VaultScanAiOperationPlan[]>(() => resolvedOperationPlans(config, snapshot));
	const [routeOverrides, setRouteOverrides] = useState<VaultIntelligenceSnapshot['operationRoutes']>({});
	const [indexOutputs, setIndexOutputs] = useState(() => config.indexOutputs.map((output) => ({
		id: output.id,
		enabled: defaultIndexOutputEnabled(output),
		availability: output.availability,
		operationIds: output.operationIds,
	})));
	const [expandedOperationGroup, setExpandedOperationGroup] = useState<'plan' | 'index' | 'relations' | 'structure' | 'follow-up' | null>(null);
	useEffect(() => {
		setSelectedCheckKeys(new Set(config.checkGroups.flatMap((group) => group.checks.map((check) => check.checkId))));
		setOperations(resolvedOperationPlans(config, snapshot));
		setRouteOverrides({});
		setIndexOutputs(config.indexOutputs.map((output) => ({ id: output.id, enabled: defaultIndexOutputEnabled(output), availability: output.availability, operationIds: output.operationIds })));
	}, [config]);
	const operationRoutes = { ...snapshot.operationRoutes, ...routeOverrides };
	const folderScopes = useMemo(() => {
		const pathsByFolder = new Map<string, string[]>();
		for (const path of snapshot.availablePaths) {
			const segments = path.split('/').filter(Boolean);
			if (segments.length < 2) {
				const rootPaths = pathsByFolder.get('Vault root') ?? [];
				rootPaths.push(path);
				pathsByFolder.set('Vault root', rootPaths);
				continue;
			}
			for (let depth = 1; depth < segments.length; depth += 1) {
				const folder = segments.slice(0, depth).join('/');
				const paths = pathsByFolder.get(folder) ?? [];
				paths.push(path);
				pathsByFolder.set(folder, paths);
			}
		}
		return [...pathsByFolder].map(([label, paths]) => ({ id: `folder:${label}`, kind: 'folder' as const, label, paths }));
	}, [snapshot.availablePaths]);
	const scopeCandidates = useMemo(() => {
		const query = pathQuery.trim().toLocaleLowerCase();
		const changedPaths = snapshot.changedPaths ?? [];
		const dynamic = changedPaths.length > 0 ? [{ selector: { id: 'last-scan-changes', kind: 'dynamic' as const, label: 'Changes since last scan', paths: changedPaths }, category: 'all' as const, detail: `Dynamic scope · ${changedPaths.length} changed objects` }] : [];
		const folders = folderScopes
			.filter((selector) => !query || selector.label.toLocaleLowerCase().includes(query))
			.slice(0, query ? 12 : 8)
			.map((selector) => ({ selector, category: 'folders' as const, detail: `Folder · ${selector.paths.length} objects` }));
		const files = query ? snapshot.availablePaths.filter((path) => path.toLocaleLowerCase().includes(query)).slice(0, 12).map((path) => ({ selector: { id: `file:${path}`, kind: 'file' as const, label: path, paths: [path] }, category: 'files' as const, detail: 'File · Vault item' })) : [];
		return [...dynamic, ...folders, ...files];
	}, [folderScopes, pathQuery, snapshot.availablePaths, snapshot.changedPaths]);
	const addSelector = (selector: VaultScanScopeSelector) => {
		setSelectors((current) => current.some((candidate) => candidate.id === selector.id) ? current : [...current, selector]);
		setSelectedPaths((current) => uniqueStrings([...current, ...selector.paths]));
	};
	const removeSelector = (selector: VaultScanScopeSelector) => {
		setSelectors((current) => current.filter((candidate) => candidate.id !== selector.id));
		setSelectedPaths((current) => current.filter((path) => !selector.paths.includes(path) || selectors.some((candidate) => candidate.id !== selector.id && candidate.paths.includes(path))));
	};
	const toggleSelector = (selector: VaultScanScopeSelector) => selectors.some((candidate) => candidate.id === selector.id) ? removeSelector(selector) : addSelector(selector);
	const scopeObjectCount = scopeMode === 'selected'
		? selectedPaths.length
		: scopeMode === 'changed'
			? snapshot.changedSinceScan ?? 0
			: snapshot.availablePaths.length;
	const scopedPaths = scopeMode === 'selected'
		? selectedPaths
		: scopeMode === 'changed'
			? snapshot.changedPaths ?? []
			: snapshot.availablePaths;
	const textEstimate = estimateVaultScanText({
		paths: scopedPaths,
		pathBytes: snapshot.availablePathBytes,
		bytesPerToken: config.scanEstimateBytesPerToken,
	});
	const routedOperations = operations.map((operation) => {
		const route = operationRoutes[operation.id];
		const resolvedOperation = route?.available
			? { ...operation, model: route.model, provider: route.provider }
			: operation;
		return {
			...resolvedOperation,
		enabled: operation.enabled
			&& operationAvailableForScope(operation.id, scopeMode)
			&& (indexOutputs.filter((output) => output.operationIds.includes(operation.id)).length === 0
				|| indexOutputs.some((output) => output.enabled && output.operationIds.includes(operation.id))),
		};
	});
	const plannedOperations = estimateVaultScanOperations(routedOperations, config, textEstimate);
	const selectedOps = plannedOperations.filter((operation) => operation.enabled);
	const hasUnconfiguredEnabledOperation = selectedOps.some((operation) => operationRoutes[operation.id]?.available === false);
	// This is a live planning estimate: scope scales each enabled operation's
	// configured workload immediately, and the receipt still records the actual
	// tokens/cost after the run. It must never require a separate user action.
	const estimatedTokens = selectedOps.reduce((total, operation) => total + operation.estimatedTokens, 0);
	const lastCompletedRun = snapshot.lastCompletedRun;
	const matchingCompletedRoutes = lastCompletedRun?.aiOperations?.length
		? selectedOps.every((operation) => lastCompletedRun.aiOperations?.some((route) => route.id === operation.id && route.model === operation.model && route.provider === operation.provider))
		: false;
	const completedDurationMinutes = lastCompletedRun && matchingCompletedRoutes
		? (lastCompletedRun.completedAt - lastCompletedRun.startedAt) / 60_000
		: 0;
	const priorTokensPerMinute = lastCompletedRun && matchingCompletedRoutes && completedDurationMinutes > 0 && lastCompletedRun.usage.totalTokens > 0
		? lastCompletedRun.usage.totalTokens / completedDurationMinutes
		: null;
	const estimatedMinutes = priorTokensPerMinute && estimatedTokens > 0
		? estimatedTokens / priorTokensPerMinute
		: null;
	const operationCosts = selectedOps.map(estimateOperationCostUsd);
	const estimatedCost = operationCosts.some((cost) => cost === null)
		? null
		: operationCosts.reduce<number>((total, cost) => total + (cost ?? 0), 0);
	const enabledCheckIds = uniqueStrings(displayedCheckGroups.flatMap((group) => group.checks
		.filter((check) => selectedCheckKeys.has(check.checkId))
		.flatMap((check) => check.checkIds ?? [check.checkId])));
	const setGroupSelected = (checks: typeof allChecks, selected: boolean) => setSelectedCheckKeys((current) => {
		const next = new Set(current);
		for (const check of checks) selected ? next.add(check.checkId) : next.delete(check.checkId);
		return next;
	});
	const toggleOutput = (id: typeof indexOutputs[number]['id']) => setIndexOutputs((current) => current.map((output) => output.id === id && output.availability === 'optional' ? { ...output, enabled: !output.enabled } : output));
	const start = () => onStart({
			scope: { mode: scopeMode, selectedPaths, selectors },
			enabledCheckIds,
			indexOutputs,
			aiOperations: plannedOperations,
			createdAt: Date.now(),
		});
	const scopeStatus = scopeMode === 'selected' ? `${selectedPaths.length} selected` : scopeMode === 'changed' ? `${snapshot.changedSinceScan ?? 0} changed` : `${snapshot.availablePaths.length} objects`;
	return <div className="pk-vi-page pk-vi-scan-setup"><section className="pk-vi-scan-setup-shell">
		<div className="pk-vi-scan-setup-body"><section className="pk-vi-scan-setup-overview"><div className="pk-vi-scan-setup-hero"><span><ScanSearch size={23} /></span><div><strong>Prepare a safe Vault scan<HoverHint placement="bottom" label="Choose what Peak should examine, then review AI models and estimated usage. Your current Vault stays available while it runs." /></strong></div><span className="pk-vi-readiness-state is-ready"><Check size={13} />Ready</span></div><div className="pk-vi-scan-trust-row"><span><Clock3 size={14} /><small>Last successful scan</small><strong>{snapshot.changedCursorAt ? formatDateTime(snapshot.changedCursorAt) : 'Not indexed yet'}</strong></span><span><ShieldCheck size={14} /><small>Current Vault view</small><strong>Stays usable until this scan publishes</strong></span><span><FileText size={14} /><small>User files</small><strong>No automatic edits</strong></span></div></section>
		<div className="pk-vi-scan-setup-grid"><SetupSection number="1" title="Choose scan scope" description="Peak also checks the existing relationships and Communities affected by this scope." status="Recommended"><div className={`pk-vi-scope-builder${scopeMode === 'selected' ? ' is-custom-scope' : ''}`}><div className="pk-vi-scope-mode-options">{([
			['changed', 'Since last scan', snapshot.changedCursorAt ? `${snapshot.changedSinceScan ?? 0} changed` : 'Not indexed yet'],
			['selected', 'Choose a scope', 'Search & select'],
			['entire', 'Entire Vault', `${snapshot.availablePaths.length} objects`],
		] as const).map(([id, label, meta]) => <Button key={id} variant="ghost" disabled={id === 'changed' && !snapshot.changedCursorAt} className={scopeMode === id ? 'is-active' : ''} onClick={() => setScopeMode(id)}><strong>{label}</strong><span>{meta}</span></Button>)}</div>
			{scopeMode !== 'entire' && <div className="pk-vi-scope-selected-row"><div className="pk-vi-scope-selected-head"><strong>Included scope</strong><span>{scopeObjectCount ? `${scopeObjectCount} objects included` : 'No scope selected yet'}</span></div><div className="pk-vi-selected-paths">{scopeMode === 'changed' && <span className="pk-vi-scope-token"><Check size={13} />Changes since last scan <b>{scopeObjectCount}</b></span>}{scopeMode === 'selected' && selectors.map((selector) => <span key={selector.id} className="pk-vi-selected-scope-chip" title={selector.label}><span className="pk-vi-scope-token-label">{selector.label}</span><b>{selector.paths.length}</b><Button variant="ghost" size="icon" onClick={() => removeSelector(selector)} aria-label={`Remove ${selector.label}`}><X size={13} /></Button></span>)}</div></div>}
			{scopeMode === 'selected' && <div className="pk-vi-path-picker"><div className="pk-vi-scope-combobox"><Search size={16} /><input value={pathQuery} onFocus={() => setScopePickerOpen(true)} onMouseDown={(event) => { if (document.activeElement === event.currentTarget) setScopePickerOpen((current) => !current); }} onChange={(event) => { setPathQuery(event.target.value); setScopePickerOpen(true); }} aria-expanded={scopePickerOpen} aria-controls="pk-vi-scope-results" placeholder="Add a file or folder…" /><Button variant="ghost" className="pk-vi-scope-browse" onClick={() => setScopePickerOpen((current) => !current)} aria-expanded={scopePickerOpen}>Browse</Button></div>{scopePickerOpen && <div id="pk-vi-scope-results" className="pk-vi-path-results"><div className="pk-vi-scope-picker-toolbar"><span>Search results</span><div>{([['all', 'All'], ['files', 'Files'], ['folders', 'Folders']] as const).map(([id, label]) => <Button key={id} variant="ghost" className={scopePickerKind === id ? 'is-active' : ''} onClick={() => setScopePickerKind(id)}>{label}</Button>)}</div></div><div className="pk-vi-scope-picker-list">{scopeCandidates.filter((candidate) => scopePickerKind === 'all' || candidate.category === scopePickerKind).map((candidate) => { const selected = selectors.some((selector) => selector.id === candidate.selector.id); return <Button key={candidate.selector.id} variant="ghost" className={selected ? 'is-selected' : ''} onClick={() => toggleSelector(candidate.selector)}><span className="pk-vi-scope-option-check">{selected && <Check size={13} />}</span><span><strong>{candidate.selector.label}</strong><small>{candidate.detail}</small></span><b>{candidate.selector.paths.length}</b></Button>; })}</div></div>}</div>}
			<div className="pk-vi-scope-builder-foot"><GitBranch size={13} />Affected relationships are included automatically.</div></div></SetupSection>
		<SetupSection number="2" title="Choose scan tasks" description="Select the maintenance task categories Peak should run." status={`${selectedCheckKeys.size} of ${allChecks.length} tasks selected`}><div className="pk-vi-scan-check-grid">{displayedCheckGroups.map((group) => { const selectedCount = group.checks.filter((check) => selectedCheckKeys.has(check.checkId)).length; const selected = selectedCount === group.checks.length; return <Button key={group.id} variant="ghost" className={selected ? 'is-active' : ''} title={group.description} onClick={() => setGroupSelected(group.checks, !selected)}><span className="pk-vi-check-mark">{selected && <Check size={13} />}</span><strong>{group.label}</strong><span>{group.checks.length} tasks</span></Button>; })}</div><IndexOutputPlan config={config} outputs={indexOutputs} scopeObjectCount={scopeObjectCount} onToggle={toggleOutput} /></SetupSection>
		<SetupSection number="3" title="Review AI models" description="Open a group only when you want to configure an individual operation." status={`${selectedOps.length} operations · ${hasUnconfiguredEnabledOperation ? 'configuration needed' : selectedOps.length ? 'models ready' : 'no AI work'}`}><div className="pk-vi-scan-ai-groups">{(['plan', 'index', 'relations', 'structure', 'follow-up'] as const).map((group) => { const definitions = config.scanOperations.filter((definition) => definition.group === group); const groupOperations = definitions.map((candidate) => plannedOperations.find((operation) => operation.id === candidate.id)!).filter(Boolean); const enabled = groupOperations.filter((operation) => operation.enabled).length; const expanded = expandedOperationGroup === group; return <section key={group} className={expanded ? 'is-expanded' : ''}><Button variant="ghost" className="pk-vi-scan-ai-group-row" aria-expanded={expanded} onClick={() => setExpandedOperationGroup(expanded ? null : group)}><span><strong>{scanOperationGroupLabel(group)}<HoverHint label={scanOperationGroupDescription(group)} /></strong><small>{scanOperationGroupSummary(group)}</small></span><span><strong>{enabled} / {definitions.length} enabled</strong></span><ChevronRight size={15} /></Button><div className="pk-vi-scan-operation-disclosure" aria-hidden={!expanded}><div className="pk-vi-scan-operation-list">{definitions.map((definition) => { const operation = plannedOperations.find((candidate) => candidate.id === definition.id)!; const route = operationRoutes[operation.id]; const scopeAvailable = operationAvailableForScope(operation.id, scopeMode); const disabledReason = scopeAvailable ? undefined : 'This operation requires the Entire Vault scope. Choose Entire Vault to configure its model.'; const shared = sharedExecutionLabel(operation.id); const detail = shared ? `Runs in ${shared}; this switch remains independent.` : definition.description; return <div key={definition.id} className={!scopeAvailable ? 'is-scope-unavailable' : ''}><span><strong>{definition.label}<HoverHint label={detail} /></strong></span><OperationModelPicker operation={operation} route={route} disabledReason={disabledReason} onChange={async (candidate) => { await onRouteChange(operation.id, candidate); setOperations((current) => current.map((item) => item.id === operation.id ? { ...item, model: candidate.model, provider: candidate.provider } : item)); setRouteOverrides((current) => ({ ...current, [operation.id]: { profileId: candidate.profileId, model: candidate.model, provider: candidate.provider, available: true, candidates: route?.candidates ?? [] } })); }} /><span>{operationEstimateLabel(operation, route)}</span><Button variant="ghost" disabled={!scopeAvailable} className={`pk-vi-scan-operation-toggle ${operation.enabled ? 'is-on' : ''}`} aria-label={`${operation.enabled ? 'Disable' : 'Enable'} ${definition.label}`} aria-pressed={operation.enabled} onClick={() => setOperations((current) => toggleOperationExecutionGroup(current, operation.id))}>{!scopeAvailable ? 'Entire Vault only' : operation.enabled ? 'On' : 'Off'}</Button></div>; })}</div></div></section>; })}</div></SetupSection>
		<section className="pk-vi-scan-estimate-block"><div><span><strong>Estimated run</strong><small>Updates automatically when the scope, enabled operations, or model routes change.</small></span><span className={`pk-vi-readiness-state ${hasUnconfiguredEnabledOperation ? 'is-attention' : 'is-ready'}`}>{hasUnconfiguredEnabledOperation ? 'Model configuration needed' : selectedOps.length ? 'Estimate updated' : 'No AI work selected'}</span></div><div className="pk-vi-scan-estimate-metrics"><span><span className="pk-vi-estimate-value"><strong>{estimatedMinutes !== null ? `~${estimatedMinutes.toFixed(1)} min` : 'After first matching Scan'}</strong><EstimateHelp label="How time is calculated" lines={['Peak uses the latest completed Scan with the same operation models to calculate throughput.', 'Before a matching receipt exists, Peak does not invent a duration.', 'The final receipt records the actual elapsed time.']} /></span><small>Estimated time</small></span><span><span className="pk-vi-estimate-value"><strong>{estimatedTokens > 0 ? `~${formatCompactNumber(estimatedTokens)}` : '—'}</strong><EstimateHelp label="How token usage is calculated" lines={[`${textEstimate.readableFileCount} directly readable files contribute ${formatCompactNumber(textEstimate.readableBytes)} bytes.`, `Peak uses a provider-neutral approximation of 1 token per ${config.scanEstimateBytesPerToken} UTF-8 bytes.`, 'Each operation then adds its configured prompt and output budget; the final receipt records actual tokens.']} /></span><small>Typical AI tokens</small></span><span><span className="pk-vi-estimate-value"><strong>{estimatedCost === null ? 'Price unavailable' : estimatedCost > 0 ? `~${formatMoney(estimatedCost)}` : '$0.00'}</strong><EstimateHelp label="How cost is calculated" lines={['Peak prices the estimated input and output tokens using each resolved operation model.', 'Local Ollama and LM Studio routes are shown as $0.00.', 'A remote model without catalog pricing remains Price unavailable instead of using a guessed price.']} /></span><small>Typical AI cost</small></span></div><small className="pk-vi-scan-estimate-note"><Info size={13} />This planning estimate uses readable source text and explicit operation budgets; the final receipt records actual tokens, time, and spend.</small></section></div></div>
		<footer className="pk-vi-scan-setup-footer"><span><Info size={14} />The scan updates machine state and prepares review items. It never applies user-file edits. Current scope: {scopeStatus}.{hasUnconfiguredEnabledOperation ? ' Configure or turn off the unavailable AI operations before starting.' : ''}</span><div><Button variant="outline" onClick={onBack}>Cancel</Button><Button className="pk-vi-primary" onClick={start} disabled={(scopeMode === 'selected' && selectedPaths.length === 0) || hasUnconfiguredEnabledOperation}><Play size={15} />Start scan</Button></div></footer>
	</section></div>;
}

function OperationModelPicker({ operation, route, onChange, disabledReason }: {
	operation: VaultScanAiOperationPlan;
	route: VaultIntelligenceSnapshot['operationRoutes'][VaultScanAiOperationPlan['id']] | undefined;
	onChange: (candidate: VaultScanOperationRouteCandidate) => Promise<void>;
	disabledReason?: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [selectionError, setSelectionError] = useState<string | null>(null);
	const [selecting, setSelecting] = useState(false);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const pickerRef = useRef<HTMLDivElement | null>(null);
	const [pickerPosition, setPickerPosition] = useState<{ left: number; top: number; width: number } | null>(null);
	const close = () => {
		setOpen(false);
		setQuery('');
		setSelectionError(null);
		setPickerPosition(null);
	};
	useEffect(() => {
		if (!open) return;
		const place = () => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const width = Math.min(360, window.innerWidth - 32);
			const estimatedPickerHeight = 280;
			const preferredTop = rect.bottom + 6;
			const top = preferredTop + estimatedPickerHeight <= window.innerHeight - 16
				? preferredTop
				: Math.max(16, rect.top - estimatedPickerHeight - 6);
			setPickerPosition({
				left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
				top,
				width,
			});
		};
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (triggerRef.current?.contains(target) || pickerRef.current?.contains(target)) return;
			close();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			close();
			triggerRef.current?.focus();
		};
		place();
		document.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);
	const matches = (route?.candidates ?? []).filter((candidate) => `${candidate.provider} ${candidate.displayName ?? candidate.model} ${candidate.model}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
	const configured = route?.available && route.profileId ? `${route.provider} · ${route.model}` : null;
	const picker = open && pickerPosition && <div ref={pickerRef} className="pk-vi-model-picker" role="dialog" aria-label={`Choose model for ${operation.id}`} style={pickerPosition}>
		<label><Search size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search configured models" /></label>
		{matches.length > 0 ? <div>{matches.map((candidate) => {
			const selected = route?.profileId === candidate.profileId && route.model === candidate.model;
			const unavailable = candidate.selectable === false;
			return <Button key={`${candidate.profileId}:${candidate.model}`} variant="ghost" disabled={selecting || unavailable} className={selected ? 'is-selected' : ''} title={unavailable ? candidate.unavailableReason ?? 'This model is not compatible with this operation.' : undefined} onClick={() => { setSelecting(true); setSelectionError(null); void onChange(candidate).then(() => { close(); }).catch((error: unknown) => { console.error('[Peak Assistant] Could not apply Vault Scan model route.', error); setSelectionError(error instanceof VaultOperationRouteSelectionError ? error.message : 'Peak could not apply this model. Refresh the model catalog and try again.'); }).finally(() => setSelecting(false)); }}><span><strong>{candidate.displayName ?? candidate.model}</strong><small>{unavailable ? candidate.unavailableReason ?? candidate.provider : candidate.provider}</small></span>{selected && <Check size={14} />}</Button>;
		})}</div> : <div className="pk-vi-model-picker-empty"><strong>No configured models match</strong><small>{operation.id === 'embedding-refresh' ? 'Configure an embedding model in Peak Settings.' : 'Configure a compatible chat model in Peak Settings.'}</small></div>}
		{selectionError && <div className="pk-vi-model-picker-error" role="alert">{selectionError}</div>}
	</div>;
	return <div className="pk-vi-scan-model-field">
		<Button ref={triggerRef} variant="ghost" disabled={Boolean(disabledReason)} className={`pk-vi-model-trigger ${configured ? '' : 'is-unconfigured'}`} aria-expanded={open} aria-describedby={disabledReason ? `${operation.id}-model-disabled-reason` : undefined} onClick={() => { if (open) close(); else setOpen(true); }}>
			<Sparkles size={14} /><span>{configured ?? 'Configure model'}</span><ChevronDown size={14} />
		</Button>
		{disabledReason && <small id={`${operation.id}-model-disabled-reason`}>{disabledReason}</small>}
		{picker && (typeof document === 'undefined' ? picker : createPortal(<div className="peak-vault-intelligence-view">{picker}</div>, document.body))}
	</div>;
}

function IndexOutputPlan({ config, outputs, scopeObjectCount, onToggle }: {
	config: VaultIntelligenceConfig;
	outputs: Array<{ id: VaultIntelligenceConfig['indexOutputs'][number]['id']; enabled: boolean; availability: 'required' | 'automatic' | 'optional' | 'later'; operationIds: VaultScanAiOperationPlan['id'][] }>;
	scopeObjectCount: number;
	onToggle: (id: VaultIntelligenceConfig['indexOutputs'][number]['id']) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const [focusedOutputId, setFocusedOutputId] = useState<VaultIntelligenceConfig['indexOutputs'][number]['id']>('pdf-summary');
	const selected = outputs.filter((output) => output.enabled).length;
	const coreOutputs = config.indexOutputs.filter((output) => output.group === 'core');
	const generatedGroups = ['summaries', 'tags', 'relationships', 'content'] as const;
	const renderOutputRow = (entry: VaultIntelligenceConfig['indexOutputs'][number]) => {
		const output = outputs.find((candidate) => candidate.id === entry.id)!;
		const canToggle = entry.availability === 'optional';
		const state = entry.availability === 'automatic' || entry.availability === 'required'
			? <i className="pk-vi-index-state is-automatic" aria-label={entry.availability === 'required' ? 'Required' : 'Automatic'}><Check size={12} /></i>
			: entry.availability === 'later' ? <i className="pk-vi-index-state is-later">Later</i> : null;
		const className = entry.group === 'core' ? `pk-vi-index-core-row is-${entry.availability}` : `pk-vi-index-output is-${entry.availability}`;
		const content = <><span><strong>{entry.label}{entry.group === 'core' && <HoverHint label={entry.description} />}</strong></span>{state}{canToggle && <i className={`pk-vi-index-output-toggle ${output.enabled ? 'is-on' : ''}`} aria-hidden="true" />}</>;
		if (canToggle) return <Button key={entry.id} variant="ghost" className={className} aria-pressed={output.enabled} onMouseEnter={() => setFocusedOutputId(entry.id)} onFocus={() => setFocusedOutputId(entry.id)} onClick={() => onToggle(entry.id)}>{content}</Button>;
		return <div key={entry.id} className={className} tabIndex={0} onMouseEnter={() => setFocusedOutputId(entry.id)} onFocus={() => setFocusedOutputId(entry.id)}>{content}</div>;
	};
	const focusedOutput = config.indexOutputs.find((output) => output.id === focusedOutputId) ?? config.indexOutputs[0];
	const focusedState = focusedOutput?.availability === 'later'
		? 'Runtime not available'
		: focusedOutput?.availability === 'automatic' || focusedOutput?.availability === 'required'
			? 'Local · always on'
			: focusedOutput?.operationIds.length
				? `Configured in Step 3 · ${focusedOutput.operationIds.length} AI ${focusedOutput.operationIds.length === 1 ? 'operation' : 'operations'}`
				: 'Optional for this run';
	return <section className={`pk-vi-index-plan ${expanded ? 'is-expanded' : ''}`}>
		<Button variant="ghost" className="pk-vi-index-plan-trigger" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
			<Search size={16} /><span><strong>Knowledge Index plan</strong><small>Core Search + {selected} enabled outputs · inherits the Step 1 scope</small></span><span>{scopeObjectCount} objects</span><ChevronDown size={16} />
		</Button>
		{expanded && <div className="pk-vi-index-plan-body">
			<div className="pk-vi-index-plan-heading"><div><strong>Choose what this scan adds to the Index<HoverHint placement="bottom" label="Step 1 already defines the content scope. Here you choose the reusable Search and machine-knowledge outputs built from that same scope." /></strong></div><span>Scope · current selection</span></div>
			<div className="pk-vi-index-core-label"><strong>Core Search<HoverHint placement="bottom" label="Foundations used to find and retrieve files." /></strong></div>
				<div className="pk-vi-index-core">{coreOutputs.map(renderOutputRow)}</div>
			<div className="pk-vi-index-generated-head"><div><strong>Generated knowledge<HoverHint placement="bottom" label="Hover, focus, or select an output to see what it changes and which model operation supports it." /></strong></div><div className="pk-vi-index-legend"><span><i className="is-automatic"><Check size={11} /></i>Automatic</span><span><i />Optional</span><span><i>−</i>Later</span></div></div>
				<div className="pk-vi-index-output-grid">{generatedGroups.map((group) => {
				const entries = config.indexOutputs.filter((output) => output.group === group);
				if (entries.length === 0) return null;
				const automatic = entries.filter((entry) => entry.availability === 'automatic').length;
				const enabled = entries.filter((entry) => entry.availability === 'optional' && outputs.find((output) => output.id === entry.id)?.enabled).length;
				const later = entries.filter((entry) => entry.availability === 'later').length;
				const summary = [`${automatic} auto`, `${enabled} on`, `${later} later`].filter((part) => !part.startsWith('0 ')).join(' · ');
				return <section key={group} className="pk-vi-index-output-group"><div className="pk-vi-index-output-head"><strong>{indexOutputGroupLabel(group)}</strong><span>{summary}</span></div><div className="pk-vi-index-output-list">{entries.map((entry) => renderOutputRow(entry))}</div></section>;
			})}</div>
			{focusedOutput && <div className="pk-vi-index-output-explainer" role="status"><Info size={14} /><span><strong>{focusedOutput.label}</strong><small>{focusedOutput.description}</small></span><b>{focusedState}</b></div>}
			<div className="pk-vi-index-plan-foot"><span>Background refresh, batching, retry, chunking, and default model policies remain in Knowledge Index settings.</span></div>
		</div>}
	</section>;
}

function indexOutputGroupLabel(group: 'core' | 'summaries' | 'tags' | 'relationships' | 'content'): string {
	if (group === 'core') return 'Core Search';
	if (group === 'summaries') return 'Summaries';
	if (group === 'tags') return 'Tags & entities';
	if (group === 'relationships') return 'Relationships';
	return 'Content understanding';
}

function HoverHint({ label, placement = 'top' }: { label: string; placement?: 'top' | 'bottom' }) {
	const tooltipId = useId();
	return <span className={`pk-vi-hover-hint is-${placement}`} tabIndex={0} aria-describedby={tooltipId}><Info size={13} /><span id={tooltipId} role="tooltip">{label}</span></span>;
}

function SetupSection({ number, title, description, status, children }: { number: string; title: string; description: string; status: string; children: React.ReactNode }) {
	const tone = /needed|unavailable/i.test(status) ? 'is-attention' : /recommended|selected|ready/i.test(status) ? 'is-ready' : '';
	return <section className="pk-vi-scan-config-card"><div className="pk-vi-scan-config-head"><div><span>{number}</span><div><strong>{title}<HoverHint placement="bottom" label={description} /></strong></div></div><span className={`pk-vi-readiness-state ${tone}`}>{status}</span></div>{children}</section>;
}

function EstimateHelp({ label, lines }: { label: string; lines: string[] }) {
	const tooltipId = useId();
	return <span className="pk-vi-estimate-help" tabIndex={0} aria-describedby={tooltipId}><Info size={13} /><span id={tooltipId} role="tooltip"><strong>{label}</strong>{lines.map((line) => <small key={line}>{line}</small>)}</span></span>;
}

function estimateOperationCostUsd(operation: VaultScanAiOperationPlan): number | null {
	if (operation.estimatedTokens <= 0 || operation.provider === 'Peak') return 0;
	if (operation.provider === 'ollama' || operation.provider === 'lmstudio') return 0;
	const model = modelRegistry.getModelsForProvider(operation.provider).find((candidate) => candidate.id === operation.model);
	if (!model || model.costInput === undefined || model.costOutput === undefined) return null;
	const inputPrice = Number(model.costInput);
	const outputPrice = Number(model.costOutput);
	if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice) || inputPrice + outputPrice <= 0) return null;
	const estimatedInput = operation.estimatedInputTokens ?? operation.estimatedTokens * .8;
	const estimatedOutput = operation.estimatedOutputTokens ?? operation.estimatedTokens * .2;
	return estimatedInput / 1_000_000 * inputPrice + estimatedOutput / 1_000_000 * outputPrice;
}

function operationEstimateLabel(
	operation: VaultScanAiOperationPlan,
	route: VaultIntelligenceSnapshot['operationRoutes'][VaultScanAiOperationPlan['id']] | undefined,
): string {
	if (operation.estimatedTokens <= 0) return 'Estimate pending';
	if (route?.available === false) return `${formatCompactNumber(operation.estimatedTokens)} · Model needed`;
	const cost = estimateOperationCostUsd(operation);
	if (cost === null) return `${formatCompactNumber(operation.estimatedTokens)} · Price unknown`;
	if (operation.provider === 'Peak' || operation.provider === 'ollama' || operation.provider === 'lmstudio') return `${formatCompactNumber(operation.estimatedTokens)} · Local`;
	return `${formatCompactNumber(operation.estimatedTokens)} · ${formatMoney(cost)}`;
}

function RunProgress({ snapshot, runtime, onBack, onCompleted, onStartNew }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
	onCompleted: () => void;
	onStartNew: () => void;
}) {
	const run = snapshot.run;
	const [clockNow, setClockNow] = useState(() => Date.now());
	const liveStageId = deriveLiveStageId(run);
	const [inspectedStageId, setInspectedStageId] = useState<VaultIntelligenceSnapshot['run']['stages'][number]['id'] | null>(null);
	const [stageMenuOpen, setStageMenuOpen] = useState(false);
	const stageMenuRef = useRef<HTMLDivElement>(null);
	useEffect(() => setInspectedStageId(null), [run.id]);
	useEffect(() => {
		setClockNow(Date.now());
		if (run.status !== 'running' && run.status !== 'stopping') return;
		const timer = globalThis.setInterval(() => setClockNow(Date.now()), 1_000);
		return () => globalThis.clearInterval(timer);
	}, [run.id, run.status]);
	useEffect(() => {
		if (!stageMenuOpen) return;
		const closeOutside = (event: PointerEvent) => {
			if (stageMenuRef.current?.contains(event.target as Node)) return;
			setStageMenuOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setStageMenuOpen(false);
			stageMenuRef.current?.querySelector<HTMLButtonElement>('.pk-vi-stage-inspector-trigger')?.focus();
		};
		document.addEventListener('pointerdown', closeOutside);
		document.addEventListener('keydown', closeOnEscape);
		return () => {
			document.removeEventListener('pointerdown', closeOutside);
			document.removeEventListener('keydown', closeOnEscape);
		};
	}, [stageMenuOpen]);
	const completed = run.status === 'completed';
	const resumable = run.status === 'paused' || run.status === 'interrupted' || run.status === 'stopped-partial';
	const canStartNew = resumable;
	const startNew = async () => {
		await runtime.startNewScan();
		onStartNew();
	};
	const progressMetric = scanProgressMetric(run);
	const runUsage = displayRunUsage(run.operations);
	const plannedAiOperations = run.plan?.aiOperations.filter((operation) => operation.enabled) ?? run.operations.filter((operation) => operation.enabled);
	const plannedTokens = plannedAiOperations.reduce((total, operation) => total + operation.estimatedTokens, 0);
	const plannedCost = plannedAiOperations.reduce((total, operation) => total + operation.estimatedCostUsd, 0);
	const overall = progressMetric.percent;
	const liveStageIds = new Set(run.stages.filter((stage) => stage.status === 'running').map((stage) => stage.id));
	const focusedStageId = inspectedStageId ?? liveStageId;
	const currentStage = run.stages.find((stage) => stage.id === focusedStageId) ?? run.stages[0] ?? null;
	const relevantEvents = snapshot.events.filter((event) => !run.id || event.runId === run.id).slice(-8).reverse();
	const liveHeadline = runStageHeadline(liveStageId, run.status);
	const elapsedMs = run.startedAt ? Math.max(0, clockNow - run.startedAt) : 0;
	const objectsPerMinute = elapsedMs > 0 ? Math.round(progressMetric.processed / elapsedMs * 60_000) : 0;
	const activeOperations = run.operations.filter((operation) => operation.status === 'running');
	const activeOperation = activeOperations.find((operation) => operation.currentPath) ?? activeOperations[0] ?? null;
	const liveActivityTitle = activeOperation
		? `${operationLabel(activeOperation.id)} is working`
		: `${stageLabel(liveStageId ?? 'discover')} is working`;
	const liveActivityDetail = activeOperation?.currentPath
		? `${activeOperation.currentPath} · ${activeOperation.provider}`
		: activeOperation
			? `Waiting for the next response from ${activeOperation.provider}`
			: 'Waiting for the next durable progress event';
	const stageDescription = currentStage?.id === 'discover'
		? 'Freeze the exact input and the existing Vault state this run will compare against.'
		: currentStage?.id === 'index'
			? 'Core Search leads each document; selected embeddings, summaries, and machine-only AI Tags follow as soon as that document is ready.'
			: currentStage?.id === 'ai'
				? 'A bounded Discovery Agent investigates the frozen evidence frontier; only validated findings enter the retained list.'
				: currentStage?.id === 'prepare-review'
					? 'One Review Preparation Agent turns frozen findings into validated owner work before Publish.'
				: 'Publish begins only after every selected layer has a validated terminal receipt; user-file changes still require later review and Apply.';
	return <div className="pk-vi-page pk-vi-run-page">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }, { label: 'Run progress' }]} />
		<section className="pk-vi-run-overview">
			<div className="pk-vi-run-hero">
				<div><span className="pk-vi-selection-type">{completed ? 'Run finished' : resumable ? 'Paused · checkpoint saved' : run.status === 'failed' ? 'Attention needed' : `${stageLabel(liveStageId ?? 'discover').toUpperCase()} IN PROGRESS`}</span><span className="pk-vi-page-title">{liveHeadline}</span></div>
				<div className="pk-vi-page-actions"><span className="pk-vi-user-file-boundary">User files unchanged</span>{run.status === 'running' && inspectedStageId && inspectedStageId !== liveStageId && <Button variant="ghost" onClick={() => setInspectedStageId(null)}><Activity size={15} />Follow live</Button>}{run.status === 'running' && <><Button variant="ghost" onClick={() => runtime.requestPause()} title="Finish the current durable unit, then retain the checkpoint"><Pause size={15} />Pause</Button><Button className="pk-vi-stop-run" onClick={() => runtime.requestStop()} title="Stop active provider work and retain completed facts and partial results"><X size={15} />Stop scan</Button></>}{run.status === 'stopping' && <Button variant="ghost" disabled><RefreshCw size={15} className="pk-vi-spin" />Stopping…</Button>}{canStartNew && <Button variant="ghost" onClick={() => void startNew()} title="Discard this unfinished run checkpoint and prepare a new Scan">Start new scan</Button>}{resumable && <Button className="pk-vi-primary" onClick={() => void runtime.resumeScan()}><Play size={15} />Resume</Button>}{completed && <Button className="pk-vi-primary" onClick={onCompleted}>View completed work<ChevronRight size={15} /></Button>}</div>
			</div>
			<div className="pk-vi-run-progress-summary">
				<div className="pk-vi-overall-number"><strong>{overall}%</strong><small>overall progress</small></div><div className="pk-vi-run-progress-main"><div className="pk-vi-progress-track"><i style={{ width: `${overall}%` }} /></div><div><span><strong>{progressMetric.processed.toLocaleString()} / {progressMetric.total.toLocaleString()}</strong> objects advanced</span><span><strong>{run.startedAt ? elapsedLabel(run.startedAt, clockNow) : '0s'}</strong> elapsed</span><span><strong>{objectsPerMinute || '—'}</strong> objects / min</span></div></div><div className="pk-vi-run-ai-usage"><small>AI usage</small><strong>{runUsage.providerReceiptCount ? formatMoney(runUsage.costUsd) : 'Unavailable'}</strong><span>{runUsage.providerReceiptCount ? `${formatCompactNumber(runUsage.totalTokens)} tokens used` : 'No provider receipt yet'}</span><em>{plannedTokens > 0 ? `Projected ~${formatMoney(plannedCost)} · ${formatCompactNumber(plannedTokens)} tokens` : 'Projection unavailable'}</em></div>
			</div>
			{(run.status === 'running' || run.status === 'stopping') && <div className="pk-vi-run-liveness" role="status" aria-live="polite"><RefreshCw size={14} className="pk-vi-spin" /><span><strong>{liveActivityTitle}</strong><small>{liveActivityDetail}</small></span><em>Active · {run.startedAt ? elapsedLabel(run.startedAt, clockNow) : '0s'}</em></div>}
			{run.status === 'failed' && <div className="pk-vi-run-failure" role="alert" aria-live="assertive">
				<CircleAlert size={18} />
				<span><strong>Scan stopped</strong><small>{run.error || 'The selected model or provider did not return a usable response.'}</small><em>No further Scan stages or queued model requests will start. Fix the selected route, then begin a new Scan.</em></span>
				<Button variant="outline" onClick={() => void startNew()}>Exit to Scan setup</Button>
			</div>}
		</section>
		<section className="pk-vi-run-stage-workspace" role="tabpanel">
			<div className="pk-vi-run-stage-workspace-head"><div><span className="pk-vi-card-title">{currentStage?.id === 'ai' ? 'Vault-wide discovery' : currentStage?.id === 'prepare-review' ? 'Preparing work for review' : currentStage?.id === 'index' ? 'Build Index' : currentStage?.id === 'discover' ? 'Discover scope and affected context' : currentStage?.id === 'publish' ? 'Publish verified machine layers and follow-up' : 'Scan stage'}</span><span className="pk-vi-card-caption">{stageDescription}</span></div><div className="pk-vi-run-stage-head-actions">{currentStage ? <StageState status={currentStage.status} /> : <span>Not available</span>}<div ref={stageMenuRef} className={`pk-vi-stage-inspector ${stageMenuOpen ? 'is-open' : ''}`}><Button variant="ghost" className="pk-vi-stage-inspector-trigger" aria-expanded={stageMenuOpen} onClick={() => setStageMenuOpen((value) => !value)}><ListChecks size={15} />View 5 stages<ChevronDown size={14} /></Button><div className="pk-vi-stage-inspector-menu" role="tablist" aria-label="Scan stages">{run.stages.map((stage, index) => { const isLive = liveStageIds.has(stage.id); return <Button key={stage.id} variant="ghost" role="tab" aria-selected={focusedStageId === stage.id} title={stage.message} className={`pk-vi-run-stage-tab is-${stage.status} ${focusedStageId === stage.id ? 'is-active' : ''} ${isLive ? 'is-live' : ''}`} onClick={() => { setInspectedStageId(stage.id === liveStageId ? null : stage.id); setStageMenuOpen(false); }}><span>{index + 1}</span><strong>{stageLabel(stage.id)}</strong><small>{stageStateLabel(stage, run.status)}</small></Button>; })}</div></div></div></div>
			{currentStage?.id === 'discover' ? <DiscoverRunWorkspace run={run} stage={currentStage} /> : currentStage?.id === 'index' ? <BuildIndexParityWorkspace run={run} stage={currentStage} runtime={runtime} /> : currentStage?.id === 'ai' ? <VaultDiscoveryParityWorkspace run={run} /> : currentStage?.id === 'prepare-review' ? <PrepareReviewRunWorkspace run={run} /> : <PublishRunWorkspace run={run} stage={currentStage} />}
		</section>
		<section className="pk-vi-run-events"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Run events</span><span className="pk-vi-card-caption">Durable runtime evidence for this Scan.</span></div></div>{relevantEvents.length > 0 ? <div>{relevantEvents.map((event) => <span key={event.id}><time>{formatDateTime(event.timestamp)}</time><strong>{event.detail}</strong></span>)}</div> : <div className="pk-vi-empty">No run events recorded yet.</div>}</section>
		{run.warnings.length > 0 && <section className="pk-vi-card pk-vi-warning-list"><strong>Partial results and warnings</strong>{run.warnings.map((warning) => <span key={warning}><CircleAlert size={14} />{warning}</span>)}</section>}
	</div>;
}

function DiscoverRunWorkspace({ run, stage }: { run: VaultIntelligenceSnapshot['run']; stage: VaultIntelligenceSnapshot['run']['stages'][number] }) {
	const changedCount = run.plan?.scope.mode === 'changed' ? run.frozenPaths.length : null;
	const rows = [
		{ icon: <ScanSearch size={15} />, title: 'Changed input', detail: changedCount === null ? `${run.frozenPaths.length.toLocaleString()} frozen objects in the selected Scan scope` : `${changedCount.toLocaleString()} changed objects since the last successful Scan`, state: stage.status === 'waiting' ? 'Waiting' : stage.status === 'running' && run.frozenPaths.length === 0 ? 'Scanning' : 'Complete' },
		{ icon: <GitBranch size={15} />, title: 'Affected context', detail: 'Resolve connected files, folders, saved work, and existing Communities.', state: stage.status === 'completed' ? 'Complete' : 'Waiting' },
		{ icon: <Activity size={15} />, title: 'Current graph baseline', detail: 'Reuse the complete maintained graph; changes are overlaid rather than analyzed in isolation.', state: stage.status === 'completed' ? 'Complete' : 'Waiting' },
	];
	return <div className="pk-vi-run-stage-list">{rows.map((row) => <div key={row.title} className={row.state === 'Scanning' ? 'is-running' : ''}><i>{row.icon}</i><span><strong>{row.title}</strong><small>{row.detail}</small></span><StageState status={row.state === 'Complete' ? 'completed' : row.state === 'Scanning' ? 'running' : 'waiting'} /></div>)}</div>;
}

function PublishRunWorkspace({ run, stage }: { run: VaultIntelligenceSnapshot['run']; stage: VaultIntelligenceSnapshot['run']['stages'][number] | null }) {
	const followUpCount = run.plan ? run.operations.filter((operation) => operation.status === 'partial' || operation.status === 'failed').length : 0;
	const rows: Array<{ icon: React.ReactNode; title: string; detail: string; state: VaultIntelligenceSnapshot['run']['stages'][number]['status'] }> = [
		{ icon: <Search size={15} />, title: 'Publish verified Index layers', detail: 'Promote Core Search, vectors, summaries, and AI Tags by verified layer; an optional failure remains a partial result.', state: stage?.status ?? 'waiting' },
		{ icon: <GitBranch size={15} />, title: 'Vault map machine state', detail: 'Publish deterministic graph facts; keep AI Community changes as reviewable proposals.', state: stage?.status === 'completed' ? 'completed' : 'waiting' },
		{ icon: <Check size={15} />, title: 'Follow-up and receipts', detail: `${followUpCount.toLocaleString()} partial operation${followUpCount === 1 ? '' : 's'} require a retained receipt or owner follow-up.`, state: stage?.status === 'completed' ? 'completed' : 'waiting' },
	];
	return <div className="pk-vi-run-stage-list">{rows.map((row) => <div key={row.title} className={row.state === 'running' ? 'is-running' : ''}><i>{row.icon}</i><span><strong>{row.title}</strong><small>{row.detail}</small></span><StageState status={row.state} /></div>)}</div>;
}

function IndexRunWorkspace({ run, stage }: { run: VaultIntelligenceSnapshot['run']; stage: VaultIntelligenceSnapshot['run']['stages'][number] }) {
	const indexOperations = run.operations.filter((operation) => ['embedding-refresh', 'file-summaries', 'ai-tags'].includes(operation.id));
	const currentOperation = indexOperations.find((operation) => operation.status === 'running' && operation.currentPath) ?? null;
	const currentPath = currentOperation?.currentPath ?? stage.currentPath ?? run.coreIndexedPaths?.at(-1) ?? null;
	const total = stage.total || run.frozenPaths.length;
	const coreReadyPaths = new Set(run.coreIndexedPaths ?? []);
	const processed = Math.min(total, coreReadyPaths.size || stage.processed);
	const position = currentPath ? run.frozenPaths.findIndex((path) => path === currentPath) : -1;
	const queueStart = Math.max(0, (position >= 0 ? position : processed) - 2);
	const queue = run.frozenPaths.slice(queueStart, queueStart + 7);
	const indexPercent = total > 0 ? Math.round(processed / total * 100) : 0;
	const enabledEnrichment = indexOperations.filter((operation) => operation.enabled && operation.status !== 'skipped');
	const successfulReceipt = (operation: typeof indexOperations[number], path: string | null) => Boolean(path && operation.attempts?.some((attempt) => attempt.path === path && ['produced', 'already-current'].includes(attempt.status)));
	const failedReceipt = (operation: typeof indexOperations[number], path: string | null) => Boolean(path && operation.attempts?.some((attempt) => attempt.path === path && ['failed', 'partial', 'cancelled'].includes(attempt.status)));
	const enrichedCount = enabledEnrichment.length === 0 ? 0 : run.frozenPaths.filter((path) => enabledEnrichment.every((operation) => successfulReceipt(operation, path))).length;
	const coreReady = Boolean(currentPath && coreReadyPaths.has(currentPath));
	const embedding = indexOperations.find((operation) => operation.id === 'embedding-refresh');
	const summary = indexOperations.find((operation) => operation.id === 'file-summaries');
	const tags = indexOperations.find((operation) => operation.id === 'ai-tags');
	const requestedKnowledge = [summary, tags].filter((operation): operation is NonNullable<typeof operation> => Boolean(operation?.enabled && operation.status !== 'skipped'));
	const generatedKnowledgeDone = requestedKnowledge.length === 0 || requestedKnowledge.every((operation) => successfulReceipt(operation, currentPath));
	const generatedKnowledgeFailed = requestedKnowledge.some((operation) => failedReceipt(operation, currentPath));
	const substeps = [
		{ label: 'Read & extract text', state: coreReady ? 'done' : stage.status === 'running' ? 'active' : 'waiting' },
		{ label: 'Full-text index', state: coreReady ? 'done' : 'waiting' },
		{ label: 'Generate embedding', state: !embedding?.enabled || embedding.status === 'skipped' ? 'not-selected' : successfulReceipt(embedding, currentPath) ? 'done' : failedReceipt(embedding, currentPath) ? 'failed' : embedding.currentPath === currentPath ? 'active' : 'waiting' },
		{ label: 'Summary & AI Tags', state: requestedKnowledge.length === 0 ? 'not-selected' : generatedKnowledgeDone ? 'done' : generatedKnowledgeFailed ? 'failed' : requestedKnowledge.some((operation) => operation.currentPath === currentPath) ? 'active' : 'waiting' },
		{ label: 'Resolve explicit relations', state: coreReady ? 'done' : 'waiting' },
		{ label: 'Save layered Index record', state: coreReady && (enabledEnrichment.length === 0 || enabledEnrichment.every((operation) => successfulReceipt(operation, currentPath))) ? 'done' : enabledEnrichment.some((operation) => operation.currentPath === currentPath) ? 'active' : 'waiting' },
	] as const;
	const completedSubsteps = substeps.filter((step) => step.state === 'done' || step.state === 'not-selected').length;
	const fileProgress = Math.round(completedSubsteps / substeps.length * 100);
	const currentName = currentPath?.split('/').at(-1) ?? 'No document in flight';
	const currentFolder = currentPath?.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : 'Vault root';
	return <div className="pk-vi-index-live-workbench">
		<div className="pk-vi-index-progress-head"><div><span className="pk-vi-selection-type">{stage.status === 'running' ? 'Indexing · processing documents' : stage.status}</span><strong>{processed.toLocaleString()} of {total || '—'}</strong><small>documents complete across selected Index layers</small></div><strong>{indexPercent}%</strong></div>
		<div className="pk-vi-index-progress-bar"><i style={{ width: `${indexPercent}%` }} /></div>
		<div className="pk-vi-index-live-summary"><span><strong>Not available</strong><small>estimated remaining</small></span><span><strong>Not available</strong><small>current document speed</small></span><span><strong>{processed.toLocaleString()} / {total || '—'}</strong><small>Core Search ready</small></span><span><strong>{enabledEnrichment.length ? `${enrichedCount.toLocaleString()} / ${total || '—'}` : 'Not selected'}</strong><small>AI-enriched documents</small></span></div>
		<div className="pk-vi-index-pipeline">{['Discover eligible', 'Process documents', 'Verify layer receipts', 'Ready to publish'].map((label, index) => <span key={label} className={indexPercent >= (index + 1) * 25 ? 'is-complete' : indexPercent >= index * 25 && stage.status === 'running' ? 'is-active' : ''}><i>{index + 1}</i><strong>{label}</strong><small>{indexPercent >= (index + 1) * 25 ? 'Complete' : indexPercent >= index * 25 && stage.status === 'running' ? 'Running' : 'Waiting'}</small></span>)}</div>
		<div className="pk-vi-index-workspace-grid">
			<section className="pk-vi-index-queue"><div className="pk-vi-index-queue-head"><span><strong>Document order</strong><small>Completed documents stay visible around the current document.</small></span><select aria-label="Document processing order" disabled><option>Frozen Scan order</option></select></div><div className="pk-vi-index-table-head"><span>#</span><span>Document</span><span>Core Index progress</span><span>Time</span></div>{queue.map((path, index) => { const absoluteIndex = queueStart + index; const state = coreReadyPaths.has(path) ? 'Complete' : path === currentPath ? 'Processing now' : 'Waiting'; return <span key={path} className={path === currentPath ? 'is-current' : ''}><small>{absoluteIndex + 1}</small><strong>{path}</strong><em>{state}</em><small>—</small></span>; })}<footer><span><strong>{processed.toLocaleString()}</strong> completed this run</span><span><strong>{indexOperations.reduce((count, operation) => count + (operation.attempts?.filter((attempt) => attempt.status === 'failed').length ?? 0), 0)}</strong> need attention after the run</span><Button variant="ghost" disabled={!currentPath || stage.status !== 'running'}>Skip current document</Button></footer></section>
			<aside className="pk-vi-index-current"><span className="pk-vi-selection-type">{currentPath ? 'Current document' : 'Document queue'}</span><div className="pk-vi-index-current-file"><strong>{currentName}</strong><span>{currentFolder}</span></div><div className="pk-vi-index-current-facts"><span>Size unavailable</span><span>·</span><span>Chunks unavailable</span><span>·</span><span>{position >= 0 ? `${position + 1} / ${total}` : `— / ${total || '—'}`}</span></div><div className="pk-vi-index-file-progress"><i style={{ width: `${fileProgress}%` }} /><span>{fileProgress}%</span></div><div className="pk-vi-index-substeps">{substeps.map((step) => <span key={step.label} className={`is-${step.state}`}><i>{step.state === 'done' ? <Check size={12} /> : null}</i><strong>{step.label}</strong><small>{step.state.replace('-', ' ')}</small></span>)}</div><div className="pk-vi-index-throughput"><span>Throughput <strong>Not available</strong></span><small>{stage.status === 'running' ? 'Live · measuring' : stage.status}</small><svg viewBox="0 0 260 42" preserveAspectRatio="none" aria-hidden="true"><path d="M0 31 L34 30 L68 32 L102 28 L136 28 L170 25 L204 27 L238 26 L260 26" /></svg></div></aside>
		</div>
		<div className="pk-vi-index-parallel"><strong>Parallel lanes</strong><span>Local content health</span><span>Deterministic graph facts</span><span>AI Index enrichment uses the approved models and appears under AI Work</span><StageState status={stage.status} /></div>
	</div>;
}

function AiRunWorkspace({ run, runtime }: { run: VaultIntelligenceSnapshot['run']; runtime: VaultIntelligenceWorkspaceRuntime }) {
	const perFile = run.operations.filter((operation) => ['embedding-refresh', 'file-summaries', 'ai-tags'].includes(operation.id));
	const vaultWide = run.operations.filter((operation) => !['embedding-refresh', 'file-summaries', 'ai-tags'].includes(operation.id));
	const phaseDefinitions: ReadonlyArray<{ key: 'evidence' | 'discover' | 'review' | 'followup'; title: string; description: string; operationIds: readonly VaultScanAiOperationId[] }> = [
		{ key: 'evidence', title: 'Assemble evidence', description: 'Freeze changed input, affected context, the current graph, and source revisions.', operationIds: [] },
		{ key: 'discover', title: 'Discover candidates', description: 'Search changed and already-known content for possible meaning and relationships.', operationIds: ['relationship-discovery', 'relationship-review'] },
		{ key: 'review', title: 'Review and explain', description: 'Test candidates against source evidence, Communities, Hubs, bridges, and history.', operationIds: ['semantic-review', 'community-analysis', 'hub-bridge-analysis'] },
		{ key: 'followup', title: 'Prepare follow-up', description: 'Create guarded proposals and retain only unresolved owner work.', operationIds: ['file-proposals', 'maintenance-synthesis'] },
	];
	const phaseState = (operationIds: readonly string[]) => {
		if (operationIds.length === 0) return run.stages.find((stage) => stage.id === 'index')?.status === 'completed' ? 'completed' : 'running';
		const operations = vaultWide.filter((operation) => operationIds.includes(operation.id));
		if (operations.length === 0 || operations.every((operation) => operation.status === 'skipped')) return 'skipped';
		if (operations.some((operation) => operation.status === 'running')) return 'running';
		if (operations.some((operation) => operation.status === 'failed')) return 'failed';
		if (operations.every((operation) => operation.status === 'completed')) return 'completed';
		return 'waiting';
	};
	const focusedPhaseKey = [...phaseDefinitions].reverse().find((phase) => phaseState(phase.operationIds) === 'running')?.key ?? null;
	const perFileUsage = displayRunUsage(perFile);
	const perFileRoute = perFile.find((operation) => operation.actualRoute)?.actualRoute ?? null;
	const perFileState = perFile.every((operation) => operation.status === 'completed') ? 'completed' : perFile.some((operation) => operation.status === 'running') ? 'running' : perFile.some((operation) => operation.status === 'failed') ? 'failed' : 'waiting';
	return <div className="pk-vi-ai-live-workbench">
		<section className="pk-vi-ai-index-lane"><div className="pk-vi-ai-scope-divider"><div><small>Per document · part of Knowledge Index</small><strong>Index enrichment</strong><span>Each eligible document receives its selected Embedding, Summary, and AI Tags after Core Search prepares the text. This lane contributes directly to Index progress.</span></div><StageState status={perFileState} /></div><details className="pk-vi-index-enrichment-group" open><summary><i>{perFileState === 'completed' ? <Check size={13} /> : null}</i><span><strong>Enrich the Knowledge Index</strong><small>Follows Core Search per document; it is part of Index progress and can overlap local indexing.</small></span><span><strong>{perFileRoute?.model ?? 'Selected Index models'}</strong><small>{perFileRoute?.provider ?? `${perFile.length} configured operations`}</small></span><span><strong>{perFileUsage.providerReceiptCount ? formatCompactNumber(perFileUsage.totalTokens) : 'Usage unavailable'}</strong><small>{perFileUsage.providerReceiptCount ? `${formatMoney(perFileUsage.costUsd)} actual` : 'No provider receipt yet'}</small></span><ChevronDown size={15} /></summary><div className="pk-vi-run-operations">{perFile.map((operation) => <RunOperation key={operation.id} operation={operation} runtime={runtime} run={run} />)}</div></details></section>
		<section className="pk-vi-vault-analysis"><div className="pk-vi-ai-scope-divider"><div><small>Vault-wide · begins as soon as enough Index evidence exists</small><strong>Vault-wide analysis timeline</strong><span>One continuous trace from frozen evidence to candidates, review, and follow-up. Stages may overlap when their required evidence is ready.</span></div><StageState status={vaultWide.some((operation) => operation.status === 'running') ? 'running' : vaultWide.every((operation) => ['completed', 'skipped'].includes(operation.status)) ? 'completed' : 'waiting'} /></div>
			<div className="pk-vi-vault-analysis-track" aria-label="Vault-wide analysis timeline">{phaseDefinitions.map((phase, index) => { const state = phaseState(phase.operationIds); return <span key={phase.key} className={`is-${state}`}><i>{state === 'completed' ? <Check size={12} /> : index + 1}</i><strong>{phase.title}</strong><small>{state === 'completed' ? 'Complete' : state === 'running' ? phase.key === 'discover' ? 'Discovering candidates' : phase.key === 'review' ? 'Reviewing evidence' : phase.key === 'followup' ? 'Preparing follow-up' : 'Assembling evidence' : state === 'skipped' ? 'Not selected' : 'Waiting'}</small></span>; })}</div>
			<div className="pk-vi-vault-analysis-timeline">{phaseDefinitions.map((phase, index) => { const state = phaseState(phase.operationIds); const operations = vaultWide.filter((operation) => phase.operationIds.includes(operation.id)); const usage = displayRunUsage(operations); const route = operations.find((operation) => operation.actualRoute)?.actualRoute ?? null; return <details key={phase.key} className={`pk-vi-vault-phase is-${state}`} open={phase.key === focusedPhaseKey}><summary><i>{state === 'completed' ? <Check size={12} /> : index + 1}</i><span><strong>{phase.title}</strong><small>{phase.description}</small></span><span>{state === 'completed' ? 'Evidence boundary complete.' : state === 'running' ? operations.some((operation) => operation.liveEvidence?.length) ? 'Runtime evidence is streaming below.' : 'Provider work is active; waiting for the first evidence event.' : state === 'skipped' ? 'No operation in this phase was selected.' : 'Waiting for the previous evidence boundary.'}</span><span><strong>{operations.length ? usage.providerReceiptCount ? `${formatCompactNumber(usage.totalTokens)} tokens · ${formatMoney(usage.costUsd)}` : 'No provider receipt' : 'Local evidence'}</strong><small>{route ? `${route.model} · ${route.provider}` : operations.length ? 'No completed provider route' : 'No model call'}</small></span><ChevronRight size={15} /></summary><div>{phase.key === 'evidence' ? <div className="pk-vi-vault-evidence-chain">{['Freeze selected input', 'Resolve affected context', 'Load the current graph baseline', 'Seal the evidence packet'].map((label, evidenceIndex) => <span key={label}><i><Check size={10} /></i><strong>{label}</strong><small>{evidenceIndex === 0 ? `${run.frozenPaths.length} frozen objects with source revisions` : evidenceIndex === 1 ? 'Affected links, folders, saved work, and Communities resolved' : evidenceIndex === 2 ? 'Existing identities and graph history retained' : 'Provenance attached for downstream operations'}</small><em>Complete</em></span>)}</div> : operations.length ? operations.map((operation) => <RunOperation key={operation.id} operation={operation} runtime={runtime} run={run} />) : <div className="pk-vi-empty">No operation selected for this phase.</div>}</div></details>; })}</div>
		</section>
	</div>;
}

function BuildIndexParityWorkspace({ run, stage, runtime }: { run: VaultIntelligenceSnapshot['run']; stage: VaultIntelligenceSnapshot['run']['stages'][number]; runtime: VaultIntelligenceWorkspaceRuntime }) {
	const [inspectOpen, setInspectOpen] = useState(false);
	const [knowledgePath, setKnowledgePath] = useState<string | null>(null);
	const knowledgeTriggerRef = useRef<HTMLButtonElement | null>(null);
	const closeKnowledge = () => {
		setKnowledgePath(null);
		queueMicrotask(() => knowledgeTriggerRef.current?.focus());
	};
	useEffect(() => {
		if (!knowledgePath) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			closeKnowledge();
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [knowledgePath]);
	const corePaths = new Set(run.coreIndexedPaths ?? []);
	const operations = run.operations.filter((operation) => ['embedding-refresh', 'file-summaries', 'ai-tags'].includes(operation.id));
	const embedding = operations.find((operation) => operation.id === 'embedding-refresh') ?? null;
	const aiOperations = operations.filter((operation) => operation.id === 'file-summaries' || operation.id === 'ai-tags');
	const summaries = aiOperations.find((operation) => operation.id === 'file-summaries') ?? null;
	const aiTags = aiOperations.find((operation) => operation.id === 'ai-tags') ?? null;
	const attemptDone = (operation: typeof embedding, path: string) => Boolean(operation?.attempts?.some((attempt) => attempt.path === path && ['produced', 'already-current'].includes(attempt.status)));
	const attemptNotEligible = (operation: typeof embedding, path: string) => Boolean(operation?.attempts?.some((attempt) => attempt.path === path && attempt.status === 'not-eligible'));
	const attemptFor = (operation: typeof embedding, path: string) => [...(operation?.attempts ?? [])].reverse().find((attempt) => attempt.path === path) ?? null;
	const knowledgeState = (operation: typeof embedding, path: string, eligible: boolean, output: 'summary' | 'tags') => {
		if (!eligible || attemptNotEligible(operation, path)) return { label: 'Not eligible', className: 'is-not-supported' };
		const attempt = attemptFor(operation, path);
		const hasOutput = output === 'summary'
			? Boolean(attempt?.generatedKnowledge?.summary?.trim())
			: Array.isArray(attempt?.generatedKnowledge?.tags);
		if ((attempt?.status === 'produced' || attempt?.status === 'already-current') && hasOutput) return { label: 'Ready', className: 'is-done' };
		if (attempt?.status === 'produced' || attempt?.status === 'already-current') return { label: 'Output unavailable', className: 'is-not-supported' };
		if (attempt && ['failed', 'partial', 'cancelled'].includes(attempt.status)) return { label: 'Failed', className: 'is-failed' };
		if (operation?.currentPath === path) return { label: 'Generating', className: 'is-running' };
		return { label: corePaths.has(path) ? 'Queued' : 'Waiting for text', className: '' };
	};
	const searchEligiblePaths = run.frozenPaths.filter((path) => run.pathEligibility?.[path]?.fullText !== false);
	const embeddingEligiblePaths = run.frozenPaths.filter((path) => run.pathEligibility?.[path]?.embeddings !== false);
	const aiEligiblePaths = run.frozenPaths.filter((path) => run.pathEligibility?.[path]?.aiEnrichment !== false);
	const total = searchEligiblePaths.length;
	const embeddingTotal = embedding?.total ?? embeddingEligiblePaths.length;
	const aiTotal = aiOperations.length > 0 ? Math.max(...aiOperations.map((operation) => operation.total), aiEligiblePaths.length) : 0;
	const embeddingDone = embeddingEligiblePaths.filter((path) => attemptDone(embedding, path)).length;
	const aiDone = aiEligiblePaths.filter((path) => aiOperations.length > 0 && aiOperations.every((operation) => attemptDone(operation, path))).length;
	const counts = { search: Math.min(total, corePaths.size || stage.processed), embedding: embeddingDone, ai: aiDone };
	const totals = { search: total, embedding: embeddingTotal, ai: aiTotal };
	const workTotal = totals.search + totals.embedding + totals.ai;
	const workDone = counts.search + counts.embedding + counts.ai;
	const percent = workTotal > 0 ? Math.round(workDone / workTotal * 100) : 0;
	const elapsed = run.startedAt ? elapsedLabel(run.startedAt, Date.now()) : '0s';
	const usage = displayRunUsage(aiOperations);
	const latestGeneratedPath = aiOperations.flatMap((operation) => operation.attempts ?? [])
		.filter((attempt) => attempt.path && attempt.generatedKnowledge)
		.sort((left, right) => right.completedAt - left.completedAt)[0]?.path ?? null;
	const currentKnowledgePath = aiOperations.find((operation) => operation.currentPath)?.currentPath
		?? latestGeneratedPath
		?? aiEligiblePaths.find((path) => corePaths.has(path))
		?? aiEligiblePaths[0]
		?? null;
	const laneRows = (kind: 'search' | 'embedding' | 'ai') => {
		const activePath = kind === 'search' ? stage.currentPath : kind === 'embedding' ? embedding?.currentPath : aiOperations.find((operation) => operation.currentPath)?.currentPath;
		const paths = kind === 'search' ? searchEligiblePaths : kind === 'embedding' ? embeddingEligiblePaths : aiEligiblePaths;
		const start = Math.max(0, activePath ? paths.indexOf(activePath) : counts[kind]);
		return paths.slice(start, start + 4).map((path, index) => {
			const done = kind === 'search' ? corePaths.has(path) : kind === 'embedding' ? attemptDone(embedding, path) : aiOperations.length > 0 && aiOperations.every((operation) => attemptDone(operation, path));
			const running = path === activePath;
			const route = kind === 'embedding' ? embedding?.actualRoute : kind === 'ai' ? aiOperations.find((operation) => operation.currentPath === path)?.actualRoute ?? aiOperations.find((operation) => operation.actualRoute)?.actualRoute : null;
			return { path, state: done ? 'done' : running ? 'running' : 'queued', label: done ? 'Complete' : running ? kind === 'search' ? 'Scanning' : kind === 'embedding' ? 'Vectorizing' : 'Generating' : index === 0 && activePath ? 'Next' : 'Queued', model: kind === 'search' ? 'Local' : route?.model ?? 'Route pending' };
		});
	};
	const lanes = [
		{ id: 'search' as const, title: 'Full-text search', icon: <Search size={23} />, count: counts.search, total: totals.search, rate: 'Measuring…', facts: ['Estimated time calculating', 'Passages counted at commit', 'Unsupported files excluded'], tooltip: 'Reads each supported document, extracts keywords and passages, and commits them to the local full-text index.' },
		{ id: 'embedding' as const, title: 'Embeddings', icon: <GitBranch size={23} />, count: counts.embedding, total: totals.embedding, rate: 'Measuring…', facts: ['Estimated time calculating', 'Chunks counted at commit', `${embedding?.currentPath ? 1 : 0} active files`], tooltip: 'Chunks eligible search-ready documents and generates vectors with the configured model.' },
		{ id: 'ai' as const, title: 'AI enrichment', icon: <Sparkles size={23} />, count: counts.ai, total: totals.ai, rate: usage.providerReceiptCount ? `${formatCompactNumber(usage.totalTokens)} tokens` : 'Usage unavailable', facts: ['Eligible Markdown only', usage.providerReceiptCount ? `${formatMoney(usage.costUsd)} actual` : 'No provider receipt yet', `${aiOperations.filter((operation) => operation.status === 'running').length} active operations`], tooltip: 'Generates summaries and machine-only AI Tags for eligible Markdown files. Unsupported files are explicitly Not supported.' },
	];
	const laneStatus = (id: 'search' | 'embedding' | 'ai', count: number, laneTotal: number) => {
		if (laneTotal > 0 && count >= laneTotal) return 'completed';
		const laneOperations = id === 'embedding' ? [embedding].filter(Boolean) : id === 'ai' ? aiOperations : [];
		if (id === 'search') return stage.status === 'running' ? 'running' : stage.status;
		if (laneOperations.some((operation) => operation?.currentPath || operation?.status === 'running')) return 'running';
		if (laneOperations.some((operation) => operation?.status === 'failed')) return 'failed';
		if (laneOperations.some((operation) => operation?.status === 'partial')) return 'partial';
		return 'waiting';
	};
	const previewSummaryReceipt = currentKnowledgePath ? attemptFor(summaries, currentKnowledgePath) : null;
	const previewTagsReceipt = currentKnowledgePath ? attemptFor(aiTags, currentKnowledgePath) : null;
	const previewEligible = Boolean(currentKnowledgePath && run.pathEligibility?.[currentKnowledgePath]?.aiEnrichment !== false);
	const previewSummaryState = currentKnowledgePath ? knowledgeState(summaries, currentKnowledgePath, previewEligible, 'summary') : { label: 'Queued', className: '' };
	const previewTagsState = currentKnowledgePath ? knowledgeState(aiTags, currentKnowledgePath, previewEligible, 'tags') : { label: 'Queued', className: '' };
	const previewTags = previewTagsReceipt?.generatedKnowledge?.tags ?? [];
	const liveActivity = [
		...(summaries?.liveEvidence ?? []).map((event) => ({ ...event, operation: 'Summary' })),
		...(aiTags?.liveEvidence ?? []).map((event) => ({ ...event, operation: 'AI Tags' })),
	].sort((left, right) => left.updatedAt - right.updatedAt).slice(-3);
	const detailSummaryReceipt = knowledgePath ? attemptFor(summaries, knowledgePath) : null;
	const detailTagsReceipt = knowledgePath ? attemptFor(aiTags, knowledgePath) : null;
	const detailEligible = Boolean(knowledgePath && run.pathEligibility?.[knowledgePath]?.aiEnrichment !== false);
	const detailSummaryState = knowledgePath ? knowledgeState(summaries, knowledgePath, detailEligible, 'summary') : { label: 'Queued', className: '' };
	const detailTagsState = knowledgePath ? knowledgeState(aiTags, knowledgePath, detailEligible, 'tags') : { label: 'Queued', className: '' };
	const detailTraces = knowledgePath
		? [
			...(runtime.getGenerationTraces?.('file-summaries', knowledgePath) ?? []),
			...(runtime.getGenerationTraces?.('ai-tags', knowledgePath) ?? []),
		].sort((left, right) => right.startedAt - left.startedAt)
		: [];
	return <div className="pk-vi-build-parity">
		<section className="pk-vi-build-summary"><div className="pk-vi-build-overall"><i><ListChecks size={28} /></i><div><strong>Building search, semantic, and AI layers.</strong><span className="pk-vi-build-number">{percent}% <small>overall progress</small></span><ProgressBar value={percent} /><span className="pk-vi-build-facts"><b>{elapsed}</b> elapsed <b>Calculating…</b> target <b>{workDone} / {workTotal}</b> eligible layer passes</span></div></div><div className="pk-vi-build-outcomes">{lanes.map((lane) => { const lanePercent = lane.total > 0 ? Math.round(lane.count / lane.total * 100) : 100; const state = laneStatus(lane.id, lane.count, lane.total); return <div key={lane.id} className={`is-${state}`} title={lane.tooltip}><i>{lane.icon}</i><strong>{lane.id === 'search' ? 'Building search' : lane.id === 'embedding' ? 'Semantic ready' : 'Fully enriched'}</strong><span><b>{lanePercent}%</b><small>done</small></span><span><b>{lane.count} / {lane.total}</b><small>eligible</small></span><span><b>{elapsed}</b><small>elapsed</small></span><span><b>Calculating…</b><small>target</small></span></div>; })}</div></section>
		<section className="pk-vi-build-card"><header><strong>One document stream · three independent lanes</strong><span><i />Complete <i />Running <i />Queued</span></header><div className="pk-vi-build-pipeline">{lanes.map((lane, laneIndex) => { const lanePercent = lane.total > 0 ? Math.round(lane.count / lane.total * 100) : 100; const rows = laneRows(lane.id); const state = laneStatus(lane.id, lane.count, lane.total); return <article key={lane.id} className={`pk-vi-build-lane is-${lane.id}`}><span className="pk-vi-build-marker">{laneIndex + 1}</span><div className="pk-vi-build-lane-title"><i>{lane.icon}</i><span><strong>{lane.title}</strong><em>{state === 'completed' ? 'Complete' : state === 'running' ? 'Running' : state}</em></span></div><div className="pk-vi-build-lane-progress"><span><b>{lane.count} / {lane.total}</b> eligible documents <strong>{lane.rate}</strong></span><ProgressBar value={lanePercent} /><div>{lane.facts.map((fact) => <small key={fact}>{fact}</small>)}</div></div><div className="pk-vi-build-window"><header><span>Current files</span><span>{rows.filter((row) => row.state === 'running').length} active · {rows.filter((row) => row.state === 'queued').length} next</span></header>{rows.length ? rows.map((row) => <span key={row.path} className={`is-${row.state}`}><i /><strong title={row.path}>{row.path}</strong><em>{row.model}</em><small>{row.label}</small></span>) : <div className="pk-vi-build-empty">No eligible files in this lane.</div>}</div></article>; })}</div></section>
		<section className="pk-vi-generated-preview" aria-live="polite">
			<header><strong>Generated knowledge · current document</strong><Button variant="outline" disabled={!currentKnowledgePath || !previewEligible} onClick={(event) => { knowledgeTriggerRef.current = event.currentTarget; setKnowledgePath(currentKnowledgePath); }}>View details</Button></header>
			<div className="pk-vi-generated-preview-body">
				<div className="pk-vi-generated-document"><FileText size={15} /><strong title={currentKnowledgePath ?? undefined}>{currentKnowledgePath ?? 'Waiting for Core Search'}</strong></div>
					<div className="pk-vi-generated-output-list">
						<div className="pk-vi-generated-output"><span>Summary</span><strong>{previewSummaryReceipt?.generatedKnowledge?.summary || (previewSummaryState.label === 'Generating' ? 'Waiting for response…' : previewSummaryState.label)}</strong><em className={previewSummaryState.className}>{previewSummaryState.label}</em></div>
						<div className="pk-vi-generated-output"><span>AI Tags</span><div className="pk-vi-generated-tags">{previewTags.length ? previewTags.map((tag) => <i key={tag}>{tag}</i>) : <strong>{previewTagsState.label === 'Generating' ? 'Waiting for tags…' : previewTagsState.label}</strong>}</div><em className={previewTagsState.className}>{previewTagsState.label}</em></div>
					</div>
				</div>
				{liveActivity.length > 0 && <div className="pk-vi-generated-activity"><header><strong>Activity</strong></header><div>{liveActivity.map((event, index) => <span key={`${event.operation}:${event.updatedAt}:${index}`}><i className={event.kind === 'text' ? 'is-output' : ''} /><b>{event.operation}</b><strong>{event.text}</strong><time>{formatDateTime(event.updatedAt)}</time></span>)}</div></div>}
			</section>
			<details className="pk-vi-build-inspect" onToggle={(event) => setInspectOpen(event.currentTarget.open)}><summary><span><FileText size={14} /><strong>Inspect all document states</strong><small>{run.frozenPaths.length} files</small></span><ChevronDown size={14} /></summary>{inspectOpen && <div><header><span>Document</span><span>Full-text search</span><span>Embeddings</span><span>Summary</span><span>AI Tags</span></header>{run.frozenPaths.length ? run.frozenPaths.map((path) => { const searchUnsupported = run.pathEligibility?.[path]?.fullText === false; const embeddingUnsupported = run.pathEligibility?.[path]?.embeddings === false || attemptNotEligible(embedding, path); const aiEligible = run.pathEligibility?.[path]?.aiEnrichment !== false; const summaryState = knowledgeState(summaries, path, aiEligible, 'summary'); const tagState = knowledgeState(aiTags, path, aiEligible, 'tags'); const openable = aiEligible && (corePaths.has(path) || Boolean(attemptFor(summaries, path) || attemptFor(aiTags, path))); return <Button key={path} variant="ghost" className="pk-vi-build-inspect-row" disabled={!openable} onClick={(event) => { knowledgeTriggerRef.current = event.currentTarget; setKnowledgePath(path); }}><strong title={path}>{path}</strong><em className={corePaths.has(path) ? 'is-done' : searchUnsupported ? 'is-not-supported' : ''}>{searchUnsupported ? 'Not supported' : corePaths.has(path) ? 'Complete' : path === stage.currentPath ? 'Running' : 'Queued'}</em><em className={attemptDone(embedding, path) ? 'is-done' : embeddingUnsupported ? 'is-not-supported' : ''}>{embeddingUnsupported ? 'Not supported' : attemptDone(embedding, path) ? 'Complete' : embedding?.currentPath === path ? 'Running' : 'Queued'}</em><em className={summaryState.className}>{summaryState.label}</em><em className={tagState.className}>{tagState.label}</em></Button>; }) : <div className="pk-vi-build-empty">No documents are in the frozen Scan scope.</div>}</div>}</details>
		{knowledgePath && <div className="pk-vi-generated-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) closeKnowledge(); }}>
			<section role="dialog" aria-modal="true" aria-label="Generated knowledge">
				<header><div><span>Generated knowledge</span><strong>{knowledgePath.split('/').at(-1)}</strong></div><Button variant="ghost" className="pk-vi-dialog-close" aria-label="Close generated knowledge" onClick={closeKnowledge}><X size={17} /></Button></header>
				<div className="pk-vi-generated-detail">
					<section><strong>Summary <em className={detailSummaryState.className}>{detailSummaryState.label}</em></strong><span className="pk-vi-generated-detail-copy">{detailSummaryReceipt?.generatedKnowledge?.summary || (detailSummaryState.label === 'Failed' ? detailSummaryReceipt?.error || summaries?.error || run.error || 'Summary failed.' : detailSummaryState.label === 'Generating' ? 'Waiting for response…' : detailSummaryState.label)}</span></section>
					<section><strong>AI Tags <em className={detailTagsState.className}>{detailTagsState.label}</em></strong><div className="pk-vi-generated-tags">{detailTagsReceipt?.generatedKnowledge?.tags?.length ? detailTagsReceipt.generatedKnowledge.tags.map((tag) => <i key={tag}>{tag}</i>) : <span>{detailTagsState.label === 'Failed' ? detailTagsReceipt?.error || aiTags?.error || run.error || 'AI Tags failed.' : detailTagsState.label === 'Generating' ? 'Waiting for tags…' : detailTagsState.label}</span>}</div></section>
				</div>
				<details className="pk-vi-generation-log">
					<summary><span><FileText size={14} /><strong>Request log</strong></span><small>{detailTraces.length ? `${detailTraces.length} call${detailTraces.length === 1 ? '' : 's'}` : 'Waiting'}</small><ChevronDown size={14} /></summary>
					<div>{detailTraces.length ? detailTraces.map((trace) => {
						const reasoning = trace.usage?.reasoningTokens ?? 0;
						const answer = Math.max(0, (trace.usage?.outputTokens ?? 0) - reasoning);
						const usageText = trace.usage
							? `${formatCompactNumber(trace.usage.inputTokens ?? 0)} in · ${formatCompactNumber(answer)} answer${reasoning > 0 ? ` · ${formatCompactNumber(reasoning)} reasoning` : ''}`
							: trace.phase === 'request' ? 'Awaiting receipt' : 'Usage unavailable';
						return <article key={`${trace.operation}:${trace.requestId}`}>
							<header><strong>{trace.operation === 'summary' ? 'Summary' : 'AI Tags'}{trace.phase === 'stream' ? ' · streaming' : trace.phase === 'failed' ? ' · failed' : ''}</strong><span>{trace.finishReason ? `${usageText} · ${trace.finishReason}` : usageText}</span></header>
							<section><strong>Request</strong><pre>{`SYSTEM\n${trace.systemPrompt || '(empty)'}\n\nUSER\n${trace.userPrompt}`}</pre></section>
							{trace.reasoningText ? <section><strong>Provider reasoning</strong><pre>{trace.reasoningText}</pre></section> : null}
							<section><strong>Raw response</strong><pre>{trace.phase === 'failed' ? `${trace.error ?? 'Request failed.'}\n\n${trace.responseText?.trim() || '(empty provider content)'}` : trace.responseText ?? 'Waiting for the provider response…'}</pre></section>
						</article>;
					}) : <span className="pk-vi-generation-log-empty">The exact request and raw response will appear here when this document starts generation.</span>}</div>
				</details>
				<div className="pk-vi-generated-boundary"><ShieldCheck size={14} /><span>Source unchanged</span><i />Saved to Peak Index</div>
			</section>
		</div>}
	</div>;
}

function VaultDiscoveryParityWorkspace({ run }: { run: VaultIntelligenceSnapshot['run'] }) {
	const operation = run.operations.find((candidate) => candidate.id === 'relationship-discovery' && candidate.status !== 'skipped') ?? run.operations.find((candidate) => candidate.liveEvidence?.length) ?? null;
	const findings = run.discoveryFindings ?? [];
	const events = operation?.liveEvidence ?? [];
	const processed = operation?.processed ?? 0;
	const total = operation?.total ?? run.frozenPaths.length;
	const percent = total > 0 ? Math.round(processed / total * 100) : 0;
	const usage = displayRunUsage(operation ? [operation] : []);
	const kinds = ['relationship', 'community', 'hub', 'bridge', 'island', 'drift'] as const;
	const latest = events.at(-1) ?? null;
	return <div className="pk-vi-discovery-parity">
		<section className="pk-vi-discovery-hero"><div><i><GitBranch size={29} /></i><span><strong>Discovering structure across your vault.</strong><em><i />{operation?.status === 'running' ? 'Investigating the evidence frontier' : operation?.status ?? 'Waiting'}</em><ProgressBar value={percent} /><small>{processed.toLocaleString()} of {total.toLocaleString()} evidence records checked</small></span></div><aside><span><b>{percent}%</b><small>evidence coverage</small></span><span><b>Calculating…</b><small>estimated remaining</small></span><span><b>{run.startedAt ? elapsedLabel(run.startedAt, Date.now()) : '0s'}</b><small>elapsed</small></span><span><b>{usage.providerReceiptCount ? formatMoney(usage.costUsd) : 'Unavailable'}</b><small>model usage</small></span></aside></section>
		<section className="pk-vi-discovery-findings"><header><strong>Findings</strong><span>View findings</span></header><div className="pk-vi-discovery-finding-summary"><span><b>{findings.length}</b><small>retained</small></span><div>{kinds.map((kind) => <span key={kind}><i className={`is-${kind}`} /><strong>{kind.replace('-', ' ')}</strong><b>{findings.filter((finding) => finding.kind === kind).length}</b></span>)}</div></div><details><summary>Finding details<ChevronDown size={14} /></summary><div><header><span>Type</span><span>Finding</span><span>Evidence</span></header>{findings.length ? findings.map((finding) => <span key={finding.id}><em><i />{finding.kind}</em><strong>{finding.title}</strong><small>{finding.evidenceCount ? `${finding.evidenceCount} sources` : 'Evidence retained in session'}</small></span>) : <div className="pk-vi-discovery-empty">Retained findings will appear here.</div>}</div></details></section>
		<section className="pk-vi-discovery-session"><header><strong>Session</strong><span>{operation?.actualRoute ? `${operation.actualRoute.model} · ${operation.actualRoute.provider}` : 'Route pending'}</span></header><div className="pk-vi-discovery-live"><span><i />Agent <strong>{operation?.actualRoute?.model ?? 'Waiting for route'}</strong><time>{latest ? formatDateTime(latest.updatedAt) : '00:00'}</time></span><div>{latest?.text ?? 'Starting session…'}</div><small><FileText size={14} />{operation?.currentPath ?? 'Frozen Vault evidence packet'}</small></div><div className="pk-vi-discovery-history-head"><span>Earlier in this session</span><span>Newest first</span></div><div className="pk-vi-discovery-history">{events.length ? [...events].reverse().map((event, index) => <span key={`${event.updatedAt}:${index}`}><time>{formatDateTime(event.updatedAt)}</time><div><em><i />{event.kind === 'tool' ? 'Tool' : event.kind === 'status' ? 'Agent' : 'Reasoning'}</em>{event.text}<small><FileText size={13} />{operation?.currentPath ?? 'Frozen Vault evidence'}</small></div></span>) : <div className="pk-vi-discovery-empty">Output will appear here as the session continues.</div>}</div></section>
	</div>;
}

function PrepareReviewRunWorkspace({ run }: { run: VaultIntelligenceSnapshot['run'] }) {
	const projection = run.reviewPreparation;
	const total = projection?.findingsAccounted.total ?? run.discoveryFindings?.length ?? 0;
	const accounted = projection?.findingsAccounted.processed ?? 0;
	const percent = projection?.percent;
	const stream = projection?.stream ?? [];
	const latest = stream.at(-1) ?? null;
	const jobs = projection?.jobs ?? [];
	const receipts = stream.filter((event) => ['validation-passed', 'artifact-committed', 'job-completed'].includes(event.type));
	return <div className="pk-vi-review-parity">
		<section className="pk-vi-review-hero"><div><i><ListChecks size={29} /></i><span><strong>Planning review work.</strong><em><b>{percent === null || percent === undefined ? 'Planning…' : `${percent}%`}</b>{projection?.phase?.replace('-', ' ') ?? 'normalizing findings'}</em><ProgressBar value={percent ?? 0} /><small>{projection ? `${accounted} of ${total} findings accounted` : 'Freezing review inputs'}</small><small><Clock3 size={14} />Elapsed <b>{run.startedAt ? elapsedLabel(run.startedAt, Date.now()) : '0s'}</b> · Estimated remaining <b>Calculating…</b></small></span></div><aside><span><i><Check size={15} /></i><strong>Findings accounted</strong><b>{accounted} / {total}<small>{projection?.status ?? 'waiting'}</small></b></span><span><i><ListChecks size={15} /></i><strong>Tasks planned</strong><b>{projection?.tasksPlanned ?? '—'}<small>{projection ? 'planned' : 'waiting'}</small></b></span><span><i><CircleAlert size={15} /></i><strong>Ready / attention</strong><b>{projection?.ready ?? 0} / {projection?.attention ?? 0}<small>{projection ? 'validated' : 'waiting'}</small></b></span></aside></section>
		<section className="pk-vi-review-work"><header><span><ListChecks size={16} /><strong>Review work</strong></span><small><i />Running <i />Ready <i />Needs attention <i />Waiting</small></header><div>{jobs.length ? jobs.map((job) => { const done = job.status === 'completed' || job.status === 'attention'; const rowPercent = done ? 100 : job.status === 'queued' ? 0 : 50; return <span key={job.jobId} className={`is-${job.status}`}><i><FileText size={19} /></i><strong title={job.workKey}>{job.workKey.replace(/:/g, ' · ')}</strong><b>{job.atomRefs.length} atoms</b><em><span><b>{job.status}</b><small>{done ? job.atomRefs.length : 0} / {job.atomRefs.length}</small></span><ProgressBar value={rowPercent} /></em><small>{job.attemptIds.length ? `${job.attemptIds.length} attempt${job.attemptIds.length === 1 ? '' : 's'}` : 'Waiting'}</small></span>; }) : <div className="pk-vi-review-planning"><i />Organizing findings into owner work</div>}<div className="pk-vi-review-live"><span><i />{latest?.type ?? 'Controller'}<strong>{latest?.jobId ?? 'Local rules'}</strong><time>{latest ? formatDateTime(latest.occurredAt) : '0s'}</time></span><div>{latest?.text ?? 'Starting review preparation…'}</div><small><FileText size={14} />{projection ? `${projection.jobs.length} planned jobs · frozen review inputs` : 'Frozen review snapshot pending'}</small></div></div></section>
		<section className="pk-vi-review-log"><header><span><ListChecks size={16} /><strong>Session receipts</strong></span><small>Completed work only</small></header><div className="pk-vi-review-log-head"><span>Validated outcomes</span><span>Appends without moving your scroll position</span></div><div>{receipts.length ? [...receipts].reverse().map((event) => <span key={event.id}><time>{formatDateTime(event.occurredAt)}</time><em><i />{event.type.replace(/-/g, ' ')}</em><strong>{event.text}</strong><small>{event.jobId ?? 'Controller'}</small></span>) : <div className="pk-vi-review-empty">A receipt appears only after the active work above finishes.</div>}</div></section>
	</div>;
}

function ProgressBar({ value }: { value: number }) {
	return <span className="pk-vi-parity-progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>;
}

function RunOperation({ operation, runtime, run }: { operation: VaultIntelligenceSnapshot['run']['operations'][number]; runtime: VaultIntelligenceWorkspaceRuntime; run: VaultIntelligenceSnapshot['run'] }) {
	const executionPeers = operation.executionId
		? run.operations.filter((candidate) => candidate.executionId === operation.executionId)
		: [operation];
	const owner = executionPeers[0] ?? operation;
	const sharedReceipt = owner.id !== operation.id;
	const actualRoute = operation.actualRoute ?? null;
	const hasProviderReceipt = Boolean(actualRoute);
	const processSteps = operationProcessSteps(operation.id);
	const evidence = operation.liveEvidence?.length
		? operation.liveEvidence.map((entry) => ({ label: entry.kind === 'tool' ? 'Tool' : entry.kind === 'text' ? 'Output' : 'Progress', text: entry.text }))
		: (operation.evidence ?? []).map((text) => ({ label: 'Evidence', text }));
	return <details className="pk-vi-run-operation" open={operation.status === 'running'}><summary><span className={`pk-vi-operation-dot is-${operation.status}`} /> <div><strong>{operationLabel(operation.id)}</strong><span>{operation.currentPath ?? operation.provider}</span></div><div><strong>{operation.model || 'Not configured'}</strong><span>{actualRoute?.provider ?? operation.provider}</span></div><div>{sharedReceipt && hasProviderReceipt ? <><strong>Shared receipt</strong><span>Included in {operationLabel(owner.id)}</span></> : hasProviderReceipt ? <><strong>{formatCompactNumber(operation.usage.totalTokens)} tokens</strong><span>{formatMoney(operation.usage.costUsd)} actual</span></> : <><strong>No provider receipt</strong><span>Usage unavailable</span></>}</div>{operation.status === 'waiting' || operation.status === 'running' ? <Button variant="ghost" size="sm" title={executionPeers.length > 1 ? 'Skip every operation sharing this Vault Review execution' : `Stop remaining ${operationLabel(operation.id)} work`} onClick={(event) => { event.preventDefault(); void runtime.skipOperation(operation.id); }}>Stop remaining</Button> : <span className="pk-vi-operation-status">{operation.status}</span>}<ChevronDown size={15} /></summary><div className="pk-vi-operation-live" aria-live="polite"><section><strong>Process timeline</strong>{processSteps.map((step, index) => { const complete = operation.status === 'completed' || index < Math.min(processSteps.length, operation.processed); const active = operation.status === 'running' && index === Math.min(processSteps.length - 1, operation.processed); return <span key={step} className={complete ? 'is-complete' : active ? 'is-running' : 'is-waiting'}><i>{complete ? <Check size={10} /> : null}</i><em>{step}</em><small>{complete ? 'Done' : active ? 'Running' : 'Waiting'}</small></span>; })}</section><section><strong>Current input</strong><span>{operation.currentPath ?? (operation.status === 'running' ? 'Frozen Vault evidence packet' : 'No object in flight')}</span><small>{operation.attempts?.length ?? 0} attempt{operation.attempts?.length === 1 ? '' : 's'} · {operation.processed}/{operation.total || '—'} advanced</small></section><section><strong>Evidence produced</strong>{evidence.length ? evidence.slice(-4).map((entry, index) => <span key={`${entry.label}:${index}`}><b>{entry.label}</b>{entry.text}</span>) : <small>{operation.status === 'running' ? 'Waiting for the first evidence event…' : 'No runtime evidence recorded.'}</small>}</section>{operation.error && <div className="pk-vi-stale-warning"><CircleAlert size={14} />{operation.error}</div>}</div></details>;
}

function operationProcessSteps(operationId: VaultScanAiOperationId): string[] {
	if (operationId === 'relationship-discovery') return ['Build changed + affected candidate pool', 'Compare links, vectors, and summaries', 'Rank candidates and remove duplicates', 'Attach source passages to each candidate'];
	if (operationId === 'relationship-review' || operationId === 'semantic-review') return ['Load candidate endpoints and passages', 'Check direction, meaning, and contradictions', 'Compare existing relations and history', 'Retain or reject with cited evidence'];
	if (operationId === 'community-analysis') return ['Load Community members and boundaries', 'Overlay changed and affected files', 'Compare identities, drift, and history', 'Emit explainable Community candidates'];
	if (operationId === 'hub-bridge-analysis') return ['Load centrality and bridge facts', 'Compare the previous graph snapshot', 'Inspect documents causing the shift', 'Emit Hub or bridge candidates'];
	if (operationId === 'file-proposals') return ['Collect reviewed evidence', 'Map evidence to possible file changes', 'Generate exact guarded diffs', 'Store proposal without applying'];
	if (operationId === 'maintenance-synthesis') return ['Collect retained findings', 'Separate automatic and owner work', 'Create evidence-backed queue items', 'Save maintenance receipts'];
	return ['Read prepared source text', 'Run the selected model route', 'Validate the returned artifact', 'Save the layered Index receipt'];
}

function Completed({ snapshot, runtime, onBack, onProgress, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
	onProgress: () => void;
	onOpenTask: (taskId: string) => void;
}) {
	const completed = snapshot.lastCompletedRun;
	if (!completed) return <div className="pk-vi-page"><div className="pk-vi-empty">No completed Scan is available.</div></div>;
	const tasks = snapshot.tasks.filter((task) => task.sourceRunId === completed.runId && task.state !== 'verified');
	return <div className="pk-vi-page">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Run progress', action: onProgress }, { label: 'Completed' }]} />
			<section className="pk-vi-completed-workspace">
				<div className="pk-vi-completed-hero"><span className="pk-vi-page-title">Scan complete</span></div>
				<details className="pk-vi-disclosure"><summary><span><strong>Run details</strong><small>{completed.objectCount} objects · {elapsedLabel(completed.startedAt, completed.completedAt)} · {completed.providerReceiptCount ? `${formatCompactNumber(completed.usage.totalTokens)} AI tokens · ${formatMoney(completed.usage.costUsd)} actual` : 'Provider usage unavailable'}</small></span><ChevronRight size={16} /></summary><div className="pk-vi-run-detail-grid"><span><strong>{completed.providerReceiptCount ? formatCompactNumber(completed.usage.totalTokens) : 'Unavailable'}</strong><small>Actual tokens</small></span><span><strong>{completed.providerReceiptCount ? formatMoney(completed.usage.costUsd) : 'Unavailable'}</strong><small>Actual spend</small></span><span><strong>{completed.providerReceiptCount ? `${completed.providerReceiptCount} receipt${completed.providerReceiptCount === 1 ? '' : 's'}` : 'Unavailable'}</strong><small>Provider receipts</small></span><span><strong>{completed.receipts.filter((receipt) => receipt.status === 'completed').length} / {completed.receipts.length}</strong><small>Machine receipts complete</small></span></div></details>
				<details className="pk-vi-disclosure"><summary><span><strong>Completed automatically</strong><small>{completed.searchableCount === null ? 'Search readiness unavailable' : `${completed.searchableCount} searchable`} · Map receipt recorded · {completed.receipts.filter((receipt) => receipt.status === 'completed').length} receipts complete</small></span><ChevronDown size={16} /></summary><div className="pk-vi-receipts">{completed.receipts.map((receipt) => <div key={receipt.id}><span><strong>{receipt.label}</strong><small>{receipt.detail}</small></span><span><strong>{receipt.result}</strong><small>{receipt.ownerBoundary === 'peak-owned' ? 'Peak-owned state' : 'User-file boundary'}</small></span></div>)}</div></details>
				<WorkSurface tasks={tasks} origin="completed" runtime={runtime} onOpenTask={onOpenTask} />
		</section>
	</div>;
}

function MaintenanceWorkspace({ task, config, communities, proposals, runtime, onBack, onOpenProposal }: {
	task: VaultMaintenanceTask | null;
	config: VaultIntelligenceConfig;
	communities: string[];
	proposals: VaultMaintenanceProposal[];
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
	onOpenProposal: () => void;
}) {
	const [projection, setProjection] = useState<'primary' | 'file'>('primary');
	const [reviewFilter, setReviewFilter] = useState<'all' | 'pending' | 'decided'>('all');
	const [replacementTargets, setReplacementTargets] = useState<Record<string, string>>({});
	const [suggestionInstruction, setSuggestionInstruction] = useState('');
	const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
	const dialogRef = useRef<HTMLElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!task) return;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		closeButtonRef.current?.focus();
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') { event.preventDefault(); onBack(); return; }
			if (event.key !== 'Tab' || !dialogRef.current) return;
			const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
			if (focusable.length === 0) return;
			const first = focusable[0]!;
			const last = focusable[focusable.length - 1]!;
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => { window.removeEventListener('keydown', handleKeyDown); previousFocus?.focus(); };
	}, [task?.id]);
	if (!task) return <div className="pk-vi-page"><div className="pk-vi-empty">This maintenance task is no longer available.</div></div>;
	const definition = config.tasks.find((candidate) => candidate.kind === task.kind);
	if (!definition) return null;
	const presentation = maintenancePresentation(task.kind);
	const proposalChoices = new Set(definition.choices.filter((choice) => choice.boundary === 'proposal').map((choice) => choice.id));
	const effectiveChoices = task.atomicItems.map((item) => item.ownerChoice ?? task.defaultChoice).filter(Boolean);
	const hasProposal = effectiveChoices.some((choice) => proposalChoices.has(choice!.choiceId));
	const allDecided = effectiveChoices.length === task.atomicItems.length && effectiveChoices.every((choice) => choice!.choiceId !== 'later');
	const decisionsSaved = hasProposal && task.state === 'needs-proposal' && effectiveChoices.length > 0;
	const canApply = allDecided && !decisionsSaved && effectiveChoices.some((choice) => choice!.status === 'selected');
	const canVerify = allDecided && !hasProposal && effectiveChoices.every((choice) => choice!.status === 'applied');
	const decidedCount = task.atomicItems.filter((item) => Boolean(item.ownerChoice ?? task.defaultChoice)).length;
	const pendingCount = task.atomicItems.length - decidedCount;
	const proposal = proposals.find((candidate) => candidate.taskId === task.id && candidate.status === 'ready-review') ?? null;
	const appliedProposal = proposals.find((candidate) => candidate.taskId === task.id && candidate.status === 'applied') ?? null;
	const visibleItems = task.atomicItems.filter((item) => {
		const decided = Boolean(item.ownerChoice ?? task.defaultChoice);
		if (reviewFilter === 'pending') return !decided;
		if (reviewFilter === 'decided') return decided;
		return true;
	});
	const groupedTask = { ...task, atomicItems: visibleItems };
	const grouped = projection === 'file' ? groupAtomicItemsByFile(groupedTask) : groupAtomicItemsByPrimaryProjection(groupedTask);
	return <div className={`pk-vi-task-overlay is-${task.kind}`} onPointerDown={(event) => { if (event.target === event.currentTarget) onBack(); }}>
		<section ref={dialogRef} className="pk-vi-maintenance" role="dialog" aria-modal="true" aria-label={presentation.title}>
			<div className="pk-vi-maintenance-head"><div><span className="pk-vi-selection-type">{presentation.eyebrow}</span><span className="pk-vi-page-title">{presentation.title}</span></div><div><span className="pk-vi-maintenance-count">{maintenanceCountLabel(task)}</span><Button ref={closeButtonRef} variant="ghost" className="pk-vi-dialog-close" aria-label="Close maintenance task" onClick={onBack}><X size={17} /></Button></div></div>
			<div className="pk-vi-maintenance-summary"><strong>{pendingCount ? `${pendingCount} ${presentation.itemLabel}${pendingCount === 1 ? '' : 's'} still need review` : 'Every item has an outcome'}</strong><span>{task.affectedLabel} · {task.contextLabel} · {decidedCount} decided</span></div>
			<TaskWorkflowProgress task={task} />
			{task.state === 'recovery' && task.kind !== 'unreadable-files' && <div className="pk-vi-stale-warning"><CircleAlert size={16} /><span><strong>Source revision changed.</strong> The saved owner choice is preserved, but the affected item must be refreshed or reselected against current evidence before any file review can continue.</span></div>}
			{task.kind !== 'note-split' && <div className="pk-vi-maintenance-feedback" role="group"><input value={suggestionInstruction} onChange={(event) => setSuggestionInstruction(event.target.value)} placeholder={maintenanceFeedbackPlaceholder(task.kind)} aria-label={`Update ${presentation.title} suggestions`} /><Button type="button" disabled={!suggestionInstruction.trim() || refreshingSuggestions} onClick={async () => { setRefreshingSuggestions(true); try { await runtime.refreshTaskSuggestions([task.id], suggestionInstruction); } finally { setRefreshingSuggestions(false); } }}>{refreshingSuggestions ? 'Updating…' : 'Update suggestions'}</Button>{task.suggestionReceipt && <span>{task.suggestionReceipt.status === 'running' ? 'The configured model is reviewing current evidence. Existing choices remain unchanged.' : task.suggestionReceipt.status === 'completed' ? `${task.suggestionReceipt.route?.provider} · ${task.suggestionReceipt.route?.model} · ${formatCompactNumber(task.suggestionReceipt.usage.totalTokens)} actual tokens` : task.suggestionReceipt.error}</span>}</div>}
			{task.kind === 'note-split' ? <NoteSplitCollection task={task} runtime={runtime} onClose={onBack} /> : task.kind === 'file-properties' ? <PropertyReviewCollection task={task} runtime={runtime} onClose={onBack} /> : <><div className="pk-vi-maintenance-tools"><div className="pk-vi-maintenance-tool-groups">{maintenanceSupportsGrouping(task.kind) && <div className="pk-vi-segmented" aria-label="Group findings by"><span>Group by</span><Button variant="ghost" aria-pressed={projection === 'primary'} className={projection === 'primary' ? 'is-active' : ''} onClick={() => setProjection('primary')}>{presentation.primaryProjection}</Button><Button variant="ghost" aria-pressed={projection === 'file'} className={projection === 'file' ? 'is-active' : ''} onClick={() => setProjection('file')}>File</Button></div>}<div className="pk-vi-segmented" aria-label="Filter findings"><span>Show</span>{([['all', 'All'], ['pending', 'Needs review'], ['decided', 'Decided']] as const).map(([id, label]) => <Button key={id} variant="ghost" aria-pressed={reviewFilter === id} className={reviewFilter === id ? 'is-active' : ''} onClick={() => setReviewFilter(id)}>{label}</Button>)}</div></div><label className="pk-vi-set-all"><span>Set all {task.atomicItems.length}</span><select aria-label="Choose outcome for all findings" value={task.defaultChoice?.choiceId ?? ''} onChange={(event) => { if (event.target.value) void runtime.choose(task.id, null, event.target.value); }}><option value="">Choose outcome for all</option>{definition.choices.filter((choice) => choice.id !== 'another').map((choice) => <option key={choice.id} value={choice.id} disabled={choice.id === 'suggested' && task.atomicItems.some((item) => item.suggestedChoiceId !== 'suggested')}>{choice.label}</option>)}</select></label></div>
				<div className={`pk-vi-review-table is-${task.kind}`}><div className="pk-vi-review-columns">{maintenanceTableLabels(task.kind).map((label) => <span key={label}>{label}</span>)}</div>{grouped.flatMap((group) => group.items.map((item) => { const choice = item.ownerChoice ?? task.defaultChoice; return <div key={item.id} className={`pk-vi-review-row ${choice ? 'is-decided' : 'is-undecided'}`}><Button variant="ghost" className="pk-vi-review-evidence" onClick={() => item.filePath && void runtime.openFile(item.filePath)} disabled={!item.filePath}><ChevronRight size={14} /><span><strong>{item.filePath ?? item.title}</strong><small>{item.filePath ? item.title : presentation.evidenceLabel}</small></span></Button><span className="pk-vi-review-scope"><strong>{group.label}</strong><small>{item.evidence}</small>{item.sourceType?.startsWith('vault-review') && <em><BrainCircuit size={11} />Vault Review · {item.provenance?.length ?? 0} sources</em>}{item.verification && <em className={`is-${item.verification.status}`}>{item.verification.detail}</em>}</span><div className="pk-vi-review-choice"><select aria-label={`Choose outcome for ${item.title}`} value={choice?.choiceId ?? ''} onChange={(event) => { const choiceId = event.target.value; if (choiceId) void runtime.choose(task.id, item.id, choiceId, choiceId === 'redirect' ? replacementTargets[item.id] ?? item.suggestedValue ?? null : null); }}><option value="">Choose how to handle this</option>{definition.choices.filter((candidate) => candidate.id !== 'another').map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.id === 'suggested' && item.suggestedChoiceId !== 'suggested'}>{candidate.label}{item.suggestedChoiceId === candidate.id ? ' · Suggested' : ''}</option>)}</select>{task.kind === 'broken-links' && <input value={replacementTargets[item.id] ?? item.suggestedValue ?? ''} placeholder="Exact redirect target" onChange={(event) => setReplacementTargets((current) => ({ ...current, [item.id]: event.target.value }))} />}{task.kind === 'community-membership' && <CommunityPicker label={`Choose Community for ${item.title}`} value={choice?.choiceId === 'another' ? choice.choiceValue ?? '' : ''} communities={communities} onChange={(community) => void runtime.choose(task.id, item.id, 'another', community)} />}</div></div>; }))}{visibleItems.length === 0 && <div className="pk-vi-work-empty"><strong>{task.atomicItems.length === 0 ? 'No findings remain' : 'No findings match this view'}</strong><span>{task.atomicItems.length === 0 ? 'The workspace geometry is retained; a later Scan can publish new evidence here.' : 'Choose another filter to review the remaining evidence.'}</span></div>}</div>
				<div className="pk-vi-maintenance-footer"><div><strong>{task.atomicItems.filter((item) => (item.ownerChoice ?? task.defaultChoice)?.choiceId !== undefined).length} of {task.atomicItems.length} decided</strong><span>{appliedProposal ? 'Source changes applied · verification still required' : '· No user files changed yet'}</span></div><div><Button variant="ghost" onClick={onBack}>Close</Button>{!proposal && !appliedProposal && <Button className="pk-vi-primary" disabled={!canApply} onClick={() => void runtime.applyTask(task.id)}>{hasProposal ? decisionsSaved ? 'Review decisions saved' : taskDecisionActionLabel(task) : taskDecisionActionLabel(task)}</Button>}{hasProposal && decisionsSaved && !proposal && !appliedProposal && <Button className="pk-vi-primary" onClick={async () => { await runtime.prepareProposal(task.id); onOpenProposal(); }}>Prepare guarded diff</Button>}{proposal && <Button className="pk-vi-primary" onClick={onOpenProposal}>Review guarded diff</Button>}{appliedProposal && <Button className="pk-vi-primary" onClick={() => void runtime.verifyTask(task.id)}>Re-index & verify</Button>}{!hasProposal && <Button className="pk-vi-primary" disabled={!canVerify} onClick={() => void runtime.verifyTask(task.id)}>Verify</Button>}</div></div></>}
		</section>
	</div>;
}

function TaskWorkflowProgress({ task }: { task: VaultMaintenanceTask }) {
	const workflow = task.workflow;
	if (!workflow || workflow.phase === 'decision') return null;
	const percent = workflow.total > 0 ? Math.min(100, Math.round(workflow.processed / workflow.total * 100)) : 0;
	return <section className={`pk-vi-task-workflow is-${workflow.phase}`} aria-live="polite"><div><span><strong>{workflow.phase.replace(/(^|-)\w/g, (value) => value.replace('-', ' ').toUpperCase())}</strong><small>{workflow.currentPath ?? workflow.detail}</small></span><em>{workflow.total > 0 ? `${workflow.processed} / ${workflow.total}` : 'Waiting for evidence'}</em></div><div className="pk-vi-progress-track"><i style={{ width: `${workflow.phase === 'verified' || workflow.phase === 'applied' ? 100 : percent}%` }} /></div><small>{workflow.detail}</small></section>;
}

function PropertyReviewCollection({ task, runtime, onClose }: { task: VaultMaintenanceTask; runtime: VaultIntelligenceWorkspaceRuntime; onClose: () => void }) {
	const accepted = task.atomicItems.filter((item) => (item.ownerChoice ?? task.defaultChoice)?.choiceId === 'accept').length;
	const rejected = task.atomicItems.filter((item) => (item.ownerChoice ?? task.defaultChoice)?.choiceId === 'reject').length;
	const pending = task.atomicItems.length - accepted - rejected;
	return <div className="pk-vi-property-review"><div className="pk-vi-property-checkpoint"><strong>Previous Scan checkpoint</strong><span>Saved choices and source revisions still match</span><em>{accepted} accepted</em></div><div className="pk-vi-property-toolbar"><div><span>Group by</span><strong>Batch</strong><span>File</span><span>Show</span><strong>All</strong><span>Pending {pending}</span></div><div><Button onClick={() => void runtime.choose(task.id, null, 'accept')}>Accept all</Button><Button onClick={() => void runtime.choose(task.id, null, 'reject')}>Reject all</Button></div></div><div className="pk-vi-property-list">{task.atomicItems.map((item) => { const choice = item.ownerChoice ?? task.defaultChoice; return <article key={item.id} className={choice?.choiceId === 'accept' ? 'is-accepted' : choice?.choiceId === 'reject' ? 'is-rejected' : ''}><header><ChevronDown size={14} /><strong>{item.filePath ?? item.title}</strong><span>{item.projectionLabel || 'Property change'}</span><Button className={choice?.choiceId === 'accept' ? 'is-active' : ''} onClick={() => void runtime.choose(task.id, item.id, 'accept')}>Accept</Button><Button className={choice?.choiceId === 'reject' ? 'is-active' : ''} onClick={() => void runtime.choose(task.id, item.id, 'reject')}>Reject</Button></header><div><strong>{item.title}</strong><code>Current value unavailable</code><ArrowRight size={14} /><code>{item.suggestedValue ?? item.evidence}</code></div></article>; })}</div><footer><span><strong>{accepted} accepted</strong> · {rejected} rejected · No user files changed yet</span><div><Button onClick={onClose}>Close</Button><Button className="pk-vi-primary" disabled={accepted === 0} onClick={() => void runtime.applyTask(task.id)}>Review {accepted || ''} accepted changes</Button></div></footer></div>;
}

function NoteSplitCollection({ task, runtime, onClose }: { task: VaultMaintenanceTask; runtime: VaultIntelligenceWorkspaceRuntime; onClose: () => void }) {
	return <div className="pk-vi-note-split-collection"><div className="pk-vi-note-split-summary"><strong>{task.atomicItems.length} source {task.atomicItems.length === 1 ? 'note has' : 'notes have'} proposed splits</strong><span>{task.contextLabel}</span></div><div className="pk-vi-note-split-table"><div><span>Source note</span><span>Proposed split</span><span>References to update</span><span /></div>{task.atomicItems.map((item) => <Button key={item.id} variant="ghost" onClick={() => item.filePath && void runtime.openFile(item.filePath)}><span><strong>{item.filePath ?? item.title}</strong><small>{item.evidence}</small></span><span><strong>{item.projectionLabel || item.title}</strong><small>{item.suggestedValue ?? 'Review every Markdown block before creating a Change Set.'}</small></span><span><strong>{item.provenance?.length ?? 0} references</strong></span><ChevronRight size={15} /></Button>)}</div><footer><span>Open one proposal to review every Markdown line before creating a Change Set.</span><Button onClick={onClose}>Close</Button></footer></div>;
}

function taskDecisionActionLabel(task: VaultMaintenanceTask): string {
	if (task.kind === 'file-properties') return 'Record property review';
	if (task.kind === 'broken-links') return 'Save link decisions';
	if (task.kind === 'community-membership') return 'Save Community placement';
	if (task.kind === 'knowledge-connections') return 'Record connection decisions';
	if (task.kind === 'related-notes') return 'Record note relationship';
	if (task.kind === 'note-split') return 'Save split review';
	if (task.kind === 'community-structure') return 'Save structure review';
	if (task.kind === 'community-hubs') return 'Save hub review';
	if (task.kind === 'content-lifecycle') return 'Save lifecycle state';
	if (task.kind === 'unreadable-files') return 'Record recovery choice';
	return 'Save unusual-note review';
}

function maintenanceCountLabel(task: VaultMaintenanceTask): string {
	const contextCount = task.contextLabel.split('·')[0]?.trim();
	if (contextCount && /^\d/.test(contextCount)) return contextCount;
	return `${task.atomicItems.length} item${task.atomicItems.length === 1 ? '' : 's'}`;
}

function maintenanceSupportsGrouping(kind: VaultMaintenanceTask['kind']): boolean {
	return kind === 'file-properties'
		|| kind === 'broken-links'
		|| kind === 'community-membership'
		|| kind === 'knowledge-connections';
}

function ProposalWorkspace({ task, proposal, runtime, onBack }: {
	task: VaultMaintenanceTask | null;
	proposal: VaultMaintenanceProposal | null;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
}) {
	if (!task || !proposal) return <div className="pk-vi-page"><Breadcrumb items={[{ label: 'Maintenance review', action: onBack }, { label: 'Proposal' }]} /><div className="pk-vi-empty">The prepared proposal is no longer available. Return to the maintenance review to refresh it.</div></div>;
	const proposalLabel = proposal.status === 'ready-review' ? 'Ready review' : proposal.status === 'applying' ? 'Applying' : proposal.status === 'applied' ? 'Applied · verify next' : proposal.status === 'verified' ? 'Verified' : 'Source conflict';
	return <div className="pk-vi-page pk-vi-proposal-page">
		<Breadcrumb items={[{ label: 'Maintenance review', action: onBack }, { label: 'Review proposal' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-selection-type">Guarded source-file proposal</span><span className="pk-vi-page-title">Review exact changes before Apply</span><span className="pk-vi-page-description">{task.title}. Select the concrete changes you want; Peak re-checks every source SHA-256 immediately before writing.</span></div><span className={`pk-vi-task-state is-${proposal.status}`}>{proposalLabel}</span></div>
		<TaskWorkflowProgress task={task} />
		<div className="pk-vi-proposal-layout"><ProposalReview proposal={proposal} runtime={runtime} /><aside className="pk-vi-proposal-safety"><section><ShieldCheck size={18} /><div><strong>Revision guarded</strong><span>Each diff is bound to the exact source hash captured when the proposal was prepared.</span></div></section><section><FileText size={18} /><div><strong>Selected changes only</strong><span>Unchecked changes remain untouched. A stale or ambiguous match fails closed.</span></div></section><section><RefreshCw size={18} /><div><strong>Verify is separate</strong><span>After Apply, re-index and verify the original finding before the work can close.</span></div></section></aside></div>
	</div>;
}

function ProposalReview({ proposal, runtime }: { proposal: VaultMaintenanceProposal; runtime: VaultIntelligenceWorkspaceRuntime }) {
	const selectedCount = proposal.changes.filter((change) => change.selected !== false).length;
	const canEdit = proposal.status === 'ready-review';
	return <section className="pk-vi-proposal-review" aria-label="Prepared source file diff">
		<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Prepared source-file diff</span><span className="pk-vi-card-caption">Source content is guarded by its exact SHA-256 revision. Peak will re-check it immediately before Apply.</span></div><span className={`pk-vi-task-state is-${proposal.status}`}>{proposal.status.replace('-', ' ')}</span></div>
		<div className="pk-vi-proposal-change-list">{proposal.changes.map((change) => <article key={change.id} className={`pk-vi-proposal-change ${change.selected === false ? 'is-unselected' : ''}`}><label className="pk-vi-proposal-selector"><input type="checkbox" checked={change.selected !== false} disabled={!canEdit} onChange={(event) => void runtime.setProposalChangeSelected(proposal.id, change.id, event.target.checked)} /><span>Select this change</span></label><div><strong>{change.path}</strong><small>{change.matchCount} matched occurrence{change.matchCount === 1 ? '' : 's'} · source revision {change.sourceMtime ?? 'unavailable'}</small></div><div className="pk-vi-diff"><pre><del>{change.beforeContext}</del></pre><pre><ins>{change.afterContext}</ins></pre></div></article>)}</div>
		{proposal.warnings.length > 0 && <div className="pk-vi-stale-warning"><CircleAlert size={16} /><span>{proposal.warnings.join(' ')}</span></div>}
		<div className="pk-vi-proposal-actions"><span>{selectedCount} of {proposal.changes.length} changes selected · {proposal.status.replace('-', ' ')}</span>{canEdit ? <><Button variant="ghost" onClick={() => void runtime.rejectProposal(proposal.id)}>Reject diff</Button><Button className="pk-vi-primary" disabled={selectedCount === 0} onClick={() => void runtime.applyProposal(proposal.id)}>Apply selected changes</Button></> : null}</div>
	</section>;
}

function CommunityPicker({ label, value, communities, onChange }: {
	label: string;
	value: string;
	communities: string[];
	onChange: (community: string) => void;
}) {
	return <label className={`pk-vi-community-picker ${value ? 'is-active' : ''}`}><span>{value || 'Choose another Community'}</span><select aria-label={label} value={value} disabled={communities.length === 0} onChange={(event) => { if (event.target.value) onChange(event.target.value); }}><option value="">{communities.length === 0 ? 'No indexed Communities' : 'Choose Community'}</option>{communities.map((community) => <option key={community} value={community}>{community}</option>)}</select></label>;
}

interface MaintenancePresentation {
	eyebrow: string;
	title: string;
	description: string;
	primaryProjection: string;
	evidenceLabel: string;
	itemLabel: string;
	boundaryTitle: string;
	boundaryDescription: string;
}

function maintenanceFeedbackPlaceholder(kind: VaultMaintenanceTask['kind']): string {
	if (kind === 'file-properties') return 'Tell Peak what is wrong — for example, status should follow the current lifecycle';
	if (kind === 'broken-links') return 'Tell Peak what you think about these repairs';
	if (kind === 'community-membership') return 'Tell Peak which Community evidence or boundaries need another look';
	if (kind === 'knowledge-connections') return 'Tell Peak which sources or connection evidence need another look';
	if (kind === 'related-notes') return 'Tell Peak which notes are truly duplicates or how their roles differ';
	if (kind === 'community-structure') return 'Tell Peak which Communities should stay together or how their boundaries differ';
	if (kind === 'community-hubs') return 'Tell Peak which index note or Hub evidence should be reconsidered';
	if (kind === 'content-lifecycle') return 'Tell Peak which work is active, paused, finished, or still uncertain';
	if (kind === 'unreadable-files') return 'Tell Peak which documents to retry, process another way, or leave out of the Index';
	return 'Tell Peak which evidence or suggested outcome needs another look';
}

function maintenanceTableLabels(kind: VaultMaintenanceTask['kind']): [string, string, string] {
	if (kind === 'broken-links') return ['Broken target', 'Affected', 'Resolution'];
	if (kind === 'community-membership') return ['Note to place', 'Community evidence', 'Your choice'];
	if (kind === 'knowledge-connections') return ['Connection to review', 'Changed evidence', 'Your choice'];
	if (kind === 'related-notes') return ['Notes to review', 'Scope', 'Your choice'];
	if (kind === 'note-split') return ['Source note', 'Proposed split', 'Your choice'];
	if (kind === 'community-structure') return ['Community change', 'Scope', 'Your choice'];
	if (kind === 'community-hubs') return ['Community index', 'Coverage evidence', 'Your choice'];
	if (kind === 'content-lifecycle') return ['Work to check', 'Why Peak asked', 'Current status'];
	if (kind === 'unreadable-files') return ['Document not fully indexed', 'What happened', 'Your choice'];
	if (kind === 'unusual-notes') return ['Unusual note', 'Why Peak asked', 'Your choice'];
	return ['Property finding', 'Suggested change', 'Your choice'];
}

function maintenancePresentation(kind: VaultMaintenanceTask['kind']): MaintenancePresentation {
	if (kind === 'file-properties') return { eyebrow: 'Property maintenance', title: 'File property maintenance', description: 'Review each metadata finding by property batch or by source file before requesting a concrete proposal.', primaryProjection: 'Batch', evidenceLabel: 'Property finding', itemLabel: 'finding', boundaryTitle: 'Review does not write YAML.', boundaryDescription: 'Selected outcomes remain guarded decisions until a real proposed value and per-file diff are available in the owning editor.' };
	if (kind === 'broken-links') return { eyebrow: 'Broken-link maintenance', title: 'Repair broken links', description: 'Work by missing target or by source file, with a specific outcome for every reference.', primaryProjection: 'Target', evidenceLabel: 'Broken reference evidence', itemLabel: 'reference', boundaryTitle: 'Every repair is explicit.', boundaryDescription: 'Redirect, create and remove outcomes require a source-file diff; keep-unresolved is Peak-owned.' };
	if (kind === 'community-membership') return { eyebrow: 'Community membership', title: 'Decide which Communities these notes belong to', description: 'Review current structure and suggested membership without rewriting note metadata.', primaryProjection: 'Community', evidenceLabel: 'Membership evidence', itemLabel: 'note', boundaryTitle: 'Community membership is Peak-owned by default.', boundaryDescription: 'Only the explicit source-file option crosses into Markdown or YAML review.' };
	if (kind === 'knowledge-connections') return { eyebrow: 'Knowledge connections', title: 'Review connections affected by recent changes', description: 'Keep, update or replace each evidence-backed bridge.', primaryProjection: 'Connection', evidenceLabel: 'Connection evidence', itemLabel: 'connection', boundaryTitle: 'Graph decisions and document edits are separate.', boundaryDescription: 'Peak can record an expected bridge; document changes still require review.' };
	if (kind === 'related-notes') return { eyebrow: 'Related notes', title: 'Review related and duplicate notes', description: 'Review possible merge groups and typed relationships by group or by file.', primaryProjection: 'Related group', evidenceLabel: 'Similarity evidence', itemLabel: 'note group', boundaryTitle: 'Similarity is evidence, not permission.', boundaryDescription: 'Merge choices remain proposals; related and separate choices are reversible Peak knowledge.' };
	if (kind === 'note-split') return { eyebrow: 'Note structure', title: 'Review note splits', description: 'Keep the original source visible while deciding whether a concrete Composer proposal should be requested.', primaryProjection: 'Source note', evidenceLabel: 'Split evidence', itemLabel: 'finding', boundaryTitle: 'The source note stays unchanged.', boundaryDescription: 'Requesting or guiding a split only records the review decision on this surface; no line-routing diff exists yet.' };
	if (kind === 'community-structure') return { eyebrow: 'Community Structure', title: 'Review Community structure', description: 'Accept, adjust or retain the current grouping using the same canonical decisions.', primaryProjection: 'Community', evidenceLabel: 'Structure evidence', itemLabel: 'finding', boundaryTitle: 'Structure changes stay inside Peak.', boundaryDescription: 'This does not add folders, links or frontmatter to user files.' };
	if (kind === 'community-hubs') return { eyebrow: 'Community index notes', title: 'Maintain Community index notes', description: 'Inspect hub coverage before deciding whether an index-note update is warranted.', primaryProjection: 'Community', evidenceLabel: 'Hub evidence', itemLabel: 'index note', boundaryTitle: 'Index-note updates are proposals.', boundaryDescription: 'Keeping the current hub records intent without modifying a document.' };
	if (kind === 'content-lifecycle') return { eyebrow: 'Content lifecycle', title: 'Review what is still current', description: 'Separate active work, paused material and finished material without moving files.', primaryProjection: 'Lifecycle state', evidenceLabel: 'Lifecycle evidence', itemLabel: 'note', boundaryTitle: 'Lifecycle is Peak-owned context.', boundaryDescription: 'Finished does not archive, move or delete the source file.' };
	if (kind === 'unreadable-files') return { eyebrow: 'Scan coverage', title: "Review documents Scan couldn't process", description: 'Retry the parser and Index pipeline, or leave the document in recovery for later.', primaryProjection: 'Index error', evidenceLabel: 'Parser or Index error', itemLabel: 'document', boundaryTitle: 'Recovery does not rewrite the document.', boundaryDescription: 'Retry uses the existing Index path. A durable Index exclusion writer is not exposed here, so this surface does not pretend to exclude files.' };
	return { eyebrow: 'Unusual notes', title: 'Review isolated or unusual notes', description: 'Decide whether each unusual pattern should be connected, retained or prepared for source review.', primaryProjection: 'Finding type', evidenceLabel: 'Unusual-pattern evidence', itemLabel: 'finding', boundaryTitle: 'Unusual does not mean wrong.', boundaryDescription: 'Peak records intent unless you explicitly choose a source-file proposal.' };
}

function Breadcrumb({ items }: { items: Array<{ label: string; action?: () => void }> }) {
	return <div className="pk-vi-breadcrumb">{items.map((item, index) => <React.Fragment key={`${item.label}:${index}`}>{index > 0 && <span>/</span>}{item.action ? <Button variant="ghost" onClick={item.action}>{index === 0 && <ArrowLeft size={14} />}{item.label}</Button> : <strong>{item.label}</strong>}</React.Fragment>)}</div>;
}

function TaskState({ task }: { task: VaultMaintenanceTask }) {
	const label = task.state === 'needs-choice' ? 'Needs choice' : task.state === 'needs-proposal' ? 'Proposal needed' : task.state === 'ready-review' ? 'Ready review' : task.state === 'ready-apply' ? 'Ready to verify' : task.state === 'applying' ? 'Applying' : task.state === 'applied' ? 'Applied · verify' : task.state === 'reindexing' ? 'Re-indexing' : task.state === 'verifying' ? 'Verifying' : task.state === 'recovery' ? 'Recovery' : 'Verified';
	return <span className={`pk-vi-task-state is-${task.state}`}>{label}</span>;
}

function TaskStatus({ task }: { task: VaultMaintenanceTask }) {
	return <span className="pk-vi-task-status"><TaskState task={task} /><small className={`pk-vi-impact-dot is-${task.impact}`}>{task.impact} impact</small></span>;
}

function StageState({ status }: { status: VaultIntelligenceSnapshot['run']['stages'][number]['status'] }) {
	return <span className={`pk-vi-stage-state is-${status}`}>{status}</span>;
}

function MiniActivity({ days, onSelect }: { days: VaultActivityDay[]; onSelect?: (date: string) => void }) {
	const calendar = calendarDays(days, 365);
	const max = Math.max(0, ...calendar.map((day) => day.count));
	return <div className="pk-vi-mini-activity">{calendar.map((day) => onSelect ? <Button key={day.date} variant="ghost" size="icon" style={{ '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} title={`${day.date} · ${day.count}`} aria-label={`Open activity for ${day.date}`} onClick={() => onSelect(day.date)} /> : <span key={day.date} style={{ '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} title={`${day.date} · ${day.count}`} />)}</div>;
}

interface ActivityBucket {
	key: string;
	label: string;
	fileCount: number;
	vaultCount: number;
	chatCount: number;
	projectCount: number;
	composerCount: number;
}

function ActivityLane({ label, detail, buckets, value, max, tone, muted, selection }: {
	label: string;
	detail: string;
	buckets: ActivityBucket[];
	value: (bucket: ActivityBucket) => number;
	max: number;
	tone: 'files' | 'chat' | 'project' | 'composer' | 'receipts';
	muted: boolean;
	selection: { start: number; end: number };
}) {
	return <div className={`pk-vi-activity-lane-row is-${tone} ${muted ? 'is-muted' : ''}`}><span className="pk-vi-activity-lane-label"><strong>{label}</strong><small>{detail}</small></span><div className="pk-vi-activity-lane-track">{buckets.map((bucket, index) => {
		const count = value(bucket);
		return <span key={bucket.key} className={index < selection.start || index > selection.end ? 'is-outside-range' : ''} title={`${bucket.label} · ${count}`}><i style={{ height: `${count === 0 ? 2 : Math.max(7, count / max * 100)}%` }} /></span>;
	})}</div></div>;
}

function bucketRecordedActivity(
	days: VaultActivityDay[],
	records: VaultIntelligenceSnapshot['recentActivity'],
	maxBuckets: number,
): ActivityBucket[] {
	if (days.length === 0) return [];
	const size = Math.max(1, Math.ceil(days.length / maxBuckets));
	const countsByKind = new Map<string, Partial<Record<'vaultCount' | 'chatCount' | 'projectCount' | 'composerCount', number>>>();
	for (const record of records) {
		const date = toLocalDateKey(new Date(record.timestamp));
		const counts = countsByKind.get(date) ?? {};
		if (record.kind === 'chat') counts.chatCount = (counts.chatCount ?? 0) + 1;
		else if (record.kind === 'project') counts.projectCount = (counts.projectCount ?? 0) + 1;
		else if (record.kind === 'composer') counts.composerCount = (counts.composerCount ?? 0) + 1;
		else counts.vaultCount = (counts.vaultCount ?? 0) + 1;
		countsByKind.set(date, counts);
	}
	const result: ActivityBucket[] = [];
	for (let index = 0; index < days.length; index += size) {
		const slice = days.slice(index, index + size);
		const first = slice[0];
		const last = slice[slice.length - 1];
		if (!first || !last) continue;
		result.push({
			key: `${first.date}:${last.date}`,
			label: first.date === last.date ? first.date : `${first.date} – ${last.date}`,
			fileCount: slice.reduce((sum, day) => sum + day.files.length, 0),
			vaultCount: slice.reduce((sum, day) => sum + (countsByKind.get(day.date)?.vaultCount ?? 0), 0),
			chatCount: slice.reduce((sum, day) => sum + (countsByKind.get(day.date)?.chatCount ?? 0), 0),
			projectCount: slice.reduce((sum, day) => sum + (countsByKind.get(day.date)?.projectCount ?? 0), 0),
			composerCount: slice.reduce((sum, day) => sum + (countsByKind.get(day.date)?.composerCount ?? 0), 0),
		});
	}
	return result;
}

function buildRecordedSessions(records: VaultIntelligenceSnapshot['recentActivity']): Array<{ key: string; label: string; summary: string; count: number }> {
	const sessions = new Map<string, VaultIntelligenceSnapshot['recentActivity']>();
	for (const record of [...records].sort((left, right) => right.timestamp - left.timestamp)) {
		const key = toLocalDateKey(new Date(record.timestamp));
		sessions.set(key, [...(sessions.get(key) ?? []), record]);
	}
	return [...sessions.entries()].map(([key, sessionRecords]) => ({
		key,
		label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${key}T12:00:00`)),
		summary: uniqueStrings(sessionRecords.map((record) => record.label)).slice(0, 2).join(' · '),
		count: sessionRecords.length,
	}));
}

function mergeRecordedActivity(
	days: VaultActivityDay[],
	records: VaultIntelligenceSnapshot['recentActivity'],
): VaultActivityDay[] {
	const merged = new Map(days.map((day) => [day.date, { ...day, files: [...day.files] }]));
	for (const record of records) {
		const date = toLocalDateKey(new Date(record.timestamp));
		const current = merged.get(date) ?? { date, count: 0, files: [] };
		merged.set(date, { ...current, count: current.count + 1 });
	}
	return [...merged.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function allRecordedActivity(snapshot: VaultIntelligenceSnapshot): VaultIntelligenceSnapshot['recentActivity'] {
	return [...(snapshot.sourceActivity ?? []), ...snapshot.recentActivity];
}

function calendarDays(days: VaultActivityDay[], range: ActivityRange): VaultActivityDay[] {
	const byDate = new Map(days.map((day) => [day.date, day]));
	const end = new Date();
	end.setHours(0, 0, 0, 0);
	const start = new Date(end);
	start.setDate(start.getDate() - range + 1);
	const result: VaultActivityDay[] = [];
	for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
		const date = toLocalDateKey(cursor);
		result.push(byDate.get(date) ?? { date, count: 0, files: [] });
	}
	return result;
}

function calendarDaysBetween(days: VaultActivityDay[], startDate: string, endDate: string): VaultActivityDay[] {
	const byDate = new Map(days.map((day) => [day.date, day]));
	const start = new Date(`${startDate}T12:00:00`);
	const end = new Date(`${endDate}T12:00:00`);
	if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];
	const result: VaultActivityDay[] = [];
	for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
		const date = toLocalDateKey(cursor);
		result.push(byDate.get(date) ?? { date, count: 0, files: [] });
	}
	return result;
}

function dateOffsetKey(offset: number): string {
	const date = new Date();
	date.setHours(12, 0, 0, 0);
	date.setDate(date.getDate() - offset);
	return toLocalDateKey(date);
}

function activityLevel(count: number, max: number): number {
	if (!count || !max) return 0;
	return Math.min(4, Math.max(1, Math.ceil(count / max * 4)));
}

function rankTasks(tasks: VaultMaintenanceTask[]): VaultMaintenanceTask[] {
	const impact = { high: 0, medium: 1, low: 2 } as const;
	const category = { decision: 0, recovery: 1, review: 2 } as const;
	return [...tasks].sort((left, right) => impact[left.impact] - impact[right.impact] || category[left.category] - category[right.category] || left.title.localeCompare(right.title));
}

function taskMatchesWorkFilter(task: VaultMaintenanceTask, filter: Exclude<WorkFilter, 'all'>): boolean {
	if (filter === 'choice') return task.state === 'needs-choice' || task.state === 'needs-proposal';
	if (filter === 'review') return ['ready-review', 'ready-apply', 'applying', 'applied', 'reindexing', 'verifying'].includes(task.state);
	return task.state === 'recovery';
}

function taskExitCondition(task: VaultMaintenanceTask): string {
	if (task.state === 'recovery') return 'Index retry succeeds; otherwise recovery remains open';
	if (task.state === 'needs-proposal') return 'A real per-file diff is generated or the request is rejected';
	if (task.state === 'ready-review') return 'Every proposal is accepted, rejected or deferred';
	if (task.state === 'ready-apply') return 'Recheck confirms the finding is closed';
	if (task.state === 'applying') return 'Every selected write receives a source-revision receipt or fails closed';
	if (task.state === 'applied' || task.state === 'reindexing' || task.state === 'verifying') return 'Re-index and a fresh verifier confirm the original finding is closed';
	return 'Every atomic item has an owner choice';
}

function resolvedOperationPlans(
	config: VaultIntelligenceConfig,
	snapshot: VaultIntelligenceSnapshot,
): VaultScanAiOperationPlan[] {
	return createVaultScanPlan(config, { mode: 'changed', selectedPaths: [] }).aiOperations.map((operation) => {
		const route = snapshot.operationRoutes[operation.id];
		if (!route) return operation;
		return {
			...operation,
			model: route.model,
			provider: route.provider,
		};
	});
}

function defaultIndexOutputEnabled(output: VaultIntelligenceConfig['indexOutputs'][number]): boolean {
	if (output.availability === 'required' || output.availability === 'automatic') return true;
	if (output.availability !== 'optional') return false;
	return output.defaultEnabled ?? true;
}

function toggleOperationExecutionGroup(
	operations: VaultScanAiOperationPlan[],
	id: VaultScanAiOperationPlan['id'],
): VaultScanAiOperationPlan[] {
	const enabled = !operations.find((operation) => operation.id === id)?.enabled;
	return operations.map((operation) => operation.id === id ? { ...operation, enabled } : operation);
}

function sharedExecutionLabel(id: VaultScanAiOperationPlan['id']): string | null {
	if (id === 'file-summaries' || id === 'ai-tags') return 'shared Index enrichment run';
	if (isSharedReviewOperation(id)) {
		return 'shared Vault Review run';
	}
	return null;
}

function operationGroupLabel(group: 'plan' | 'index' | 'relations' | 'structure' | 'follow-up'): string {
	if (group === 'plan') return 'Run planning';
	if (group === 'index') return 'Knowledge Index enrichment';
	if (group === 'relations') return 'Relationship discovery';
	if (group === 'structure') return 'Community and hub interpretation';
	return 'Follow-up preparation';
}

function operationGroupDescription(group: 'plan' | 'index' | 'relations' | 'structure' | 'follow-up'): string {
	if (group === 'plan') return 'Freezes the selected scope, estimated use, routes, and user-file boundary before work begins.';
	if (group === 'index') return 'Rebuildable machine knowledge used by Search and maintenance evidence.';
	if (group === 'relations') return 'The shared relationship review needs an Entire Vault baseline and produces evidence, never source-file edits.';
	if (group === 'structure') return 'Requires an Entire Vault scope so Community and hub claims share one baseline.';
	return 'Creates review evidence and owner actions; Scan never applies source-file changes.';
}

function scanOperationGroupLabel(group: 'plan' | 'index' | 'relations' | 'structure' | 'follow-up'): string {
	if (group === 'plan') return 'Plan this scan';
	if (group === 'index') return 'Enrich Knowledge Index';
	if (group === 'relations') return 'Find meaning and relationships';
	if (group === 'structure') return 'Review Communities, Hubs, and bridges';
	return 'Prepare reviewable follow-up';
}

function scanOperationGroupDescription(group: 'plan' | 'index' | 'relations' | 'structure' | 'follow-up'): string {
	if (group === 'plan') return 'Keep enabled AI work inside the selected scope and selected tasks.';
	if (group === 'index') return 'Route the AI-backed Index outputs selected in Step 2.';
	if (group === 'relations') return 'Compare changed files with affected context instead of a disconnected subset.';
	if (group === 'structure') return 'Use the complete current graph, then overlay the changed and affected area.';
	return 'Create safe proposals and explain what completed automatically versus what still needs you.';
}

function scanOperationGroupSummary(group: 'plan' | 'index' | 'relations' | 'structure' | 'follow-up'): string {
	if (group === 'plan') return 'Optional AI planning';
	if (group === 'index') return 'Embeddings · summaries · AI Tags';
	if (group === 'relations') return 'Discovery · semantic review';
	if (group === 'structure') return 'Community · Hub and bridge';
	return 'File proposals · synthesis';
}

function operationAvailableForScope(
	id: VaultScanAiOperationPlan['id'],
	scope: VaultScanScopeMode,
): boolean {
	// Scope changes affect each operation's estimate, never whether the owner can
	// configure or enable it. The mock keeps every operation available per run.
	void id;
	void scope;
	return true;
}

function isSharedReviewOperation(id: VaultScanAiOperationPlan['id']): boolean {
	return id === 'relationship-discovery'
		|| id === 'semantic-review'
		|| id === 'community-analysis'
		|| id === 'hub-bridge-analysis'
		|| id === 'file-proposals'
		|| id === 'maintenance-synthesis';
}

function scopeLabel(scope: VaultScanScopeMode): string {
	if (scope === 'entire') return 'Entire Vault';
	if (scope === 'selected') return 'Selected scope';
	return 'Changed objects';
}

function groupAtomicItemsByFile(task: VaultMaintenanceTask) {
	const groups = new Map<string, VaultMaintenanceTask['atomicItems']>();
	for (const item of task.atomicItems) {
		const key = item.filePath ?? 'No file';
		groups.set(key, [...(groups.get(key) ?? []), item]);
	}
	return [...groups.entries()].map(([label, items]) => ({ key: label, label, items }));
}

function groupAtomicItemsByPrimaryProjection(task: VaultMaintenanceTask) {
	const groups = new Map<string, { label: string; items: VaultMaintenanceTask['atomicItems'] }>();
	for (const item of task.atomicItems) {
		const key = item.projectionKey || item.id;
		const current = groups.get(key) ?? { label: item.projectionLabel || item.title, items: [] };
		groups.set(key, { ...current, items: [...current.items, item] });
	}
	return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

function stageLabel(id: VaultIntelligenceSnapshot['run']['stages'][number]['id']): string {
	if (id === 'discover') return 'Discover';
	if (id === 'index') return 'Build Index';
	if (id === 'ai') return 'Vault discovery';
	if (id === 'prepare-review') return 'Prepare review';
	return 'Publish';
}

function runStageHeadline(
	stageId: VaultIntelligenceSnapshot['run']['stages'][number]['id'] | null,
	status: VaultIntelligenceSnapshot['run']['status'],
): string {
	if (status === 'completed') return 'Scan complete';
	if (status === 'failed') return 'Scan needs attention';
	if (stageId === 'discover') return 'Discovering changed inputs and affected context';
	if (stageId === 'index') return 'Building and enriching the Knowledge Index';
	if (stageId === 'ai') return 'Analyzing meaning, relationships, and structure';
	if (stageId === 'prepare-review') return 'Preparing validated owner work for review';
	if (stageId === 'publish') return 'Publishing verified knowledge and follow-up';
	return 'Preparing the Vault Scan';
}

function stageStateLabel(stage: VaultIntelligenceSnapshot['run']['stages'][number], runStatus: VaultIntelligenceSnapshot['run']['status']): string {
	if (stage.status === 'completed') return 'Complete';
	if (stage.status === 'running') return runStatus === 'paused' || runStatus === 'interrupted' ? 'Paused' : stage.id === 'ai' ? 'Operations running' : 'Live';
	if (stage.status === 'partial') return 'Partial';
	if (stage.status === 'failed') return 'Needs attention';
	if (stage.status === 'skipped') return 'Skipped';
	return 'Waiting';
}

function operationLabel(id: VaultIntelligenceSnapshot['run']['operations'][number]['id']): string {
	return DEFAULT_VAULT_INTELLIGENCE_CONFIG.scanOperations.find((operation) => operation.id === id)?.label ?? id;
}

function displayRunUsage(operations: VaultIntelligenceSnapshot['run']['operations']) {
	const executions = new Set<string>();
	const receiptKeys = new Set<string>();
	const usage = operations.reduce((usage, operation) => {
		const key = operation.executionId ?? `operation:${operation.id}`;
		for (const attempt of operation.attempts ?? []) {
			if (attempt.actualRoute) receiptKeys.add(`${attempt.executionId}:${attempt.path ?? 'vault'}:${attempt.startedAt}`);
		}
		if (executions.has(key)) return usage;
		executions.add(key);
		return {
			totalTokens: usage.totalTokens + operation.usage.totalTokens,
			costUsd: usage.costUsd + operation.usage.costUsd,
			providerReceiptCount: usage.providerReceiptCount,
		};
	}, { totalTokens: 0, costUsd: 0, providerReceiptCount: 0 });
	usage.providerReceiptCount = receiptKeys.size || operations.filter((operation) => operation.actualRoute && !operation.attempts?.length).length;
	return usage;
}

function deriveLiveStageId(run: VaultIntelligenceSnapshot['run']): VaultIntelligenceSnapshot['run']['stages'][number]['id'] | null {
	const current = run.currentStage ? run.stages.find((stage) => stage.id === run.currentStage) : null;
	if (current?.status === 'running') return current.id;
	const running = run.stages.find((stage) => stage.status === 'running');
	if (running) return running.id;
	if (run.status === 'completed') return 'publish';
	if (run.currentStage) return run.currentStage;
	return run.stages.find((stage) => stage.status === 'waiting')?.id ?? run.stages[0]?.id ?? null;
}

function scanProgressMetric(run: VaultIntelligenceSnapshot['run']): { processed: number; total: number; percent: number } {
	if (run.progress?.totalUnits) {
		return { processed: run.progress.terminalUnits, total: run.progress.totalUnits, percent: run.progress.percent };
	}
	const frozenCount = run.frozenPaths.length;
	const discover = run.stages.find((stage) => stage.id === 'discover');
	const index = run.stages.find((stage) => stage.id === 'index');
	const publish = run.stages.find((stage) => stage.id === 'publish');
	const stageUnits = (stage: typeof discover, fallbackTotal: number) => {
		const total = Math.max(1, stage?.total ?? 0, fallbackTotal);
		if (!stage) return { processed: 0, total };
		if (stage.status === 'completed') return { processed: total, total };
		return { processed: Math.min(total, Math.max(0, stage.processed)), total };
	};
	const discoverUnits = stageUnits(discover, frozenCount);
	const indexUnits = stageUnits(index, frozenCount);
	const aiOperations = run.operations.filter((operation) => operation.enabled);
	const aiUnits = aiOperations.reduce((metric, operation) => {
		const total = Math.max(1, operation.total);
		const terminal = operation.status === 'completed' || operation.status === 'skipped' || operation.status === 'failed';
		const processed = terminal ? total : operation.total > 0 ? Math.min(total, operation.processed) : 0;
		return { processed: metric.processed + processed, total: metric.total + total };
	}, { processed: 0, total: 0 });
	const publishUnits = stageUnits(publish, 1);
	const processed = discoverUnits.processed + indexUnits.processed + aiUnits.processed + publishUnits.processed;
	const total = discoverUnits.total + indexUnits.total + aiUnits.total + publishUnits.total;
	return { processed, total, percent: total > 0 ? Math.round(processed / total * 100) : 0 };
}

function formatNumber(value: number): string { return value.toLocaleString(); }
function fileTypeLabel(extension: string): string {
	if (extension === 'md') return 'Markdown';
	if (extension === 'canvas') return 'Canvas';
	if (extension === 'pdf') return 'PDF';
	if (extension === '(none)') return 'No extension';
	return extension.toUpperCase();
}

function pathExtension(path: string): string {
	const name = path.split('/').pop() ?? path;
	const separator = name.lastIndexOf('.');
	return separator > 0 && separator < name.length - 1 ? name.slice(separator + 1).toLocaleLowerCase() : '(none)';
}
function pieSlicePath(start: number, end: number): string {
	if (end - start >= 0.9999) return 'M 50 50 m -46 0 a 46 46 0 1 0 92 0 a 46 46 0 1 0 -92 0';
	const point = (ratio: number) => {
		const angle = ratio * Math.PI * 2 - Math.PI / 2;
		return [50 + Math.cos(angle) * 46, 50 + Math.sin(angle) * 46] as const;
	};
	const [startX, startY] = point(start);
	const [endX, endY] = point(end);
	return `M 50 50 L ${startX.toFixed(3)} ${startY.toFixed(3)} A 46 46 0 ${end - start > 0.5 ? 1 : 0} 1 ${endX.toFixed(3)} ${endY.toFixed(3)} Z`;
}
function uniqueStrings(values: string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function formatCompactNumber(value: number): string { return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function formatMoney(value: number): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: value < 0.01 ? 3 : 2, maximumFractionDigits: 3 }).format(value); }
function formatDateTime(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp); }
function formatShortDate(date: string): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
function formatLongDate(date: string): string { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
function formatActivityDateKey(date: string): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
function formatActivityDate(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp); }
function elapsedLabel(start: number, end: number): string { const seconds = Math.max(0, Math.round((end - start) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }

VaultIntelligenceWorkspace.displayName = 'VaultIntelligenceWorkspace';
