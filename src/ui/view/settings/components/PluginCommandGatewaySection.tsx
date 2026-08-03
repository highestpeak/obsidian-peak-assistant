import React, { useEffect, useMemo, useState } from 'react';
import {
	Check,
	ChevronDown,
	Filter,
	Info,
	LoaderCircle,
	LockKeyhole,
	RefreshCw,
	Search,
	ShieldCheck,
} from 'lucide-react';
import {
	Button,
	Modal,
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type {
	PluginCommandGatewayScanProgress,
	PluginCommandGatewaySnapshot,
	PluginCommandReviewItem,
	PluginCommandRisk,
} from '@/core/types/plugin-command-gateway';
import { useSettingsStrings, type SettingsStrings } from '../settingsStrings';
import { PluginCommandGatewayReviewList } from './PluginCommandGatewayReviewList';
import {
	filterPluginCommandItems,
	formatPluginCommandCopy,
	groupPluginCommandItems,
	isPluginCommandBulkEligible,
	isPluginCommandUnavailable,
	pluginCommandScanPercent,
	summarizePluginCommandItems,
	type PluginCommandAccessFilter,
} from './pluginCommandGatewayReviewModel';

type PluginCommandCopy = SettingsStrings['tools']['pluginCommands'];
type BulkScope = 'filtered' | 'all';

interface BulkSelection {
	readonly scope: BulkScope;
	readonly items: readonly PluginCommandReviewItem[];
	readonly excludedCount: number;
}

export function PluginCommandGatewaySection(): React.ReactElement {
	const { pluginCommandGateway } = useServiceContext();
	const copy = useSettingsStrings().tools.pluginCommands;
	const [snapshot, setSnapshot] = useState<PluginCommandGatewaySnapshot | null>(null);
	const [query, setQuery] = useState('');
	const [pluginId, setPluginId] = useState('all');
	const [risk, setRisk] = useState<'all' | PluginCommandRisk>('all');
	const [access, setAccess] = useState<PluginCommandAccessFilter>('all');
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [scanProgress, setScanProgress] = useState<PluginCommandGatewayScanProgress | null>(null);
	const [bulkSelection, setBulkSelection] = useState<BulkSelection | null>(null);
	const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
	const [warning, setWarning] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!pluginCommandGateway) return;
		let cancelled = false;
		void pluginCommandGateway.getSnapshot()
			.then((next) => {
				if (!cancelled) setSnapshot(next);
			})
			.catch((reason) => {
				if (!cancelled) setError(toErrorMessage(reason));
			});
		return () => {
			cancelled = true;
		};
	}, [pluginCommandGateway]);

	const items = snapshot?.commands ?? [];
	const filters = { query, pluginId, risk, access } as const;
	const filteredItems = useMemo(
		() => filterPluginCommandItems(items, filters),
		[items, query, pluginId, risk, access],
	);
	const groups = useMemo(() => groupPluginCommandItems(filteredItems), [filteredItems]);
	const summary = useMemo(() => summarizePluginCommandItems(items), [items]);
	const eligibleFiltered = useMemo(
		() => filteredItems.filter(isPluginCommandBulkEligible),
		[filteredItems],
	);
	const eligibleAll = useMemo(
		() => items.filter(isPluginCommandBulkEligible),
		[items],
	);
	const plugins = useMemo(
		() => [...new Map(items.map((item) => [
			item.descriptor.pluginId,
			item.descriptor.pluginName,
		])).entries()].sort((left, right) => left[1].localeCompare(right[1])),
		[items],
	);

	if (!pluginCommandGateway) {
		return (
			<GatewaySectionShell copy={copy}>
				<div className="pkset-empty">
					<span className="pkset-empty__text">{copy.runtimeUnavailable}</span>
				</div>
			</GatewaySectionShell>
		);
	}

	const runMutation = async (
		key: string,
		action: () => Promise<PluginCommandGatewaySnapshot>,
	): Promise<void> => {
		setBusyKey(key);
		setError(null);
		try {
			setSnapshot(await action());
		} catch (reason) {
			setError(toErrorMessage(reason));
		} finally {
			setBusyKey(null);
		}
	};

	const runScan = async (): Promise<void> => {
		setBusyKey('scan');
		setWarning(null);
		setError(null);
		setScanProgress({
			phase: 'discovering',
			processedCommands: 0,
			totalCommands: 0,
			pluginCount: 0,
		});
		try {
			const result = await pluginCommandGateway.scan(setScanProgress);
			setSnapshot(result.snapshot);
			if (result.explanationStatus === 'fallback') setWarning(copy.scanFallback);
		} catch (reason) {
			setError(toErrorMessage(reason));
		} finally {
			setBusyKey(null);
			setScanProgress(null);
		}
	};

	const toggleAccess = (item: PluginCommandReviewItem): void => {
		const commandId = item.descriptor.commandId;
		void runMutation(commandId, () => item.approved
			? pluginCommandGateway.clearReview(commandId)
			: pluginCommandGateway.allowMany([commandId]));
	};

	const openBulk = (scope: BulkScope): void => {
		const candidates = scope === 'all' ? eligibleAll : eligibleFiltered;
		if (candidates.length === 0) return;
		const scopeItems = scope === 'all' ? items : filteredItems;
		setBulkMenuOpen(false);
		setBulkSelection({
			scope,
			items: candidates,
			excludedCount: scopeItems.filter(isPluginCommandUnavailable).length,
		});
	};

	const confirmBulk = async (): Promise<void> => {
		if (!bulkSelection) return;
		setBusyKey('bulk');
		setError(null);
		try {
			setSnapshot(await pluginCommandGateway.allowMany(
				bulkSelection.items.map((item) => item.descriptor.commandId),
			));
			setBulkSelection(null);
		} catch (reason) {
			setBulkSelection(null);
			setError(toErrorMessage(reason));
		} finally {
			setBusyKey(null);
		}
	};

	const clearFilters = (): void => {
		setQuery('');
		setPluginId('all');
		setRisk('all');
		setAccess('all');
	};

	const scanning = busyKey === 'scan';
	return (
		<GatewaySectionShell
			copy={copy}
			action={(
				<Button size="sm" variant="secondary" disabled={busyKey !== null} onClick={() => void runScan()}>
					<RefreshCw className={scanning ? 'pk-command-gateway-spin' : undefined} aria-hidden="true" />
					{scanning ? copy.scanning : copy.scanCommands}
				</Button>
			)}
		>
			<GatewaySummary copy={copy} summary={summary} />
			{scanProgress && <GatewayScanProgress copy={copy} progress={scanProgress} />}
			{warning && <div className="pk-command-gateway-warning" role="status">{warning}</div>}
			{error && <div className="pk-command-gateway-error" role="alert">{error}</div>}

			<div className="pk-command-gateway-filter-surface">
				<GatewayFilters
					copy={copy}
					query={query}
					pluginId={pluginId}
					risk={risk}
					access={access}
					plugins={plugins}
					disabled={scanning}
					onQuery={setQuery}
					onPlugin={setPluginId}
					onRisk={setRisk}
					onAccess={setAccess}
					onClear={clearFilters}
				/>
				<GatewayBatchBar
					copy={copy}
					shownCount={filteredItems.length}
					eligibleFiltered={eligibleFiltered.length}
					eligibleAll={eligibleAll.length}
					busy={busyKey !== null}
					menuOpen={bulkMenuOpen}
					onMenuOpen={setBulkMenuOpen}
					onOpenBulk={openBulk}
				/>
			</div>

			<div className="pk-command-gateway-columns" aria-hidden="true">
				<span>{copy.columns.command}</span>
				<span>{copy.columns.risk}</span>
				<span>{copy.columns.access}</span>
			</div>
			{snapshot && filteredItems.length === 0 && (
				<div className="pkset-empty"><span className="pkset-empty__text">{copy.empty}</span></div>
			)}
			<PluginCommandGatewayReviewList
				groups={groups}
				copy={copy}
				busyKey={busyKey}
				scanning={scanning}
				onToggle={toggleAccess}
			/>
			<RecentCommandActivity copy={copy} snapshot={snapshot} />

			<BulkAllowDialog
				copy={copy}
				selection={bulkSelection}
				busy={busyKey === 'bulk'}
				onOpenChange={(open) => { if (!open && busyKey !== 'bulk') setBulkSelection(null); }}
				onConfirm={() => void confirmBulk()}
			/>
		</GatewaySectionShell>
	);
}

function GatewaySectionShell(props: {
	copy: PluginCommandCopy;
	action?: React.ReactNode;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<div className="pkset-section pk-command-gateway">
			<div className="pk-command-gateway-head">
				<div className="pkset-section__head">
					<span className="pkset-section__title pktw-flex pktw-items-center pktw-gap-2">
						<ShieldCheck size={16} aria-hidden="true" />
						{props.copy.sectionTitle}
					</span>
					<span className="pkset-section__sub">{props.copy.sectionSub}</span>
				</div>
				{props.action}
			</div>
			{props.children}
		</div>
	);
}

function GatewaySummary(props: {
	copy: PluginCommandCopy;
	summary: ReturnType<typeof summarizePluginCommandItems>;
}): React.ReactElement {
	return (
		<div className="pk-command-gateway-summary">
			<SummaryStat label={props.copy.summary.approved} value={props.summary.approved} />
			<SummaryStat label={props.copy.summary.notAllowed} value={props.summary.notAllowed} />
			<SummaryStat label={props.copy.summary.systemExcluded} value={props.summary.unavailable} />
			<div className="pk-command-gateway-summary__note">
				<Info aria-hidden="true" />
				<span>{props.copy.scanNote}</span>
			</div>
		</div>
	);
}

function SummaryStat(props: { label: string; value: number }): React.ReactElement {
	return (
		<div className="pk-command-gateway-summary__stat">
			<span>{props.label}</span>
			<strong>{props.value}</strong>
		</div>
	);
}

function GatewayScanProgress(props: {
	copy: PluginCommandCopy;
	progress: PluginCommandGatewayScanProgress;
}): React.ReactElement {
	const percent = pluginCommandScanPercent(props.progress);
	return (
		<div className="pk-command-scan-progress" role="status" aria-live="polite">
			<div className="pk-command-scan-progress__icon">
				<LoaderCircle className="pk-command-gateway-spin" aria-hidden="true" />
			</div>
			<div className="pk-command-scan-progress__body">
				<div className="pk-command-scan-progress__head">
					<span>{props.copy.scanPhases[props.progress.phase]}</span>
					<span>{percent}%</span>
				</div>
				<div className="pk-command-scan-progress__track" aria-hidden="true">
					<span style={{ width: `${percent}%` }} />
				</div>
				<div className="pk-command-scan-progress__meta">
					<span>{formatPluginCommandCopy(props.copy.scanMeta.plugins, { count: props.progress.pluginCount })}</span>
					<span>{formatPluginCommandCopy(props.copy.scanMeta.commands, { count: props.progress.totalCommands })}</span>
					<span>{props.copy.scanMeta.accessUnchanged}</span>
				</div>
			</div>
		</div>
	);
}

function GatewayFilters(props: {
	copy: PluginCommandCopy;
	query: string;
	pluginId: string;
	risk: 'all' | PluginCommandRisk;
	access: PluginCommandAccessFilter;
	plugins: readonly (readonly [string, string])[];
	disabled: boolean;
	onQuery: (value: string) => void;
	onPlugin: (value: string) => void;
	onRisk: (value: 'all' | PluginCommandRisk) => void;
	onAccess: (value: PluginCommandAccessFilter) => void;
	onClear: () => void;
}): React.ReactElement {
	const riskOptions = Object.entries(props.copy.risks).map(([value, label]) => ({ value, label }));
	return (
		<div className="pk-command-gateway-filters">
			<label className="pk-command-gateway-search">
				<Search aria-hidden="true" />
				<input
					type="search"
					value={props.query}
					disabled={props.disabled}
					aria-label={props.copy.filters.searchPlaceholder}
					placeholder={props.copy.filters.searchPlaceholder}
					onChange={(event) => props.onQuery(event.currentTarget.value)}
				/>
			</label>
			<GatewaySelect
				label={props.copy.filters.pluginLabel}
				value={props.pluginId}
				disabled={props.disabled}
				options={[
					{ value: 'all', label: props.copy.filters.allPlugins },
					...props.plugins.map(([value, label]) => ({ value, label })),
				]}
				onChange={props.onPlugin}
			/>
			<GatewaySelect
				label={props.copy.filters.riskLabel}
				value={props.risk}
				disabled={props.disabled}
				options={[{ value: 'all', label: props.copy.filters.allRisks }, ...riskOptions]}
				onChange={(value) => props.onRisk(value as 'all' | PluginCommandRisk)}
			/>
			<GatewaySelect
				label={props.copy.filters.accessLabel}
				value={props.access}
				disabled={props.disabled}
				options={[
					{ value: 'all', label: props.copy.filters.allAccess },
					{ value: 'allowed', label: props.copy.access.allowed },
					{ value: 'not-allowed', label: props.copy.access.notAllowed },
					{ value: 'unavailable', label: props.copy.access.unavailable },
				]}
				onChange={(value) => props.onAccess(value as PluginCommandAccessFilter)}
			/>
			<Button size="sm" variant="ghost" disabled={props.disabled} onClick={props.onClear}>
				<Filter aria-hidden="true" />
				{props.copy.filters.clear}
			</Button>
		</div>
	);
}

function GatewaySelect(props: {
	label: string;
	value: string;
	disabled: boolean;
	options: readonly { value: string; label: string }[];
	onChange: (value: string) => void;
}): React.ReactElement {
	return (
		<label className="pk-command-gateway-select">
			<span>{props.label}</span>
			<select
				value={props.value}
				disabled={props.disabled}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			>
				{props.options.map((option) => (
					<option key={option.value} value={option.value}>{option.label}</option>
				))}
			</select>
			<ChevronDown aria-hidden="true" />
		</label>
	);
}

function GatewayBatchBar(props: {
	copy: PluginCommandCopy;
	shownCount: number;
	eligibleFiltered: number;
	eligibleAll: number;
	busy: boolean;
	menuOpen: boolean;
	onMenuOpen: (open: boolean) => void;
	onOpenBulk: (scope: BulkScope) => void;
}): React.ReactElement {
	return (
		<div className="pk-command-gateway-batch">
			<div className="pk-command-gateway-batch__summary">
				<strong>{formatPluginCommandCopy(props.copy.batch.commandsShown, { count: props.shownCount })}</strong>
				<span>{formatPluginCommandCopy(props.copy.batch.eligibleForAllow, { count: props.eligibleFiltered })}</span>
				<span className="pk-command-gateway-batch__scope">
					<Filter aria-hidden="true" />
					{props.copy.batch.currentFilterScope}
				</span>
			</div>
			<div className="pk-command-gateway-batch__control">
				<Button
					size="sm"
					variant="primary"
					className="pk-command-gateway-batch__main"
					disabled={props.busy || props.eligibleFiltered === 0}
					onClick={() => props.onOpenBulk('filtered')}
				>
					<Check aria-hidden="true" />
					{formatPluginCommandCopy(props.copy.batch.allowFiltered, { count: props.eligibleFiltered })}
				</Button>
				<Popover open={props.menuOpen} onOpenChange={props.onMenuOpen}>
					<PopoverTrigger asChild>
						<Button
							size="sm"
							variant="primary"
							className="pk-command-gateway-batch__toggle"
							disabled={props.busy || props.eligibleAll === 0}
							aria-label={props.copy.batch.allowAll}
						>
							<ChevronDown aria-hidden="true" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="pk-command-gateway-batch-menu">
						<PopoverItem disabled={props.eligibleFiltered === 0} onClick={() => props.onOpenBulk('filtered')}>
							<span><strong>{props.copy.batch.allowCurrentFilter}</strong><small>{props.copy.batch.allowCurrentFilterHint}</small></span>
							<span>{props.eligibleFiltered}</span>
						</PopoverItem>
						<PopoverItem disabled={props.eligibleAll === 0} onClick={() => props.onOpenBulk('all')}>
							<span><strong>{props.copy.batch.allowAll}</strong><small>{props.copy.batch.allowAllHint}</small></span>
							<span>{props.eligibleAll}</span>
						</PopoverItem>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}

function BulkAllowDialog(props: {
	copy: PluginCommandCopy;
	selection: BulkSelection | null;
	busy: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}): React.ReactElement {
	const count = props.selection?.items.length ?? 0;
	return (
		<Modal open={props.selection !== null} onOpenChange={props.onOpenChange}>
			<Modal.Content width="narrow" portalClassName="peak-design-root">
				<Modal.Header>
					<div>
						<Modal.Title>{formatPluginCommandCopy(props.copy.batch.confirmTitle, { count })}</Modal.Title>
						<Modal.Subtitle>
							{props.selection?.scope === 'all' ? props.copy.batch.confirmAll : props.copy.batch.confirmFiltered}
						</Modal.Subtitle>
					</div>
					<Modal.Close disabled={props.busy} />
				</Modal.Header>
				<Modal.Body>
					<div className="pk-command-bulk-confirm-list">
						{props.selection?.items.slice(0, 6).map((item) => (
							<span key={item.descriptor.commandId}>
								<Check aria-hidden="true" />
								{item.descriptor.pluginName} · {item.descriptor.commandName}
							</span>
						))}
						{count > 6 && (
							<span>{formatPluginCommandCopy(props.copy.batch.more, { count: count - 6 })}</span>
						)}
					</div>
					<div className="pk-command-bulk-confirm-exclusion">
						<LockKeyhole aria-hidden="true" />
						<span>{formatPluginCommandCopy(props.copy.batch.excluded, {
							count: props.selection?.excludedCount ?? 0,
						})}</span>
					</div>
				</Modal.Body>
				<Modal.Footer>
					<Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onOpenChange(false)}>
						{props.copy.batch.cancel}
					</Button>
					<Button size="sm" variant="primary" disabled={props.busy || count === 0} onClick={props.onConfirm}>
						<Check aria-hidden="true" />
						{props.copy.batch.confirm}
					</Button>
				</Modal.Footer>
			</Modal.Content>
		</Modal>
	);
}

function RecentCommandActivity(props: {
	copy: PluginCommandCopy;
	snapshot: PluginCommandGatewaySnapshot | null;
}): React.ReactElement | null {
	const runs = props.snapshot?.recentRuns ?? [];
	if (runs.length === 0) return null;
	return (
		<div className="pk-command-activity">
			<span className="pk-command-activity__title">{props.copy.activity.title}</span>
			<div className="pk-command-activity__list">
				{runs.map((run) => (
					<div key={run.runId} className="pk-command-activity__row">
						<Chip variant={run.status === 'completed' ? 'success' : 'danger'}>
							{run.status === 'completed'
								? props.copy.activity.completed
								: props.copy.activity.failed}
						</Chip>
						<span className="pk-command-activity__name">{run.commandName}</span>
						<span className="pk-command-activity__summary">
							{run.observation?.observableChange
								? run.observation.summary
								: run.error ?? props.copy.activity.noObservableChange}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
