import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
	Activity,
	ArrowLeft,
	BrainCircuit,
	Check,
	ChevronDown,
	ChevronRight,
	CircleAlert,
	Clock3,
	File,
	FileText,
	FolderKanban,
	MessageSquare,
	Pause,
	PenLine,
	Play,
	RefreshCw,
	ScanSearch,
	Search,
	X,
} from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { AtlasGraphCanvas, type AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type {
	VaultMaintenanceTask,
	VaultMaintenanceTaskCategory,
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
	| { kind: 'surface'; surface: Surface }
	| { kind: 'setup' }
	| { kind: 'progress' }
	| { kind: 'completed' }
	| { kind: 'task'; taskId: string; origin: 'completed' | 'queue' };
type WorkFilter = 'all' | VaultMaintenanceTaskCategory;
type ActivityRange = 30 | 90 | 183 | 365;

export interface VaultIntelligenceWorkspaceProps {
	runtime: VaultIntelligenceWorkspaceRuntime;
}

export const VaultIntelligenceWorkspace: React.FC<VaultIntelligenceWorkspaceProps> = ({ runtime }) => {
	const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
	const [config, setConfig] = useState(DEFAULT_VAULT_INTELLIGENCE_CONFIG);
	const [route, setRoute] = useState<Route>({ kind: 'surface', surface: 'overview' });
	useEffect(() => {
		void runtime.refresh();
		void loadVaultIntelligenceConfig().then(setConfig);
	}, [runtime]);

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
			<main className="pk-vi-main">
				{route.kind === 'surface' && route.surface === 'overview' && (
					<Overview snapshot={snapshot} runtime={runtime} onRoute={setRoute} />
				)}
				{route.kind === 'surface' && route.surface === 'map' && (
					<VaultMap snapshot={snapshot} runtime={runtime} config={config} onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })} />
				)}
				{route.kind === 'surface' && route.surface === 'queue' && (
					<WorkQueue tasks={snapshot.tasks} onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })} />
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
					{snapshot.lastCompletedRun ? <span>Last scan {formatDateTime(snapshot.lastCompletedRun.completedAt)}</span> : <span>Not scanned yet</span>}
					{snapshot.changedSinceScan > 0 && <span>· {formatNumber(snapshot.changedSinceScan)} changed</span>}
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
	return (
		<div className="pk-vi-page pk-vi-overview">
			<section className="pk-vi-object-grid" aria-label="Vault objects">
				{snapshot.objects.map((object) => {
					const Icon = object.id === 'files' ? File : object.id === 'chats' ? MessageSquare : object.id === 'projects' ? FolderKanban : PenLine;
					return <Button key={object.id} variant="ghost" className="pk-vi-object-card" onClick={() => onRoute({ kind: 'surface', surface: 'map' })} title={object.detail}>
						<span className="pk-vi-object-icon"><Icon size={19} /></span><span className="pk-vi-object-value">{formatNumber(object.count)}</span><span className="pk-vi-object-label">{object.label}</span>
					</Button>;
				})}
			</section>
			<div className="pk-vi-overview-grid">
				<section className="pk-vi-card pk-vi-continue">
					<div className="pk-vi-card-head"><span className="pk-vi-card-title">Continue work</span><Button variant="ghost" size="sm" onClick={() => onRoute({ kind: 'surface', surface: 'queue' })}>View all {snapshot.tasks.filter((task) => task.state !== 'verified').length}<ChevronRight size={15} /></Button></div>
					<CompactTaskList tasks={openTasks} onOpen={(taskId) => onRoute({ kind: 'task', taskId, origin: 'queue' })} />
				</section>
				<div className="pk-vi-overview-side">
					<section className="pk-vi-card">
						<div className="pk-vi-card-head"><span className="pk-vi-card-title">What changed</span></div>
						<div className="pk-vi-change-list">
							<div><strong>{formatNumber(snapshot.changedSinceScan)}</strong><span>Vault items changed</span></div>
							<div><strong>{formatNumber(snapshot.digest?.communityLinks?.length ?? 0)}</strong><span>Community connections</span></div>
							<div><strong>{formatNumber(snapshot.digest?.counts.orphans ?? 0)}</strong><span>Notes outside Communities</span></div>
							<div><strong>{formatNumber(snapshot.tasks.filter((task) => task.kind === 'content-lifecycle').reduce((sum, task) => sum + task.atomicItems.length, 0))}</strong><span>Lifecycle choices</span></div>
						</div>
					</section>
					<section className="pk-vi-card">
						<div className="pk-vi-card-head"><span className="pk-vi-card-title">Vault activity</span><Button variant="ghost" size="sm" onClick={() => onRoute({ kind: 'surface', surface: 'map' })}>Open activity<ChevronRight size={15} /></Button></div>
						<MiniActivity days={snapshot.activityDays} />
					</section>
				</div>
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
			<TaskState task={task} /><ChevronRight size={16} />
		</Button>
	))}</div>;
}

function VaultMap({ snapshot, runtime, config, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	onOpenTask: (taskId: string) => void;
}) {
	const [surface, setSurface] = useState<MapSurface>('contents');
	return <div className="pk-vi-page">
		<div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Vault map</span><span className="pk-vi-page-description">Current indexed contents, structure and activity evidence.</span></div></div>
		<div className="pk-vi-local-nav">
			<Button variant="ghost" className={surface === 'contents' ? 'is-active' : ''} onClick={() => setSurface('contents')}>Vault contents</Button>
			<Button variant="ghost" className={surface === 'activity' ? 'is-active' : ''} onClick={() => setSurface('activity')}>Activity</Button>
		</div>
		{surface === 'contents' ? <VaultContents snapshot={snapshot} runtime={runtime} config={config} onOpenTask={onOpenTask} /> : <ActivityView days={snapshot.activityDays} />}
	</div>;
}

function VaultContents({ snapshot, runtime, config, onOpenTask }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	onOpenTask: (taskId: string) => void;
}) {
	const [selectedExtension, setSelectedExtension] = useState<string | null>(null);
	return <div className="pk-vi-map-layout">
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
	const shown = snapshot.fileTypes.slice(0, 7);
	const stops: string[] = [];
	let cursor = 0;
	shown.forEach((type, index) => {
		const next = cursor + type.share * 100;
		stops.push(`${config.fileTypeColors[index % config.fileTypeColors.length]} ${cursor}% ${next}%`);
		cursor = next;
	});
	if (cursor < 100) stops.push(`#dedce4 ${cursor}% 100%`);
	return <section className="pk-vi-card pk-vi-file-types">
		<div className="pk-vi-card-head"><span className="pk-vi-card-title">Vault contents</span><Button variant="ghost" size="sm" onClick={() => onSelect(null)} className={!selected ? 'is-active' : ''}>All files</Button></div>
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
	const [preset, setPreset] = useState<AtlasGraphPreset>('community');
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const model = useMemo(() => buildVaultIntelligenceGraph(snapshot.digest, { extension: selectedExtension }), [snapshot.digest, selectedExtension]);
	const selected = model?.nodes.find((node) => node.id === selectedNodeId) ?? null;
	return <div className="pk-vi-graph-layout">
		<section className="pk-vi-card pk-vi-graph-card">
			<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Knowledge communities{selectedExtension ? ` · .${selectedExtension}` : ''}</span><span className="pk-vi-card-caption">Communities contain representative Topics and Hubs; arrows show verified references.</span></div><div className="pk-vi-segmented"><Button variant="ghost" className={preset === 'community' ? 'is-active' : ''} onClick={() => setPreset('community')}>Communities</Button><Button variant="ghost" className={preset === 'constellation' ? 'is-active' : ''} onClick={() => setPreset('constellation')}>Constellation</Button><Button variant="ghost" className={preset === 'flow-lr' ? 'is-active' : ''} onClick={() => setPreset('flow-lr')}>Flow</Button></div></div>
			<div className="pk-vi-graph-canvas"><AtlasGraphCanvas model={model} preset={preset} showSemantic={false} layerLabel="Verified references" showMiniMap emptyLabel="Build the Knowledge Index to see current Communities." onNodeTap={(node) => setSelectedNodeId((current) => current === node.id ? null : node.id)} onNodeDblTap={(node) => { if (!node.path.startsWith('community:')) void runtime.openFile(node.path); }} /></div>
			<div className="pk-vi-graph-legend"><span><i className="is-community" />Community</span><span><i className="is-topic" />Topic / Hub</span><span><b className="is-contains" />contains</span><span><b className="is-reference" />reference</span></div>
		</section>
		<aside className="pk-vi-card pk-vi-selection">
			<div className="pk-vi-card-head"><span className="pk-vi-card-title">Selection</span>{selected && <Button variant="ghost" size="sm" onClick={() => setSelectedNodeId(null)}>Clear<X size={14} /></Button>}</div>
			{selected ? <><span className="pk-vi-selection-type">{String(selected.metadata?.kind ?? selected.role)}</span><strong>{selected.label}</strong><span>{selected.path.startsWith('community:') ? `${selected.constituentCount ?? 0} notes in this Community` : selected.path}</span>{Array.isArray(selected.metadata?.topics) && <div className="pk-vi-topic-list">{(selected.metadata.topics as string[]).map((topic) => <span key={topic}>{topic}</span>)}</div>}</> : <div className="pk-vi-empty">Select a Community, Topic or Hub to inspect its current evidence.</div>}
		</aside>
	</div>;
}

function ActivityView({ days }: { days: VaultActivityDay[] }) {
	const [range, setRange] = useState<ActivityRange>(365);
	const calendar = useMemo(() => calendarDays(days, range), [days, range]);
	const latest = [...calendar].reverse().find((day) => day.count > 0) ?? calendar[calendar.length - 1] ?? null;
	const [selectedDate, setSelectedDate] = useState<string | null>(latest?.date ?? null);
	const selected = calendar.find((day) => day.date === selectedDate) ?? latest;
	const max = Math.max(0, ...calendar.map((day) => day.count));
	return <section className="pk-vi-card pk-vi-activity">
		<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Vault activity</span><span className="pk-vi-card-caption">Raw file modification times. AI themes are not inferred from this history.</span></div><select value={range} onChange={(event) => setRange(Number(event.target.value) as ActivityRange)} aria-label="Activity range"><option value={30}>30 days</option><option value={90}>90 days</option><option value={183}>6 months</option><option value={365}>1 year</option></select></div>
		<div className="pk-vi-activity-grid">{calendar.map((day) => <Button key={day.date} variant="ghost" className={selected?.date === day.date ? 'is-selected' : ''} style={{ '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} title={`${day.date} · ${day.count} file changes`} onClick={() => setSelectedDate(day.date)} aria-label={`${day.date}, ${day.count} file changes`} />)}</div>
		<div className="pk-vi-day-list"><div className="pk-vi-card-head"><span className="pk-vi-card-title">{selected?.date ?? 'Selected day'}</span><span>{selected?.count ?? 0} changed files</span></div>{selected?.files.slice(0, 20).map((file) => <div key={file.path}><FileText size={15} /><span>{file.path}</span><time>{formatDateTime(file.modifiedAt)}</time></div>)}</div>
	</section>;
}

function WorkQueue({ tasks, onOpenTask }: { tasks: VaultMaintenanceTask[]; onOpenTask: (taskId: string) => void }) {
	return <div className="pk-vi-page"><div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Work queue</span><span className="pk-vi-page-description">Durable Vault maintenance only. Successful machine work stays in Scan receipts.</span></div></div><WorkSurface tasks={tasks.filter((task) => task.state !== 'verified')} origin="queue" onOpenTask={onOpenTask} /></div>;
}

function WorkSurface({ tasks, origin, onOpenTask }: { tasks: VaultMaintenanceTask[]; origin: 'queue' | 'completed'; onOpenTask: (taskId: string) => void }) {
	const [filter, setFilter] = useState<WorkFilter>('all');
	const [query, setQuery] = useState('');
	const filtered = tasks.filter((task) => {
		if (filter !== 'all' && task.category !== filter) return false;
		const text = `${task.title} ${task.typeLabel} ${task.affectedLabel} ${task.contextLabel}`.toLocaleLowerCase();
		return !query.trim() || text.includes(query.trim().toLocaleLowerCase());
	});
	const count = (category: WorkFilter) => category === 'all' ? tasks.length : tasks.filter((task) => task.category === category).length;
	return <section className="pk-vi-work-surface">
		<div className="pk-vi-work-head"><div><strong>{tasks.length} maintenance {tasks.length === 1 ? 'task' : 'tasks'} {origin === 'completed' ? 'need you' : 'still need you'}</strong><span>{origin === 'completed' ? 'This run' : 'Current queue'}</span></div></div>
		<div className="pk-vi-work-tools"><div className="pk-vi-filter-bar">{([
			['all', 'All'], ['decision', 'Needs choice'], ['review', 'Ready review'], ['recovery', 'Recovery'],
		] as const).map(([id, label]) => <Button key={id} variant="ghost" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}<span>{count(id)}</span></Button>)}</div><label className="pk-vi-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label></div>
		<div className="pk-vi-work-table"><div className="pk-vi-work-columns"><span>Task</span><span>Affected</span><span>State</span><span /></div>{filtered.map((task) => <Button key={task.id} variant="ghost" className="pk-vi-work-row" onClick={() => onOpenTask(task.id)}>
			<span className="pk-vi-task-name"><small>{task.typeLabel}</small><strong>{task.title}</strong></span><span className="pk-vi-task-affected"><strong>{task.affectedLabel}</strong><span>· {task.contextLabel}</span></span><TaskState task={task} /><ChevronRight size={17} />
		</Button>)}{filtered.length === 0 && <div className="pk-vi-empty">No maintenance tasks match this view.</div>}</div>
	</section>;
}

function ScanSetup({ snapshot, config, onBack, onStart }: {
	snapshot: VaultIntelligenceSnapshot;
	config: VaultIntelligenceConfig;
	onBack: () => void;
	onStart: (plan: VaultScanPlan) => void;
}) {
	const [scopeMode, setScopeMode] = useState<VaultScanScopeMode>('changed');
	const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
	const [pathQuery, setPathQuery] = useState('');
	const [taskKinds, setTaskKinds] = useState(() => new Set(config.tasks.map((task) => task.kind)));
	const [operations, setOperations] = useState<VaultScanAiOperationPlan[]>(() => resolvedOperationPlans(config, snapshot));
	useEffect(() => {
		setTaskKinds(new Set(config.tasks.map((task) => task.kind)));
		setOperations(resolvedOperationPlans(config, snapshot));
	}, [config, snapshot.operationRoutes]);
	const matchingPaths = pathQuery.trim() ? snapshot.availablePaths.filter((path) => path.toLocaleLowerCase().includes(pathQuery.toLocaleLowerCase())).slice(0, 8) : [];
	const scopeObjectCount = scopeMode === 'selected'
		? selectedPaths.length
		: scopeMode === 'changed'
			? snapshot.changedSinceScan
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
		enabledTaskKinds: [...taskKinds],
		aiOperations: plannedOperations,
		createdAt: Date.now(),
	});
	return <div className="pk-vi-page pk-vi-scan-setup">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Prepare a safe Vault Scan</span><span className="pk-vi-page-description">Freeze the scope, choose maintenance checks, and review AI routing before the run starts.</span></div></div>
		<SetupSection number="1" title="Choose scope" status={scopeMode === 'selected' ? `${selectedPaths.length} selected` : scopeMode === 'changed' ? `${snapshot.changedSinceScan} changed` : `${snapshot.availablePaths.length} files`}>
			<div className="pk-vi-choice-grid">{([
				['changed', 'Changed objects', 'Only objects changed since the latest completed Scan.'],
				['selected', 'Selected scope', 'Choose exact files through the searchable picker.'],
				['entire', 'Entire Vault', 'Rebuild the full Vault scope explicitly.'],
			] as const).map(([id, label, description]) => <Button key={id} variant="ghost" className={scopeMode === id ? 'is-active' : ''} onClick={() => setScopeMode(id)}><strong>{label}</strong><span>{description}</span></Button>)}</div>
			{scopeMode === 'selected' && <div className="pk-vi-path-picker"><label><Search size={15} /><input value={pathQuery} onChange={(event) => setPathQuery(event.target.value)} placeholder="Search Vault files" /></label>{matchingPaths.length > 0 && <div className="pk-vi-path-results">{matchingPaths.map((path) => <Button key={path} variant="ghost" onClick={() => { setSelectedPaths((current) => current.includes(path) ? current : [...current, path]); setPathQuery(''); }}><FileText size={14} /><span>{path}</span><Check size={14} /></Button>)}</div>}<div className="pk-vi-selected-paths">{selectedPaths.map((path) => <span key={path}>{path}<Button variant="ghost" size="icon" onClick={() => setSelectedPaths((current) => current.filter((candidate) => candidate !== path))} aria-label={`Remove ${path}`}><X size={13} /></Button></span>)}</div></div>}
		</SetupSection>
		<SetupSection number="2" title="Choose maintenance checks" status={`${taskKinds.size} of ${config.tasks.length} selected`}>
			<div className="pk-vi-check-grid">{config.tasks.map((task) => <Button key={task.kind} variant="ghost" className={taskKinds.has(task.kind) ? 'is-active' : ''} onClick={() => setTaskKinds((current) => { const next = new Set(current); if (next.has(task.kind)) next.delete(task.kind); else next.add(task.kind); return next; })}><span className="pk-vi-check-mark">{taskKinds.has(task.kind) && <Check size={14} />}</span><span><strong>{task.title}</strong><small>{task.typeLabel}</small></span></Button>)}</div>
		</SetupSection>
		<SetupSection number="3" title="Review AI operations" status={`${selectedOps.length} enabled`}>
			<div className="pk-vi-operation-list">{config.scanOperations.map((definition) => { const operation = plannedOperations.find((candidate) => candidate.id === definition.id)!; const routeAvailable = snapshot.operationRoutes[operation.id]?.available ?? true; const scopeAvailable = operationAvailableForScope(operation.id, scopeMode); const available = routeAvailable && scopeAvailable; const shared = sharedExecutionLabel(operation.id); return <div key={definition.id} className="pk-vi-operation-row"><div><strong>{definition.label}</strong><span>{definition.description}{shared ? ` · ${shared}` : ''}</span></div><div className="pk-vi-operation-route"><strong>{operation.model}</strong><span>{operation.provider}</span></div><span>{formatCompactNumber(operation.estimatedTokens)} · {formatMoney(operation.estimatedCostUsd)}</span><Button variant="ghost" disabled={!available} className={operation.enabled ? 'is-on' : ''} onClick={() => setOperations((current) => toggleOperationExecutionGroup(current, operation.id))}>{!routeAvailable ? 'Unavailable' : !scopeAvailable ? 'Entire Vault only' : operation.enabled ? 'On' : 'Off'}</Button></div>; })}</div>
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
	return <div className="pk-vi-page">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }, { label: 'Run progress' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-page-title">{completed ? 'Scan finished' : resumable ? 'Scan paused at a durable checkpoint' : run.status === 'failed' ? 'Scan failed' : 'Scanning the Vault'}</span><span className="pk-vi-page-description">{run.id ?? 'No active run'} · {run.frozenPaths.length} frozen objects</span></div><div className="pk-vi-page-actions">{run.status === 'running' && <Button variant="ghost" onClick={() => runtime.requestStop()}><Pause size={15} />Stop safely</Button>}{resumable && <Button className="pk-vi-primary" onClick={() => void runtime.resumeScan()}><Play size={15} />Resume</Button>}{completed && <Button className="pk-vi-primary" onClick={onCompleted}>View completed work<ChevronRight size={15} /></Button>}</div></div>
		<section className="pk-vi-card pk-vi-progress-overview"><div><span>Overall progress</span><strong>{overall}%</strong></div><div className="pk-vi-progress-track"><i style={{ width: `${overall}%` }} /></div></section>
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
			<details className="pk-vi-disclosure"><summary><span><strong>Run details</strong><small>{completed.objectCount} objects · {elapsedLabel(completed.startedAt, completed.completedAt)} · {formatCompactNumber(completed.usage.totalTokens)} AI tokens · {formatMoney(completed.usage.costUsd)} actual</small></span><ChevronDown size={16} /></summary><div className="pk-vi-run-detail-grid"><span><small>Scope</small><strong>{completed.scopeMode}</strong></span><span><small>Searchable</small><strong>{completed.searchableCount}</strong></span><span><small>Warnings</small><strong>{completed.warnings.length}</strong></span><span><small>Run ID</small><strong>{completed.runId}</strong></span></div></details>
			<details className="pk-vi-disclosure"><summary><span><strong>Completed automatically</strong><small>{completed.searchableCount} searchable · Map current · {completed.receipts.filter((receipt) => receipt.status === 'completed').length} receipts complete</small></span><ChevronDown size={16} /></summary><div className="pk-vi-receipts">{completed.receipts.map((receipt) => <div key={receipt.id}><span><strong>{receipt.label}</strong><small>{receipt.detail}</small></span><span><strong>{receipt.result}</strong><small>{receipt.ownerBoundary === 'peak-owned' ? 'Peak-owned state' : 'User-file boundary'}</small></span></div>)}</div></details>
			<WorkSurface tasks={tasks} origin="completed" onOpenTask={onOpenTask} />
		</section>
	</div>;
}

function MaintenanceWorkspace({ task, config, runtime, onBack }: {
	task: VaultMaintenanceTask | null;
	config: VaultIntelligenceConfig;
	runtime: VaultIntelligenceWorkspaceRuntime;
	onBack: () => void;
}) {
	const [projection, setProjection] = useState<'primary' | 'file'>('primary');
	if (!task) return <div className="pk-vi-page"><div className="pk-vi-empty">This maintenance task is no longer available.</div></div>;
	const definition = config.tasks.find((candidate) => candidate.kind === task.kind);
	if (!definition) return null;
	const proposalChoices = new Set(definition.choices.filter((choice) => choice.boundary === 'proposal').map((choice) => choice.id));
	const effectiveChoices = task.atomicItems.map((item) => item.ownerChoice ?? task.defaultChoice).filter(Boolean);
	const hasProposal = effectiveChoices.some((choice) => proposalChoices.has(choice!.choiceId));
	const canApply = effectiveChoices.length === task.atomicItems.length && effectiveChoices.every((choice) => choice!.choiceId !== 'later');
	const canVerify = canApply && !hasProposal && effectiveChoices.every((choice) => choice!.status === 'applied');
	const projectionLabels = taskProjectionLabels(task.kind);
	const grouped = projection === 'file' ? groupAtomicItemsByFile(task) : groupAtomicItemsByPrimaryProjection(task);
	return <div className="pk-vi-page">
		<Breadcrumb items={[{ label: 'Back', action: onBack }, { label: task.title }]} />
		<section className="pk-vi-maintenance">
			<div className="pk-vi-maintenance-head"><div><span className="pk-vi-selection-type">{task.typeLabel}</span><span className="pk-vi-page-title">{task.title}</span></div><div><TaskState task={task} /><span className={`pk-vi-impact is-${task.impact}`}>{task.impact} impact</span></div></div>
			<div className="pk-vi-maintenance-summary"><strong>{task.affectedLabel}</strong><span>·</span><span>{task.contextLabel}</span><span>·</span><span>Source Scan {task.sourceRunId}</span></div>
			<div className="pk-vi-owner-boundary"><BrainCircuit size={17} /><span><strong>One canonical decision set.</strong> Changing projection does not duplicate, reset or recount choices. Peak-owned decisions save directly; source-file changes remain guarded proposals.</span></div>
			<div className="pk-vi-maintenance-tools"><div className="pk-vi-segmented"><Button variant="ghost" className={projection === 'primary' ? 'is-active' : ''} onClick={() => setProjection('primary')}>{projectionLabels[0]}</Button><Button variant="ghost" className={projection === 'file' ? 'is-active' : ''} onClick={() => setProjection('file')}>{projectionLabels[1]}</Button></div><label><span>Set all</span><select value={task.defaultChoice?.choiceId ?? ''} onChange={(event) => void runtime.choose(task.id, null, event.target.value)}><option value="" disabled>Choose default</option>{definition.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label></div>
			<div className="pk-vi-atomic-list">{grouped.map((group) => <section key={group.key} className="pk-vi-atomic-group"><div className="pk-vi-atomic-group-head"><strong>{group.label}</strong><span>{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span></div>{group.items.map((item) => { const choice = item.ownerChoice ?? task.defaultChoice; const choiceDefinition = definition.choices.find((candidate) => candidate.id === choice?.choiceId); return <div key={item.id} className="pk-vi-atomic-row"><div><strong>{item.title}</strong><span>{item.evidence}</span>{item.filePath && <Button variant="ghost" size="sm" onClick={() => void runtime.openFile(item.filePath!)}><FileText size={14} />{item.filePath}</Button>}</div><div className="pk-vi-atomic-decision"><select value={item.ownerChoice?.choiceId ?? ''} onChange={(event) => void runtime.choose(task.id, item.id, event.target.value)}><option value="">{task.defaultChoice ? `Default · ${definition.choices.find((candidate) => candidate.id === task.defaultChoice!.choiceId)?.label ?? task.defaultChoice.choiceId}` : 'Choose'}</option>{definition.choices.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select>{choiceDefinition && <span className={`is-${choiceDefinition.boundary}`}>{choiceDefinition.description}</span>}</div></div>; })}</section>)}</div>
			<div className="pk-vi-maintenance-footer"><div><strong>{task.atomicItems.filter((item) => (item.ownerChoice ?? task.defaultChoice)?.choiceId !== undefined).length} of {task.atomicItems.length} decided</strong><span>{hasProposal ? 'File-changing choices will continue in their owner surface with per-file diffs and revision guards.' : 'Only Peak-owned state will be recorded from this workspace.'}</span></div><div><Button variant="ghost" onClick={onBack}>Close</Button><Button className="pk-vi-primary" disabled={!canApply} onClick={() => void runtime.applyTask(task.id)}>{hasProposal ? 'Prepare review handoff' : 'Record choices'}</Button><Button className="pk-vi-primary" disabled={!canVerify} onClick={() => void runtime.verifyTask(task.id)}>Verify</Button></div></div>
		</section>
	</div>;
}

function Breadcrumb({ items }: { items: Array<{ label: string; action?: () => void }> }) {
	return <div className="pk-vi-breadcrumb">{items.map((item, index) => <React.Fragment key={`${item.label}:${index}`}>{index > 0 && <span>/</span>}{item.action ? <Button variant="ghost" onClick={item.action}>{index === 0 && <ArrowLeft size={14} />}{item.label}</Button> : <strong>{item.label}</strong>}</React.Fragment>)}</div>;
}

function TaskState({ task }: { task: VaultMaintenanceTask }) {
	const label = task.state === 'needs-choice' ? 'Needs choice' : task.state === 'ready-review' ? 'Ready review' : task.state === 'ready-apply' ? 'Ready to verify' : task.state === 'recovery' ? 'Recovery' : 'Verified';
	return <span className={`pk-vi-task-state is-${task.state}`}>{label}</span>;
}

function StageState({ status }: { status: VaultIntelligenceSnapshot['run']['stages'][number]['status'] }) {
	return <span className={`pk-vi-stage-state is-${status}`}>{status}</span>;
}

function MiniActivity({ days }: { days: VaultActivityDay[] }) {
	const calendar = calendarDays(days, 90);
	const max = Math.max(0, ...calendar.map((day) => day.count));
	return <div className="pk-vi-mini-activity">{calendar.map((day) => <span key={day.date} style={{ '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} title={`${day.date} · ${day.count}`} />)}</div>;
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

function operationAvailableForScope(
	id: VaultScanAiOperationPlan['id'],
	scope: VaultScanScopeMode,
): boolean {
	if (id === 'relationship-review' || id === 'community-analysis' || id === 'file-proposals' || id === 'maintenance-synthesis') {
		return scope === 'entire';
	}
	return true;
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

function taskProjectionLabels(kind: VaultMaintenanceTask['kind']): [string, string] {
	if (kind === 'file-properties') return ['Batch', 'File'];
	if (kind === 'broken-links') return ['Target', 'File'];
	if (kind === 'community-membership') return ['Community', 'File'];
	if (kind === 'knowledge-connections') return ['Connection', 'Connecting file'];
	if (kind === 'related-notes') return ['Related group', 'File'];
	if (kind === 'note-split') return ['Source note', 'File'];
	if (kind === 'community-structure') return ['Community', 'File'];
	if (kind === 'community-hubs') return ['Community', 'Index note'];
	if (kind === 'content-lifecycle') return ['Lifecycle state', 'File'];
	if (kind === 'unreadable-files') return ['Error', 'File'];
	return ['Finding type', 'File'];
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
function formatCompactNumber(value: number): string { return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function formatMoney(value: number): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: value < 0.01 ? 3 : 2, maximumFractionDigits: 3 }).format(value); }
function formatDateTime(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp); }
function elapsedLabel(start: number, end: number): string { const seconds = Math.max(0, Math.round((end - start) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }

VaultIntelligenceWorkspace.displayName = 'VaultIntelligenceWorkspace';
