import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import type {
	VaultMaintenanceTask,
	VaultMaintenanceProposal,
	VaultScanAiOperationPlan,
	VaultScanOperationRouteCandidate,
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
}

export const VaultIntelligenceWorkspace: React.FC<VaultIntelligenceWorkspaceProps> = ({ runtime, initialRoute = 'overview' }) => {
	const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
	const [config, setConfig] = useState(DEFAULT_VAULT_INTELLIGENCE_CONFIG);
	const [route, setRoute] = useState<Route>(() => initialWorkspaceRoute(initialRoute));
	const mainRef = useRef<HTMLElement>(null);
	useEffect(() => {
		void runtime.refresh();
		void loadVaultIntelligenceConfig().then(setConfig);
	}, [runtime]);
	useEffect(() => {
		const main = mainRef.current;
		if (!main) return;
		main.scrollTop = 0;
		main.scrollLeft = 0;
	}, [route]);

	const openPrimary = () => {
		if (snapshot.run.status === 'running' || snapshot.run.status === 'stopping' || snapshot.run.status === 'interrupted') {
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
					<VaultMap snapshot={snapshot} runtime={runtime} config={config} initialSurface={route.mapSurface ?? 'contents'} initialDate={route.mapDate ?? null} initialExtension={route.mapExtension ?? null} onOpenSetup={(initialSelector) => setRoute({ kind: 'setup', initialSelector })} onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })} onOpenMapText={(extension) => setRoute({ kind: 'map-text', extension })} />
				)}
				{route.kind === 'surface' && route.surface === 'queue' && (
					<WorkQueue
						tasks={snapshot.tasks}
						onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })}
					/>
				)}
				{route.kind === 'setup' && (
					<ScanSetup snapshot={snapshot} config={config} initialSelector={route.initialSelector ?? null} onBack={() => setRoute({ kind: 'surface', surface: 'overview' })} onSelectOperationRoute={(operationId, candidate) => { void runtime.selectOperationRoute(operationId, candidate); }} onStart={(plan) => {
						setRoute({ kind: 'progress' });
						void runtime.startScan(plan);
					}} />
				)}
				{route.kind === 'progress' && (
					<RunProgress snapshot={snapshot} runtime={runtime} onBack={() => setRoute({ kind: 'surface', surface: 'overview' })} onCompleted={() => setRoute({ kind: 'completed' })} />
				)}
				{route.kind === 'completed' && (
					<Completed snapshot={snapshot} onBack={() => setRoute({ kind: 'surface', surface: 'overview' })} onProgress={() => setRoute({ kind: 'progress' })} onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'completed' })} />
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
						proposal={snapshot.proposals.find((proposal) => proposal.taskId === route.taskId && proposal.status === 'ready-review') ?? null}
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
	const resumable = snapshot.run.status === 'interrupted';
	const [infoOpen, setInfoOpen] = useState(false);
	const infoButtonRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!infoOpen) return;
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setInfoOpen(false);
			infoButtonRef.current?.focus();
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [infoOpen]);
	return (
		<header className="pk-vi-header">
			<div className="pk-vi-title-row">
				<div className="pk-vi-brand">
					<span className="pk-vi-mark"><VaultReferenceIcon name="vault" size={20} /></span>
					<div className="pk-vi-brand-text"><span className="pk-vi-eyebrow">PEAK ASSISTANT</span><span className="pk-vi-title">Vault Intelligence</span></div>
					<div className="pk-vi-header-status">
						{snapshot.lastCompletedRun ? <Button variant="ghost" onClick={() => onRoute({ kind: 'completed' })}>Last scan {formatDateTime(snapshot.lastCompletedRun.completedAt)}<ChevronRight size={13} /></Button> : <span>Not prepared</span>}
						{snapshot.changedSinceScan !== null && snapshot.changedSinceScan > 0 && <Button variant="ghost" className="pk-vi-change-status" onClick={() => onRoute({ kind: 'setup' })}>· {formatNumber(snapshot.changedSinceScan)} changed <strong>Review plan</strong><ChevronRight size={12} /></Button>}
					</div>
				</div>
				<div className="pk-vi-top-actions">
					<div className="pk-vi-info-wrap">
						<Button ref={infoButtonRef} variant="outline" className="pk-vi-icon-button" aria-label="About Vault scans" aria-expanded={infoOpen} onClick={() => setInfoOpen((open) => !open)}><Info size={16} /></Button>
						{infoOpen && <div className="pk-vi-info-popover" role="dialog" aria-label="About Vault scans"><strong>What a Vault scan does</strong><span>Discover and index current Vault objects, then publish review evidence and owner actions.</span><div><small>AI, provider and cost</small><span>The Scan plan shows every enabled AI operation, its selected provider/model and estimated use before it runs.</span></div><div><small>Write boundary</small><span>The Knowledge Index is Peak-owned and rebuildable. Markdown or frontmatter changes require a separate selected diff, Apply, and Verify.</span></div></div>}
					</div>
					<Button className="pk-vi-primary" onClick={onPrimary}>
						{active ? <Activity size={17} /> : resumable ? <Play size={17} /> : <VaultReferenceIcon name="scan" size={17} />}
						{active ? 'View progress' : resumable ? 'Resume scan' : 'Prepare Vault'}
					</Button>
				</div>
			</div>
			<nav className="pk-vi-nav" aria-label="Vault Intelligence pages">
				{([
					['overview', 'Overview'],
					['map', 'Vault map'],
					['queue', 'Work queue'],
				] as const).map(([surface, label]) => (
					<Button key={surface} variant="ghost" className={currentSurface === surface ? 'is-active' : ''} onClick={() => onRoute({ kind: 'surface', surface })}>
						{label}{surface === 'queue' && snapshot.tasks.filter((task) => task.state !== 'verified').length > 0 && <span className="pk-vi-count">{snapshot.tasks.filter((task) => task.state !== 'verified').length}</span>}
					</Button>
				))}
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
	return (
		<div className="pk-vi-page pk-vi-overview">
			<ObjectInventory snapshot={snapshot} runtime={runtime} config={config} onRoute={onRoute} />
			<section className="pk-vi-card pk-vi-continue">
				<div className="pk-vi-card-head"><span className="pk-vi-card-title">Continue work</span><span className="pk-vi-card-head-actions"><small>Top {Math.min(7, openTasks.length)}</small><Button variant="ghost" size="sm" onClick={() => onRoute({ kind: 'surface', surface: 'queue' })}>View all {snapshot.tasks.filter((task) => task.state !== 'verified').length}<ChevronRight size={15} /></Button></span></div>
				<div className="pk-vi-continue-summary">
					<span><Clock3 size={14} /><small>Since last scan</small></span>
					<span><strong>{snapshot.lastCompletedRun && snapshot.changedSinceScan !== null ? formatNumber(snapshot.changedSinceScan) : '0'}</strong><small>{snapshot.lastCompletedRun ? 'Vault items changed' : 'Not indexed yet'}</small></span>
					<span><strong>{snapshot.digest && (snapshot.digest.communityLinks?.length ?? 0) > 0 ? formatNumber(snapshot.digest.communityLinks?.length ?? 0) : 'No'}</strong><small>current connections</small></span>
					<span><strong>{snapshot.digest ? formatNumber(snapshot.digest.counts.orphans ?? 0) : '0'}</strong><small>notes need a home</small></span>
					<span><strong>{formatNumber(snapshot.tasks.filter((task) => task.kind === 'content-lifecycle' && task.state !== 'verified').length)}</strong><small>work states need review</small></span>
				</div>
				<CompactTaskList tasks={openTasks} onOpen={(taskId) => onRoute({ kind: 'task', taskId, origin: 'queue' })} />
			</section>
			<OverviewActivity snapshot={snapshot} onOpenActivity={(date) => onRoute({ kind: 'surface', surface: 'map', mapSurface: 'activity', mapDate: date })} />
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
	return <section className="pk-vi-inventory-strip" aria-label="Vault object inventory">{objects.map((object) => {
		const presentation = config.inventoryObjects[object.id] ?? DEFAULT_VAULT_INTELLIGENCE_CONFIG.inventoryObjects[object.id];
		const canonicalBreakdown = object.id === 'files'
			? snapshot.fileTypes.map((type) => ({ id: type.extension, label: fileTypeLabel(type.extension), count: type.count }))
			: object.breakdown?.length ? object.breakdown : [{ id: 'canonical', label: canonicalObjectBucketLabel(object.id), count: object.count }];
		const breakdown = object.id === 'files'
			? inventoryPreviewItems(canonicalBreakdown, config.inventoryPreviewTypeLimit, config.inventoryTypeGroups ?? DEFAULT_VAULT_INTELLIGENCE_CONFIG.inventoryTypeGroups)
			: canonicalBreakdown;
		const previewIsGrouped = breakdown.length < canonicalBreakdown.length;
		const coverageNote = previewIsGrouped
			? `${canonicalBreakdown.length} groups · largest ${Math.max(0, breakdown.length - 1)} + Other formats`
			: object.coverageNote;
		const distributionUnavailable = object.id !== 'files'
			&& (object.breakdownStatus === 'unavailable' || canonicalBreakdown.length === 0);
		const statusLabel = object.id === 'files'
			? snapshot.changedSinceScan === null ? 'Not indexed yet' : `${formatNumber(snapshot.changedSinceScan)} changed`
			: object.count > 0 ? 'Recorded' : 'No records';
		const open = () => object.id === 'files'
			? onRoute({ kind: 'surface', surface: 'map', mapSurface: 'contents' })
			: void runtime.openOwnerSurface(object.id);
		return <div key={object.id} className={`pk-vi-inventory-item is-${object.id} ${object.id === 'files' ? 'is-files' : ''}`} tabIndex={0} aria-label={`${formatNumber(object.count)} ${object.label}`}>
			<span className="pk-vi-type-icon"><VaultReferenceIcon name={object.id} size={28} /></span><span className="pk-vi-inventory-value">{formatNumber(object.count)}</span><span className="pk-vi-inventory-label">{object.label}</span>
			<div className="pk-vi-inventory-hover" role="group" aria-label={`${object.label} distribution`}>
				<div className="pk-vi-hover-head"><div><strong>{presentation.title}</strong><span>{presentation.description}</span></div><small className={distributionUnavailable ? 'is-unavailable' : ''}>{statusLabel}</small></div>
				<InventoryDistribution total={object.count} label={object.label} items={breakdown} canonicalGroupCount={canonicalBreakdown.length} colors={config.fileTypeColors} large={object.id === 'files'} unavailable={distributionUnavailable} unavailableTitle={presentation.unavailableTitle} unavailableDescription={presentation.unavailableDescription} />
				<div className="pk-vi-hover-footer"><span>{coverageNote ?? 'Canonical records only.'}</span><Button variant="ghost" size="sm" onClick={open}>{object.id === 'files' ? 'Open full file inventory' : `Open ${object.label}`}<ChevronRight size={13} /></Button></div>
			</div>
		</div>;
	})}</section>;
}

function canonicalObjectBucketLabel(id: VaultIntelligenceObjectSummary['id']): string {
	if (id === 'chats') return 'Recorded conversations';
	if (id === 'projects') return 'Current projects';
	if (id === 'composer') return 'Recorded workspace events';
	return 'Recorded files';
}

function InventoryDistribution({ total, label, items, canonicalGroupCount, colors, large, unavailable, unavailableTitle, unavailableDescription }: {
	total: number;
	label: string;
	items: Array<{ id: string; label: string; count: number }>;
	canonicalGroupCount: number;
	colors: string[];
	large: boolean;
	unavailable: boolean;
	unavailableTitle: string;
	unavailableDescription: string;
}) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const palette = colors.length > 0 ? colors : DEFAULT_VAULT_INTELLIGENCE_CONFIG.fileTypeColors;
	const empty = unavailable || items.length === 0;
	let offset = 0;
	return <div className={`pk-vi-inventory-distribution ${large ? 'is-large' : ''} ${unavailable ? 'is-unavailable' : ''}`}>
		<div className="pk-vi-inventory-pie-panel"><svg className="pk-vi-inventory-pie" viewBox="0 0 100 100" role="img" aria-label={unavailable ? `${label} distribution not available` : `${label} distribution`}>
			{empty && <circle className="pk-vi-pie-empty" cx="50" cy="50" r="49" />}
			{!unavailable && items.map((item, index) => {
			const start = total > 0 ? offset / total : 0;
			offset += item.count;
			const end = total > 0 ? offset / total : 0;
			return <path key={item.id} className={`pk-vi-pie-segment ${activeId && activeId !== item.id ? 'is-muted' : ''}`} d={pieSlicePath(start, end)} style={{ fill: palette[index % palette.length] }} onMouseEnter={() => setActiveId(item.id)} onMouseLeave={() => setActiveId(null)} />;
		})}</svg><strong>{formatNumber(total)} {label.toLowerCase()}</strong><span>{unavailable ? 'Buckets not available' : label === 'Files' ? `${canonicalGroupCount} detected extensions · grouped for clarity` : `${canonicalGroupCount} canonical ${canonicalGroupCount === 1 ? 'group' : 'groups'}`}</span><span className="pk-vi-pie-readout">{unavailable ? 'Distribution not available' : activeId ? items.find((item) => item.id === activeId)?.label : 'Hover a slice or group'}</span></div>
		<div className="pk-vi-inventory-legend">{unavailable
			? <div className="pk-vi-inventory-unavailable" role="status"><strong>{unavailableTitle}</strong><span>{unavailableDescription}</span></div>
			: items.map((item, index) => <div key={item.id} className={`${activeId === item.id ? 'is-active' : ''} ${activeId && activeId !== item.id ? 'is-muted' : ''}`} tabIndex={0} onMouseEnter={() => setActiveId(item.id)} onMouseLeave={() => setActiveId(null)} onFocus={() => setActiveId(item.id)} onBlur={() => setActiveId(null)}><i style={{ background: palette[index % palette.length] }} /><strong>{item.label}</strong><span><b>{formatNumber(item.count)}</b> · {total > 0 ? `${(item.count / total * 100).toFixed(1)}%` : '0%'}</span></div>)}</div>
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
	const sorted = otherCount > 0
		? [...grouped, { id: 'other-formats', label: 'Other formats', count: otherCount }]
		: grouped;
	const fallbackLimit = DEFAULT_VAULT_INTELLIGENCE_CONFIG.inventoryPreviewTypeLimit;
	const safeLimit = Number.isFinite(limit) ? Math.max(2, Math.floor(limit)) : fallbackLimit;
	if (sorted.length <= safeLimit) return sorted;
	const visible = sorted.slice(0, safeLimit - 1);
	const remaining = sorted.slice(safeLimit - 1);
	return [...visible, {
		id: 'other-formats',
		label: 'Other formats',
		count: remaining.reduce((sum, item) => sum + item.count, 0),
	}];
}

function referenceObjectInventory(objects: VaultIntelligenceObjectSummary[]): VaultIntelligenceObjectSummary[] {
	const byId = new Map(objects.map((object) => [object.id, object]));
	const fallback: VaultIntelligenceObjectSummary[] = [
		{ id: 'files', label: 'Files', count: 0, detail: 'Vault files visible to Peak', breakdown: [], coverageNote: 'No file inventory has been indexed yet.' },
		{ id: 'chats', label: 'Chats', count: 0, detail: 'Durable Peak conversations', breakdown: [{ id: 'canonical', label: 'Recorded conversations', count: 0 }], breakdownStatus: 'available', coverageNote: 'Conversation type is shown only when Chat Studio publishes it explicitly.' },
		{ id: 'projects', label: 'Projects', count: 0, detail: 'Current Peak projects', breakdown: [{ id: 'canonical', label: 'Current projects', count: 0 }], breakdownStatus: 'available', coverageNote: 'Lifecycle state is shown only when the Project store publishes it explicitly.' },
		{ id: 'composer', label: 'Composer', count: 0, detail: 'Durable Composer activity', breakdown: [{ id: 'canonical', label: 'Recorded workspace events', count: 0 }], breakdownStatus: 'available', coverageNote: 'Result state is shown only when Composer history publishes it explicitly.' },
	];
	return fallback.map((item) => byId.get(item.id) ?? item);
}

function OverviewActivity({ snapshot, onOpenActivity }: { snapshot: VaultIntelligenceSnapshot; onOpenActivity: (date: string | null) => void }) {
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
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setRangeOpen(false);
			rangeButtonRef.current?.focus();
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
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
		<div className="pk-vi-card-head"><div className="pk-vi-overview-activity-title"><span className="pk-vi-card-title">Vault activity</span><span>{formatNumber(totalRecords)} explicit records</span></div><div className="pk-vi-overview-activity-actions"><div className="pk-vi-overview-range"><Button ref={rangeButtonRef} variant="outline" aria-haspopup="dialog" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}><CalendarDays size={15} />{days[0] && lastDay ? `${formatShortDate(days[0].date)} – ${formatShortDate(lastDay.date)}` : 'No recorded range'}<ChevronDown size={13} /></Button>{rangeOpen && <div className="pk-vi-overview-range-popover" role="dialog" aria-label="Choose activity date range"><div className="pk-vi-overview-range-head"><strong>Date range</strong><Button variant="ghost" onClick={() => { setCustomApplied(false); setRange(365); setPinnedDate(null); setRangeOpen(false); }}>Clear filters</Button></div>{([7, 30, 365] as const).map((option) => <Button key={option} variant="ghost" className={!customApplied && range === option ? 'is-active' : ''} onClick={() => { setRange(option); setCustomApplied(false); setRangeOpen(false); setPinnedDate(null); }}><span>Last {option} days</span>{!customApplied && range === option && <Check size={14} />}</Button>)}<Button variant="ghost" className={customApplied ? 'is-active' : ''} onClick={() => setCustomOpen((open) => !open)}><span>Custom date</span><ChevronRight size={14} /></Button>{customOpen && <div className="pk-vi-custom-range"><div><label><span>Start</span><input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label><span>–</span><label><span>End</span><input type="date" value={customEnd} min={customStart} max={dateOffsetKey(0)} onChange={(event) => setCustomEnd(event.target.value)} /></label></div><div><small>{customError}</small><Button className="pk-vi-primary" size="sm" onClick={() => { if (!customStart || !customEnd || customStart > customEnd) { setCustomError('Choose a valid date range.'); return; } setCustomError(''); setCustomApplied(true); setRangeOpen(false); setPinnedDate(null); }}>Apply</Button></div></div>}</div>}</div><Button variant="ghost" size="sm" onClick={() => onOpenActivity(selectedDay?.date ?? null)}>Open Activity<ChevronRight size={14} /></Button></div></div>
		<div className="pk-vi-overview-activity-body"><div className="pk-vi-overview-heatmap"><div className="pk-vi-overview-heatmap-scroll"><div className="pk-vi-overview-heatmap-calendar"><div className="pk-vi-overview-months" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil((days.length + firstWeekday) / 7))}, 17px)` }}>{months.map((month) => <span key={month.key} style={{ gridColumn: month.column }}>{month.label}</span>)}</div><div className="pk-vi-overview-calendar"><div className="pk-vi-overview-weekdays"><span>Sun</span><span /><span>Tue</span><span /><span>Thu</span><span /><span>Sat</span></div><div className="pk-vi-overview-grid" role="grid" aria-label="Calendar heatmap of explicit Vault activity" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil((days.length + firstWeekday) / 7))}, 17px)` }}>{days.map((day, index) => <Button key={day.date} variant="ghost" size="icon" className={selectedDay?.date === day.date ? 'is-selected' : ''} style={{ gridColumn: Math.floor((index + firstWeekday) / 7) + 1, gridRow: (index + firstWeekday) % 7 + 1, '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} aria-label={`${day.date}, ${day.count} records${pinnedDate === day.date ? ', pinned' : ''}`} aria-pressed={pinnedDate === day.date} onMouseEnter={() => setHoveredDate(day.date)} onMouseLeave={() => setHoveredDate(null)} onFocus={() => setHoveredDate(day.date)} onBlur={() => setHoveredDate(null)} onClick={() => setPinnedDate((current) => current === day.date ? null : day.date)} />)}</div></div></div></div><div className="pk-vi-overview-evidence" aria-live="polite"><strong>{selectedDay ? `${formatLongDate(selectedDay.date)} · ${selectedDay.count} explicit records` : 'No recorded activity'}</strong><div>{selectedRecords.slice(0, 5).map((record) => <article key={record.id}><span className={`is-${record.kind}`}>{activityIcon(record.kind)}</span><div><strong>{record.label}</strong><span>{record.objectPath ?? (record.runId ? `Run ${record.runId}` : 'Peak-owned record')}</span></div><small>{record.kind}</small></article>)}{selectedRecords.length === 0 && selectedDay?.files.slice(0, 5).map((file) => <article key={file.path}><span><File size={14} /></span><div><strong>{file.path}</strong><span>Vault file modification</span></div><small>file</small></article>)}{selectedDay && selectedDay.count === 0 && <span className="pk-vi-empty">No explicit records for this date.</span>}</div></div><div className="pk-vi-overview-heatmap-footer"><div className="pk-vi-overview-legend"><span>None</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} style={{ '--pk-vi-level': level } as React.CSSProperties} />)}<span>More records</span></div></div></div>
		</div>
	</section>;
}

function KnowledgeIndexOverview({ snapshot, onReview }: { snapshot: VaultIntelligenceSnapshot; onReview: () => void }) {
	const discovered = snapshot.indexReadiness.discovered;
	const ready = snapshot.indexReadiness.searchReady;
	const percent = discovered > 0 && ready !== null ? Math.min(100, Math.max(0, Math.round(ready / discovered * 100))) : 0;
	const readinessNote = ready !== null && ready > discovered
		? `${formatNumber(ready)} search records exceed ${formatNumber(discovered)} discovered objects; rebuild the Index baseline.`
		: snapshot.indexReadiness.pendingOrExcluded === null
			? 'Pending and excluded counts are not reported.'
			: `${formatNumber(snapshot.indexReadiness.pendingOrExcluded)} pending or excluded by current Index evidence.`;
	return <section className="pk-vi-card pk-vi-index-overview"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Knowledge Index</span><span className="pk-vi-card-caption">Search and machine knowledge maintained by Vault scans</span></div><div><span className={`pk-vi-readiness-state ${snapshot.indexReadiness.isReady ? 'is-ready' : 'is-pending'}`}>{snapshot.indexReadiness.pendingOrExcluded === null ? 'Readiness unavailable' : `${formatNumber(snapshot.indexReadiness.pendingOrExcluded)} updates pending`}</span><Button variant="ghost" size="sm" onClick={onReview}>Review next Index plan<ChevronRight size={14} /></Button></div></div><div className="pk-vi-index-overview-body"><div className="pk-vi-readiness-summary"><div className="pk-vi-readiness-ring" style={{ '--pk-vi-ready': `${percent * 3.6}deg` } as React.CSSProperties}><span>{percent}%</span></div></div><div className="pk-vi-index-meters"><IndexMeter label="Search ready" value={ready} total={discovered} /><IndexMeter label="Vectors ready" value={null} total={discovered} /><IndexMeter label="Summary ready" value={null} total={discovered} /><IndexMeter label="AI Tags ready" value={null} total={discovered} /><small>{readinessNote}</small></div><div className="pk-vi-index-impact"><strong>What this Index powers</strong><span>One maintained layer is reused across Peak instead of every feature reading the Vault again.</span><div><span><Search size={14} />Vault Search</span><span><Sparkles size={14} />AI Search</span><span><FileText size={14} />File context</span><span><GitBranch size={14} />Vault map</span></div><small>Full-text, vectors, summaries, AI Tags, and relationship signals are rebuildable Peak knowledge. Your Markdown and frontmatter stay unchanged.</small></div></div></section>;
}

function IndexMeter({ label, value, total }: { label: string; value: number | null; total: number }) {
	const percent = value === null || total === 0 ? 0 : Math.min(100, value / total * 100);
	return <div className="pk-vi-index-meter"><span>{label}</span><i><b style={{ width: `${percent}%` }} /></i><strong>{value === null ? 'Not reported' : `${formatNumber(value)} / ${formatNumber(total)}`}</strong></div>;
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

function VaultMap({ snapshot, runtime, config, initialSurface, initialDate, initialExtension, onOpenSetup, onOpenTask, onOpenMapText }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	initialSurface: MapSurface;
	initialDate: string | null;
	initialExtension: string | null;
	onOpenSetup: (initialSelector: VaultScanScopeSelector | null) => void;
	onOpenTask: (taskId: string) => void;
	onOpenMapText: (extension: string | null) => void;
}) {
	const [surface, setSurface] = useState<MapSurface>(initialSurface);
	const [selectedExtension, setSelectedExtension] = useState<string | null>(initialExtension);
	const scanSelection = selectedExtension === null ? null : {
		id: `file-type:${selectedExtension}`,
		kind: 'file-type' as const,
		label: `${fileTypeLabel(selectedExtension)} files`,
		paths: snapshot.availablePaths.filter((path) => pathExtension(path) === selectedExtension),
	};
	return <div className="pk-vi-page">
		<div className="pk-vi-page-head pk-vi-map-head"><div><span className="pk-vi-page-title">{surface === 'contents' ? 'Vault contents · file types in context' : 'Activity'}</span><span className="pk-vi-page-description">{surface === 'contents' ? 'Choose an actual file type, then see where it fits in the knowledge structure and what Peak can currently use.' : 'Timestamped local evidence by recorded source. Work sessions group real VI receipts; no topic is guessed.'}</span></div>{surface === 'contents' ? <div className="pk-vi-page-actions"><Button variant="ghost" size="sm" onClick={() => onOpenMapText(selectedExtension)}>Manage map text</Button><Button variant="ghost" size="sm" onClick={() => onOpenSetup(scanSelection)}><ScanSearch size={14} />Scan selected type</Button></div> : <span className="pk-vi-map-freshness">{snapshot.indexReadiness.builtAt ? `Index built ${formatDateTime(snapshot.indexReadiness.builtAt)}` : 'No completed Index build'}</span>}</div>
		<div className="pk-vi-local-nav">
			<Button variant="ghost" className={surface === 'contents' ? 'is-active' : ''} onClick={() => setSurface('contents')}>Vault contents</Button>
			<Button variant="ghost" className={surface === 'activity' ? 'is-active' : ''} onClick={() => setSurface('activity')}>Activity</Button>
		</div>
		{surface === 'contents' ? <VaultContents snapshot={snapshot} runtime={runtime} config={config} selectedExtension={selectedExtension} onSelectExtension={setSelectedExtension} onOpenTask={onOpenTask} /> : <ActivityView snapshot={snapshot} runtime={runtime} initialDate={initialDate} />}
	</div>;
}

function VaultContents({ snapshot, runtime, config, selectedExtension, onSelectExtension, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	selectedExtension: string | null;
	onSelectExtension: (extension: string | null) => void;
	onOpenTask: (taskId: string) => void;
}) {
	const unreadable = snapshot.tasks.find((task) => task.kind === 'unreadable-files')?.atomicItems.length ?? 0;
	const actualTypes = snapshot.fileTypes.filter((type) => type.count > 0).length;
	return <div className="pk-vi-map-layout">
		<section className="pk-vi-content-summary" aria-label="Vault contents summary">
			<span><small>Discovered</small><strong>{formatNumber(snapshot.indexReadiness.discovered)}</strong></span>
			<span><small>Search ready</small><strong>{snapshot.indexReadiness.searchReady === null ? '—' : formatNumber(snapshot.indexReadiness.searchReady)}</strong></span>
			<span><small>Pending / excluded</small><strong>{snapshot.indexReadiness.pendingOrExcluded === null ? '—' : formatNumber(snapshot.indexReadiness.pendingOrExcluded)}</strong></span>
			<span><small>Actual file types</small><strong>{formatNumber(actualTypes)}</strong></span>
			<span className={unreadable > 0 ? 'is-warning' : ''}><small>Unreadable</small><strong>{formatNumber(unreadable)}</strong></span>
		</section>
		<FileTypeDistribution snapshot={snapshot} config={config} selected={selectedExtension} onSelect={onSelectExtension} />
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

function FileTypeDistribution({ snapshot, config, selected, onSelect }: {
	snapshot: VaultIntelligenceSnapshot;
	config: VaultIntelligenceConfig;
	selected: string | null;
	onSelect: (extension: string | null) => void;
}) {
	const [hovered, setHovered] = useState<string | null>(null);
	const shown = snapshot.fileTypes.slice(0, 16);
	const total = snapshot.fileTypes.reduce((sum, type) => sum + type.count, 0);
	const active = hovered ?? selected;
	let cursor = 0;
	const slices = shown.map((type, index) => {
		const start = cursor;
		cursor += type.share;
		return { type, color: config.fileTypeColors[index % config.fileTypeColors.length], start, end: cursor };
	});
	return <section className="pk-vi-card pk-vi-file-types">
		<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Files by actual type</span><span className="pk-vi-card-caption">Select a type to focus the knowledge map without changing the source Vault.</span></div><Button variant="ghost" size="sm" onClick={() => onSelect(null)} className={!selected ? 'is-active' : ''}>All files</Button></div>
			<div className="pk-vi-file-type-body">
				<div className="pk-vi-donut"><svg viewBox="0 0 100 100" aria-label="File type distribution" onMouseLeave={() => setHovered(null)}>{slices.map((slice) => <path key={slice.type.extension} className={`${active === slice.type.extension ? 'is-active' : ''} ${active && active !== slice.type.extension ? 'is-muted' : ''}`} d={pieSlicePath(slice.start, slice.end)} fill={slice.color} onMouseEnter={() => setHovered(slice.type.extension)} onFocus={() => setHovered(slice.type.extension)} onBlur={() => setHovered(null)} tabIndex={0} />)}{cursor < 1 && <path d={pieSlicePath(cursor, 1)} fill="#dedce4" />}</svg><span><strong>{formatNumber(total)}</strong><small>{active ? fileTypeLabel(active) : 'files'}</small></span></div>
				<div className="pk-vi-file-type-list">{shown.map((type, index) => <Button key={type.extension} variant="ghost" className={`${active === type.extension ? 'is-active' : ''} ${active && active !== type.extension ? 'is-muted' : ''}`} aria-pressed={selected === type.extension} onMouseEnter={() => setHovered(type.extension)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(type.extension)} onBlur={() => setHovered(null)} onClick={() => onSelect(selected === type.extension ? null : type.extension)}>
					<i style={{ backgroundColor: config.fileTypeColors[index % config.fileTypeColors.length] }} /><span>{fileTypeLabel(type.extension)}</span><strong>{formatNumber(type.count)}</strong><small>{Math.round(type.share * 100)}%</small>
			</Button>)}</div>
		</div>
	</section>;
}

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

function WorkQueue({ tasks, onOpenTask }: { tasks: VaultMaintenanceTask[]; onOpenTask: (taskId: string) => void }) {
	return <div className="pk-vi-page"><div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Work queue</span><span className="pk-vi-page-description">Only unresolved work with an owner action and a verifiable exit condition belongs here. Starting a scan stays in the global Vault control, not inside the queue.</span></div></div><WorkSurface tasks={tasks.filter((task) => task.state !== 'verified')} origin="queue" onOpenTask={onOpenTask} /></div>;
}

function WorkSurface({ tasks, origin, onOpenTask }: { tasks: VaultMaintenanceTask[]; origin: 'queue' | 'completed'; onOpenTask: (taskId: string) => void }) {
	const [filter, setFilter] = useState<WorkFilter>('all');
	const [query, setQuery] = useState('');
	const [adjustment, setAdjustment] = useState('');
	const [adjustmentReceipt, setAdjustmentReceipt] = useState('');
	const filtered = tasks.filter((task) => {
		if (filter !== 'all' && !taskMatchesWorkFilter(task, filter)) return false;
		const text = `${task.title} ${task.typeLabel} ${task.affectedLabel} ${task.contextLabel}`.toLocaleLowerCase();
		return !query.trim() || text.includes(query.trim().toLocaleLowerCase());
	});
	const count = (workFilter: WorkFilter) => workFilter === 'all' ? tasks.length : tasks.filter((task) => taskMatchesWorkFilter(task, workFilter)).length;
	return <section className="pk-vi-work-surface">
		<div className="pk-vi-work-head"><div><strong>{tasks.length} maintenance {tasks.length === 1 ? 'task' : 'tasks'} {origin === 'completed' ? 'need you' : 'still need you'}</strong><span>{origin === 'completed' ? 'Created by this Scan' : 'Current canonical queue'}</span></div><span className="pk-vi-work-guidance">Owner choice → review or recovery → apply → verify</span></div>
		<form className="pk-vi-work-adjust" onSubmit={(event) => { event.preventDefault(); const request = adjustment.trim(); if (!request) return; setAdjustmentReceipt('Suggestion recorded locally for the next Scan review. Current tasks remain unchanged until Peak returns evidence-backed replacements.'); }}><input value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder={`Tell Peak how to regroup, rescope, or rewrite these ${tasks.length} tasks`} aria-label={origin === 'queue' ? 'Adjust Work queue suggestions' : 'Adjust completed Scan follow-up suggestions'} /><Button variant="ghost" type="submit" disabled={!adjustment.trim()}>Update suggestions</Button>{adjustmentReceipt && <span>{adjustmentReceipt}</span>}</form>
		<div className="pk-vi-work-tools"><div className="pk-vi-filter-bar">{([
			['all', 'All'], ['choice', 'Needs your choice'], ['review', 'Ready for review'], ['recovery', 'Needs recovery'],
		] as const).map(([id, label]) => <Button key={id} variant="ghost" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}<span>{count(id)}</span></Button>)}</div><label className="pk-vi-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label></div>
		<div className="pk-vi-work-table"><div className="pk-vi-work-columns"><span>Task</span><span>Affected</span><span>State</span><span /></div>{filtered.map((task) => <Button key={task.id} variant="ghost" className="pk-vi-work-row" title={taskExitCondition(task)} onClick={() => onOpenTask(task.id)}>
			<span className="pk-vi-task-name"><small>{task.typeLabel}</small><strong>{task.title}</strong></span><span className="pk-vi-task-affected"><strong>{task.affectedLabel}</strong><span>· {task.contextLabel}</span></span><TaskStatus task={task} /><ChevronRight size={17} />
		</Button>)}{filtered.length === 0 && <div className="pk-vi-work-empty"><span className="pk-vi-empty-mark"><Check size={20} /></span><div><strong>{tasks.length === 0 ? 'No unresolved maintenance work' : 'No tasks match this view'}</strong><span>{tasks.length === 0 ? 'The queue intentionally stays empty until a Scan creates evidence-backed owner work.' : 'Change the filter or search query to see another part of the queue.'}</span></div></div>}</div>
	</section>;
}

function ScanSetup({ snapshot, config, initialSelector, onBack, onStart, onSelectOperationRoute }: {
	snapshot: VaultIntelligenceSnapshot;
	config: VaultIntelligenceConfig;
	initialSelector: VaultScanScopeSelector | null;
	onBack: () => void;
	onSelectOperationRoute: (operationId: VaultScanAiOperationPlan['id'], candidate: VaultScanOperationRouteCandidate) => void;
	onStart: (plan: VaultScanPlan) => void;
}) {
	const [scopeMode, setScopeMode] = useState<VaultScanScopeMode>(initialSelector ? 'selected' : snapshot.changedCursorAt ? 'changed' : 'entire');
	const [selectedPaths, setSelectedPaths] = useState<string[]>(initialSelector?.paths ?? []);
	const [selectors, setSelectors] = useState<VaultScanScopeSelector[]>(initialSelector ? [initialSelector] : []);
	const [pathQuery, setPathQuery] = useState('');
	const allChecks = config.checkGroups.flatMap((group) => group.checks);
	const displayedCheckGroups = [...config.checkGroups].sort(
		(left, right) => (left.displayOrder ?? 99) - (right.displayOrder ?? 99),
	);
	const [selectedCheckKeys, setSelectedCheckKeys] = useState(() => new Set(allChecks.map((check) => check.checkId)));
	const [operations, setOperations] = useState<VaultScanAiOperationPlan[]>(() => resolvedOperationPlans(config, snapshot));
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
		setIndexOutputs(config.indexOutputs.map((output) => ({ id: output.id, enabled: defaultIndexOutputEnabled(output), availability: output.availability, operationIds: output.operationIds })));
	}, [config, snapshot.operationRoutes]);
	const matchingPaths = pathQuery.trim() ? snapshot.availablePaths.filter((path) => path.toLocaleLowerCase().includes(pathQuery.toLocaleLowerCase())).slice(0, 8) : [];
	const folderScopes = useMemo(() => uniqueStrings(snapshot.availablePaths.map((path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'Vault root'))
		.slice(0, 8).map((folder) => ({ id: `folder:${folder}`, kind: 'folder' as const, label: folder, paths: snapshot.availablePaths.filter((path) => folder === 'Vault root' ? !path.includes('/') : path.startsWith(`${folder}/`)) })), [snapshot.availablePaths]);
	const communityScopes = useMemo(() => (snapshot.digest?.clusters ?? []).map((community) => ({ id: `community:${community.id}`, kind: 'community' as const, label: community.label, paths: community.topNodes.map((node) => node.path).filter((path) => snapshot.availablePaths.includes(path)) })), [snapshot.availablePaths, snapshot.digest]);
	const savedWorkScope = useMemo(() => ({ id: 'saved-work:open-queue', kind: 'saved-work' as const, label: 'Open Work queue files', paths: uniqueStrings(snapshot.tasks.filter((task) => task.state !== 'verified').flatMap((task) => task.atomicItems.flatMap((item) => item.filePath ? [item.filePath] : []))) }), [snapshot.tasks]);
	const addSelector = (selector: VaultScanScopeSelector) => {
		setSelectors((current) => current.some((candidate) => candidate.id === selector.id) ? current : [...current, selector]);
		setSelectedPaths((current) => uniqueStrings([...current, ...selector.paths]));
	};
	const scopeObjectCount = scopeMode === 'selected'
		? selectedPaths.length
		: scopeMode === 'changed'
			? snapshot.changedSinceScan ?? 0
			: snapshot.availablePaths.length;
	const estimateScale = snapshot.availablePaths.length > 0
		? Math.min(1, scopeObjectCount / snapshot.availablePaths.length)
		: 0;
	const plannedOperations = operations.map((operation) => ({
		...operation,
		enabled: operation.enabled
			&& operationAvailableForScope(operation.id, scopeMode)
			&& (indexOutputs.filter((output) => output.operationIds.includes(operation.id)).length === 0
				|| indexOutputs.some((output) => output.enabled && output.operationIds.includes(operation.id))),
		estimatedTokens: Math.round(operation.estimatedTokens * estimateScale),
		estimatedCostUsd: operation.estimatedCostUsd * estimateScale,
	}));
	const selectedOps = plannedOperations.filter((operation) => operation.enabled);
	const hasUnconfiguredEnabledOperation = selectedOps.some((operation) => snapshot.operationRoutes[operation.id]?.available === false);
	const estimatedTokens = selectedOps.reduce((sum, operation) => sum + operation.estimatedTokens, 0);
	const operationCosts = selectedOps.map((operation) => estimateOperationCostUsd(operation));
	const hasUnknownCost = operationCosts.some((cost) => cost === null);
	const estimatedCost = operationCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
	const localMinutes = scopeObjectCount > 0 ? scopeObjectCount / 120 : 0;
	const longestAiMinutes = selectedOps.reduce((longest, operation) => Math.max(longest, operation.estimatedTokens / 45_000), 0);
	const queuedAiMinutes = estimatedTokens / 450_000;
	const estimatedMinutes = scopeObjectCount > 0
		? Math.max(0.1, Math.ceil((localMinutes + longestAiMinutes * .4 + queuedAiMinutes) * 10) / 10)
		: null;
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
		<div className="pk-vi-scan-setup-body"><section className="pk-vi-scan-setup-overview"><div className="pk-vi-scan-setup-hero"><span><ScanSearch size={23} /></span><div><strong>Prepare a safe Vault scan</strong><small>Choose what Peak should examine, then review AI models and estimated usage. Your current Vault stays available while it runs.</small></div><span className="pk-vi-readiness-state is-ready"><Check size={13} />Ready</span></div><div className="pk-vi-scan-trust-row"><span><Clock3 size={14} /><small>Last successful scan</small><strong>{snapshot.changedCursorAt ? formatDateTime(snapshot.changedCursorAt) : 'Not indexed yet'}</strong></span><span><ShieldCheck size={14} /><small>Current Vault view</small><strong>Stays usable until this scan publishes</strong></span><span><FileText size={14} /><small>User files</small><strong>No automatic edits</strong></span></div></section>
		<div className="pk-vi-scan-setup-grid"><SetupSection number="1" title="Choose scan scope" description="Peak also checks the existing relationships and Communities affected by this scope." status="Recommended"><div className={`pk-vi-scope-builder${scopeMode === 'selected' ? ' is-custom-scope' : ''}`}><div className="pk-vi-scope-mode-options">{([
			['changed', 'Since last scan', snapshot.changedCursorAt ? `${snapshot.changedSinceScan ?? 0} changed` : 'Not indexed yet'],
			['selected', 'Choose a scope', 'Search & select'],
			['entire', 'Entire Vault', `${snapshot.availablePaths.length} objects`],
		] as const).map(([id, label, meta]) => <Button key={id} variant="ghost" disabled={id === 'changed' && !snapshot.changedCursorAt} className={scopeMode === id ? 'is-active' : ''} onClick={() => setScopeMode(id)}><strong>{label}</strong><span>{meta}</span></Button>)}</div><div className="pk-vi-scope-selected-row"><div><strong>Included scope</strong><span>{scopeObjectCount ? `${scopeObjectCount} objects included` : 'No scope selected yet'}</span></div><span className="pk-vi-scope-token">{scopeObjectCount > 0 && <Check size={13} />}{scopeMode === 'changed' ? 'Changes since last scan' : scopeMode === 'entire' ? 'Entire Vault' : selectors.length === 1 ? selectors[0].label : selectors.length ? `${selectors.length} selected scopes` : 'Choose files or saved scope'} {scopeObjectCount > 0 && <b>{scopeObjectCount}</b>}</span></div>{scopeMode === 'selected' && <div className="pk-vi-path-picker"><label><Search size={15} /><input value={pathQuery} onChange={(event) => setPathQuery(event.target.value)} placeholder="Search files, folders, Communities, or saved work" /></label>{matchingPaths.length > 0 && <div className="pk-vi-path-results">{matchingPaths.map((path) => { const selected = selectedPaths.includes(path); return <Button key={path} variant="ghost" className={selected ? 'is-selected' : ''} onClick={() => { if (!selected) addSelector({ id: `file:${path}`, kind: 'file', label: path, paths: [path] }); setPathQuery(''); }}><FileText size={14} /><span>{path}</span>{selected && <Check size={14} />}</Button>; })}</div>}<details className="pk-vi-scope-shortcuts"><summary>Browse suggested scopes</summary><div><strong>Folders</strong>{folderScopes.map((selector) => <Button key={selector.id} variant="ghost" disabled={selector.paths.length === 0} onClick={() => addSelector(selector)}>Folder · {selector.label}<span>{selector.paths.length}</span></Button>)}<strong>Communities &amp; saved work</strong>{communityScopes.map((selector) => <Button key={selector.id} variant="ghost" disabled={selector.paths.length === 0} onClick={() => addSelector(selector)}>Community · {selector.label}<span>{selector.paths.length}</span></Button>)}{savedWorkScope.paths.length > 0 && <Button variant="ghost" onClick={() => addSelector(savedWorkScope)}>Saved work · {savedWorkScope.label}<span>{savedWorkScope.paths.length}</span></Button>}</div></details><div className="pk-vi-selected-paths">{selectors.map((selector) => <span key={selector.id} title={selector.label}>{selector.kind} · {selector.label} · {selector.paths.length} files<Button variant="ghost" size="icon" onClick={() => { setSelectors((current) => current.filter((candidate) => candidate.id !== selector.id)); setSelectedPaths((current) => current.filter((path) => !selector.paths.includes(path) || selectors.some((candidate) => candidate.id !== selector.id && candidate.paths.includes(path)))); }} aria-label={`Remove ${selector.label}`}><X size={13} /></Button></span>)}</div></div>}<div className="pk-vi-scope-builder-foot"><GitBranch size={13} />Affected relationships and existing Community context are included automatically.</div></div></SetupSection>
		<SetupSection number="2" title="Choose scan tasks" description="Select the maintenance task categories Peak should run." status={`${selectedCheckKeys.size} of ${allChecks.length} tasks selected`}><div className="pk-vi-scan-check-grid">{displayedCheckGroups.map((group) => { const selectedCount = group.checks.filter((check) => selectedCheckKeys.has(check.checkId)).length; const selected = selectedCount === group.checks.length; return <Button key={group.id} variant="ghost" className={selected ? 'is-active' : ''} title={group.description} onClick={() => setGroupSelected(group.checks, !selected)}><span className="pk-vi-check-mark">{selected && <Check size={13} />}</span><strong>{group.label}</strong><span>{group.checks.length} tasks</span></Button>; })}</div><IndexOutputPlan config={config} outputs={indexOutputs} scopeObjectCount={scopeObjectCount} onToggle={toggleOutput} /></SetupSection>
		<SetupSection number="3" title="Review AI models" description="Open a group only when you want to configure an individual operation." status={`${selectedOps.length} operations · ${hasUnconfiguredEnabledOperation ? 'configuration needed' : selectedOps.length ? 'models ready' : 'no AI work'}`}><div className="pk-vi-scan-ai-groups">{(['plan', 'index', 'relations', 'structure', 'follow-up'] as const).map((group) => { const definitions = config.scanOperations.filter((definition) => definition.group === group); const groupOperations = definitions.map((candidate) => plannedOperations.find((operation) => operation.id === candidate.id)!).filter(Boolean); const enabled = groupOperations.filter((operation) => operation.enabled).length; const expanded = expandedOperationGroup === group; return <section key={group} className={expanded ? 'is-expanded' : ''}><Button variant="ghost" className="pk-vi-scan-ai-group-row" aria-expanded={expanded} onClick={() => setExpandedOperationGroup(expanded ? null : group)}><span><strong>{scanOperationGroupLabel(group)}</strong><small>{scanOperationGroupDescription(group)}</small></span><span><strong>{enabled} / {definitions.length} enabled</strong><small>{groupOperations.some((operation) => snapshot.operationRoutes[operation.id]?.available === false) ? 'Configure model' : groupOperations[0]?.provider ?? 'Route not available'}</small></span><ChevronRight size={15} /></Button>{expanded && <div className="pk-vi-scan-operation-list">{definitions.map((definition) => { const operation = plannedOperations.find((candidate) => candidate.id === definition.id)!; const route = snapshot.operationRoutes[operation.id]; const scopeAvailable = operationAvailableForScope(operation.id, scopeMode); const shared = sharedExecutionLabel(operation.id); return <div key={definition.id} className={!scopeAvailable ? 'is-scope-unavailable' : ''}><span><strong>{definition.label}</strong><small>{shared ? `Runs in ${shared}; this switch remains independent.` : definition.description}</small></span><OperationModelPicker operation={operation} route={route} onChange={(candidate) => { setOperations((current) => current.map((item) => item.id === operation.id ? { ...item, model: candidate.model, provider: candidate.provider } : item)); onSelectOperationRoute(operation.id, candidate); }} /><span>{operationEstimateLabel(operation, route)}</span><Button variant="ghost" disabled={!scopeAvailable} className={`pk-vi-scan-operation-toggle ${operation.enabled ? 'is-on' : ''}`} aria-label={`${operation.enabled ? 'Disable' : 'Enable'} ${definition.label}`} aria-pressed={operation.enabled} onClick={() => setOperations((current) => toggleOperationExecutionGroup(current, operation.id))}>{!scopeAvailable ? 'Entire Vault only' : operation.enabled ? 'On' : 'Off'}</Button></div>; })}</div>}</section>; })}</div></SetupSection>
		<section className="pk-vi-scan-estimate-block"><div><span><strong>Estimated run</strong><small>Recalculated from the selected scope, enabled operations, and their resolved models.</small></span><span className={`pk-vi-readiness-state ${hasUnconfiguredEnabledOperation || hasUnknownCost ? 'is-attention' : 'is-ready'}`}>{hasUnconfiguredEnabledOperation ? 'Model configuration needed' : hasUnknownCost ? 'Some prices unknown' : 'Ready to estimate'}</span></div><div className="pk-vi-scan-estimate-metrics"><span><span className="pk-vi-estimate-value"><strong>{estimatedMinutes === null ? 'Not available' : `${estimatedMinutes.toFixed(1)}–${(estimatedMinutes + 3).toFixed(1)} min`}</strong><EstimateHelp label="How estimated time is calculated" lines={[`Scope · ${scopeObjectCount} objects ÷ 120 objects/min`, `Parallel AI path · 40% × ${longestAiMinutes.toFixed(1)} min`, `Queue share · 10% of ${formatCompactNumber(estimatedTokens)} enabled AI tokens`]} /></span><small>Estimated time</small></span><span><span className="pk-vi-estimate-value"><strong>{estimatedTokens > 0 ? `~${formatCompactNumber(estimatedTokens)}` : 'Not available'}</strong><EstimateHelp label="How AI tokens are calculated" lines={[`${selectedOps.length} enabled operations`, 'Operation allowance × current scope factor', 'Embedding input is included separately']} /></span><small>Typical AI tokens</small></span><span><span className="pk-vi-estimate-value"><strong>{hasUnknownCost ? 'Not available' : estimatedCost > 0 ? `~${formatMoney(estimatedCost)}` : '$0.00'}</strong><EstimateHelp label="How AI cost is calculated" lines={['80% estimated input + 20% estimated output', 'Selected model catalog prices per operation', 'Missing price or model route = not available']} /></span><small>Typical AI cost</small></span></div><small className="pk-vi-scan-estimate-note"><Info size={13} />Open an estimate to inspect its inputs. The final receipt records actual tokens and spend; missing provider prices are never treated as $0.</small></section></div></div>
		<footer className="pk-vi-scan-setup-footer"><span><Info size={14} />The scan updates machine state and prepares review items. It never applies user-file edits. Current scope: {scopeStatus}.{hasUnconfiguredEnabledOperation ? ' Configure or turn off the unavailable AI operations before starting.' : ''}</span><div><Button variant="outline" onClick={onBack}>Cancel</Button><Button className="pk-vi-primary" onClick={start} disabled={(scopeMode === 'selected' && selectedPaths.length === 0) || hasUnconfiguredEnabledOperation}><Play size={15} />Start scan</Button></div></footer>
	</section></div>;
}

function OperationModelPicker({ operation, route, onChange }: {
	operation: VaultScanAiOperationPlan;
	route: VaultIntelligenceSnapshot['operationRoutes'][VaultScanAiOperationPlan['id']] | undefined;
	onChange: (candidate: VaultScanOperationRouteCandidate) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const candidates = (route?.candidates ?? []).filter((candidate) => {
		if (operation.id !== 'embedding-refresh') return true;
		return /embed/i.test(candidate.model);
	});
	const matches = candidates.filter((candidate) => `${candidate.provider} ${candidate.model}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
	const configured = route?.available && route.profileId ? `${route.provider} · ${route.model}` : null;
	return <div className="pk-vi-scan-model-field">
		<Button variant="ghost" className={`pk-vi-model-trigger ${configured ? '' : 'is-unconfigured'}`} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
			<Sparkles size={14} /><span>{configured ?? 'Configure model'}</span><ChevronDown size={14} />
		</Button>
		{open && <div className="pk-vi-model-picker" role="dialog" aria-label={`Choose model for ${operation.id}`}>
			<label><Search size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search configured models" /></label>
			{matches.length > 0 ? <div>{matches.map((candidate) => <Button key={`${candidate.profileId}:${candidate.model}`} variant="ghost" className={route?.profileId === candidate.profileId && route.model === candidate.model ? 'is-selected' : ''} onClick={() => { onChange(candidate); setOpen(false); setQuery(''); }}><span><strong>{candidate.model}</strong><small>{candidate.provider}</small></span>{route?.profileId === candidate.profileId && route.model === candidate.model && <Check size={14} />}</Button>)}</div> : <div className="pk-vi-model-picker-empty"><strong>No configured models match</strong><small>{operation.id === 'embedding-refresh' ? 'Configure an embedding-capable model in Peak Settings.' : 'Configure a compatible chat model in Peak Settings.'}</small></div>}
		</div>}
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
		const state = entry.availability === 'automatic' ? 'Automatic' : entry.availability === 'required' ? 'Required' : entry.availability === 'later' ? 'Later' : null;
		const className = entry.group === 'core' ? `pk-vi-index-core-row is-${entry.availability}` : `pk-vi-index-output is-${entry.availability}`;
		const content = <><span><strong>{entry.label}</strong></span>{state && !canToggle && <em>{entry.availability === 'automatic' || entry.availability === 'required' ? 'Local · always on' : state}</em>}{canToggle ? <i className={`pk-vi-index-output-toggle ${output.enabled ? 'is-on' : ''}`} aria-hidden="true" /> : <i className={`pk-vi-index-output-state is-${entry.availability}`} aria-hidden="true">{entry.availability === 'automatic' || entry.availability === 'required' ? '✓' : state}</i>}</>;
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
			<div className="pk-vi-index-plan-heading"><div><strong>Choose what this scan adds to the Index</strong><small>Step 1 already defines the content scope. Here you choose the reusable Search and machine-knowledge outputs built from that same scope.</small></div><span>Scope · current selection</span></div>
			<div className="pk-vi-index-core-label"><strong>Core Search</strong><small>Foundations used to find and retrieve files</small></div>
				<div className="pk-vi-index-core">{coreOutputs.map(renderOutputRow)}</div>
			<div className="pk-vi-index-generated-head"><div><strong>Generated Index outputs</strong><small>Optional AI outputs can be included for this run; automatic outputs stay on.</small></div><span>{selected} enabled</span></div>
				<div className="pk-vi-index-output-grid">{generatedGroups.map((group) => {
				const entries = config.indexOutputs.filter((output) => output.group === group);
				if (entries.length === 0) return null;
				return <section key={group} className="pk-vi-index-output-group"><div className="pk-vi-index-output-head"><strong>{indexOutputGroupLabel(group)}</strong><span>{entries.filter((entry) => outputs.find((output) => output.id === entry.id)?.enabled).length} enabled</span></div><div className="pk-vi-index-output-list">{entries.map((entry) => renderOutputRow(entry))}</div></section>;
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

function SetupSection({ number, title, description, status, children }: { number: string; title: string; description: string; status: string; children: React.ReactNode }) {
	const tone = /needed|unavailable/i.test(status) ? 'is-attention' : /recommended|selected|ready/i.test(status) ? 'is-ready' : '';
	return <section className="pk-vi-scan-config-card"><div className="pk-vi-scan-config-head"><div><span>{number}</span><div><strong>{title}</strong><small>{description}</small></div></div><span className={`pk-vi-readiness-state ${tone}`}>{status}</span></div>{children}</section>;
}

function EstimateHelp({ label, lines }: { label: string; lines: string[] }) {
	return <details className="pk-vi-estimate-help"><summary aria-label={label}><Info size={13} /></summary><span role="tooltip"><strong>{label}</strong>{lines.map((line) => <small key={line}>{line}</small>)}</span></details>;
}

function estimateOperationCostUsd(operation: VaultScanAiOperationPlan): number | null {
	if (operation.estimatedTokens <= 0 || operation.provider === 'Peak') return 0;
	if (operation.provider === 'ollama' || operation.provider === 'lmstudio') return 0;
	const model = modelRegistry.getModelsForProvider(operation.provider).find((candidate) => candidate.id === operation.model);
	if (!model || model.costInput === undefined || model.costOutput === undefined) return null;
	const inputPrice = Number(model.costInput);
	const outputPrice = Number(model.costOutput);
	if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice) || inputPrice + outputPrice <= 0) return null;
	const estimatedInput = operation.estimatedTokens * .8;
	const estimatedOutput = operation.estimatedTokens * .2;
	return estimatedInput / 1_000_000 * inputPrice + estimatedOutput / 1_000_000 * outputPrice;
}

function operationEstimateLabel(
	operation: VaultScanAiOperationPlan,
	route: VaultIntelligenceSnapshot['operationRoutes'][VaultScanAiOperationPlan['id']] | undefined,
): string {
	if (route?.available === false) return 'Configure first';
	if (operation.estimatedTokens <= 0) return 'Estimate pending';
	const cost = estimateOperationCostUsd(operation);
	if (cost === null) return `${formatCompactNumber(operation.estimatedTokens)} · Price unknown`;
	if (operation.provider === 'Peak' || operation.provider === 'ollama' || operation.provider === 'lmstudio') return `${formatCompactNumber(operation.estimatedTokens)} · Local`;
	return `${formatCompactNumber(operation.estimatedTokens)} · ${formatMoney(cost)}`;
}

function RunProgress({ snapshot, runtime, onBack, onCompleted }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
	onCompleted: () => void;
}) {
	const run = snapshot.run;
	const [focusedStageId, setFocusedStageId] = useState<VaultIntelligenceSnapshot['run']['stages'][number]['id'] | null>(run.currentStage ?? run.stages[0]?.id ?? null);
	const completed = run.status === 'completed';
	const resumable = run.status === 'interrupted';
	const overall = run.stages.length ? Math.round(run.stages.reduce((sum, stage) => sum + (stage.status === 'completed' || stage.status === 'partial' ? 1 : stage.status === 'running' ? progressRatio(stage) : 0), 0) / run.stages.length * 100) : 0;
	const indexStage = run.stages.find((stage) => stage.id === 'index');
	const indexProgress = indexStage ? Math.round(progressRatio(indexStage) * 100) : 0;
	const currentStage = run.stages.find((stage) => stage.id === focusedStageId) ?? run.stages[0] ?? null;
	const currentOperation = run.operations.find((operation) => operation.status === 'running') ?? null;
	const stageOperations = currentStage?.id === 'ai' ? run.operations : [];
	const relevantEvents = snapshot.events.filter((event) => !run.id || event.runId === run.id).slice(-8).reverse();
	const stageDescription = currentStage?.id === 'discover'
		? 'Prepare the frozen Scan input and a durable Vault baseline.'
		: currentStage?.id === 'index'
			? 'Build the selected Search and machine-knowledge outputs.'
			: currentStage?.id === 'ai'
				? 'Run only the AI operations selected in the saved Scan plan.'
				: 'Publish Peak-owned facts and reviewable follow-up without changing user files.';
	return <div className="pk-vi-page">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }, { label: 'Run progress' }]} />
		<section className="pk-vi-run-hero">
			<div><span className="pk-vi-selection-type">{completed ? 'Completed' : resumable ? 'Paused' : run.status === 'failed' ? 'Attention needed' : 'Scan in progress'}</span><span className="pk-vi-page-title">{completed ? 'Scan finished' : resumable ? 'Scan paused at a durable checkpoint' : run.status === 'failed' ? 'Scan failed' : 'Scanning the Vault'}</span><span className="pk-vi-page-description">Peak-owned index and review facts are being updated. Your files remain unchanged.</span></div>
			<div className="pk-vi-page-actions">{run.status === 'running' && <Button variant="ghost" onClick={() => runtime.requestStop()}><Pause size={15} />Pause at checkpoint</Button>}{resumable && <Button className="pk-vi-primary" onClick={() => void runtime.resumeScan()}><Play size={15} />Resume</Button>}{completed && <Button className="pk-vi-primary" onClick={onCompleted}>View completed work<ChevronRight size={15} /></Button>}</div>
		</section>
		<section className="pk-vi-run-progress-summary">
			<div><span><strong>Overall progress</strong><strong>{overall}%</strong></span><div className="pk-vi-progress-track"><i style={{ width: `${overall}%` }} /></div><small>{currentStage?.message ?? 'Waiting for a stage to start.'}</small></div>
			<div className="pk-vi-run-progress-facts"><span><small>Objects</small><strong>{currentStage?.processed.toLocaleString() ?? '0'} / {currentStage?.total.toLocaleString() || '—'}</strong></span><span><small>Current work</small><strong>{currentOperation?.currentPath ?? 'No object in flight'}</strong></span><span><small>AI usage</small><strong>{formatCompactNumber(run.operations.reduce((sum, operation) => sum + operation.usage.totalTokens, 0))} · {formatMoney(run.operations.reduce((sum, operation) => sum + operation.usage.costUsd, 0))}</strong></span></div>
		</section>
		<div className="pk-vi-run-stage-tabs" role="tablist" aria-label="Scan stages">{run.stages.map((stage, index) => <Button key={stage.id} variant="ghost" role="tab" aria-selected={focusedStageId === stage.id} className={`pk-vi-run-stage-tab is-${stage.status} ${focusedStageId === stage.id ? 'is-active' : ''}`} onClick={() => setFocusedStageId(stage.id)}><span>{index + 1}</span><strong>{stageLabel(stage.id)}</strong><StageState status={stage.status} /></Button>)}</div>
		<section className="pk-vi-run-stage-workspace" role="tabpanel">
			<div className="pk-vi-run-stage-workspace-head"><div><span className="pk-vi-card-title">{currentStage ? stageLabel(currentStage.id) : 'Scan stage'}</span><span className="pk-vi-card-caption">{stageDescription}</span></div><span>{currentStage ? `${currentStage.processed.toLocaleString()} of ${currentStage.total || '—'}` : 'Not available'}</span></div>
			{currentStage && <div className="pk-vi-progress-track"><i style={{ width: `${Math.round(progressRatio(currentStage) * 100)}%` }} /></div>}
			{currentStage?.id !== 'ai' && <div className="pk-vi-run-stage-rows"><span><strong>{currentStage?.id === 'discover' ? 'Frozen Scan input' : currentStage?.id === 'index' ? 'Knowledge Index' : 'Publish receipt'}</strong><small>{currentStage?.message ?? 'Not available'}</small></span><span><strong>{currentOperation?.currentPath ?? 'No object in flight'}</strong><small>{currentOperation ? operationLabel(currentOperation.id) : 'No runtime object detail has been published.'}</small></span><span><strong>{run.frozenPaths.length.toLocaleString()} frozen objects</strong><small>Scope and route remain fixed for this Scan.</small></span></div>}
			{currentStage?.id === 'ai' && <div className="pk-vi-run-operations">{stageOperations.length > 0 ? stageOperations.map((operation) => { const sharedOwner = sharedUsageOwner(operation.id); const owner = sharedOwner ? run.operations.find((candidate) => candidate.id === sharedOwner) : null; return <details key={operation.id} className="pk-vi-run-operation"><summary><span className={`pk-vi-operation-dot is-${operation.status}`} /><div><strong>{operationLabel(operation.id)}</strong><span>{operation.currentPath ?? operation.provider}</span></div><div><strong>{operation.model || 'Not configured'}</strong><span>{operation.processed}/{operation.total || '—'}</span></div><div>{owner && owner.usage.totalTokens > 0 ? <><strong>Shared receipt</strong><span>Included in {operationLabel(owner.id)}</span></> : <><strong>{formatCompactNumber(operation.usage.totalTokens)} tokens</strong><span>{formatMoney(operation.usage.costUsd)}</span></>}</div>{operation.status === 'waiting' || operation.status === 'running' ? <Button variant="ghost" size="sm" onClick={(event) => { event.preventDefault(); void runtime.skipOperation(operation.id); }}>Skip</Button> : <span className="pk-vi-operation-status">{operation.status}</span>}<ChevronDown size={15} /></summary><div className="pk-vi-operation-evidence"><span><small>Started</small><strong>{operation.startedAt ? formatDateTime(operation.startedAt) : 'Not started'}</strong></span><span><small>Completed</small><strong>{operation.completedAt ? formatDateTime(operation.completedAt) : 'Not completed'}</strong></span><div>{operation.evidence?.length ? operation.evidence.map((fact) => <span key={fact}>{fact}</span>) : <span>No runtime evidence has been recorded yet.</span>}</div>{operation.error && <span className="pk-vi-stale-warning"><CircleAlert size={14} />{operation.error}</span>}</div></details>; }) : <div className="pk-vi-empty">No AI operations were selected for this Scan.</div>}</div>}
		</section>
		<section className="pk-vi-run-events"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Run events</span><span className="pk-vi-card-caption">Durable runtime evidence for this Scan.</span></div></div>{relevantEvents.length > 0 ? <div>{relevantEvents.map((event) => <span key={event.id}><time>{formatDateTime(event.timestamp)}</time><strong>{event.detail}</strong></span>)}</div> : <div className="pk-vi-empty">No run events recorded yet.</div>}</section>
		{run.warnings.length > 0 && <section className="pk-vi-card pk-vi-warning-list"><strong>Partial results and warnings</strong>{run.warnings.map((warning) => <span key={warning}><CircleAlert size={14} />{warning}</span>)}</section>}
	</div>;
}

function Completed({ snapshot, onBack, onProgress, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
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
				<div className="pk-vi-completed-hero"><span className="pk-vi-complete-mark"><Check size={22} /></span><div><span className="pk-vi-page-title">Scan complete</span><span>{formatDateTime(completed.completedAt)}</span></div></div>
				<section className="pk-vi-completed-summary"><span><small>Scope</small><strong>{scopeLabel(completed.scopeMode)}</strong></span><span><small>Processed</small><strong>{formatNumber(completed.objectCount)}</strong></span><span><small>Search ready</small><strong>{completed.searchableCount === null ? '—' : formatNumber(completed.searchableCount)}</strong></span><span><small>Needs you</small><strong>{formatNumber(tasks.length)}</strong></span><span><small>Actual AI cost</small><strong>{formatMoney(completed.usage.costUsd)}</strong></span></section>
				<details className="pk-vi-disclosure"><summary><span><strong>Run details</strong><small>{completed.objectCount} objects · {elapsedLabel(completed.startedAt, completed.completedAt)} · {formatCompactNumber(completed.usage.totalTokens)} AI tokens · {formatMoney(completed.usage.costUsd)} actual</small></span><ChevronDown size={16} /></summary><div className="pk-vi-run-detail-grid"><span><strong>{formatCompactNumber(completed.usage.totalTokens)}</strong><small>Actual tokens</small></span><span><strong>{formatMoney(completed.usage.costUsd)}</strong><small>Actual spend</small></span><span><strong>Not available</strong><small>Models used</small></span><span><strong>{completed.receipts.filter((receipt) => receipt.status === 'completed').length} / {completed.receipts.length}</strong><small>AI operations completed</small></span></div></details>
				<details className="pk-vi-disclosure"><summary><span><strong>Completed automatically</strong><small>{completed.searchableCount === null ? 'Search readiness unavailable' : `${completed.searchableCount} searchable`} · Map receipt recorded · {completed.receipts.filter((receipt) => receipt.status === 'completed').length} receipts complete</small></span><ChevronDown size={16} /></summary><div className="pk-vi-receipts">{completed.receipts.map((receipt) => <div key={receipt.id}><span><strong>{receipt.label}</strong><small>{receipt.detail}</small></span><span><strong>{receipt.result}</strong><small>{receipt.ownerBoundary === 'peak-owned' ? 'Peak-owned state' : 'User-file boundary'}</small></span></div>)}</div></details>
				<WorkSurface tasks={tasks} origin="completed" onOpenTask={onOpenTask} />
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
	const [replacementTargets, setReplacementTargets] = useState<Record<string, string>>({});
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
	const proposal = proposals.find((candidate) => candidate.taskId === task.id && candidate.status === 'ready-review') ?? null;
	const appliedProposal = proposals.find((candidate) => candidate.taskId === task.id && candidate.status === 'applied') ?? null;
	const grouped = projection === 'file' ? groupAtomicItemsByFile(task) : groupAtomicItemsByPrimaryProjection(task);
	return <div className={`pk-vi-task-overlay is-${task.kind}`}>
		<section className="pk-vi-maintenance" role="dialog" aria-modal="true" aria-label={presentation.title}>
			<div className="pk-vi-dialog-bar"><span>{presentation.eyebrow}</span><Button variant="ghost" className="pk-vi-dialog-close" aria-label="Close maintenance task" onClick={onBack}><X size={17} /></Button></div>
			<div className="pk-vi-maintenance-head"><div><span className="pk-vi-selection-type">{presentation.eyebrow}</span><span className="pk-vi-page-title">{presentation.title}</span><span className="pk-vi-page-description">{presentation.description}</span></div><div><TaskState task={task} /><span className={`pk-vi-impact is-${task.impact}`}>{task.impact} impact</span></div></div>
			<div className="pk-vi-maintenance-summary"><strong>{task.affectedLabel}</strong><span>·</span><span>{task.contextLabel}</span><span>·</span><span>Source Scan {task.sourceRunId}</span></div>
			{task.state === 'recovery' && task.kind !== 'unreadable-files' && <div className="pk-vi-stale-warning"><CircleAlert size={16} /><span><strong>Source revision changed.</strong> The saved owner choice is preserved, but the affected item must be refreshed or reselected against current evidence before any file review can continue.</span></div>}
			<TaskSpecificWorkspace task={task} />
			<div className="pk-vi-owner-boundary"><BrainCircuit size={17} /><span><strong>{presentation.boundaryTitle}</strong> {presentation.boundaryDescription} One canonical decision set is shared by the primary and file projections; source-file changes remain guarded proposals until their exact diff is selected and applied.</span></div>
			<div className="pk-vi-maintenance-tools"><div className="pk-vi-segmented" aria-label="Group findings by"><span>Group by</span><Button variant="ghost" aria-pressed={projection === 'primary'} className={projection === 'primary' ? 'is-active' : ''} onClick={() => setProjection('primary')}>{presentation.primaryProjection}</Button><Button variant="ghost" aria-pressed={projection === 'file'} className={projection === 'file' ? 'is-active' : ''} onClick={() => setProjection('file')}>File</Button></div><div className="pk-vi-set-all"><span title="A Set all outcome replaces existing item overrides">Set all · replace overrides</span>{definition.choices.filter((choice) => choice.id !== 'another').map((choice) => <Button key={choice.id} variant="ghost" aria-pressed={task.defaultChoice?.choiceId === choice.id} disabled={choice.id === 'suggested' && task.atomicItems.some((item) => item.suggestedChoiceId !== 'suggested')} className={task.defaultChoice?.choiceId === choice.id ? 'is-active' : ''} onClick={() => void runtime.choose(task.id, null, choice.id)}>{choice.label}</Button>)}{task.kind === 'community-membership' && <CommunityPicker label="Set all Community" value={task.defaultChoice?.choiceId === 'another' ? task.defaultChoice.choiceValue ?? '' : ''} communities={communities} onChange={(community) => void runtime.choose(task.id, null, 'another', community)} />}</div></div>
				<div className="pk-vi-atomic-list">{grouped.map((group) => <details key={group.key} className="pk-vi-atomic-group" open><summary className="pk-vi-atomic-group-head"><strong>{group.label}</strong><span>{group.items.length} {presentation.itemLabel}{group.items.length === 1 ? '' : 's'} <ChevronDown size={14} /></span></summary>{group.items.map((item) => { const choice = item.ownerChoice ?? task.defaultChoice; const choiceDefinition = definition.choices.find((candidate) => candidate.id === choice?.choiceId); return <div key={item.id} className={`pk-vi-atomic-row ${choice ? 'is-decided' : 'is-undecided'}`}><div><span className="pk-vi-evidence-label">{presentation.evidenceLabel}</span><strong>{item.title}</strong><span>{item.evidence}</span>{item.filePath && <Button variant="ghost" size="sm" onClick={() => void runtime.openFile(item.filePath!)}><FileText size={14} />Open {item.filePath}</Button>}</div><div className="pk-vi-atomic-decision"><div className="pk-vi-choice-actions">{definition.choices.filter((candidate) => candidate.id !== 'another').map((candidate) => <Button key={candidate.id} variant="ghost" aria-pressed={choice?.choiceId === candidate.id} disabled={candidate.id === 'suggested' && item.suggestedChoiceId !== 'suggested'} className={choice?.choiceId === candidate.id ? 'is-active' : ''} onClick={() => void runtime.choose(task.id, item.id, candidate.id, candidate.id === 'redirect' ? replacementTargets[item.id] ?? item.suggestedValue ?? null : null)}>{candidate.label}{item.suggestedChoiceId === candidate.id && <small>Suggested</small>}</Button>)}{task.kind === 'broken-links' && <label className="pk-vi-replacement-target"><span>Redirect target</span><input value={replacementTargets[item.id] ?? item.suggestedValue ?? ''} placeholder="Existing note path or title" onChange={(event) => setReplacementTargets((current) => ({ ...current, [item.id]: event.target.value }))} /></label>}{task.kind === 'community-membership' && <CommunityPicker label={`Choose Community for ${item.title}`} value={choice?.choiceId === 'another' ? choice.choiceValue ?? '' : ''} communities={communities} onChange={(community) => void runtime.choose(task.id, item.id, 'another', community)} />}</div>{choiceDefinition ? <span className={`is-${choiceDefinition.boundary}`}>{choiceDefinition.description}{choice?.choiceValue ? ` Current owner choice: ${choice.choiceValue}.` : ''}</span> : <span>Choose an outcome for this {presentation.itemLabel}.</span>}</div></div>; })}</details>)}</div>
				<div className="pk-vi-maintenance-footer"><div><strong>{task.atomicItems.filter((item) => (item.ownerChoice ?? task.defaultChoice)?.choiceId !== undefined).length} of {task.atomicItems.length} decided</strong><span>{proposal ? 'A guarded per-file diff is ready on its own Review surface. User files remain unchanged.' : appliedProposal ? 'The source change was applied. Re-index and verify the original finding before closing this work.' : hasProposal ? decisionsSaved ? 'Review decisions are saved. User files are still unchanged until a guarded diff is prepared.' : 'Source-file choices are decisions only. No Markdown or YAML changes during this step.' : 'These choices update Peak-owned maintenance state only.'}</span></div><div><Button variant="ghost" onClick={onBack}>Close</Button>{!proposal && !appliedProposal && <Button className="pk-vi-primary" disabled={!canApply} onClick={() => void runtime.applyTask(task.id)}>{hasProposal ? decisionsSaved ? 'Review decisions saved' : taskDecisionActionLabel(task) : taskDecisionActionLabel(task)}</Button>}{hasProposal && decisionsSaved && !proposal && !appliedProposal && <Button className="pk-vi-primary" onClick={async () => { await runtime.prepareProposal(task.id); onOpenProposal(); }}>Prepare guarded diff</Button>}{proposal && <Button className="pk-vi-primary" onClick={onOpenProposal}>Review guarded diff</Button>}{appliedProposal && <Button className="pk-vi-primary" onClick={() => void runtime.verifyTask(task.id)}>Re-index & verify</Button>}{!hasProposal && <Button className="pk-vi-primary" disabled={!canVerify} onClick={() => void runtime.verifyTask(task.id)}>Verify</Button>}</div></div>
		</section>
	</div>;
}

function TaskSpecificWorkspace({ task }: { task: VaultMaintenanceTask }) {
	if (task.kind === 'file-properties') return <FilePropertiesWorkspace task={task} />;
	if (task.kind === 'broken-links') return <BrokenLinksWorkspace task={task} />;
	if (task.kind === 'community-membership') return <CommunityMembershipWorkspace task={task} />;
	if (task.kind === 'knowledge-connections') return <KnowledgeConnectionsWorkspace task={task} />;
	if (task.kind === 'related-notes') return <RelatedNotesWorkspace task={task} />;
	if (task.kind === 'note-split') return <NoteSplitWorkspace task={task} />;
	if (task.kind === 'community-structure') return <CommunityStructureWorkspace task={task} />;
	if (task.kind === 'community-hubs') return <CommunityHubsWorkspace task={task} />;
	if (task.kind === 'content-lifecycle') return <ContentLifecycleWorkspace task={task} />;
	if (task.kind === 'unreadable-files') return <UnreadableFilesWorkspace task={task} />;
	return <UnusualNotesWorkspace task={task} />;
}

function TaskWorkspaceCallout({ label, detail, evidence, boundary, task }: {
	label: string;
	detail: string;
	evidence: string;
	boundary: string;
	task: VaultMaintenanceTask;
}) {
	const examples = task.atomicItems.slice(0, 3);
	const sourceCount = new Set(task.atomicItems.map((item) => item.filePath).filter(Boolean)).size;
	const proposalCandidates = task.atomicItems.filter((item) => item.proposalPatch).length;
	return <section className={`pk-vi-domain-workspace is-${task.kind}`}>
		<div className="pk-vi-domain-callout"><span>{label}</span><strong>{detail}</strong><small>{boundary}</small></div>
		<div className="pk-vi-domain-stats"><span><small>Evidence items</small><strong>{task.atomicItems.length}</strong></span><span><small>Source files</small><strong>{sourceCount || '—'}</strong></span><span><small>Concrete diff inputs</small><strong>{proposalCandidates || '—'}</strong></span><span><small>Review state</small><strong>{task.state.replace('-', ' ')}</strong></span></div>
		{task.kind === 'note-split' && <div className="pk-vi-domain-document"><div><span className="pk-vi-evidence-label">Source note</span><strong>{examples[0]?.filePath ?? 'No source note available'}</strong><small>The source remains read-only on this review surface.</small></div><div>{examples.map((item) => <article key={item.id}><span>{item.projectionLabel ?? 'Candidate section'}</span><strong>{item.title}</strong><small>{item.evidence}</small></article>)}{examples.length === 0 && <span className="pk-vi-empty">No split evidence is available.</span>}</div></div>}
		{task.kind === 'content-lifecycle' && <div className="pk-vi-domain-lanes">{groupAtomicItemsByPrimaryProjection(task).slice(0, 4).map((group) => <section key={group.key}><span>{group.label}</span><strong>{group.items.length}</strong><small>{group.items.slice(0, 2).map((item) => item.title).join(' · ')}</small></section>)}{task.atomicItems.length === 0 && <span className="pk-vi-empty">No lifecycle evidence is available.</span>}</div>}
		{task.kind === 'unreadable-files' && <div className="pk-vi-domain-recovery">{examples.map((item) => <article key={item.id}><CircleAlert size={16} /><div><strong>{item.filePath ?? item.title}</strong><span>{item.evidence}</span></div><small>Retry through Index</small></article>)}{examples.length === 0 && <span className="pk-vi-empty">No recovery items remain.</span>}</div>}
		{task.kind !== 'note-split' && task.kind !== 'content-lifecycle' && task.kind !== 'unreadable-files' && <div className={`pk-vi-domain-evidence ${task.kind.includes('community') || task.kind === 'knowledge-connections' || task.kind === 'related-notes' ? 'is-relationship' : 'is-matrix'}`}><div><span className="pk-vi-evidence-label">{evidence}</span><strong>{task.kind.includes('community') || task.kind === 'knowledge-connections' || task.kind === 'related-notes' ? 'Relationship evidence in context' : 'What this task is asking you to decide'}</strong><small>The per-item controls below remain the only place that records an outcome; this panel explains the domain-specific evidence and write boundary.</small></div><div>{examples.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.evidence}</span>{item.projectionLabel && <small>{item.projectionLabel}</small>}</article>)}{examples.length === 0 && <span className="pk-vi-empty">No active items remain for this task.</span>}</div></div>}
	</section>;
}

function FilePropertiesWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Property batches" detail="Compare property values by source file and batch; accept a Peak-only categorization or request only a concrete YAML patch." evidence="Property finding" boundary="No YAML is written until a selected, source-hash-guarded patch is prepared." />; }
function BrokenLinksWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Link repair" detail="Resolve each missing target by keeping it, removing it, or naming one exact redirect target before a diff can exist." evidence="Broken reference" boundary="Only an exact one-match replacement may cross into a Markdown diff; unresolved links stay Peak-owned." />; }
function CommunityMembershipWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Community placement" detail="Review whether the indexed evidence supports a Community placement, with no automatic frontmatter rewrite." evidence="Membership evidence" boundary="Community membership is Peak knowledge by default; source changes need their own concrete proposal." />; }
function KnowledgeConnectionsWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Connection evidence" detail="Review each fragile bridge as an evidence-backed relation, rather than treating graph geometry as a source-edit instruction." evidence="Connection evidence" boundary="A graph decision is reversible Peak state; document edits remain guarded proposals." />; }
function RelatedNotesWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Related-note groups" detail="Decide whether similar notes should remain related, separate, or enter a concrete merge proposal." evidence="Similarity group" boundary="Similarity never grants write permission; a merge needs an explicit per-file patch." />; }
function NoteSplitWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Split review" detail="Keep the original note visible while deciding whether its evidence warrants a future Composer split proposal." evidence="Split evidence" boundary="No sections are routed or extracted from a source note by this review surface." />; }
function CommunityStructureWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Structure review" detail="Inspect the current computed grouping and record whether to keep or adjust its Peak-owned structure." evidence="Structure evidence" boundary="This does not create folders, links, tags, or frontmatter in the Vault." />; }
function CommunityHubsWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Hub coverage" detail="Review which Community evidence supports an index note, without pretending an index note has already been written." evidence="Hub evidence" boundary="An index-note edit is only possible after a separate, exact source-file proposal." />; }
function ContentLifecycleWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Lifecycle state" detail="Classify notes as active, paused, or finished without moving, archiving, or deleting their files." evidence="Lifecycle evidence" boundary="Lifecycle is Peak-owned context; a review outcome has no filesystem side effect." />; }
function UnreadableFilesWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Index recovery" detail="Use parser and Index evidence to decide whether a document should be retried or remain in recoverable follow-up." evidence="Parser or Index error" boundary="Recovery retries the existing Index pipeline and never rewrites or excludes user content here." />; }
function UnusualNotesWorkspace({ task }: { task: VaultMaintenanceTask }) { return <TaskWorkspaceCallout task={task} label="Unusual pattern" detail="Treat a structural anomaly as evidence to keep, connect, or prepare for source review—not as an automatic error." evidence="Unusual-pattern evidence" boundary="Peak records the choice until a separate exact diff makes a user-file change possible." />; }

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

function ProposalWorkspace({ task, proposal, runtime, onBack }: {
	task: VaultMaintenanceTask | null;
	proposal: VaultMaintenanceProposal | null;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
}) {
	if (!task || !proposal) return <div className="pk-vi-page"><Breadcrumb items={[{ label: 'Maintenance review', action: onBack }, { label: 'Proposal' }]} /><div className="pk-vi-empty">The prepared proposal is no longer available. Return to the maintenance review to refresh it.</div></div>;
	return <div className="pk-vi-page pk-vi-proposal-page">
		<Breadcrumb items={[{ label: 'Maintenance review', action: onBack }, { label: 'Review proposal' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-selection-type">Guarded source-file proposal</span><span className="pk-vi-page-title">Review exact changes before Apply</span><span className="pk-vi-page-description">{task.title}. Select the concrete changes you want; Peak re-checks every source SHA-256 immediately before writing.</span></div><span className="pk-vi-task-state is-ready-review">Ready review</span></div>
		<div className="pk-vi-proposal-layout"><ProposalReview proposal={proposal} runtime={runtime} /><aside className="pk-vi-proposal-safety"><section><ShieldCheck size={18} /><div><strong>Revision guarded</strong><span>Each diff is bound to the exact source hash captured when the proposal was prepared.</span></div></section><section><FileText size={18} /><div><strong>Selected changes only</strong><span>Unchecked changes remain untouched. A stale or ambiguous match fails closed.</span></div></section><section><RefreshCw size={18} /><div><strong>Verify is separate</strong><span>After Apply, re-index and verify the original finding before the work can close.</span></div></section></aside></div>
	</div>;
}

function ProposalReview({ proposal, runtime }: { proposal: VaultMaintenanceProposal; runtime: VaultIntelligenceWorkspaceRuntime }) {
	const selectedCount = proposal.changes.filter((change) => change.selected !== false).length;
	return <section className="pk-vi-proposal-review" aria-label="Prepared source file diff">
		<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Prepared source-file diff</span><span className="pk-vi-card-caption">Source content is guarded by its exact SHA-256 revision. Peak will re-check it immediately before Apply.</span></div><span className="pk-vi-task-state is-ready-review">Ready review</span></div>
		<div className="pk-vi-proposal-change-list">{proposal.changes.map((change) => <article key={change.id} className={`pk-vi-proposal-change ${change.selected === false ? 'is-unselected' : ''}`}><label className="pk-vi-proposal-selector"><input type="checkbox" checked={change.selected !== false} onChange={(event) => void runtime.setProposalChangeSelected(proposal.id, change.id, event.target.checked)} /><span>Select this change</span></label><div><strong>{change.path}</strong><small>{change.matchCount} matched occurrence{change.matchCount === 1 ? '' : 's'} · source revision {change.sourceMtime ?? 'unavailable'}</small></div><div className="pk-vi-diff"><pre><del>{change.beforeContext}</del></pre><pre><ins>{change.afterContext}</ins></pre></div></article>)}</div>
		{proposal.warnings.length > 0 && <div className="pk-vi-stale-warning"><CircleAlert size={16} /><span>{proposal.warnings.join(' ')}</span></div>}
		<div className="pk-vi-proposal-actions"><span>{selectedCount} of {proposal.changes.length} changes selected</span><Button variant="ghost" onClick={() => void runtime.rejectProposal(proposal.id)}>Reject diff</Button><Button className="pk-vi-primary" disabled={selectedCount === 0} onClick={() => void runtime.applyProposal(proposal.id)}>Apply selected changes</Button></div>
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

function maintenancePresentation(kind: VaultMaintenanceTask['kind']): MaintenancePresentation {
	if (kind === 'file-properties') return { eyebrow: 'Property maintenance', title: 'File property maintenance', description: 'Review each metadata finding by property batch or by source file before requesting a concrete proposal.', primaryProjection: 'Batch', evidenceLabel: 'Property finding', itemLabel: 'finding', boundaryTitle: 'Review does not write YAML.', boundaryDescription: 'Selected outcomes remain guarded decisions until a real proposed value and per-file diff are available in the owning editor.' };
	if (kind === 'broken-links') return { eyebrow: 'Broken Link Review', title: 'Resolve broken references', description: 'Work by missing target or by source file, with a specific outcome for every reference.', primaryProjection: 'Missing target', evidenceLabel: 'Broken reference evidence', itemLabel: 'reference', boundaryTitle: 'Every repair is explicit.', boundaryDescription: 'Redirect, create and remove outcomes require a source-file diff; keep-unresolved is Peak-owned.' };
	if (kind === 'community-membership') return { eyebrow: 'Community Membership', title: 'Place notes in the right Community', description: 'Review current structure and suggested membership without rewriting note metadata.', primaryProjection: 'Community', evidenceLabel: 'Membership evidence', itemLabel: 'note', boundaryTitle: 'Community membership is Peak-owned by default.', boundaryDescription: 'Only the explicit source-file option crosses into Markdown or YAML review.' };
	if (kind === 'knowledge-connections') return { eyebrow: 'Knowledge Connections', title: 'Review fragile or missing connections', description: 'Keep, update or replace each evidence-backed bridge.', primaryProjection: 'Connection', evidenceLabel: 'Connection evidence', itemLabel: 'connection', boundaryTitle: 'Graph decisions and document edits are separate.', boundaryDescription: 'Peak can record an expected bridge; document changes still require review.' };
	if (kind === 'related-notes') return { eyebrow: 'Related Notes', title: 'Decide how related notes should coexist', description: 'Review possible merge groups and typed relationships by group or by file.', primaryProjection: 'Related group', evidenceLabel: 'Similarity evidence', itemLabel: 'note', boundaryTitle: 'Similarity is evidence, not permission.', boundaryDescription: 'Merge choices remain proposals; related and separate choices are reversible Peak knowledge.' };
	if (kind === 'note-split') return { eyebrow: 'Note Split Review', title: 'Review note split findings', description: 'Keep the original source visible while deciding whether a concrete Composer proposal should be requested.', primaryProjection: 'Source note', evidenceLabel: 'Split evidence', itemLabel: 'finding', boundaryTitle: 'The source note stays unchanged.', boundaryDescription: 'Requesting or guiding a split only records the review decision on this surface; no line-routing diff exists yet.' };
	if (kind === 'community-structure') return { eyebrow: 'Community Structure', title: 'Review Community structure', description: 'Accept, adjust or retain the current grouping using the same canonical decisions.', primaryProjection: 'Community', evidenceLabel: 'Structure evidence', itemLabel: 'finding', boundaryTitle: 'Structure changes stay inside Peak.', boundaryDescription: 'This does not add folders, links or frontmatter to user files.' };
	if (kind === 'community-hubs') return { eyebrow: 'Community Hub Review', title: 'Review Community index notes', description: 'Inspect hub coverage before deciding whether an index-note update is warranted.', primaryProjection: 'Community', evidenceLabel: 'Hub evidence', itemLabel: 'index note', boundaryTitle: 'Index-note updates are proposals.', boundaryDescription: 'Keeping the current hub records intent without modifying a document.' };
	if (kind === 'content-lifecycle') return { eyebrow: 'Content Lifecycle', title: 'Choose the lifecycle state of these notes', description: 'Separate active work, paused material and finished material without moving files.', primaryProjection: 'Lifecycle state', evidenceLabel: 'Lifecycle evidence', itemLabel: 'note', boundaryTitle: 'Lifecycle is Peak-owned context.', boundaryDescription: 'Finished does not archive, move or delete the source file.' };
	if (kind === 'unreadable-files') return { eyebrow: 'Index Recovery', title: 'Recover unreadable documents', description: 'Retry the parser and Index pipeline, or leave the document in recovery for later.', primaryProjection: 'Index error', evidenceLabel: 'Parser or Index error', itemLabel: 'document', boundaryTitle: 'Recovery does not rewrite the document.', boundaryDescription: 'Retry uses the existing Index path. A durable Index exclusion writer is not exposed here, so this surface does not pretend to exclude files.' };
	return { eyebrow: 'Unusual Notes', title: 'Review unusual notes', description: 'Decide whether each unusual pattern should be connected, retained or prepared for source review.', primaryProjection: 'Finding type', evidenceLabel: 'Unusual-pattern evidence', itemLabel: 'note', boundaryTitle: 'Unusual does not mean wrong.', boundaryDescription: 'Peak records intent unless you explicitly choose a source-file proposal.' };
}

function Breadcrumb({ items }: { items: Array<{ label: string; action?: () => void }> }) {
	return <div className="pk-vi-breadcrumb">{items.map((item, index) => <React.Fragment key={`${item.label}:${index}`}>{index > 0 && <span>/</span>}{item.action ? <Button variant="ghost" onClick={item.action}>{index === 0 && <ArrowLeft size={14} />}{item.label}</Button> : <strong>{item.label}</strong>}</React.Fragment>)}</div>;
}

function TaskState({ task }: { task: VaultMaintenanceTask }) {
	const label = task.state === 'needs-choice' ? 'Needs choice' : task.state === 'needs-proposal' ? 'Proposal needed' : task.state === 'ready-review' ? 'Ready review' : task.state === 'ready-apply' ? 'Ready to verify' : task.state === 'recovery' ? 'Recovery' : 'Verified';
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
	if (filter === 'review') return task.state === 'ready-review' || task.state === 'ready-apply';
	return task.state === 'recovery';
}

function taskExitCondition(task: VaultMaintenanceTask): string {
	if (task.state === 'recovery') return 'Index retry succeeds; otherwise recovery remains open';
	if (task.state === 'needs-proposal') return 'A real per-file diff is generated or the request is rejected';
	if (task.state === 'ready-review') return 'Every proposal is accepted, rejected or deferred';
	if (task.state === 'ready-apply') return 'Recheck confirms the finding is closed';
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
	if (isSharedReviewOperation(id)) {
		return scope === 'entire';
	}
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
	if (id === 'ai') return 'AI work';
	return 'Publish';
}

function operationLabel(id: VaultIntelligenceSnapshot['run']['operations'][number]['id']): string {
	return DEFAULT_VAULT_INTELLIGENCE_CONFIG.scanOperations.find((operation) => operation.id === id)?.label ?? id;
}

function sharedUsageOwner(
	id: VaultIntelligenceSnapshot['run']['operations'][number]['id'],
): VaultIntelligenceSnapshot['run']['operations'][number]['id'] | null {
	if (id === 'ai-tags') return 'file-summaries';
	if (id !== 'relationship-discovery' && isSharedReviewOperation(id)) {
		return 'relationship-discovery';
	}
	return null;
}

function progressRatio(stage: VaultIntelligenceSnapshot['run']['stages'][number]): number {
	if (stage.status === 'completed' || stage.status === 'partial') return 1;
	if (!stage.total) return stage.status === 'running' ? 0.15 : 0;
	return Math.min(1, stage.processed / stage.total);
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
