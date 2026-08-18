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
	File,
	FileText,
	FolderKanban,
	GitBranch,
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
import type {
	VaultMaintenanceTask,
	VaultScanAiOperationPlan,
	VaultScanPlan,
	VaultScanScopeMode,
} from '@/core/types/vault-intelligence';
import {
	buildVaultIntelligenceGraph,
	createVaultScanPlan,
	toLocalDateKey,
	type VaultActivityDay,
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
	| { kind: 'surface'; surface: Surface; mapSurface?: MapSurface }
	| { kind: 'setup' }
	| { kind: 'progress' }
	| { kind: 'completed' }
	| { kind: 'task'; taskId: string; origin: 'completed' | 'queue' };
type WorkFilter = 'all' | 'choice' | 'review' | 'recovery';
type ActivityRange = 30 | 90 | 183 | 365;

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

export interface VaultIntelligenceWorkspaceProps {
	runtime: VaultIntelligenceWorkspaceRuntime;
}

export const VaultIntelligenceWorkspace: React.FC<VaultIntelligenceWorkspaceProps> = ({ runtime }) => {
	const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
	const [config, setConfig] = useState(DEFAULT_VAULT_INTELLIGENCE_CONFIG);
	const [route, setRoute] = useState<Route>({ kind: 'surface', surface: 'overview' });
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
					<Overview snapshot={snapshot} runtime={runtime} onRoute={setRoute} />
				)}
				{route.kind === 'surface' && route.surface === 'map' && (
					<VaultMap snapshot={snapshot} runtime={runtime} config={config} initialSurface={route.mapSurface ?? 'contents'} onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })} />
				)}
				{route.kind === 'surface' && route.surface === 'queue' && (
					<WorkQueue
						tasks={snapshot.tasks}
						onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })}
						onScan={() => setRoute({ kind: 'setup' })}
					/>
				)}
				{route.kind === 'setup' && (
					<ScanSetup snapshot={snapshot} config={config} onBack={() => setRoute({ kind: 'surface', surface: 'overview' })} onStart={(plan) => {
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
				{route.kind === 'task' && (
					<MaintenanceWorkspace
						task={snapshot.tasks.find((task) => task.id === route.taskId) ?? null}
						config={config}
						communities={uniqueStrings(snapshot.digest?.clusters.map((cluster) => cluster.label) ?? [])}
						runtime={runtime}
						onBack={() => setRoute(route.origin === 'completed' ? { kind: 'completed' } : { kind: 'surface', surface: 'queue' })}
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
	return (
		<header className="pk-vi-header">
			<div className="pk-vi-title-row">
				<div className="pk-vi-title-lockup"><span className="pk-vi-mark"><BrainCircuit size={20} /></span><span className="pk-vi-title">Vault Intelligence</span></div>
				<div className="pk-vi-header-status">
					{snapshot.lastCompletedRun ? <Button variant="ghost" onClick={() => onRoute({ kind: 'completed' })}>Last scan {formatDateTime(snapshot.lastCompletedRun.completedAt)}<ChevronRight size={13} /></Button> : <span>Baseline not established</span>}
					{snapshot.changedSinceScan !== null && snapshot.changedSinceScan > 0 && <span>· {formatNumber(snapshot.changedSinceScan)} changed</span>}
				</div>
				<Button className="pk-vi-primary" onClick={onPrimary}>
					{active ? <Activity size={17} /> : resumable ? <Play size={17} /> : <ScanSearch size={17} />}
					{active ? 'View progress' : resumable ? 'Resume scan' : 'Scan Vault'}
				</Button>
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

function Overview({ snapshot, runtime, onRoute }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onRoute: (route: Route) => void;
}) {
	const openTasks = rankTasks(snapshot.tasks.filter((task) => task.state !== 'verified')).slice(0, 7);
	const priority = openTasks[0] ?? null;
	return (
		<div className="pk-vi-page pk-vi-overview">
			<section className="pk-vi-object-grid" aria-label="Vault objects">
				{snapshot.objects.map((object) => {
					const Icon = object.id === 'files' ? File : object.id === 'chats' ? MessageSquare : object.id === 'projects' ? FolderKanban : PenLine;
					return <Button key={object.id} variant="ghost" className="pk-vi-object-card" onClick={() => void runtime.openOwnerSurface(object.id)} title={object.detail}>
						<span className="pk-vi-object-icon"><Icon size={19} /></span><span className="pk-vi-object-value">{formatNumber(object.count)}</span><span className="pk-vi-object-label">{object.label}</span><span className="pk-vi-object-popover"><strong>{object.label}</strong><span>{object.detail}</span><small>Open owner surface <ChevronRight size={12} /></small></span>
					</Button>;
				})}
			</section>
			<section className="pk-vi-card pk-vi-continue">
				<div className="pk-vi-card-head"><span className="pk-vi-card-title">Continue work</span><span className="pk-vi-card-head-actions"><small>Top {Math.min(7, openTasks.length)}</small><Button variant="ghost" size="sm" onClick={() => onRoute({ kind: 'surface', surface: 'queue' })}>View all {snapshot.tasks.filter((task) => task.state !== 'verified').length}<ChevronRight size={15} /></Button></span></div>
				<div className="pk-vi-continue-summary">
					<span><Clock3 size={14} /><small>Since last scan</small></span>
					<span><strong>{snapshot.changedSinceScan === null ? '—' : formatNumber(snapshot.changedSinceScan)}</strong><small>Vault items changed</small></span>
					<span><strong>{snapshot.digest ? `+${formatNumber(snapshot.digest.communityLinks?.length ?? 0)}` : '—'}</strong><small>current connections</small></span>
					<span><strong>{snapshot.digest ? formatNumber(snapshot.digest.counts.orphans ?? 0) : '—'}</strong><small>notes need a home</small></span>
					<span><strong>{formatNumber(snapshot.tasks.filter((task) => task.kind === 'content-lifecycle' && task.state !== 'verified').length)}</strong><small>work states need review</small></span>
				</div>
				<CompactTaskList tasks={openTasks} onOpen={(taskId) => onRoute({ kind: 'task', taskId, origin: 'queue' })} />
			</section>
			<div className="pk-vi-overview-secondary">
					<section className="pk-vi-card pk-vi-readiness-card">
						<div className="pk-vi-card-head"><span className="pk-vi-card-title">Knowledge Index</span><span className={`pk-vi-readiness-state ${snapshot.indexReadiness.isReady ? 'is-ready' : 'is-pending'}`}>{snapshot.indexReadiness.isReady ? 'Search ready' : 'Needs attention'}</span></div>
						<div className="pk-vi-readiness-grid"><span><small>Discovered</small><strong>{formatNumber(snapshot.indexReadiness.discovered)}</strong></span><span><small>Search ready</small><strong>{snapshot.indexReadiness.searchReady === null ? '—' : formatNumber(snapshot.indexReadiness.searchReady)}</strong></span><span><small>Pending / excluded</small><strong>{snapshot.indexReadiness.pendingOrExcluded === null ? '—' : formatNumber(snapshot.indexReadiness.pendingOrExcluded)}</strong></span></div>
						<span className="pk-vi-card-caption">{snapshot.indexReadiness.builtAt ? `Last built ${formatDateTime(snapshot.indexReadiness.builtAt)}` : 'No completed Index build is recorded yet.'}</span>
					</section>
					<section className="pk-vi-card pk-vi-priority-card">
						<div className="pk-vi-card-head"><span className="pk-vi-card-title">Priority now</span></div>
						{priority ? <Button variant="ghost" className="pk-vi-priority-action" onClick={() => onRoute({ kind: 'task', taskId: priority.id, origin: 'queue' })}><span><small>{priority.typeLabel}</small><strong>{priority.title}</strong><span>{priority.affectedLabel} · {priority.contextLabel}</span></span><ChevronRight size={16} /></Button> : <div className="pk-vi-empty"><Check size={18} />No unresolved owner action.</div>}
					</section>
					<section className="pk-vi-card">
						<div className="pk-vi-card-head"><span className="pk-vi-card-title">What changed</span></div>
						<div className="pk-vi-change-list">
							<div><strong>{snapshot.changedSinceScan === null ? '—' : formatNumber(snapshot.changedSinceScan)}</strong><span>{snapshot.changedSinceScan === null ? 'Available after the first full Scan' : 'Files modified since the baseline'}</span></div>
							<div><strong>{snapshot.changedCursorAt ? formatNumber(snapshot.recentActivity.filter((record) => record.timestamp > snapshot.changedCursorAt!).length) : '—'}</strong><span>Recorded VI actions since the baseline</span></div>
							<div><strong>—</strong><span>Structure delta is not published yet</span></div>
							<div><strong>—</strong><span>Chat, Project and Composer delta is not unified yet</span></div>
						</div>
					</section>
					<section className="pk-vi-card">
						<div className="pk-vi-card-head"><span className="pk-vi-card-title">Vault activity</span><Button variant="ghost" size="sm" onClick={() => onRoute({ kind: 'surface', surface: 'map', mapSurface: 'activity' })}>Open activity<ChevronRight size={15} /></Button></div>
						<MiniActivity days={mergeRecordedActivity(snapshot.activityDays, snapshot.recentActivity)} />
					</section>
			</div>
			{snapshot.loading && <div className="pk-vi-loading"><RefreshCw size={18} className="pk-vi-spin" />Reading current Vault state…</div>}
		</div>
	);
}

function CompactTaskList({ tasks, onOpen }: { tasks: VaultMaintenanceTask[]; onOpen: (taskId: string) => void }) {
	if (tasks.length === 0) return <div className="pk-vi-empty"><Check size={19} />No unresolved maintenance work.</div>;
	return <div className="pk-vi-compact-tasks">{tasks.map((task) => (
		<Button key={task.id} variant="ghost" className="pk-vi-compact-task" onClick={() => onOpen(task.id)}>
			<span className="pk-vi-task-name"><small>{task.typeLabel}</small><strong>{task.title}</strong></span>
			<span className="pk-vi-task-affected"><strong>{task.affectedLabel}</strong><span>· {task.contextLabel}</span></span>
			<TaskStatus task={task} /><ChevronRight size={16} />
		</Button>
	))}</div>;
}

function VaultMap({ snapshot, runtime, config, initialSurface, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	initialSurface: MapSurface;
	onOpenTask: (taskId: string) => void;
}) {
	const [surface, setSurface] = useState<MapSurface>(initialSurface);
	return <div className="pk-vi-page">
		<div className="pk-vi-page-head pk-vi-map-head"><div><span className="pk-vi-page-title">{surface === 'contents' ? 'Vault contents · file types in context' : 'Activity'}</span><span className="pk-vi-page-description">{surface === 'contents' ? 'Choose an actual file type, then see where it fits in the knowledge structure and what Peak can currently use.' : 'Timestamped local evidence by recorded source. Work sessions group real VI receipts; no topic is guessed.'}</span></div><span className="pk-vi-map-freshness">{snapshot.indexReadiness.builtAt ? `Index built ${formatDateTime(snapshot.indexReadiness.builtAt)}` : 'No completed Index build'}</span></div>
		<div className="pk-vi-local-nav">
			<Button variant="ghost" className={surface === 'contents' ? 'is-active' : ''} onClick={() => setSurface('contents')}>Vault contents</Button>
			<Button variant="ghost" className={surface === 'activity' ? 'is-active' : ''} onClick={() => setSurface('activity')}>Activity</Button>
		</div>
		{surface === 'contents' ? <VaultContents snapshot={snapshot} runtime={runtime} config={config} onOpenTask={onOpenTask} /> : <ActivityView snapshot={snapshot} />}
	</div>;
}

function VaultContents({ snapshot, runtime, config, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	onOpenTask: (taskId: string) => void;
}) {
	const [selectedExtension, setSelectedExtension] = useState<string | null>(null);
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
		<FileTypeDistribution snapshot={snapshot} config={config} selected={selectedExtension} onSelect={setSelectedExtension} />
		<KnowledgeGraph snapshot={snapshot} runtime={runtime} selectedExtension={selectedExtension} />
		{snapshot.tasks.some((task) => task.kind === 'community-membership' || task.kind === 'community-structure' || task.kind === 'unusual-notes') && (
			<section className="pk-vi-card pk-vi-map-annotation"><div><strong>Structural maintenance is available</strong><span>Evidence is annotated here; decisions and verification stay in Work queue.</span></div><Button variant="ghost" onClick={() => onOpenTask(snapshot.tasks.find((task) => task.kind === 'community-membership' || task.kind === 'community-structure' || task.kind === 'unusual-notes')!.id)}>Open task<ChevronRight size={15} /></Button></section>
		)}
	</div>;
}

function FileTypeDistribution({ snapshot, config, selected, onSelect }: {
	snapshot: VaultIntelligenceSnapshot;
	config: VaultIntelligenceConfig;
	selected: string | null;
	onSelect: (extension: string | null) => void;
}) {
	const shown = snapshot.fileTypes.slice(0, 16);
	const stops: string[] = [];
	let cursor = 0;
	shown.forEach((type, index) => {
		const next = cursor + type.share * 100;
		stops.push(`${config.fileTypeColors[index % config.fileTypeColors.length]} ${cursor}% ${next}%`);
		cursor = next;
	});
	if (cursor < 100) stops.push(`#dedce4 ${cursor}% 100%`);
	return <section className="pk-vi-card pk-vi-file-types">
		<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Files by actual type</span><span className="pk-vi-card-caption">Select a type to focus the knowledge map without changing the source Vault.</span></div><Button variant="ghost" size="sm" onClick={() => onSelect(null)} className={!selected ? 'is-active' : ''}>All files</Button></div>
		<div className="pk-vi-file-type-body">
			<div className="pk-vi-donut" style={{ background: `conic-gradient(${stops.join(', ')})` }}><span><strong>{formatNumber(snapshot.fileTypes.reduce((sum, type) => sum + type.count, 0))}</strong><small>files</small></span></div>
			<div className="pk-vi-file-type-list">{shown.map((type, index) => <Button key={type.extension} variant="ghost" className={selected === type.extension ? 'is-active' : ''} onClick={() => onSelect(selected === type.extension ? null : type.extension)}>
				<i style={{ backgroundColor: config.fileTypeColors[index % config.fileTypeColors.length] }} /><span>.{type.extension}</span><strong>{formatNumber(type.count)}</strong><small>{Math.round(type.share * 100)}%</small>
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
	const model = useMemo(() => buildVaultIntelligenceGraph(snapshot.digest, { extension: selectedExtension }), [snapshot.digest, selectedExtension]);
	const selected = model?.nodes.find((node) => node.id === selectedNodeId) ?? null;
	const communityCount = snapshot.digest?.clusters.length ?? 0;
	return <div className="pk-vi-graph-layout">
		<section className="pk-vi-card pk-vi-graph-card">
			<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Knowledge map{selectedExtension ? ` · .${selectedExtension}` : ''}</span><span className="pk-vi-card-caption">Knowledge communities contain representative Topics and Hubs; lines show verified references.</span></div><div className="pk-vi-segmented pk-vi-graph-presets"><Button variant="ghost" className={preset === 'constellation' ? 'is-active' : ''} onClick={() => setPreset('constellation')}>Constellation</Button><Button variant="ghost" className={preset === 'flow-lr' ? 'is-active' : ''} onClick={() => setPreset('flow-lr')}><ArrowRight size={13} />Flow</Button><Button variant="ghost" className={preset === 'flow-tb' ? 'is-active' : ''} onClick={() => setPreset('flow-tb')}><ArrowDown size={13} />Flow</Button><Button variant="ghost" className={preset === 'orbit' ? 'is-active' : ''} onClick={() => setPreset('orbit')}>Orbit</Button></div></div>
			<div className="pk-vi-graph-canvas"><AtlasGraphCanvas model={model} preset={preset} showSemantic={false} layerLabel="Verified references" showMiniMap emptyLabel="Build the Knowledge Index to see current Communities." onNodeTap={(node) => setSelectedNodeId((current) => current === node.id ? null : node.id)} onNodeDblTap={(node) => { if (!node.path.startsWith('community:')) void runtime.openFile(node.path); }} /></div>
			<div className="pk-vi-graph-legend"><span><i className="is-community" />Community</span><span><i className="is-topic" />Topic / Hub</span><span><b className="is-contains" />contains</span><span><b className="is-reference" />reference</span></div>
		</section>
		<section className="pk-vi-graph-context" aria-label="Map context">
			<div className="pk-vi-card"><div className="pk-vi-context-label"><GitBranch size={16} />Structure</div><strong>{communityCount > 0 ? `${formatNumber(communityCount)} Communities` : 'No Communities available'}</strong><span>{model ? `${formatNumber(model.nodes.length)} visible nodes · ${formatNumber(model.edges.length)} verified relations` : 'Build the Knowledge Index to derive structure.'}</span></div>
			<div className="pk-vi-card pk-vi-selection-context"><div className="pk-vi-selection"><div className="pk-vi-card-head"><span className="pk-vi-card-title">Selection</span>{selected && <Button variant="ghost" size="sm" onClick={() => setSelectedNodeId(null)}>Clear<X size={14} /></Button>}</div>{selected ? <><span className="pk-vi-selection-type">{String(selected.metadata?.kind ?? selected.role)}</span><strong>{selected.label}</strong><span>{selected.path.startsWith('community:') ? `${selected.constituentCount ?? 0} notes in this Community` : selected.path}</span>{Array.isArray(selected.metadata?.topics) && <div className="pk-vi-topic-list">{(selected.metadata.topics as string[]).map((topic) => <span key={topic}>{topic}</span>)}</div>}</> : <div className="pk-vi-empty">Select a Community, Topic or Hub to inspect current evidence.</div>}</div><div className="pk-vi-interpretation"><div className="pk-vi-context-label"><Sparkles size={16} />AI interpretation</div><strong>Not generated</strong><span>{selected ? 'No AI claim is stored for this selection. Run an enabled Community analysis to create reviewable evidence.' : 'Select a node first. The map does not invent themes from geometry.'}</span></div></div>
		</section>
	</div>;
}

function ActivityView({ snapshot }: { snapshot: VaultIntelligenceSnapshot }) {
	const [range, setRange] = useState<ActivityRange>(365);
	const calendar = useMemo(() => calendarDays(mergeRecordedActivity(snapshot.activityDays, snapshot.recentActivity), range), [snapshot.activityDays, snapshot.recentActivity, range]);
	const calendarDates = new Set(calendar.map((day) => day.date));
	const periodFileChanges = snapshot.activityDays.filter((day) => calendarDates.has(day.date)).reduce((sum, day) => sum + day.count, 0);
	const periodRecords = snapshot.recentActivity.filter((record) => calendarDates.has(toLocalDateKey(new Date(record.timestamp))));
	const buckets = bucketRecordedActivity(calendar, periodRecords, 36);
	const maxFile = Math.max(1, ...buckets.map((bucket) => bucket.fileCount));
	const maxReceipt = Math.max(1, ...buckets.map((bucket) => bucket.receiptCount));
	const sessions = buildRecordedSessions(periodRecords).slice(0, 6);
	const activeDays = calendar.filter((day) => day.count > 0).length;
	return <div className="pk-vi-activity-workspace">
		<section className="pk-vi-activity-mode"><div className="pk-vi-segmented"><Button variant="ghost" className="is-active">Recorded activity</Button><Button variant="ghost" disabled title="No Activity analysis run is stored">AI themes · Not analyzed</Button></div><span>Current coverage: each file's latest modification timestamp and Vault Intelligence receipts. Chat, Project and Composer activity are not yet unified here.</span></section>
		<div className="pk-vi-activity-layout">
			<section className="pk-vi-card pk-vi-activity-timeline">
				<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Recorded source timeline</span><span className="pk-vi-card-caption">Each lane keeps its source contract visible. Empty space means no recorded evidence.</span></div><div className="pk-vi-segmented" aria-label="Activity range">{([[30, '30d'], [90, '90d'], [183, '6m'], [365, '1y']] as const).map(([value, label]) => <Button key={value} variant="ghost" className={range === value ? 'is-active' : ''} onClick={() => setRange(value)}>{label}</Button>)}</div></div>
				<div className="pk-vi-timeline-axis"><span>{buckets[0]?.label ?? 'Start'}</span><span>{buckets[Math.floor(buckets.length / 2)]?.label ?? ''}</span><span>{buckets[buckets.length - 1]?.label ?? 'Today'}</span></div>
				<ActivityLane label="File edits" detail="Latest file modification timestamp" buckets={buckets} value={(bucket) => bucket.fileCount} max={maxFile} tone="files" />
				<ActivityLane label="Vault Intelligence" detail="Scan and owner-action receipts" buckets={buckets} value={(bucket) => bucket.receiptCount} max={maxReceipt} tone="receipts" />
				<div className="pk-vi-activity-gap"><MessageSquare size={15} /><span><strong>Chat, Project and Composer</strong><small>No unified activity stream is available yet.</small></span></div>
			</section>
			<aside className="pk-vi-activity-aside">
				<section className="pk-vi-card pk-vi-period-card"><div className="pk-vi-card-head"><span className="pk-vi-card-title">Period summary</span></div><div className="pk-vi-period-stats"><span><small>Range</small><strong>{range === 365 ? '1 year' : `${range} days`}</strong></span><span><small>Active days</small><strong>{formatNumber(activeDays)}</strong></span><span><small>File edits</small><strong>{formatNumber(periodFileChanges)}</strong></span><span><small>VI receipts</small><strong>{formatNumber(periodRecords.length)}</strong></span></div></section>
				<section className="pk-vi-card pk-vi-session-card"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Recorded work sessions</span><span className="pk-vi-card-caption">Grouped from real VI receipts, not inferred from file timestamps.</span></div></div><div className="pk-vi-session-list">{sessions.map((session) => <div key={session.key}><span><strong>{session.label}</strong><small>{session.summary}</small></span><b>{session.count}</b></div>)}{sessions.length === 0 && <div className="pk-vi-empty">No Vault Intelligence receipts in this range.</div>}</div></section>
				<section className="pk-vi-card pk-vi-theme-card"><div className="pk-vi-context-label"><Sparkles size={16} />AI themes</div><strong>Not analyzed</strong><span>Run an explicit analysis before Peak publishes themes for this period.</span></section>
			</aside>
		</div>
	</div>;
}

function WorkQueue({ tasks, onOpenTask, onScan }: { tasks: VaultMaintenanceTask[]; onOpenTask: (taskId: string) => void; onScan: () => void }) {
	return <div className="pk-vi-page"><div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Work queue</span><span className="pk-vi-page-description">Only unresolved work with an owner action and a verifiable exit condition belongs here.</span></div><Button className="pk-vi-primary" onClick={onScan}><ScanSearch size={16} />Scan Vault</Button></div><WorkSurface tasks={tasks.filter((task) => task.state !== 'verified')} origin="queue" onOpenTask={onOpenTask} onScan={onScan} /></div>;
}

function WorkSurface({ tasks, origin, onOpenTask, onScan }: { tasks: VaultMaintenanceTask[]; origin: 'queue' | 'completed'; onOpenTask: (taskId: string) => void; onScan?: () => void }) {
	const [filter, setFilter] = useState<WorkFilter>('all');
	const [query, setQuery] = useState('');
	const filtered = tasks.filter((task) => {
		if (filter !== 'all' && !taskMatchesWorkFilter(task, filter)) return false;
		const text = `${task.title} ${task.typeLabel} ${task.affectedLabel} ${task.contextLabel}`.toLocaleLowerCase();
		return !query.trim() || text.includes(query.trim().toLocaleLowerCase());
	});
	const count = (workFilter: WorkFilter) => workFilter === 'all' ? tasks.length : tasks.filter((task) => taskMatchesWorkFilter(task, workFilter)).length;
	return <section className="pk-vi-work-surface">
		<div className="pk-vi-work-head"><div><strong>{tasks.length} maintenance {tasks.length === 1 ? 'task' : 'tasks'} {origin === 'completed' ? 'need you' : 'still need you'}</strong><span>{origin === 'completed' ? 'Created by this Scan' : 'Current canonical queue'}</span></div><span className="pk-vi-work-guidance">Owner choice → review or recovery → apply → verify</span></div>
		<div className="pk-vi-work-tools"><div className="pk-vi-filter-bar">{([
			['all', 'All'], ['choice', 'Needs your choice'], ['review', 'Ready for review'], ['recovery', 'Needs recovery'],
		] as const).map(([id, label]) => <Button key={id} variant="ghost" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}<span>{count(id)}</span></Button>)}</div><label className="pk-vi-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label></div>
		<div className="pk-vi-work-table"><div className="pk-vi-work-columns"><span>Task</span><span>Affected</span><span>State</span><span /></div>{filtered.map((task) => <Button key={task.id} variant="ghost" className="pk-vi-work-row" title={taskExitCondition(task)} onClick={() => onOpenTask(task.id)}>
			<span className="pk-vi-task-name"><small>{task.typeLabel}</small><strong>{task.title}</strong></span><span className="pk-vi-task-affected"><strong>{task.affectedLabel}</strong><span>· {task.contextLabel}</span></span><TaskStatus task={task} /><ChevronRight size={17} />
		</Button>)}{filtered.length === 0 && <div className="pk-vi-work-empty"><span className="pk-vi-empty-mark"><Check size={20} /></span><div><strong>{tasks.length === 0 ? 'No unresolved maintenance work' : 'No tasks match this view'}</strong><span>{tasks.length === 0 ? 'Run a Scan when you want Peak to refresh the evidence and prepare follow-up work.' : 'Change the filter or search query to see another part of the queue.'}</span></div>{tasks.length === 0 && onScan && <Button className="pk-vi-primary" onClick={onScan}><ScanSearch size={15} />Scan Vault</Button>}</div>}</div>
	</section>;
}

function ScanSetup({ snapshot, config, onBack, onStart }: {
	snapshot: VaultIntelligenceSnapshot;
	config: VaultIntelligenceConfig;
	onBack: () => void;
	onStart: (plan: VaultScanPlan) => void;
}) {
	const [scopeMode, setScopeMode] = useState<VaultScanScopeMode>(snapshot.changedCursorAt ? 'changed' : 'entire');
	const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
	const [pathQuery, setPathQuery] = useState('');
	const allChecks = config.checkGroups.flatMap((group) => group.checks);
	const displayedCheckGroups = [...config.checkGroups].sort(
		(left, right) => (left.displayOrder ?? 99) - (right.displayOrder ?? 99),
	);
	const [checkIds, setCheckIds] = useState(() => new Set(allChecks.map((check) => check.checkId)));
	const [operations, setOperations] = useState<VaultScanAiOperationPlan[]>(() => resolvedOperationPlans(config, snapshot));
	useEffect(() => {
		setCheckIds(new Set(config.checkGroups.flatMap((group) => group.checks.map((check) => check.checkId))));
		setOperations(resolvedOperationPlans(config, snapshot));
	}, [config, snapshot.operationRoutes]);
	const matchingPaths = pathQuery.trim() ? snapshot.availablePaths.filter((path) => path.toLocaleLowerCase().includes(pathQuery.toLocaleLowerCase())).slice(0, 8) : [];
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
		enabled: operation.enabled && operationAvailableForScope(operation.id, scopeMode),
		estimatedTokens: Math.round(operation.estimatedTokens * estimateScale),
		estimatedCostUsd: operation.estimatedCostUsd * estimateScale,
	}));
	const selectedOps = plannedOperations.filter((operation) => operation.enabled);
	const estimatedTokens = selectedOps.reduce((sum, operation) => sum + operation.estimatedTokens, 0);
	const estimatedCost = selectedOps.reduce((sum, operation) => sum + operation.estimatedCostUsd, 0);
	const start = () => onStart({
		scope: { mode: scopeMode, selectedPaths },
		enabledCheckIds: [...checkIds],
		aiOperations: plannedOperations,
		createdAt: Date.now(),
	});
	return <div className="pk-vi-page pk-vi-scan-setup">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }]} />
		<section className="pk-vi-scan-hero"><div><span className="pk-vi-ready-mark"><ShieldCheck size={22} /></span><span><strong>Prepare a safe Vault scan</strong><small>Choose what Peak should examine, then review AI models and estimated usage. Your current Vault stays available while it runs.</small></span></div><div className="pk-vi-safety-facts"><span><small>Last successful scan</small><strong>{snapshot.changedCursorAt ? formatDateTime(snapshot.changedCursorAt) : 'First full Scan required'}</strong></span><span><small>Current Vault view</small><strong>Stays usable until publish</strong></span><span><small>User files</small><strong>No automatic edits</strong></span></div></section>
		<SetupSection number="1" title="Choose scan scope" status={scopeMode === 'selected' ? `${selectedPaths.length} selected` : scopeMode === 'changed' ? `${snapshot.changedSinceScan ?? 0} changed` : `${snapshot.availablePaths.length} files`}>
			<div className="pk-vi-choice-grid">{([
				['changed', 'Since last scan', snapshot.changedCursorAt ? 'Only objects changed since the latest completed Scan.' : 'Available after the first completed full Scan.'],
				['selected', 'Choose a scope', 'Search and select exact Vault files.'],
				['entire', 'Entire Vault', 'Rebuild the full Vault scope explicitly.'],
			] as const).map(([id, label, description]) => <Button key={id} variant="ghost" disabled={id === 'changed' && !snapshot.changedCursorAt} className={scopeMode === id ? 'is-active' : ''} onClick={() => setScopeMode(id)}><strong>{label}</strong><span>{description}</span></Button>)}</div>
			{scopeMode === 'selected' && <div className="pk-vi-path-picker"><label><Search size={15} /><input value={pathQuery} onChange={(event) => setPathQuery(event.target.value)} placeholder="Search Vault files" /></label>{matchingPaths.length > 0 && <div className="pk-vi-path-results">{matchingPaths.map((path) => <Button key={path} variant="ghost" onClick={() => { setSelectedPaths((current) => current.includes(path) ? current : [...current, path]); setPathQuery(''); }}><FileText size={14} /><span>{path}</span><Check size={14} /></Button>)}</div>}<div className="pk-vi-selected-paths">{selectedPaths.map((path) => <span key={path}>{path}<Button variant="ghost" size="icon" onClick={() => setSelectedPaths((current) => current.filter((candidate) => candidate !== path))} aria-label={`Remove ${path}`}><X size={13} /></Button></span>)}</div></div>}
		</SetupSection>
		<SetupSection number="2" title="Choose scan tasks" status={`${checkIds.size} of ${allChecks.length} tasks selected`}>
			<span className="pk-vi-section-description">Select the maintenance task categories Peak should run. Every deterministic check still produces a truthful receipt.</span>
			<div className="pk-vi-check-group-grid">{displayedCheckGroups.map((group) => { const selectedCount = group.checks.filter((check) => checkIds.has(check.checkId)).length; const selected = selectedCount === group.checks.length; return <Button key={group.id} variant="ghost" className={`pk-vi-check-group-card ${selected ? 'is-active' : ''}`} onClick={() => setCheckIds((current) => { const next = new Set(current); for (const check of group.checks) { if (selected) next.delete(check.checkId); else next.add(check.checkId); } return next; })}><span className="pk-vi-check-mark">{selected && <Check size={14} />}</span><strong>{group.label}</strong><small>{group.checks.length} tasks</small></Button>; })}</div>
			<div className="pk-vi-scan-plan-row"><Search size={16} /><span><strong>Knowledge Index plan</strong><small>Full-text + Embeddings · {allChecks.length} deterministic tasks · reviewable follow-up remains guarded</small></span><strong>{scopeObjectCount} objects</strong><ChevronRight size={15} /></div>
		</SetupSection>
		<SetupSection number="3" title="Review AI operations" status={`${selectedOps.length} enabled`}>
			<div className="pk-vi-operation-groups">{(['index', 'vault', 'follow-up'] as const).map((group) => <section key={group} className="pk-vi-operation-group"><div className="pk-vi-operation-group-head"><strong>{operationGroupLabel(group)}</strong><span>{operationGroupDescription(group)}</span></div><div className="pk-vi-operation-list">{config.scanOperations.filter((definition) => definition.group === group).map((definition) => { const operation = plannedOperations.find((candidate) => candidate.id === definition.id)!; const routeAvailable = snapshot.operationRoutes[operation.id]?.available ?? true; const scopeAvailable = operationAvailableForScope(operation.id, scopeMode); const available = routeAvailable && scopeAvailable; const shared = sharedExecutionLabel(operation.id); return <div key={definition.id} className={`pk-vi-operation-row ${available ? '' : 'is-unavailable'}`}><div><strong>{definition.label}</strong><span>{definition.description}{shared ? ` · ${shared}` : ''}</span></div><div className="pk-vi-operation-route"><strong>{operation.model}</strong><span>{operation.provider}</span></div><span>{formatCompactNumber(operation.estimatedTokens)} · {formatMoney(operation.estimatedCostUsd)}</span><Button variant="ghost" disabled={!available} className={operation.enabled ? 'is-on' : ''} onClick={() => setOperations((current) => toggleOperationExecutionGroup(current, operation.id))}>{!routeAvailable ? 'Unavailable' : !scopeAvailable ? 'Entire Vault only' : operation.enabled ? 'On' : 'Off'}</Button></div>; })}</div></section>)}</div>
		</SetupSection>
		<section className="pk-vi-estimate"><div><Clock3 size={18} /><span><strong>Current run estimate</strong><small>Planning estimate scaled from the frozen scope, enabled outputs and selected routes; the receipt records actual usage.</small></span></div><div><span><small>Scope</small><strong>{scopeObjectCount} objects</strong></span><span><small>AI tokens</small><strong>~{formatCompactNumber(estimatedTokens)}</strong></span><span><small>AI cost</small><strong>~{formatMoney(estimatedCost)}</strong></span></div></section>
		<div className="pk-vi-footer-actions"><Button variant="ghost" onClick={onBack}>Cancel</Button><Button className="pk-vi-primary" onClick={start} disabled={scopeMode === 'selected' && selectedPaths.length === 0}><ScanSearch size={16} />Start Scan</Button></div>
	</div>;
}

function SetupSection({ number, title, status, children }: { number: string; title: string; status: string; children: React.ReactNode }) {
	return <section className="pk-vi-card pk-vi-setup-section"><div className="pk-vi-setup-head"><span className="pk-vi-step-number">{number}</span><strong>{title}</strong><span>{status}</span></div>{children}</section>;
}

function RunProgress({ snapshot, runtime, onBack, onCompleted }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
	onCompleted: () => void;
}) {
	const run = snapshot.run;
	const completed = run.status === 'completed';
	const resumable = run.status === 'interrupted';
	const overall = run.stages.length ? Math.round(run.stages.reduce((sum, stage) => sum + (stage.status === 'completed' || stage.status === 'partial' ? 1 : stage.status === 'running' ? progressRatio(stage) : 0), 0) / run.stages.length * 100) : 0;
	const indexStage = run.stages.find((stage) => stage.id === 'index');
	const indexProgress = indexStage ? Math.round(progressRatio(indexStage) * 100) : 0;
	const currentStage = run.stages.find((stage) => stage.id === run.currentStage) ?? null;
	const currentOperation = run.operations.find((operation) => operation.status === 'running') ?? null;
	return <div className="pk-vi-page">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }, { label: 'Run progress' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-page-title">{completed ? 'Scan finished' : resumable ? 'Scan paused at a durable checkpoint' : run.status === 'failed' ? 'Scan failed' : 'Scanning the Vault'}</span><span className="pk-vi-page-description">{run.id ?? 'No active run'} · {run.frozenPaths.length} frozen objects</span></div><div className="pk-vi-page-actions">{run.status === 'running' && <Button variant="ghost" onClick={() => runtime.requestStop()}><Pause size={15} />Stop safely</Button>}{resumable && <Button className="pk-vi-primary" onClick={() => void runtime.resumeScan()}><Play size={15} />Resume</Button>}{completed && <Button className="pk-vi-primary" onClick={onCompleted}>View completed work<ChevronRight size={15} /></Button>}</div></div>
		<section className="pk-vi-run-dashboard">
			<div className="pk-vi-card pk-vi-progress-overview"><div><span>Overall Scan</span><strong>{overall}%</strong></div><div className="pk-vi-progress-track"><i style={{ width: `${overall}%` }} /></div><small>{currentStage?.message ?? (completed ? 'All enabled stages reached a durable checkpoint.' : 'Waiting for a stage to start.')}</small></div>
			<div className="pk-vi-card pk-vi-progress-overview"><div><span>Knowledge Index</span><strong>{indexProgress}%</strong></div><div className="pk-vi-progress-track"><i style={{ width: `${indexProgress}%` }} /></div><small>{indexStage?.processed ?? 0} of {indexStage?.total || '—'} objects processed</small></div>
			<div className="pk-vi-card pk-vi-current-work"><small>Current object</small><strong>{currentOperation?.currentPath ?? 'No object in flight'}</strong><span>{currentOperation ? operationLabel(currentOperation.id) : currentStage ? stageLabel(currentStage.id) : 'Waiting'}</span></div>
		</section>
		<div className="pk-vi-stage-list">{run.stages.map((stage, index) => <section key={stage.id} className={`pk-vi-card pk-vi-stage is-${stage.status}`}><div className="pk-vi-stage-head"><span className="pk-vi-step-number">{index + 1}</span><div><strong>{stageLabel(stage.id)}</strong><span>{stage.message}</span></div><StageState status={stage.status} /></div>{stage.status === 'running' && <div className="pk-vi-progress-track"><i style={{ width: `${Math.round(progressRatio(stage) * 100)}%` }} /></div>}</section>)}</div>
		<section className="pk-vi-card"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">AI and Index operations</span><span className="pk-vi-card-caption">Frozen provider and model routes, live progress, and non-duplicated actual usage.</span></div></div><div className="pk-vi-run-operations">{run.operations.map((operation) => { const sharedOwner = sharedUsageOwner(operation.id); const owner = sharedOwner ? run.operations.find((candidate) => candidate.id === sharedOwner) : null; return <div key={operation.id} className="pk-vi-run-operation"><span className={`pk-vi-operation-dot is-${operation.status}`} /><div><strong>{operationLabel(operation.id)}</strong><span>{operation.currentPath ?? operation.provider}</span></div><div><strong>{operation.model}</strong><span>{operation.processed}/{operation.total || '—'}</span></div><div>{owner && owner.usage.totalTokens > 0 ? <><strong>Shared receipt</strong><span>Included in {operationLabel(owner.id)}</span></> : <><strong>{formatCompactNumber(operation.usage.totalTokens)} tokens</strong><span>{formatMoney(operation.usage.costUsd)}</span></>}</div>{operation.status === 'waiting' || operation.status === 'running' ? <Button variant="ghost" size="sm" onClick={() => runtime.skipOperation(operation.id)}>Skip</Button> : <span className="pk-vi-operation-status">{operation.status}</span>}</div>; })}</div></section>
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
			<details className="pk-vi-disclosure"><summary><span><strong>Run details</strong><small>{completed.objectCount} objects · {elapsedLabel(completed.startedAt, completed.completedAt)} · {formatCompactNumber(completed.usage.totalTokens)} AI tokens · {formatMoney(completed.usage.costUsd)} actual</small></span><ChevronDown size={16} /></summary><div className="pk-vi-run-detail-grid"><span><small>Scope</small><strong>{completed.scopeMode}</strong></span><span><small>Searchable</small><strong>{completed.searchableCount ?? 'Unavailable'}</strong></span><span><small>Warnings</small><strong>{completed.warnings.length}</strong></span><span><small>Run ID</small><strong>{completed.runId}</strong></span></div></details>
			<details className="pk-vi-disclosure"><summary><span><strong>Completed automatically</strong><small>{completed.searchableCount === null ? 'Search readiness unavailable' : `${completed.searchableCount} searchable`} · Map receipt recorded · {completed.receipts.filter((receipt) => receipt.status === 'completed').length} receipts complete</small></span><ChevronDown size={16} /></summary><div className="pk-vi-receipts">{completed.receipts.map((receipt) => <div key={receipt.id}><span><strong>{receipt.label}</strong><small>{receipt.detail}</small></span><span><strong>{receipt.result}</strong><small>{receipt.ownerBoundary === 'peak-owned' ? 'Peak-owned state' : 'User-file boundary'}</small></span></div>)}</div></details>
			<WorkSurface tasks={tasks} origin="completed" onOpenTask={onOpenTask} />
		</section>
	</div>;
}

function MaintenanceWorkspace({ task, config, communities, runtime, onBack }: {
	task: VaultMaintenanceTask | null;
	config: VaultIntelligenceConfig;
	communities: string[];
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
}) {
	const [projection, setProjection] = useState<'primary' | 'file'>('primary');
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
	const grouped = projection === 'file' ? groupAtomicItemsByFile(task) : groupAtomicItemsByPrimaryProjection(task);
	return <div className={`pk-vi-task-overlay is-${task.kind}`}>
		<section className="pk-vi-maintenance" role="dialog" aria-modal="true" aria-label={presentation.title}>
			<div className="pk-vi-dialog-bar"><span>{presentation.eyebrow}</span><Button variant="ghost" className="pk-vi-dialog-close" aria-label="Close maintenance task" onClick={onBack}><X size={17} /></Button></div>
			<div className="pk-vi-maintenance-head"><div><span className="pk-vi-selection-type">{presentation.eyebrow}</span><span className="pk-vi-page-title">{presentation.title}</span><span className="pk-vi-page-description">{presentation.description}</span></div><div><TaskState task={task} /><span className={`pk-vi-impact is-${task.impact}`}>{task.impact} impact</span></div></div>
			<div className="pk-vi-maintenance-summary"><strong>{task.affectedLabel}</strong><span>·</span><span>{task.contextLabel}</span><span>·</span><span>Source Scan {task.sourceRunId}</span></div>
			{task.state === 'recovery' && task.kind !== 'unreadable-files' && <div className="pk-vi-stale-warning"><CircleAlert size={16} /><span><strong>Source revision changed.</strong> The saved owner choice is preserved, but the affected item must be refreshed or reselected against current evidence before any file review can continue.</span></div>}
			<div className="pk-vi-owner-boundary"><BrainCircuit size={17} /><span><strong>{presentation.boundaryTitle}</strong> {presentation.boundaryDescription}</span></div>
			<div className="pk-vi-maintenance-tools"><div className="pk-vi-segmented"><Button variant="ghost" className={projection === 'primary' ? 'is-active' : ''} onClick={() => setProjection('primary')}>{presentation.primaryProjection}</Button><Button variant="ghost" className={projection === 'file' ? 'is-active' : ''} onClick={() => setProjection('file')}>File</Button></div><div className="pk-vi-set-all"><span title="A Set all outcome replaces existing item overrides">Set all · replace overrides</span>{definition.choices.filter((choice) => choice.id !== 'another').map((choice) => <Button key={choice.id} variant="ghost" disabled={choice.id === 'suggested' && task.atomicItems.some((item) => item.suggestedChoiceId !== 'suggested')} className={task.defaultChoice?.choiceId === choice.id ? 'is-active' : ''} onClick={() => void runtime.choose(task.id, null, choice.id)}>{choice.label}</Button>)}{task.kind === 'community-membership' && <CommunityPicker label="Set all Community" value={task.defaultChoice?.choiceId === 'another' ? task.defaultChoice.choiceValue ?? '' : ''} communities={communities} onChange={(community) => void runtime.choose(task.id, null, 'another', community)} />}</div></div>
			<div className="pk-vi-atomic-list">{grouped.map((group) => <section key={group.key} className="pk-vi-atomic-group"><div className="pk-vi-atomic-group-head"><strong>{group.label}</strong><span>{group.items.length} {presentation.itemLabel}{group.items.length === 1 ? '' : 's'}</span></div>{group.items.map((item) => { const choice = item.ownerChoice ?? task.defaultChoice; const choiceDefinition = definition.choices.find((candidate) => candidate.id === choice?.choiceId); return <div key={item.id} className="pk-vi-atomic-row"><div><span className="pk-vi-evidence-label">{presentation.evidenceLabel}</span><strong>{item.title}</strong><span>{item.evidence}</span>{item.filePath && <Button variant="ghost" size="sm" onClick={() => void runtime.openFile(item.filePath!)}><FileText size={14} />Open {item.filePath}</Button>}</div><div className="pk-vi-atomic-decision"><div className="pk-vi-choice-actions">{definition.choices.filter((candidate) => candidate.id !== 'another').map((candidate) => <Button key={candidate.id} variant="ghost" disabled={candidate.id === 'suggested' && item.suggestedChoiceId !== 'suggested'} className={choice?.choiceId === candidate.id ? 'is-active' : ''} onClick={() => void runtime.choose(task.id, item.id, candidate.id)}>{candidate.label}{item.suggestedChoiceId === candidate.id && <small>Suggested</small>}</Button>)}{task.kind === 'community-membership' && <CommunityPicker label={`Choose Community for ${item.title}`} value={choice?.choiceId === 'another' ? choice.choiceValue ?? '' : ''} communities={communities} onChange={(community) => void runtime.choose(task.id, item.id, 'another', community)} />}</div>{choiceDefinition ? <span className={`is-${choiceDefinition.boundary}`}>{choiceDefinition.description}{choice?.choiceValue ? ` Current owner choice: ${choice.choiceValue}.` : ''}</span> : <span>Choose an outcome for this {presentation.itemLabel}.</span>}</div></div>; })}</section>)}</div>
			<div className="pk-vi-maintenance-footer"><div><strong>{task.atomicItems.filter((item) => (item.ownerChoice ?? task.defaultChoice)?.choiceId !== undefined).length} of {task.atomicItems.length} decided</strong><span>{hasProposal ? decisionsSaved ? 'Review decisions saved. Source files are still unchanged; this surface has not generated or applied a diff.' : 'Source-file choices are decisions only. No Markdown or YAML changes during this step.' : 'These choices update Peak-owned maintenance state only.'}</span></div><div><Button variant="ghost" onClick={onBack}>Close</Button><Button className="pk-vi-primary" disabled={!canApply} onClick={() => void runtime.applyTask(task.id)}>{hasProposal ? decisionsSaved ? 'Review decisions saved' : 'Save review decisions' : 'Record Peak decisions'}</Button>{!hasProposal && <Button className="pk-vi-primary" disabled={!canVerify} onClick={() => void runtime.verifyTask(task.id)}>Verify</Button>}</div></div>
		</section>
	</div>;
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

function MiniActivity({ days }: { days: VaultActivityDay[] }) {
	const calendar = calendarDays(days, 365);
	const max = Math.max(0, ...calendar.map((day) => day.count));
	return <div className="pk-vi-mini-activity">{calendar.map((day) => <span key={day.date} style={{ '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} title={`${day.date} · ${day.count}`} />)}</div>;
}

interface ActivityBucket {
	key: string;
	label: string;
	fileCount: number;
	receiptCount: number;
}

function ActivityLane({ label, detail, buckets, value, max, tone }: {
	label: string;
	detail: string;
	buckets: ActivityBucket[];
	value: (bucket: ActivityBucket) => number;
	max: number;
	tone: 'files' | 'receipts';
}) {
	return <div className={`pk-vi-activity-lane is-${tone}`}><span className="pk-vi-lane-label"><strong>{label}</strong><small>{detail}</small></span><div className="pk-vi-lane-bars">{buckets.map((bucket) => {
		const count = value(bucket);
		return <span key={bucket.key} title={`${bucket.label} · ${count}`}><i style={{ height: `${count === 0 ? 2 : Math.max(8, count / max * 100)}%` }} /></span>;
	})}</div></div>;
}

function bucketRecordedActivity(
	days: VaultActivityDay[],
	records: VaultIntelligenceSnapshot['recentActivity'],
	maxBuckets: number,
): ActivityBucket[] {
	if (days.length === 0) return [];
	const size = Math.max(1, Math.ceil(days.length / maxBuckets));
	const receiptCounts = new Map<string, number>();
	for (const record of records) {
		const date = toLocalDateKey(new Date(record.timestamp));
		receiptCounts.set(date, (receiptCounts.get(date) ?? 0) + 1);
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
			receiptCount: slice.reduce((sum, day) => sum + (receiptCounts.get(day.date) ?? 0), 0),
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
			enabled: operation.enabled && route.available,
			model: route.model,
			provider: route.provider,
		};
	});
}

function toggleOperationExecutionGroup(
	operations: VaultScanAiOperationPlan[],
	id: VaultScanAiOperationPlan['id'],
): VaultScanAiOperationPlan[] {
	const group = id === 'file-summaries' || id === 'ai-tags'
		? new Set<VaultScanAiOperationPlan['id']>(['file-summaries', 'ai-tags'])
		: id === 'relationship-review' || id === 'community-analysis' || id === 'file-proposals' || id === 'maintenance-synthesis'
			? new Set<VaultScanAiOperationPlan['id']>(['relationship-review', 'community-analysis', 'file-proposals', 'maintenance-synthesis'])
			: new Set<VaultScanAiOperationPlan['id']>([id]);
	const enabled = !operations.find((operation) => operation.id === id)?.enabled;
	return operations.map((operation) => group.has(operation.id) ? { ...operation, enabled } : operation);
}

function sharedExecutionLabel(id: VaultScanAiOperationPlan['id']): string | null {
	if (id === 'file-summaries' || id === 'ai-tags') return 'shared Index enrichment run';
	if (id === 'relationship-review' || id === 'community-analysis' || id === 'file-proposals' || id === 'maintenance-synthesis') {
		return 'shared Vault Review run';
	}
	return null;
}

function operationGroupLabel(group: 'index' | 'vault' | 'follow-up'): string {
	if (group === 'index') return 'Knowledge Index enrichment';
	if (group === 'vault') return 'Vault-wide interpretation';
	return 'Follow-up preparation';
}

function operationGroupDescription(group: 'index' | 'vault' | 'follow-up'): string {
	if (group === 'index') return 'Rebuildable machine knowledge used by Search and maintenance evidence.';
	if (group === 'vault') return 'Requires an Entire Vault scope so structural claims share one frozen baseline.';
	return 'Creates review evidence and owner actions; Scan never applies source-file changes.';
}

function operationAvailableForScope(
	id: VaultScanAiOperationPlan['id'],
	scope: VaultScanScopeMode,
): boolean {
	if (id === 'relationship-review' || id === 'community-analysis' || id === 'file-proposals' || id === 'maintenance-synthesis') {
		return scope === 'entire';
	}
	return true;
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
	if (id === 'community-analysis' || id === 'file-proposals' || id === 'maintenance-synthesis') {
		return 'relationship-review';
	}
	return null;
}

function progressRatio(stage: VaultIntelligenceSnapshot['run']['stages'][number]): number {
	if (stage.status === 'completed' || stage.status === 'partial') return 1;
	if (!stage.total) return stage.status === 'running' ? 0.15 : 0;
	return Math.min(1, stage.processed / stage.total);
}

function formatNumber(value: number): string { return value.toLocaleString(); }
function uniqueStrings(values: string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function formatCompactNumber(value: number): string { return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function formatMoney(value: number): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: value < 0.01 ? 3 : 2, maximumFractionDigits: 3 }).format(value); }
function formatDateTime(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp); }
function elapsedLabel(start: number, end: number): string { const seconds = Math.max(0, Math.round((end - start) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }

VaultIntelligenceWorkspace.displayName = 'VaultIntelligenceWorkspace';
