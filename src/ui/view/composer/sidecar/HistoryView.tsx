import * as React from 'react';
import {
	FilePenLine,
	Filter,
	MessageSquare,
	Sparkles,
} from 'lucide-react';
import type {
	ComposerHistoryItem,
	ComposerTransactionProjection,
} from '@/core/composer';
import {
	DEFAULT_COMPOSER_HISTORY_FILTERS,
	filterComposerHistoryActivities,
	projectComposerHistoryActivities,
	type ComposerHistoryActivity,
	type ComposerHistoryActivitySource,
	type ComposerHistoryActivityStatus,
	type ComposerHistoryFilters,
	type ComposerHistoryTransactionResolver,
} from '@/service/composer';
import {
	Button,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/ui/components/primitives';
import { HistoryDetailModal } from './HistoryDetailModal';
import type { SidecarStrings } from './sidecarConfig';
import {
	useSessionProjection,
	useSidecar,
	useWorkspaceProjection,
} from './SidecarContext';

/** One mixed activity timeline; storage truths remain separate behind the projector. */
export function HistoryView(): React.ReactElement {
	const {
		runtime,
		workspaceRuntime,
		documentId,
		documentSnapshot,
		hub,
		config,
		onLocate,
		onRestoreGeneration,
	} = useSidecar();
	const workspace = useWorkspaceProjection(workspaceRuntime);
	const session = useSessionProjection(runtime);
	const transactionProjection = useHubProjection(hub);
	const [filters, setFilters] = React.useState<ComposerHistoryFilters>(
		DEFAULT_COMPOSER_HISTORY_FILTERS,
	);
	const [selectedActivityId, setSelectedActivityId] = React.useState<string | null>(null);
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
	const activities = React.useMemo(
		() => projectComposerHistoryActivities({
			documentId: documentId ?? documentSnapshot?.documentId ?? '',
			runs: workspace?.runs ?? [],
			receipts: session.receipts,
			externalRunAliases: session.externalRunAliases,
			history: transactionProjection?.history ?? [],
			labels: composerHistoryActivityLabels(s),
			transactionResolver,
		}),
		[
			documentId,
			documentSnapshot?.documentId,
			workspace,
			session.receipts,
			session.externalRunAliases,
			transactionProjection,
			transactionResolver,
			s,
		],
	);
	const filtered = React.useMemo(
		() => filterComposerHistoryActivities(activities, filters),
		[activities, filters],
	);
	const selectedActivity = activities.find((activity) =>
		activity.activityId === selectedActivityId,
	);
	const days = groupActivitiesByDay(filtered, s, new Date());

	return (
		<div className="pk-history" data-testid="pk-unified-history">
			<header className="pk-history-heading">
				<div>
					<span className="pk-history-title">{s.historyUnifiedTitle}</span>
					<span className="pk-history-intro">{s.historyUnifiedIntro}</span>
				</div>
				<span className="pk-history-total">
					{formatCount(s.historyActivityCount, activities.length)}
				</span>
			</header>

			<HistoryFilterBar filters={filters} onChange={setFilters} strings={s} />

			{filtered.length === 0 && (
				<div className="pk-history--empty">{s.historyEmpty}</div>
			)}

			{days.map((day) => (
				<section key={day.key} className="pk-history-day">
					<header className="pk-history-day-head">
						<span>{day.label}</span>
						<span>{formatCount(s.historyActivityCount, day.items.length)}</span>
					</header>
					<div className="pk-history-list">
						{day.items.map((activity) => (
							<HistoryActivityRow
								key={activity.activityId}
								activity={activity}
								onOpen={() => setSelectedActivityId(activity.activityId)}
								strings={s}
							/>
						))}
					</div>
				</section>
			))}

			{selectedActivity && (
				<HistoryDetailModal
					activity={selectedActivity}
					snapshot={documentSnapshot}
					transactionResolver={transactionResolver}
					strings={s}
					onClose={() => setSelectedActivityId(null)}
					onLocate={onLocate}
					onRestore={onRestoreGeneration}
					onRollback={async (historyId) => {
						await hub?.rollback(historyId);
						setSelectedActivityId(null);
					}}
				/>
			)}
		</div>
	);
}

function HistoryActivityRow({
	activity,
	onOpen,
	strings,
}: {
	activity: ComposerHistoryActivity;
	onOpen(): void;
	strings: SidecarStrings;
}): React.ReactElement {
	return (
		<div
			className="pk-history-row"
			data-source={activity.source}
			data-status={activity.status}
		>
			<Button
				variant="ghost"
				className="pk-history-main"
				onClick={onOpen}
				aria-label={`${strings.historyOpenDetail}: ${activity.actionLabel}`}
			>
				<span className="pk-history-source-icon" data-source={activity.source}>
					{activityIcon(activity.source)}
				</span>
				<span className="pk-history-copy">
					<span className="pk-history-title-row">
						<strong>{activity.actionLabel}</strong>
						<em data-status={activity.status}>
							{activityStatusLabel(activity.status, strings)}
						</em>
					</span>
					<small>{activity.targetLabel}</small>
					{activity.changeSummary && (
						<span className="pk-history-excerpt">{activity.changeSummary}</span>
					)}
				</span>
				<span className="pk-history-meta">
					<time>{formatHistoryTime(activity.occurredAt)}</time>
					<strong>{activitySourceLabel(activity.source, strings)}</strong>
					{activity.variantCount > 1 && (
						<span>{formatCount(strings.generationHistoryVersions, activity.variantCount)}</span>
					)}
				</span>
			</Button>
		</div>
	);
}

function HistoryFilterBar({
	filters,
	onChange,
	strings,
}: {
	filters: ComposerHistoryFilters;
	onChange(filters: ComposerHistoryFilters): void;
	strings: SidecarStrings;
}): React.ReactElement {
	const activeCount = Object.values(filters).filter((value) => value !== 'all').length;
	return (
		<div className="pk-history-filter-bar">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="pk-history-filter-trigger"
						data-active={activeCount > 0 || undefined}
					>
						<Filter />
						{strings.historyFilter}
						{activeCount > 0 && <span>{activeCount}</span>}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="pk-history-filter-popover"
					portalClassName="pk-history-filter-portal"
				>
					<HistoryFilterSelect
						label={strings.historyFilterSource}
						value={filters.source}
						options={sourceOptions(strings)}
						onChange={(source) => onChange({ ...filters, source })}
					/>
					<HistoryFilterSelect
						label={strings.historyFilterAction}
						value={filters.effect}
						options={effectOptions(strings)}
						onChange={(effect) => onChange({ ...filters, effect })}
					/>
					<HistoryFilterSelect
						label={strings.historyFilterStatus}
						value={filters.status}
						options={statusOptions(strings)}
						onChange={(status) => onChange({ ...filters, status })}
					/>
					<HistoryFilterSelect
						label={strings.historyFilterTarget}
						value={filters.target}
						options={targetOptions(strings)}
						onChange={(target) => onChange({ ...filters, target })}
					/>
					{activeCount > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="pk-history-filter-reset"
							onClick={() => onChange(DEFAULT_COMPOSER_HISTORY_FILTERS)}
						>
							{strings.historyResetFilters}
						</Button>
					)}
				</PopoverContent>
			</Popover>
			{activeCount > 0 && (
				<span className="pk-history-filter-summary">
					{`${activeCount} · ${strings.historyFilter}`}
				</span>
			)}
		</div>
	);
}

function HistoryFilterSelect<TValue extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: TValue;
	options: readonly { value: TValue; label: string }[];
	onChange(value: TValue): void;
}): React.ReactElement {
	return (
		<label className="pk-history-filter-field">
			<span>{label}</span>
			<select value={value} onChange={(event) => onChange(event.target.value as TValue)}>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

export function composerHistoryActivityLabels(strings: SidecarStrings) {
	return {
		legacyGeneration: strings.historyLegacyGeneration,
		copilot: strings.tabCopilot,
		directEdit: strings.historyDirect,
		documentTarget: strings.historyDocumentTarget,
		blockTarget: strings.historyBlockTarget,
		unitTarget: strings.historyUnitTarget,
		selectionTarget: strings.historySelectionTarget,
		unknownTarget: strings.historyNoTarget,
	};
}

function sourceOptions(
	strings: SidecarStrings,
): readonly { value: ComposerHistoryFilters['source']; label: string }[] {
	return [
		{ value: 'all', label: strings.historyFilterAll },
		{ value: 'generation', label: strings.historySourceGeneration },
		{ value: 'copilot', label: strings.historySourceCopilot },
		{ value: 'document', label: strings.historySourceDocument },
	];
}

function effectOptions(
	strings: SidecarStrings,
): readonly { value: ComposerHistoryFilters['effect']; label: string }[] {
	return [
		{ value: 'all', label: strings.historyFilterAll },
		{ value: 'analyze', label: strings.historyActionAnalyze },
		{ value: 'rewrite', label: strings.historyActionRewrite },
		{ value: 'insert', label: strings.historyActionInsert },
		{ value: 'delete', label: strings.historyActionDelete },
		{ value: 'transform', label: strings.historyActionTransform },
		{ value: 'metadata-patch', label: strings.historyActionMetadata },
		{ value: 'asset-transaction', label: strings.historyActionAsset },
		{ value: 'native-object-patch', label: strings.historyActionNative },
	];
}

function statusOptions(
	strings: SidecarStrings,
): readonly { value: ComposerHistoryFilters['status']; label: string }[] {
	return [
		{ value: 'all', label: strings.historyFilterAll },
		{ value: 'running', label: strings.historyStatusRunning },
		{ value: 'pending-review', label: strings.generationHistoryPending },
		{ value: 'accepted', label: strings.generationHistoryAccepted },
		{ value: 'not-adopted', label: strings.generationHistoryNotAdopted },
		{ value: 'completed', label: strings.historyStatusCompleted },
		{ value: 'failed', label: strings.generationHistoryFailed },
		{ value: 'cancelled', label: strings.generationHistoryCancelled },
		{ value: 'stale', label: strings.generationHistoryStale },
		{ value: 'rolled-back', label: strings.historyStatusRolledBack },
	];
}

function targetOptions(
	strings: SidecarStrings,
): readonly { value: ComposerHistoryFilters['target']; label: string }[] {
	return [
		{ value: 'all', label: strings.historyFilterAll },
		{ value: 'document', label: strings.historyDocumentTarget },
		{ value: 'block', label: strings.historyBlockTarget },
		{ value: 'unit', label: strings.historyUnitTarget },
		{ value: 'selection', label: strings.historySelectionTarget },
	];
}

function activityIcon(source: ComposerHistoryActivitySource): React.ReactNode {
	if (source === 'generation') return <Sparkles aria-hidden />;
	if (source === 'copilot') return <MessageSquare aria-hidden />;
	return <FilePenLine aria-hidden />;
}

export function activitySourceLabel(
	source: ComposerHistoryActivitySource,
	strings: SidecarStrings,
): string {
	if (source === 'generation') return strings.historySourceGeneration;
	if (source === 'copilot') return strings.historySourceCopilot;
	return strings.historySourceDocument;
}

export function activityStatusLabel(
	status: ComposerHistoryActivityStatus,
	strings: SidecarStrings,
): string {
	if (status === 'running') return strings.historyStatusRunning;
	if (status === 'pending-review') return strings.generationHistoryPending;
	if (status === 'accepted') return strings.generationHistoryAccepted;
	if (status === 'not-adopted') return strings.generationHistoryNotAdopted;
	if (status === 'failed') return strings.generationHistoryFailed;
	if (status === 'cancelled') return strings.generationHistoryCancelled;
	if (status === 'stale') return strings.generationHistoryStale;
	if (status === 'rolled-back') return strings.historyStatusRolledBack;
	return strings.historyStatusCompleted;
}

export interface HistoryActivityDayGroup {
	key: string;
	label: string;
	items: readonly ComposerHistoryActivity[];
}

export function groupActivitiesByDay(
	items: readonly ComposerHistoryActivity[],
	strings: Pick<SidecarStrings, 'historyToday'>,
	now: Date,
): readonly HistoryActivityDayGroup[] {
	const byDay = new Map<string, ComposerHistoryActivity[]>();
	for (const item of items) {
		const key = localDateKey(new Date(item.occurredAt));
		const group = byDay.get(key) ?? [];
		group.push(item);
		byDay.set(key, group);
	}
	return [...byDay.entries()].map(([key, grouped]) => ({
		key,
		label: key === localDateKey(now)
			? strings.historyToday
			: new Intl.DateTimeFormat(undefined, {
					month: 'short',
					day: 'numeric',
				}).format(new Date(grouped[0].occurredAt)),
		items: grouped,
	}));
}

/** Compatibility helper used by the existing transaction grouping regression. */
export interface HistoryDayGroup {
	key: string;
	label: string;
	items: readonly ComposerHistoryItem[];
}

export function groupHistoryByDay(
	items: readonly ComposerHistoryItem[],
	strings: Pick<SidecarStrings, 'historyToday'>,
	now: Date,
): readonly HistoryDayGroup[] {
	const byDay = new Map<string, ComposerHistoryItem[]>();
	for (const item of [...items].reverse()) {
		const key = localDateKey(new Date(item.timestamp));
		const group = byDay.get(key) ?? [];
		group.push(item);
		byDay.set(key, group);
	}
	return [...byDay.entries()].map(([key, grouped]) => ({
		key,
		label: key === localDateKey(now)
			? strings.historyToday
			: new Intl.DateTimeFormat(undefined, {
					month: 'short',
					day: 'numeric',
				}).format(new Date(grouped[0].timestamp)),
		items: grouped,
	}));
}

export function countTransactions(items: readonly ComposerHistoryItem[]): number {
	return items.reduce((total, item) => total + (item.children?.length ?? 1), 0);
}

export function formatHistoryTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(new Date(timestamp));
}

function formatCount(template: string, count: number): string {
	return template.replace('{count}', String(count));
}

function localDateKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Subscribe to the hub projection as a React external store. */
function useHubProjection(
	hub: ReturnType<typeof useSidecar>['hub'],
): ComposerTransactionProjection | null {
	const ref = React.useRef<ComposerTransactionProjection | null>(hub?.projection() ?? null);
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
