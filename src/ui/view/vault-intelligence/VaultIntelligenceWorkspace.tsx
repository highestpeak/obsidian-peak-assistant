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
import type {
	VaultMaintenanceTask,
	VaultMaintenanceProposal,
	VaultScanAiOperationPlan,
	VaultScanPlan,
	VaultScanScopeMode,
	VaultScanScopeSelector,
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
	| { kind: 'surface'; surface: Surface; mapSurface?: MapSurface; mapDate?: string | null; mapExtension?: string | null }
	| { kind: 'setup' }
	| { kind: 'progress' }
	| { kind: 'completed' }
	| { kind: 'map-text'; extension: string | null }
	| { kind: 'task'; taskId: string; origin: 'completed' | 'queue' }
	| { kind: 'proposal'; taskId: string; origin: 'completed' | 'queue' };
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
					<Overview snapshot={snapshot} runtime={runtime} config={config} onRoute={setRoute} />
				)}
				{route.kind === 'surface' && route.surface === 'map' && (
					<VaultMap snapshot={snapshot} runtime={runtime} config={config} initialSurface={route.mapSurface ?? 'contents'} initialDate={route.mapDate ?? null} initialExtension={route.mapExtension ?? null} onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })} onOpenMapText={(extension) => setRoute({ kind: 'map-text', extension })} />
				)}
				{route.kind === 'surface' && route.surface === 'queue' && (
					<WorkQueue
						tasks={snapshot.tasks}
						onOpenTask={(taskId) => setRoute({ kind: 'task', taskId, origin: 'queue' })}
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
	const prepared = Boolean(snapshot.lastCompletedRun);
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
					<span className="pk-vi-mark"><BrainCircuit size={20} /></span>
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
						{active ? <Activity size={17} /> : resumable ? <Play size={17} /> : <ScanSearch size={17} />}
						{active ? 'View progress' : resumable ? 'Resume scan' : prepared ? 'Scan Vault' : 'Prepare Vault'}
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
				{snapshot.lastCompletedRun && <div className="pk-vi-continue-summary">
					<span><Clock3 size={14} /><small>Since last scan</small></span>
					<span><strong>{snapshot.changedSinceScan === null ? '—' : formatNumber(snapshot.changedSinceScan)}</strong><small>Vault items changed</small></span>
					<span><strong>{snapshot.digest ? `+${formatNumber(snapshot.digest.communityLinks?.length ?? 0)}` : '—'}</strong><small>current connections</small></span>
					<span><strong>{snapshot.digest ? formatNumber(snapshot.digest.counts.orphans ?? 0) : '—'}</strong><small>notes need a home</small></span>
					<span><strong>{formatNumber(snapshot.tasks.filter((task) => task.kind === 'content-lifecycle' && task.state !== 'verified').length)}</strong><small>work states need review</small></span>
				</div>}
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
	return <section className="pk-vi-inventory-strip" aria-label="Vault object inventory">{snapshot.objects.map((object) => {
		const Icon = object.id === 'files' ? File : object.id === 'chats' ? MessageSquare : object.id === 'projects' ? FolderKanban : PenLine;
		const canonicalBreakdown = object.id === 'files'
			? snapshot.fileTypes.map((type) => ({ id: type.extension, label: fileTypeLabel(type.extension), count: type.count }))
			: object.breakdown ?? [];
		const breakdown = object.id === 'files'
			? inventoryPreviewItems(canonicalBreakdown, config.inventoryPreviewTypeLimit)
			: canonicalBreakdown;
		const previewIsGrouped = breakdown.length < canonicalBreakdown.length;
		const coverageNote = previewIsGrouped
			? `${canonicalBreakdown.length} groups · largest ${Math.max(0, breakdown.length - 1)} + Other formats`
			: object.coverageNote;
		const open = () => object.id === 'files'
			? onRoute({ kind: 'surface', surface: 'map', mapSurface: 'contents' })
			: void runtime.openOwnerSurface(object.id);
		return <div key={object.id} className={`pk-vi-inventory-item is-${object.id} ${object.id === 'files' ? 'is-files' : ''}`} tabIndex={0} aria-label={`${formatNumber(object.count)} ${object.label}`}>
			<span className="pk-vi-type-icon"><Icon size={28} /></span><span className="pk-vi-inventory-value">{formatNumber(object.count)}</span><span className="pk-vi-inventory-label">{object.label}</span>
			<div className="pk-vi-inventory-hover" role="group" aria-label={`${object.label} distribution`}>
				<div className="pk-vi-hover-head"><div><strong>{object.id === 'files' ? 'Files by type' : `${object.label} distribution`}</strong><span>{object.detail}. {object.coverageNote}</span></div>{snapshot.changedSinceScan !== null && object.id === 'files' && <small>{formatNumber(snapshot.changedSinceScan)} changed</small>}</div>
				<InventoryDistribution total={object.count} label={object.label} items={breakdown} canonicalGroupCount={canonicalBreakdown.length} colors={config.fileTypeColors} large={object.id === 'files'} />
				<div className="pk-vi-hover-footer"><span>{coverageNote ?? 'Canonical records only.'}</span><Button variant="ghost" size="sm" onClick={open}>{object.id === 'files' ? 'Open full file inventory' : `Open ${object.label}`}<ChevronRight size={13} /></Button></div>
			</div>
		</div>;
	})}</section>;
}

function InventoryDistribution({ total, label, items, canonicalGroupCount, colors, large }: { total: number; label: string; items: Array<{ id: string; label: string; count: number }>; canonicalGroupCount: number; colors: string[]; large: boolean }) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const palette = colors.length > 0 ? colors : DEFAULT_VAULT_INTELLIGENCE_CONFIG.fileTypeColors;
	let offset = 0;
	return <div className={`pk-vi-inventory-distribution ${large ? 'is-large' : ''}`}>
		<div className="pk-vi-inventory-pie-panel"><svg className="pk-vi-inventory-pie" viewBox="0 0 100 100" role="img" aria-label={`${label} distribution`}>{items.map((item, index) => {
			const start = total > 0 ? offset / total : 0;
			offset += item.count;
			const end = total > 0 ? offset / total : 0;
			return <path key={item.id} className={`pk-vi-pie-segment ${activeId && activeId !== item.id ? 'is-muted' : ''}`} d={pieSlicePath(start, end)} style={{ fill: palette[index % palette.length] }} onMouseEnter={() => setActiveId(item.id)} onMouseLeave={() => setActiveId(null)} />;
		})}</svg><strong>{formatNumber(total)} {label.toLowerCase()}</strong><span>{label === 'Files' ? `${canonicalGroupCount} actual file types · click to filter` : `${canonicalGroupCount} canonical ${canonicalGroupCount === 1 ? 'group' : 'groups'}`}</span><span className="pk-vi-pie-readout">{activeId ? items.find((item) => item.id === activeId)?.label : 'Hover a slice or type'}</span></div>
		<div className="pk-vi-inventory-legend">{items.map((item, index) => <div key={item.id} className={`${activeId === item.id ? 'is-active' : ''} ${activeId && activeId !== item.id ? 'is-muted' : ''}`} tabIndex={0} onMouseEnter={() => setActiveId(item.id)} onMouseLeave={() => setActiveId(null)} onFocus={() => setActiveId(item.id)} onBlur={() => setActiveId(null)}><i style={{ background: palette[index % palette.length] }} /><strong>{item.label}</strong><span><b>{formatNumber(item.count)}</b> · {total > 0 ? `${(item.count / total * 100).toFixed(1)}%` : '0%'}</span></div>)}</div>
	</div>;
}

function inventoryPreviewItems(items: Array<{ id: string; label: string; count: number }>, limit: number) {
	const sorted = [...items].sort((left, right) => right.count - left.count);
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

function OverviewActivity({ snapshot, onOpenActivity }: { snapshot: VaultIntelligenceSnapshot; onOpenActivity: (date: string | null) => void }) {
	const [range, setRange] = useState<7 | 30 | 365>(365);
	const [rangeOpen, setRangeOpen] = useState(false);
	const [customOpen, setCustomOpen] = useState(false);
	const [customApplied, setCustomApplied] = useState(false);
	const [customError, setCustomError] = useState('');
	const [customStart, setCustomStart] = useState(() => dateOffsetKey(29));
	const [customEnd, setCustomEnd] = useState(() => dateOffsetKey(0));
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
	const records = allRecordedActivity(snapshot);
	const mergedDays = mergeRecordedActivity(snapshot.activityDays, records);
	const days = customApplied ? calendarDaysBetween(mergedDays, customStart, customEnd) : calendarDays(mergedDays, range);
	const max = Math.max(0, ...days.map((day) => day.count));
	const lastDay = days[days.length - 1] ?? null;
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
		<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Vault activity</span></div><div className="pk-vi-overview-activity-actions"><div className="pk-vi-overview-range"><Button ref={rangeButtonRef} variant="outline" aria-haspopup="dialog" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}><CalendarDays size={15} />{days[0] && lastDay ? `${formatShortDate(days[0].date)} – ${formatShortDate(lastDay.date)}` : 'No recorded range'}<ChevronDown size={13} /></Button>{rangeOpen && <div className="pk-vi-overview-range-popover" role="dialog" aria-label="Choose activity date range"><div className="pk-vi-overview-range-head"><strong>Date range</strong><Button variant="ghost" onClick={() => { setCustomApplied(false); setRange(365); setSelectedDate(null); setRangeOpen(false); }}>Clear filters</Button></div>{([7, 30, 365] as const).map((option) => <Button key={option} variant="ghost" className={!customApplied && range === option ? 'is-active' : ''} onClick={() => { setRange(option); setCustomApplied(false); setRangeOpen(false); setSelectedDate(null); }}><span>Last {option} days</span>{!customApplied && range === option && <Check size={14} />}</Button>)}<Button variant="ghost" className={customApplied ? 'is-active' : ''} onClick={() => setCustomOpen((open) => !open)}><span>Custom date</span><ChevronRight size={14} /></Button>{customOpen && <div className="pk-vi-custom-range"><div><label><span>Start</span><input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label><span>–</span><label><span>End</span><input type="date" value={customEnd} min={customStart} max={dateOffsetKey(0)} onChange={(event) => setCustomEnd(event.target.value)} /></label></div><div><small>{customError}</small><Button className="pk-vi-primary" size="sm" onClick={() => { if (!customStart || !customEnd || customStart > customEnd) { setCustomError('Choose a valid date range.'); return; } setCustomError(''); setCustomApplied(true); setRangeOpen(false); setSelectedDate(null); }}>Apply</Button></div></div>}</div>}</div><Button variant="ghost" size="sm" onClick={() => onOpenActivity(selectedDay?.date ?? null)}>Open Activity<ChevronRight size={14} /></Button></div></div>
		<div className="pk-vi-overview-activity-body"><div className="pk-vi-overview-heatmap"><div className="pk-vi-overview-heatmap-summary"><strong>{formatNumber(days.reduce((sum, day) => sum + day.count, 0))} explicit records in this range</strong></div><div className="pk-vi-overview-heatmap-scroll"><div className="pk-vi-overview-heatmap-calendar"><div className="pk-vi-overview-months" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil((days.length + firstWeekday) / 7))}, 17px)` }}>{months.map((month) => <span key={month.key} style={{ gridColumn: month.column }}>{month.label}</span>)}</div><div className="pk-vi-overview-calendar"><div className="pk-vi-overview-weekdays"><span>Sun</span><span /><span>Tue</span><span /><span>Thu</span><span /><span>Sat</span></div><div className="pk-vi-overview-grid" role="grid" aria-label="Calendar heatmap of explicit Vault activity" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil((days.length + firstWeekday) / 7))}, 17px)` }}>{days.map((day, index) => <Button key={day.date} variant="ghost" size="icon" className={selectedDay?.date === day.date ? 'is-selected' : ''} style={{ gridColumn: Math.floor((index + firstWeekday) / 7) + 1, gridRow: (index + firstWeekday) % 7 + 1, '--pk-vi-level': activityLevel(day.count, max) } as React.CSSProperties} title={`${day.date} · ${day.count} records`} aria-label={`${day.date}, ${day.count} records`} onClick={() => setSelectedDate(day.date)} />)}</div></div></div></div><div className="pk-vi-overview-evidence" aria-live="polite"><strong>{selectedDay ? `${formatLongDate(selectedDay.date)} · ${selectedDay.count} explicit records` : 'No recorded activity'}</strong><div>{selectedRecords.slice(0, 5).map((record) => <article key={record.id}><span className={`is-${record.kind}`}>{activityIcon(record.kind)}</span><div><strong>{record.label}</strong><span>{record.objectPath ?? (record.runId ? `Run ${record.runId}` : 'Peak-owned record')}</span></div><small>{record.kind}</small></article>)}{selectedRecords.length === 0 && selectedDay?.files.slice(0, 5).map((file) => <article key={file.path}><span><File size={14} /></span><div><strong>{file.path}</strong><span>Vault file modification</span></div><small>file</small></article>)}{selectedDay && selectedDay.count === 0 && <span className="pk-vi-empty">No explicit records for this date.</span>}</div></div><div className="pk-vi-overview-heatmap-footer"><div className="pk-vi-overview-legend"><span>None</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} style={{ '--pk-vi-level': level } as React.CSSProperties} />)}<span>More records</span></div></div></div>
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

function VaultMap({ snapshot, runtime, config, initialSurface, initialDate, initialExtension, onOpenTask, onOpenMapText }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	initialSurface: MapSurface;
	initialDate: string | null;
	initialExtension: string | null;
	onOpenTask: (taskId: string) => void;
	onOpenMapText: (extension: string | null) => void;
}) {
	const [surface, setSurface] = useState<MapSurface>(initialSurface);
	return <div className="pk-vi-page">
		<div className="pk-vi-page-head pk-vi-map-head"><div><span className="pk-vi-page-title">{surface === 'contents' ? 'Vault contents · file types in context' : 'Activity'}</span><span className="pk-vi-page-description">{surface === 'contents' ? 'Choose an actual file type, then see where it fits in the knowledge structure and what Peak can currently use.' : 'Timestamped local evidence by recorded source. Work sessions group real VI receipts; no topic is guessed.'}</span></div><span className="pk-vi-map-freshness">{snapshot.indexReadiness.builtAt ? `Index built ${formatDateTime(snapshot.indexReadiness.builtAt)}` : 'No completed Index build'}</span></div>
		<div className="pk-vi-local-nav">
			<Button variant="ghost" className={surface === 'contents' ? 'is-active' : ''} onClick={() => setSurface('contents')}>Vault contents</Button>
			<Button variant="ghost" className={surface === 'activity' ? 'is-active' : ''} onClick={() => setSurface('activity')}>Activity</Button>
		</div>
		{surface === 'contents' ? <VaultContents snapshot={snapshot} runtime={runtime} config={config} initialExtension={initialExtension} onOpenTask={onOpenTask} onOpenMapText={onOpenMapText} /> : <ActivityView snapshot={snapshot} runtime={runtime} initialDate={initialDate} />}
	</div>;
}

function VaultContents({ snapshot, runtime, config, initialExtension, onOpenTask, onOpenMapText }: {
	snapshot: VaultIntelligenceSnapshot;
	runtime: VaultIntelligenceWorkspaceRuntime;
	config: VaultIntelligenceConfig;
	initialExtension: string | null;
	onOpenTask: (taskId: string) => void;
	onOpenMapText: (extension: string | null) => void;
}) {
	const [selectedExtension, setSelectedExtension] = useState<string | null>(initialExtension);
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
		<section className="pk-vi-card pk-vi-map-text-entry"><div><span className="pk-vi-card-title">Map text</span><span className="pk-vi-card-caption">Community descriptions are Peak-owned annotations, pinned to the current index fingerprint and never inferred from graph geometry.</span></div><Button variant="ghost" onClick={() => onOpenMapText(selectedExtension)}>Review map text<ChevronRight size={15} /></Button></section>
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
	const [communityId, setCommunityId] = useState(communities[0]?.id ?? '');
	const entry = snapshot.mapTextEntries.find((candidate) => candidate.communityId === communityId) ?? null;
	const [text, setText] = useState(entry?.text ?? '');
	useEffect(() => { setText(snapshot.mapTextEntries.find((candidate) => candidate.communityId === communityId)?.text ?? ''); }, [communityId, snapshot.mapTextEntries]);
	if (communities.length === 0) return <div className="pk-vi-page"><Breadcrumb items={[{ label: 'Vault Intelligence', action: () => onBack(extension) }, { label: 'Map text' }]} /><div className="pk-vi-empty">Build the Knowledge Index before adding a Community map description.</div></div>;
	const community = communities.find((candidate) => candidate.id === communityId) ?? communities[0]!;
	const revisions = [...(entry?.revisions ?? [])].sort((left, right) => right.createdAt - left.createdAt);
	const latestRevision = revisions[0] ?? null;
	return <div className="pk-vi-page pk-vi-map-text-workspace">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: () => onBack(extension) }, { label: 'Vault map', action: () => onBack(extension) }, { label: 'Map text' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Map text</span><span className="pk-vi-page-description">Describe what a real indexed Community represents. This annotation lives in Peak state and records the index fingerprint it was based on.</span></div><span className="pk-vi-map-freshness">{entry?.sourceFingerprint === snapshot.digest?.fingerprint.fingerprint ? 'Matches current Index' : entry ? 'Index changed since this text' : 'Not described yet'}</span></div>
		<div className="pk-vi-map-text-layout"><section className="pk-vi-card pk-vi-community-list"><span className="pk-vi-card-title">Communities</span>{communities.map((candidate) => <Button key={candidate.id} variant="ghost" className={candidate.id === community.id ? 'is-active' : ''} onClick={() => setCommunityId(candidate.id)}><span><strong>{candidate.label}</strong><small>{candidate.memberCount} notes · {candidate.dominantTopics.slice(0, 2).join(' · ') || 'No topics recorded'}</small></span><ChevronRight size={15} /></Button>)}</section><section className="pk-vi-card pk-vi-map-text-editor"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">{community.label}</span><span className="pk-vi-card-caption">{community.memberCount} indexed notes · current structure is evidence only.</span></div><span className={`pk-vi-map-text-state is-${latestRevision?.status ?? 'draft'}`}>{latestRevision?.status ?? 'draft'}</span></div><label><span>Map description</span><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a grounded description for this Community…" /></label><div className="pk-vi-map-text-facts"><span><small>Topics</small><strong>{community.dominantTopics.join(' · ') || 'No topics recorded'}</strong></span><span><small>Stored revision</small><strong>{entry ? formatDateTime(entry.updatedAt) : 'None'}</strong></span><span><small>Index fingerprint</small><strong>{entry?.sourceFingerprint === snapshot.digest?.fingerprint.fingerprint ? 'Current' : entry ? 'Changed' : 'None'}</strong></span></div><details className="pk-vi-map-text-history"><summary><span><strong>Version history</strong><small>{revisions.length} stored revisions · drafts, published text, and keep decisions are distinct</small></span><ChevronDown size={15} /></summary><div>{revisions.length === 0 ? <span className="pk-vi-empty">No stored revision yet.</span> : revisions.map((revision) => <article key={revision.id}><span><strong>{revision.status}</strong><small>{formatDateTime(revision.createdAt)} · {revision.sourceFingerprint === snapshot.digest?.fingerprint.fingerprint ? 'current Index' : 'older Index'}</small></span><p>{revision.text || 'Empty description'}</p></article>)}</div></details><div className="pk-vi-footer-actions"><Button variant="ghost" onClick={() => onBack(extension)}>Cancel</Button><Button variant="ghost" disabled={!entry} onClick={() => void runtime.keepMapText(community.id)}>Keep current</Button><Button variant="ghost" disabled={!entry} onClick={() => void runtime.publishMapText(community.id)}>Publish revision</Button><Button className="pk-vi-primary" onClick={() => void runtime.saveMapText(community.id, text)}>Save draft</Button></div></section></div>
	</div>;
}

function FileTypeDistribution({ snapshot, config, selected, onSelect }: {
	snapshot: VaultIntelligenceSnapshot;
	config: VaultIntelligenceConfig;
	selected: string | null;
	onSelect: (extension: string | null) => void;
}) {
	const shown = snapshot.fileTypes.slice(0, 16);
	const total = snapshot.fileTypes.reduce((sum, type) => sum + type.count, 0);
	let cursor = 0;
	const slices = shown.map((type, index) => {
		const start = cursor;
		cursor += type.share;
		return { type, color: config.fileTypeColors[index % config.fileTypeColors.length], start, end: cursor };
	});
	return <section className="pk-vi-card pk-vi-file-types">
		<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Files by actual type</span><span className="pk-vi-card-caption">Select a type to focus the knowledge map without changing the source Vault.</span></div><Button variant="ghost" size="sm" onClick={() => onSelect(null)} className={!selected ? 'is-active' : ''}>All files</Button></div>
			<div className="pk-vi-file-type-body">
				<div className="pk-vi-donut"><svg viewBox="0 0 100 100" aria-label="File type distribution">{slices.map((slice) => <path key={slice.type.extension} d={pieSlicePath(slice.start, slice.end)} fill={slice.color} />)}{cursor < 1 && <path d={pieSlicePath(cursor, 1)} fill="#dedce4" />}</svg><span><strong>{formatNumber(total)}</strong><small>files</small></span></div>
				<div className="pk-vi-file-type-list">{shown.map((type, index) => <Button key={type.extension} variant="ghost" className={selected === type.extension ? 'is-active' : ''} onClick={() => onSelect(selected === type.extension ? null : type.extension)}>
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
			<div className="pk-vi-graph-legend"><span><i className="is-community" />Community</span><span><i className="is-topic" />Topic / Hub</span><span><b className="is-contains" />contains</span><span><b className="is-reference" />reference</span></div>
		</section>
		<section className="pk-vi-graph-context" aria-label="Map context">
			<div className="pk-vi-card"><div className="pk-vi-context-label"><GitBranch size={16} />Structure</div><strong>{communityCount > 0 ? `${formatNumber(communityCount)} Communities` : 'No Communities available'}</strong><span>{model ? `${formatNumber(model.nodes.length)} visible nodes · ${formatNumber(model.edges.length)} verified relations` : 'Build the Knowledge Index to derive structure.'}</span></div>
			<div className="pk-vi-card pk-vi-selection-context"><div className="pk-vi-selection"><div className="pk-vi-card-head"><span className="pk-vi-card-title">Selection</span>{selected && <Button variant="ghost" size="sm" onClick={() => setSelectedNodeId(null)}>Clear<X size={14} /></Button>}</div>{selected ? <><span className="pk-vi-selection-type">{String(selected.metadata?.kind ?? selected.role)}</span><strong>{selected.label}</strong><span>{selected.path.startsWith('community:') ? `${selected.constituentCount ?? 0} notes in this Community` : selected.path}</span>{selectedCommunityId && <Button variant="ghost" size="sm" onClick={() => toggleCommunity(selectedCommunityId)}>{selectedExpanded ? 'Collapse members' : 'Expand members'}<ChevronRight size={14} /></Button>}{Array.isArray(selected.metadata?.topics) && <div className="pk-vi-topic-list">{(selected.metadata.topics as string[]).map((topic) => <span key={topic}>{topic}</span>)}</div>}</> : <div className="pk-vi-empty">Select a Community, Topic or Hub to inspect current evidence.</div>}</div><div className="pk-vi-interpretation"><div className="pk-vi-context-label"><Sparkles size={16} />AI interpretation</div><strong>Not generated</strong><span>{selected ? 'No AI claim is stored for this selection. Run an enabled Community analysis to create reviewable evidence.' : 'Select a node first. The map does not invent themes from geometry.'}</span></div></div>
		</section>
	</div>;
}

function ActivityView({ snapshot, runtime, initialDate }: { snapshot: VaultIntelligenceSnapshot; runtime: VaultIntelligenceWorkspaceRuntime; initialDate: string | null }) {
	const [range, setRange] = useState<ActivityRange>(365);
	const [mode, setMode] = useState<'recorded' | 'themes'>('recorded');
	const [focusedDate, setFocusedDate] = useState<string | null>(initialDate);
	useEffect(() => { setFocusedDate(initialDate); }, [initialDate]);
	const records = allRecordedActivity(snapshot);
	const calendar = useMemo(() => calendarDays(mergeRecordedActivity(snapshot.activityDays, records), range), [snapshot.activityDays, records, range]);
	const calendarDates = new Set(calendar.map((day) => day.date));
	const periodFileChanges = snapshot.activityDays.filter((day) => calendarDates.has(day.date)).reduce((sum, day) => sum + day.count, 0);
	const periodRecords = records.filter((record) => calendarDates.has(toLocalDateKey(new Date(record.timestamp))));
	const buckets = bucketRecordedActivity(calendar, periodRecords, 36);
	const maxFile = Math.max(1, ...buckets.map((bucket) => bucket.fileCount));
	const maxVault = Math.max(1, ...buckets.map((bucket) => bucket.vaultCount));
	const maxChat = Math.max(1, ...buckets.map((bucket) => bucket.chatCount));
	const maxComposer = Math.max(1, ...buckets.map((bucket) => bucket.composerCount));
	const sessions = snapshot.activitySessions.filter((session) => session.endedAt >= Date.now() - range * 86_400_000).slice(0, 6);
	const themes = snapshot.activityThemes.filter((theme) => theme.citations.some((citation) => periodRecords.some((record) => record.id === citation.recordId)));
	const activeDays = calendar.filter((day) => day.count > 0).length;
	const focusedRecords = focusedDate ? periodRecords.filter((record) => toLocalDateKey(new Date(record.timestamp)) === focusedDate) : [];
	const rangeStart = Date.now() - range * 86_400_000;
	return <div className="pk-vi-activity-workspace pk-vi-activity-grid">
		<section className="pk-vi-activity-mode"><div className="pk-vi-segmented"><Button variant="ghost" className={mode === 'recorded' ? 'is-active' : ''} onClick={() => setMode('recorded')}>Recorded activity</Button><Button variant="ghost" className={mode === 'themes' ? 'is-active' : ''} onClick={() => setMode('themes')}>Evidence themes{themes.length ? ` · ${themes.length}` : ''}</Button></div><span>Each lane declares its source: file mtimes, durable chat/composer records, and Vault Intelligence receipts. Themes are generated only from those citations and remain Peak-owned annotations.</span></section>
		<div className="pk-vi-activity-layout">
			<section className="pk-vi-card pk-vi-activity-timeline">
				<div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Recorded source timeline</span><span className="pk-vi-card-caption">Each lane keeps its source contract visible. Empty space means no recorded evidence.</span></div><div className="pk-vi-segmented" aria-label="Activity range">{([[30, '30d'], [90, '90d'], [183, '6m'], [365, '1y']] as const).map(([value, label]) => <Button key={value} variant="ghost" className={range === value ? 'is-active' : ''} onClick={() => setRange(value)}>{label}</Button>)}</div></div>
				{mode === 'recorded' ? <><div className="pk-vi-timeline-axis"><span>{buckets[0]?.label ?? 'Start'}</span><span>{buckets[Math.floor(buckets.length / 2)]?.label ?? ''}</span><span>{buckets[buckets.length - 1]?.label ?? 'Today'}</span></div><ActivityLane label="File edits" detail="Latest file modification timestamp" buckets={buckets} value={(bucket) => bucket.fileCount} max={maxFile} tone="files" /><ActivityLane label="Chats" detail="Durable conversation message events" buckets={buckets} value={(bucket) => bucket.chatCount} max={maxChat} tone="chat" /><ActivityLane label="Composer" detail="Durable workspace events with a timestamp" buckets={buckets} value={(bucket) => bucket.composerCount} max={maxComposer} tone="composer" /><ActivityLane label="Vault Intelligence" detail="Scan and owner-action receipts" buckets={buckets} value={(bucket) => bucket.vaultCount} max={maxVault} tone="receipts" /><div className="pk-vi-activity-gap"><FolderKanban size={15} /><span><strong>Projects</strong><small>No project-history event stream is registered, so this lane remains intentionally empty.</small></span></div></> : <div className="pk-vi-theme-results">{themes.length === 0 ? <div className="pk-vi-empty"><strong>No evidence themes for this range</strong><span>Run the explicit analysis to create cited Peak-owned annotations. It never reads content outside the recorded activity selection.</span><Button className="pk-vi-primary" onClick={() => void runtime.analyzeActivityThemes(rangeStart, Date.now())}>Analyze recorded evidence</Button></div> : themes.map((theme) => <article key={theme.id}><span className="pk-vi-context-label"><Sparkles size={15} />Evidence theme</span><strong>{theme.label}</strong><small>{theme.citations.length} cited records · {Math.round(theme.confidence * 100)}% grouping confidence · {formatDateTime(theme.generatedAt)}</small><div>{theme.citations.slice(0, 4).map((citation) => <span key={citation.recordId}>{citation.objectPath ?? citation.recordId}</span>)}</div></article>)}</div>}
			</section>
			<aside className="pk-vi-activity-aside">
				<section className="pk-vi-card pk-vi-period-card"><div className="pk-vi-card-head"><span className="pk-vi-card-title">Period summary</span></div><div className="pk-vi-period-stats"><span><small>Range</small><strong>{range === 365 ? '1 year' : `${range} days`}</strong></span><span><small>Active days</small><strong>{formatNumber(activeDays)}</strong></span><span><small>File edits</small><strong>{formatNumber(periodFileChanges)}</strong></span><span><small>Recorded events</small><strong>{formatNumber(periodRecords.length)}</strong></span></div></section>
				<section className="pk-vi-card pk-vi-session-card"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">Recorded work sessions</span><span className="pk-vi-card-caption">Grouped by adjacent time or a shared object from durable events; session reasons are visible.</span></div></div><div className="pk-vi-session-list">{sessions.map((session) => <div key={session.id}><span><strong>{session.label}</strong><small>{formatDateTime(session.startedAt)} – {formatDateTime(session.endedAt)} · {session.reason.replace('-', ' ')}</small></span><b>{session.recordIds.length}</b></div>)}{sessions.length === 0 && <div className="pk-vi-empty">No timestamped event records in this range.</div>}</div></section>
				<section className="pk-vi-card pk-vi-theme-card"><div className="pk-vi-context-label"><Sparkles size={16} />Evidence themes</div><strong>{themes.length ? `${themes.length} generated` : 'Not analyzed'}</strong><span>{themes.length ? 'Each theme stores citations and its source revision.' : 'Use the explicit analysis action; no topic is inferred from blank timeline space.'}</span>{!themes.length && <Button variant="ghost" size="sm" onClick={() => void runtime.analyzeActivityThemes(rangeStart, Date.now())}>Analyze range</Button>}</section>
				{focusedDate && <section className="pk-vi-card pk-vi-focused-activity"><div className="pk-vi-card-head"><span className="pk-vi-card-title">{focusedDate}</span><Button variant="ghost" size="sm" onClick={() => setFocusedDate(null)}>Clear<X size={14} /></Button></div><span className="pk-vi-card-caption">{focusedRecords.length} durable Chat, Composer or Vault Intelligence records selected from the Overview heatmap. File mtimes remain in the file lane.</span></section>}
			</aside>
		</div>
	</div>;
}

function WorkQueue({ tasks, onOpenTask }: { tasks: VaultMaintenanceTask[]; onOpenTask: (taskId: string) => void }) {
	return <div className="pk-vi-page"><div className="pk-vi-page-head"><div><span className="pk-vi-page-title">Work queue</span><span className="pk-vi-page-description">Only unresolved work with an owner action and a verifiable exit condition belongs here. Starting a scan stays in the global Vault control, not inside the queue.</span></div></div><WorkSurface tasks={tasks.filter((task) => task.state !== 'verified')} origin="queue" onOpenTask={onOpenTask} /></div>;
}

function WorkSurface({ tasks, origin, onOpenTask }: { tasks: VaultMaintenanceTask[]; origin: 'queue' | 'completed'; onOpenTask: (taskId: string) => void }) {
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
		</Button>)}{filtered.length === 0 && <div className="pk-vi-work-empty"><span className="pk-vi-empty-mark"><Check size={20} /></span><div><strong>{tasks.length === 0 ? 'No unresolved maintenance work' : 'No tasks match this view'}</strong><span>{tasks.length === 0 ? 'The queue intentionally stays empty until a Scan creates evidence-backed owner work.' : 'Change the filter or search query to see another part of the queue.'}</span></div></div>}</div>
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
	const [selectors, setSelectors] = useState<VaultScanScopeSelector[]>([]);
	const [pathQuery, setPathQuery] = useState('');
	const allChecks = config.checkGroups.flatMap((group) => group.checks);
	const displayedCheckGroups = [...config.checkGroups].sort(
		(left, right) => (left.displayOrder ?? 99) - (right.displayOrder ?? 99),
	);
	const [selectedCheckKeys, setSelectedCheckKeys] = useState(() => new Set(allChecks.map((check) => check.checkId)));
	const [operations, setOperations] = useState<VaultScanAiOperationPlan[]>(() => resolvedOperationPlans(config, snapshot));
	const [indexOutputs, setIndexOutputs] = useState(() => config.indexOutputs.map((output) => ({
		id: output.id,
		enabled: output.availability !== 'later',
		availability: output.availability,
		operationIds: output.operationIds,
	})));
	useEffect(() => {
		setSelectedCheckKeys(new Set(config.checkGroups.flatMap((group) => group.checks.map((check) => check.checkId))));
		setOperations(resolvedOperationPlans(config, snapshot));
		setIndexOutputs(config.indexOutputs.map((output) => ({ id: output.id, enabled: output.availability !== 'later', availability: output.availability, operationIds: output.operationIds })));
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
	const estimatedTokens = selectedOps.reduce((sum, operation) => sum + operation.estimatedTokens, 0);
	const estimatedCost = selectedOps.reduce((sum, operation) => sum + operation.estimatedCostUsd, 0);
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
	return <div className="pk-vi-page pk-vi-scan-setup">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }]} />
		<section className="pk-vi-scan-hero"><div><span className="pk-vi-ready-mark"><ShieldCheck size={22} /></span><span><strong>Prepare a safe Vault scan</strong><small>Choose what Peak should examine, then review AI models and estimated usage. Your current Vault stays available while it runs.</small></span></div><div className="pk-vi-safety-facts"><span><small>Last successful scan</small><strong>{snapshot.changedCursorAt ? formatDateTime(snapshot.changedCursorAt) : 'First full Scan required'}</strong></span><span><small>Current Vault view</small><strong>Stays usable until publish</strong></span><span><small>User files</small><strong>No automatic edits</strong></span></div></section>
		<SetupSection number="1" title="Choose scan scope" status={scopeMode === 'selected' ? `${selectedPaths.length} selected` : scopeMode === 'changed' ? `${snapshot.changedSinceScan ?? 0} changed` : `${snapshot.availablePaths.length} files`}>
			<div className="pk-vi-choice-grid">{([
				['changed', 'Since last scan', snapshot.changedCursorAt ? 'Only objects changed since the latest completed Scan.' : 'Available after the first completed full Scan.'],
				['selected', 'Choose a scope', 'Search and select exact Vault files.'],
				['entire', 'Entire Vault', 'Rebuild the full Vault scope explicitly.'],
			] as const).map(([id, label, description]) => <Button key={id} variant="ghost" disabled={id === 'changed' && !snapshot.changedCursorAt} className={scopeMode === id ? 'is-active' : ''} onClick={() => setScopeMode(id)}><strong>{label}</strong><span>{description}</span></Button>)}</div>
			{scopeMode === 'selected' && <div className="pk-vi-path-picker"><label><Search size={15} /><input value={pathQuery} onChange={(event) => setPathQuery(event.target.value)} placeholder="Search Vault files" /></label>{matchingPaths.length > 0 && <div className="pk-vi-path-results">{matchingPaths.map((path) => <Button key={path} variant="ghost" onClick={() => { addSelector({ id: `file:${path}`, kind: 'file', label: path, paths: [path] }); setPathQuery(''); }}><FileText size={14} /><span>{path}</span><Check size={14} /></Button>)}</div>}<div className="pk-vi-scope-shortcuts"><span>Add a saved scope</span><div>{folderScopes.map((selector) => <Button key={selector.id} variant="ghost" disabled={selector.paths.length === 0} onClick={() => addSelector(selector)}>Folder · {selector.label}</Button>)}{communityScopes.map((selector) => <Button key={selector.id} variant="ghost" disabled={selector.paths.length === 0} onClick={() => addSelector(selector)}>Community · {selector.label}</Button>)}{savedWorkScope.paths.length > 0 && <Button variant="ghost" onClick={() => addSelector(savedWorkScope)}>Saved work · {savedWorkScope.label}</Button>}</div></div><div className="pk-vi-selected-paths">{selectors.map((selector) => <span key={selector.id}>{selector.kind} · {selector.label} · {selector.paths.length} files<Button variant="ghost" size="icon" onClick={() => { setSelectors((current) => current.filter((candidate) => candidate.id !== selector.id)); setSelectedPaths((current) => current.filter((path) => !selector.paths.includes(path) || selectors.some((candidate) => candidate.id !== selector.id && candidate.paths.includes(path)))); }} aria-label={`Remove ${selector.label}`}><X size={13} /></Button></span>)}</div></div>}
		</SetupSection>
		<SetupSection number="2" title="Choose scan tasks" status={`${selectedCheckKeys.size} of 19 tasks selected`}>
			<span className="pk-vi-section-description">These four owner-facing groups are the V2 contract: Knowledge Index 5, Content 4, Relationships 8, and Reviewable follow-up 2. The groups below keep every underlying detector or safe local output visible.</span>
			<div className="pk-vi-check-group-grid">{displayedCheckGroups.map((group) => { const selectedCount = group.checks.filter((check) => selectedCheckKeys.has(check.checkId)).length; const selected = selectedCount === group.checks.length; return <section key={group.id} className={`pk-vi-check-group-card ${selected ? 'is-active' : ''}`}><Button variant="ghost" onClick={() => setGroupSelected(group.checks, !selected)}><span className="pk-vi-check-mark">{selected && <Check size={14} />}</span><strong>{group.label}</strong><small>{selectedCount}/{group.checks.length} tasks</small></Button><div>{group.checks.map((check) => <label key={check.checkId}><input type="checkbox" checked={selectedCheckKeys.has(check.checkId)} onChange={() => setSelectedCheckKeys((current) => { const next = new Set(current); if (next.has(check.checkId)) next.delete(check.checkId); else next.add(check.checkId); return next; })} /><span><strong>{check.label}</strong><small>{check.description}</small></span></label>)}</div></section>; })}</div>
			<IndexOutputPlan config={config} outputs={indexOutputs} scopeObjectCount={scopeObjectCount} onToggle={toggleOutput} />
		</SetupSection>
		<SetupSection number="3" title="Review AI operations" status={`${selectedOps.length} enabled`}>
			<div className="pk-vi-operation-groups">{(['plan', 'index', 'relations', 'structure', 'follow-up'] as const).map((group) => <section key={group} className="pk-vi-operation-group"><div className="pk-vi-operation-group-head"><strong>{operationGroupLabel(group)}</strong><span>{operationGroupDescription(group)}</span></div><div className="pk-vi-operation-list">{config.scanOperations.filter((definition) => definition.group === group).map((definition) => { const operation = plannedOperations.find((candidate) => candidate.id === definition.id)!; const routeAvailable = snapshot.operationRoutes[operation.id]?.available ?? true; const scopeAvailable = operationAvailableForScope(operation.id, scopeMode); const available = routeAvailable && scopeAvailable; const shared = sharedExecutionLabel(operation.id); return <div key={definition.id} className={`pk-vi-operation-row ${available ? '' : 'is-unavailable'}`}><div><strong>{definition.label}</strong><span>{definition.description}{shared ? ` · ${shared}` : ''}</span></div><div className="pk-vi-operation-route"><strong>{operation.model}</strong><span>{operation.provider}</span></div><span>{formatCompactNumber(operation.estimatedTokens)} · {formatMoney(operation.estimatedCostUsd)}</span><Button variant="ghost" disabled={!available} className={operation.enabled ? 'is-on' : ''} onClick={() => setOperations((current) => toggleOperationExecutionGroup(current, operation.id))}>{!routeAvailable ? 'Unavailable' : !scopeAvailable ? 'Entire Vault only' : operation.enabled ? 'On' : 'Off'}</Button></div>; })}</div></section>)}</div>
		</SetupSection>
		<section className="pk-vi-estimate"><div><Clock3 size={18} /><span><strong>Current run estimate</strong><small>Planning estimate scaled from the frozen scope, enabled outputs and selected routes; the receipt records actual usage.</small></span></div><div><span><small>Scope</small><strong>{scopeObjectCount} objects</strong></span><span><small>AI tokens</small><strong>~{formatCompactNumber(estimatedTokens)}</strong></span><span><small>AI cost</small><strong>~{formatMoney(estimatedCost)}</strong></span></div></section>
		<div className="pk-vi-footer-actions"><Button variant="ghost" onClick={onBack}>Cancel</Button><Button className="pk-vi-primary" onClick={start} disabled={scopeMode === 'selected' && selectedPaths.length === 0}><ScanSearch size={16} />Start Scan</Button></div>
	</div>;
}

function IndexOutputPlan({ config, outputs, scopeObjectCount, onToggle }: {
	config: VaultIntelligenceConfig;
	outputs: Array<{ id: VaultIntelligenceConfig['indexOutputs'][number]['id']; enabled: boolean; availability: 'required' | 'automatic' | 'optional' | 'later'; operationIds: VaultScanAiOperationPlan['id'][] }>;
	scopeObjectCount: number;
	onToggle: (id: VaultIntelligenceConfig['indexOutputs'][number]['id']) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const selected = outputs.filter((output) => output.enabled).length;
	return <section className={`pk-vi-index-plan ${expanded ? 'is-expanded' : ''}`}>
		<Button variant="ghost" className="pk-vi-index-plan-trigger" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
			<Search size={16} /><span><strong>Knowledge Index plan</strong><small>Core Search + {selected} enabled outputs · inherits the Step 1 scope</small></span><span>{scopeObjectCount} objects</span><ChevronDown size={16} />
		</Button>
		{expanded && <div className="pk-vi-index-output-groups">{(['core', 'summaries', 'tags', 'relationships', 'content'] as const).map((group) => {
			const entries = config.indexOutputs.filter((output) => output.group === group);
			if (entries.length === 0) return null;
			return <section key={group}><div><strong>{indexOutputGroupLabel(group)}</strong><span>{entries.filter((entry) => outputs.find((output) => output.id === entry.id)?.enabled).length} enabled</span></div>{entries.map((entry) => { const output = outputs.find((candidate) => candidate.id === entry.id)!; const canToggle = entry.availability === 'optional'; return <label key={entry.id} className={`pk-vi-index-output is-${entry.availability}`}><input type="checkbox" checked={output.enabled} disabled={!canToggle} onChange={() => onToggle(entry.id)} /><span><strong>{entry.label}</strong><small>{entry.description}</small></span><em>{entry.availability === 'automatic' ? 'Automatic' : entry.availability === 'required' ? 'Required' : entry.availability === 'later' ? 'Later' : 'Optional'}</em></label>; })}</section>;
		})}</div>}
	</section>;
}

function indexOutputGroupLabel(group: 'core' | 'summaries' | 'tags' | 'relationships' | 'content'): string {
	if (group === 'core') return 'Core Search';
	if (group === 'summaries') return 'Summaries';
	if (group === 'tags') return 'Tags & entities';
	if (group === 'relationships') return 'Relationships';
	return 'Content understanding';
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
	const [focusedStageId, setFocusedStageId] = useState<VaultIntelligenceSnapshot['run']['stages'][number]['id'] | null>(run.currentStage);
	const completed = run.status === 'completed';
	const resumable = run.status === 'interrupted';
	const overall = run.stages.length ? Math.round(run.stages.reduce((sum, stage) => sum + (stage.status === 'completed' || stage.status === 'partial' ? 1 : stage.status === 'running' ? progressRatio(stage) : 0), 0) / run.stages.length * 100) : 0;
	const indexStage = run.stages.find((stage) => stage.id === 'index');
	const indexProgress = indexStage ? Math.round(progressRatio(indexStage) * 100) : 0;
	const currentStage = run.stages.find((stage) => stage.id === run.currentStage) ?? null;
	const currentOperation = run.operations.find((operation) => operation.status === 'running') ?? null;
	return <div className="pk-vi-page">
		<Breadcrumb items={[{ label: 'Vault Intelligence', action: onBack }, { label: 'Scan setup' }, { label: 'Run progress' }]} />
		<div className="pk-vi-page-head"><div><span className="pk-vi-page-title">{completed ? 'Scan finished' : resumable ? 'Scan paused at a durable checkpoint' : run.status === 'failed' ? 'Scan failed' : 'Scanning the Vault'}</span><span className="pk-vi-page-description">{run.id ?? 'No active run'} · {run.frozenPaths.length} frozen objects</span></div><div className="pk-vi-page-actions">{run.status === 'running' && <Button variant="ghost" onClick={() => runtime.requestStop()}><Pause size={15} />Pause at checkpoint</Button>}{resumable && <Button className="pk-vi-primary" onClick={() => void runtime.resumeScan()}><Play size={15} />Resume</Button>}{completed && <Button className="pk-vi-primary" onClick={onCompleted}>View completed work<ChevronRight size={15} /></Button>}</div></div>
		<section className="pk-vi-run-dashboard">
			<div className="pk-vi-card pk-vi-progress-overview"><div><span>Overall Scan</span><strong>{overall}%</strong></div><div className="pk-vi-progress-track"><i style={{ width: `${overall}%` }} /></div><small>{currentStage?.message ?? (completed ? 'All enabled stages reached a durable checkpoint.' : 'Waiting for a stage to start.')}</small></div>
			<div className="pk-vi-card pk-vi-progress-overview"><div><span>Knowledge Index</span><strong>{indexProgress}%</strong></div><div className="pk-vi-progress-track"><i style={{ width: `${indexProgress}%` }} /></div><small>{indexStage?.processed ?? 0} of {indexStage?.total || '—'} objects processed</small></div>
			<div className="pk-vi-card pk-vi-current-work"><small>Current object</small><strong>{currentOperation?.currentPath ?? 'No object in flight'}</strong><span>{currentOperation ? operationLabel(currentOperation.id) : currentStage ? stageLabel(currentStage.id) : 'Waiting'}</span></div>
		</section>
		<div className="pk-vi-stage-list">{run.stages.map((stage, index) => <Button key={stage.id} variant="ghost" className={`pk-vi-card pk-vi-stage is-${stage.status} ${focusedStageId === stage.id ? 'is-focused' : ''}`} onClick={() => setFocusedStageId((current) => current === stage.id ? null : stage.id)}><div className="pk-vi-stage-head"><span className="pk-vi-step-number">{index + 1}</span><div><strong>{stageLabel(stage.id)}</strong><span>{stage.message}</span></div><StageState status={stage.status} /></div>{(stage.status === 'running' || focusedStageId === stage.id) && <><div className="pk-vi-progress-track"><i style={{ width: `${Math.round(progressRatio(stage) * 100)}%` }} /></div><small className="pk-vi-stage-focus-detail">{stage.processed.toLocaleString()} of {stage.total || 'unknown'} objects · click again to collapse this stage.</small></>}</Button>)}</div>
		<section className="pk-vi-card"><div className="pk-vi-card-head"><div><span className="pk-vi-card-title">AI and Index operations</span><span className="pk-vi-card-caption">Frozen provider and model routes, live progress, non-duplicated actual usage, and only runtime evidence.</span></div></div><div className="pk-vi-run-operations">{run.operations.map((operation) => { const sharedOwner = sharedUsageOwner(operation.id); const owner = sharedOwner ? run.operations.find((candidate) => candidate.id === sharedOwner) : null; return <details key={operation.id} className="pk-vi-run-operation"><summary><span className={`pk-vi-operation-dot is-${operation.status}`} /><div><strong>{operationLabel(operation.id)}</strong><span>{operation.currentPath ?? operation.provider}</span></div><div><strong>{operation.model}</strong><span>{operation.processed}/{operation.total || '—'}</span></div><div>{owner && owner.usage.totalTokens > 0 ? <><strong>Shared receipt</strong><span>Included in {operationLabel(owner.id)}</span></> : <><strong>{formatCompactNumber(operation.usage.totalTokens)} tokens</strong><span>{formatMoney(operation.usage.costUsd)}</span></>}</div>{operation.status === 'waiting' || operation.status === 'running' ? <Button variant="ghost" size="sm" onClick={(event) => { event.preventDefault(); void runtime.skipOperation(operation.id); }}>Skip</Button> : <span className="pk-vi-operation-status">{operation.status}</span>}<ChevronDown size={15} /></summary><div className="pk-vi-operation-evidence"><span><small>Started</small><strong>{operation.startedAt ? formatDateTime(operation.startedAt) : 'Not started'}</strong></span><span><small>Completed</small><strong>{operation.completedAt ? formatDateTime(operation.completedAt) : 'Not completed'}</strong></span><div>{operation.evidence?.length ? operation.evidence.map((fact) => <span key={fact}>{fact}</span>) : <span>No runtime evidence has been recorded yet.</span>}</div>{operation.error && <span className="pk-vi-stale-warning"><CircleAlert size={14} />{operation.error}</span>}</div></details>; })}</div></section>
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
				<details className="pk-vi-disclosure"><summary><span><strong>Completed automatically</strong><small>{completed.searchableCount === null ? 'Search readiness unavailable' : `${completed.searchableCount} searchable`} · Map receipt recorded · {completed.receipts.filter((receipt) => receipt.status === 'completed').length} receipts complete</small></span><ChevronDown size={16} /></summary><div className="pk-vi-receipts">{completed.receipts.map((receipt) => <div key={receipt.id}><span><strong>{receipt.label}</strong><small>{receipt.detail}</small></span><span><strong>{receipt.result}</strong><small>{receipt.ownerBoundary === 'peak-owned' ? 'Peak-owned state' : 'User-file boundary'}</small></span></div>)}</div></details>
				<details className="pk-vi-disclosure"><summary><span><strong>Run details</strong><small>{completed.objectCount} objects · {elapsedLabel(completed.startedAt, completed.completedAt)} · {formatCompactNumber(completed.usage.totalTokens)} AI tokens · {formatMoney(completed.usage.costUsd)} actual</small></span><ChevronDown size={16} /></summary><div className="pk-vi-run-detail-grid"><span><small>Scope</small><strong>{completed.scopeMode}</strong></span><span><small>Searchable</small><strong>{completed.searchableCount ?? 'Unavailable'}</strong></span><span><small>Warnings</small><strong>{completed.warnings.length}</strong></span><span><small>Run ID</small><strong>{completed.runId}</strong></span></div></details>
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
	composerCount: number;
}

function ActivityLane({ label, detail, buckets, value, max, tone }: {
	label: string;
	detail: string;
	buckets: ActivityBucket[];
	value: (bucket: ActivityBucket) => number;
	max: number;
	tone: 'files' | 'chat' | 'composer' | 'receipts';
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
	const countsByKind = new Map<string, Partial<Record<'vaultCount' | 'chatCount' | 'composerCount', number>>>();
	for (const record of records) {
		const date = toLocalDateKey(new Date(record.timestamp));
		const counts = countsByKind.get(date) ?? {};
		if (record.kind === 'chat') counts.chatCount = (counts.chatCount ?? 0) + 1;
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
		: isSharedReviewOperation(id)
			? new Set<VaultScanAiOperationPlan['id']>(['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis'])
			: new Set<VaultScanAiOperationPlan['id']>([id]);
	const enabled = !operations.find((operation) => operation.id === id)?.enabled;
	return operations.map((operation) => group.has(operation.id) ? { ...operation, enabled } : operation);
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
function elapsedLabel(start: number, end: number): string { const seconds = Math.max(0, Math.round((end - start) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }

VaultIntelligenceWorkspace.displayName = 'VaultIntelligenceWorkspace';
