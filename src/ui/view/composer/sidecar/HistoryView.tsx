import * as React from 'react';
import {
	Check,
	ChevronRight,
	FilePenLine,
	Filter,
	MessageSquare,
	Sparkles,
	X,
} from 'lucide-react';
import type {
	ComposerCapabilityEffectKind,
	ComposerHistoryItem,
	ComposerTarget,
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
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';

/** One mixed activity timeline; storage truths remain separate behind the projector. */
export function HistoryView(): React.ReactElement {
	const historyRef = React.useRef<HTMLDivElement | null>(null);
	const selectedTriggerRef = React.useRef<HTMLElement | null>(null);
	const {
		runtime,
		workspaceRuntime,
		documentId,
		documentSnapshot,
		hub,
		config,
		onLocate,
		onRestoreGeneration,
		onPresentationOriginChange,
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
	const hasActiveFilters = filters.source !== 'all'
		|| filters.effects.length > 0
		|| filters.statuses.length > 0
		|| filters.targets.length > 0;
	const selectedActivity = activities.find((activity) =>
		activity.activityId === selectedActivityId,
	);
	const days = groupActivitiesByDay(filtered, s, new Date());
	useRovingComposite(historyRef, {
		itemSelector: '.pk-history-main:not([disabled])',
		orientation: 'vertical',
		rememberBy: 'data-history-activity-id',
	});

	return (
		<div ref={historyRef} className="pk-history" data-testid="pk-unified-history">
			<header className="pk-history-heading">
				<div>
					<span className="pk-history-title">{s.historyUnifiedTitle}</span>
					<span className="pk-history-intro">{s.historyUnifiedIntro}</span>
				</div>
				<span className="pk-history-total">
					{formatCount(
						hasActiveFilters
							? s.historyFilteredActivityCount
							: s.historyActivityCount,
						hasActiveFilters ? filtered.length : activities.length,
					)}
				</span>
			</header>

			<HistoryFilterBar
				activities={activities}
				filteredCount={filtered.length}
				filters={filters}
				onChange={setFilters}
				strings={s}
			/>

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
								onOpen={(trigger) => {
									selectedTriggerRef.current = trigger;
									setSelectedActivityId(activity.activityId);
								}}
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
					opener={selectedTriggerRef.current}
					onClose={() => setSelectedActivityId(null)}
					onLocate={onLocate}
					onRestore={(runId) => {
						const restored = onRestoreGeneration?.(runId) ?? false;
						if (!restored) return false;
						onPresentationOriginChange?.({
							kind: 'history-deep-link',
							runId,
						});
						return true;
					}}
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
	onOpen(trigger: HTMLElement): void;
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
				data-history-activity-id={activity.activityId}
				onClick={(event) => onOpen(event.currentTarget)}
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
				<time className="pk-history-time">{formatHistoryTime(activity.occurredAt)}</time>
				<ChevronRight className="pk-history-chevron" aria-hidden />
			</Button>
		</div>
	);
}

function HistoryFilterBar({
	activities,
	filteredCount,
	filters,
	onChange,
	strings,
}: {
	activities: readonly ComposerHistoryActivity[];
	filteredCount: number;
	filters: ComposerHistoryFilters;
	onChange(filters: ComposerHistoryFilters): void;
	strings: SidecarStrings;
}): React.ReactElement {
	const [open, setOpen] = React.useState(false);
	const primaryRef = React.useRef<HTMLDivElement | null>(null);
	useRovingComposite(primaryRef, {
		itemSelector: 'button:not([disabled])',
		orientation: 'horizontal',
		rememberBy: 'data-history-source',
	});
	const activeCount = filters.effects.length + filters.statuses.length + filters.targets.length;
	const sourceFiltered = filters.source === 'all'
		? activities
		: activities.filter((activity) => activity.source === filters.source);
	const effects = withFacetCounts(
		effectOptions(strings),
		sourceFiltered,
		(activity) => activity.effectKind,
		filters.effects,
	);
	const statuses = withFacetCounts(
		statusOptions(strings),
		sourceFiltered,
		(activity) => activity.status,
		filters.statuses,
	);
	const targets = withFacetCounts(
		targetOptions(strings),
		sourceFiltered,
		(activity) => activity.targetKind,
		filters.targets,
	);
	return (
		<div className="pk-history-filter-bar">
			<div
				ref={primaryRef}
				className="pk-history-filter-primary"
				role="group"
				aria-label={strings.historyFilterSource}
			>
				{sourceOptions(strings, activities).map((option) => (
					<Button
						key={option.value}
						variant="ghost"
						size="sm"
						className="pk-history-source-filter"
						data-history-source={option.value}
						aria-pressed={filters.source === option.value}
						data-active={filters.source === option.value || undefined}
						onClick={() => onChange({ ...filters, source: option.value })}
					>
						<span>{option.label}</span>
						<small>{option.count}</small>
					</Button>
				))}
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="pk-history-filter-trigger"
							data-history-source="more"
							data-active={activeCount > 0 || undefined}
						>
							<Filter aria-hidden />
							{strings.historyFilterMore}
							{activeCount > 0 && <span>{activeCount}</span>}
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="pk-history-filter-popover"
						portalClassName="pk-history-filter-portal"
					>
						<header className="pk-history-filter-popover__head">
							<strong>{strings.historyFilter}</strong>
							<span>{strings.historyFilterAvailable}</span>
						</header>
						{effects.length > 0 && (
							<HistoryFacetGroup
								label={strings.historyFilterAction}
								options={effects}
								selected={filters.effects}
								onToggle={(effect) => onChange({
									...filters,
									effects: toggleFilterValue(filters.effects, effect),
								})}
							/>
						)}
						{statuses.length > 0 && (
							<HistoryFacetGroup
								label={strings.historyFilterStatus}
								options={statuses}
								selected={filters.statuses}
								onToggle={(status) => onChange({
									...filters,
									statuses: toggleFilterValue(filters.statuses, status),
								})}
							/>
						)}
						{targets.length > 0 && (
							<HistoryFacetGroup
								label={strings.historyFilterTarget}
								options={targets}
								selected={filters.targets}
								onToggle={(target) => onChange({
									...filters,
									targets: toggleFilterValue(filters.targets, target),
								})}
							/>
						)}
						<footer className="pk-history-filter-popover__footer">
							<span>{formatCount(strings.historyFilterShowing, filteredCount)}</span>
							<div>
								{activeCount > 0 && (
									<Button
										variant="ghost"
										size="sm"
										className="pk-history-filter-reset"
										onClick={() => onChange({
											...filters,
											effects: [],
											statuses: [],
											targets: [],
										})}
									>
										{strings.historyResetFilters}
									</Button>
								)}
								<Button
									variant="secondary"
									size="sm"
									className="pk-history-filter-done"
									onClick={() => setOpen(false)}
								>
									{strings.historyFilterDone}
								</Button>
							</div>
						</footer>
					</PopoverContent>
				</Popover>
			</div>
			{activeCount > 0 && (
				<HistoryAppliedFilters
					filters={filters}
					onChange={onChange}
					strings={strings}
				/>
			)}
		</div>
	);
}

interface CountedFilterOption<TValue extends string> {
	value: TValue;
	label: string;
	count: number;
}

function HistoryFacetGroup<TValue extends string>({
	label,
	options,
	selected,
	onToggle,
}: {
	label: string;
	options: readonly CountedFilterOption<TValue>[];
	selected: readonly TValue[];
	onToggle(value: TValue): void;
}): React.ReactElement {
	return (
		<section className="pk-history-filter-group">
			<span className="pk-history-filter-group__label">{label}</span>
			<div>
				{options.map((option) => (
					<Button
						key={option.value}
						variant="ghost"
						className="pk-history-filter-option"
						aria-pressed={selected.includes(option.value)}
						data-selected={selected.includes(option.value) || undefined}
						onClick={() => onToggle(option.value)}
					>
						<span className="pk-history-filter-check">
							{selected.includes(option.value) && <Check aria-hidden />}
						</span>
						<span>{option.label}</span>
						<small>{option.count}</small>
					</Button>
				))}
			</div>
		</section>
	);
}

function HistoryAppliedFilters({
	filters,
	onChange,
	strings,
}: {
	filters: ComposerHistoryFilters;
	onChange(filters: ComposerHistoryFilters): void;
	strings: SidecarStrings;
}): React.ReactElement {
	return (
		<div className="pk-history-filter-chips">
			{filters.effects.map((effect) => (
				<HistoryFilterChip
					key={effect}
					label={optionLabel(effectOptions(strings), effect)}
					removeLabel={strings.historyRemoveFilter}
					onRemove={() => onChange({
						...filters,
						effects: filters.effects.filter((value) => value !== effect),
					})}
				/>
			))}
			{filters.statuses.map((status) => (
				<HistoryFilterChip
					key={status}
					label={optionLabel(statusOptions(strings), status)}
					removeLabel={strings.historyRemoveFilter}
					onRemove={() => onChange({
						...filters,
						statuses: filters.statuses.filter((value) => value !== status),
					})}
				/>
			))}
			{filters.targets.map((target) => (
				<HistoryFilterChip
					key={target}
					label={optionLabel(targetOptions(strings), target)}
					removeLabel={strings.historyRemoveFilter}
					onRemove={() => onChange({
						...filters,
						targets: filters.targets.filter((value) => value !== target),
					})}
				/>
			))}
		</div>
	);
}

function HistoryFilterChip({
	label,
	removeLabel,
	onRemove,
}: {
	label: string;
	removeLabel: string;
	onRemove(): void;
}): React.ReactElement {
	return (
		<Button
			variant="ghost"
			size="sm"
			className="pk-history-filter-chip"
			aria-label={removeLabel.replace('{label}', label)}
			onClick={onRemove}
		>
			{label}
			<X aria-hidden />
		</Button>
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
	activities: readonly ComposerHistoryActivity[],
): readonly CountedFilterOption<ComposerHistoryFilters['source']>[] {
	return [
		{ value: 'all', label: strings.historyFilterAll, count: activities.length },
		{
			value: 'generation',
			label: strings.historySourceGeneration,
			count: activities.filter((activity) => activity.source === 'generation').length,
		},
		{
			value: 'copilot',
			label: strings.historySourceCopilot,
			count: activities.filter((activity) => activity.source === 'copilot').length,
		},
		{
			value: 'document',
			label: strings.historySourceDocument,
			count: activities.filter((activity) => activity.source === 'document').length,
		},
	];
}

function effectOptions(
	strings: SidecarStrings,
): readonly { value: ComposerCapabilityEffectKind; label: string }[] {
	return [
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
): readonly { value: ComposerHistoryActivityStatus; label: string }[] {
	return [
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
): readonly { value: ComposerTarget['kind']; label: string }[] {
	return [
		{ value: 'document', label: strings.historyDocumentTarget },
		{ value: 'block', label: strings.historyBlockTarget },
		{ value: 'unit', label: strings.historyUnitTarget },
		{ value: 'selection', label: strings.historySelectionTarget },
	];
}

function withFacetCounts<TValue extends string>(
	options: readonly { value: TValue; label: string }[],
	activities: readonly ComposerHistoryActivity[],
	select: (activity: ComposerHistoryActivity) => TValue | undefined,
	selected: readonly TValue[],
): readonly CountedFilterOption<TValue>[] {
	return options
		.map((option) => ({
			...option,
			count: activities.filter((activity) => select(activity) === option.value).length,
		}))
		.filter((option) => option.count > 0 || selected.includes(option.value));
}

function toggleFilterValue<TValue extends string>(
	values: readonly TValue[],
	value: TValue,
): readonly TValue[] {
	return values.includes(value)
		? values.filter((item) => item !== value)
		: [...values, value];
}

function optionLabel<TValue extends string>(
	options: readonly { value: TValue; label: string }[],
	value: TValue,
): string {
	return options.find((option) => option.value === value)?.label ?? value;
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
