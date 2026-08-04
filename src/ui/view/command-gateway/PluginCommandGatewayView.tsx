import React, { useEffect, useMemo, useState } from 'react';
import {
	Activity,
	Check,
	ChevronDown,
	ChevronRight,
	Info,
	LoaderCircle,
	LockKeyhole,
	RefreshCw,
	Search,
	ShieldCheck,
} from 'lucide-react';
import { Button, Chip, Modal } from '@/ui/components/primitives';
import type { PluginCommandGatewayPort } from '@/core/ports/PluginCommandGatewayPort';
import type {
	PluginCommandGatewayScanProgress,
	PluginCommandGatewaySnapshot,
	PluginCommandReviewItem,
	PluginCommandRisk,
} from '@/core/types/plugin-command-gateway';
import {
	DEFAULT_SETTINGS_STRINGS,
	loadSettingsStrings,
	type SettingsStrings,
} from '@/ui/view/settings/settingsStrings';
import { PluginCommandGatewayReviewList, unavailableReason } from './PluginCommandGatewayReviewList';
import {
	filterPluginCommandItems,
	formatPluginCommandCopy,
	groupPluginCommandItems,
	isPluginCommandBulkEligible,
	isPluginCommandContextual,
	isPluginCommandUnavailable,
	pluginCommandScanRatio,
	summarizePluginCommandItems,
	type PluginCommandAccessFilter,
} from './pluginCommandGatewayReviewModel';

type PluginCommandCopy = SettingsStrings['tools']['pluginCommands'];

interface BulkSelection {
	readonly items: readonly PluginCommandReviewItem[];
	readonly excludedCount: number;
}

export function PluginCommandGatewayView(props: {
	pluginCommandGateway: PluginCommandGatewayPort;
}): React.ReactElement {
	const { pluginCommandGateway } = props;
	const [copy, setCopy] = useState<PluginCommandCopy>(
		DEFAULT_SETTINGS_STRINGS.tools.pluginCommands,
	);
	const [snapshot, setSnapshot] = useState<PluginCommandGatewaySnapshot | null>(null);
	const [query, setQuery] = useState('');
	const [pluginId, setPluginId] = useState('all');
	const [risk, setRisk] = useState<'all' | PluginCommandRisk>('all');
	const [access, setAccess] = useState<PluginCommandAccessFilter>('not-allowed');
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [scanProgress, setScanProgress] = useState<PluginCommandGatewayScanProgress | null>(null);
	const [bulkSelection, setBulkSelection] = useState<BulkSelection | null>(null);
	const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
	const [activityOpen, setActivityOpen] = useState(false);
	const [warning, setWarning] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void loadSettingsStrings().then((strings) => {
			if (!cancelled) setCopy(strings.tools.pluginCommands);
		});
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
	const plugins = useMemo(
		() => [...new Map(items.map((item) => [
			item.descriptor.pluginId,
			item.descriptor.pluginName,
		])).entries()].sort((left, right) => left[1].localeCompare(right[1])),
		[items],
	);
	const selectedItem = items.find(
		(item) => item.descriptor.commandId === selectedCommandId,
	) ?? null;

	useEffect(() => {
		if (filteredItems.length === 0) {
			setSelectedCommandId(null);
			return;
		}
		if (filteredItems.some((item) => item.descriptor.commandId === selectedCommandId)) return;
		setSelectedCommandId(filteredItems[0]!.descriptor.commandId);
	}, [filteredItems, selectedCommandId]);

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

	const onScanProgress = (progress: PluginCommandGatewayScanProgress): void => {
		setScanProgress(progress);
		if (progress.snapshot) setSnapshot(progress.snapshot);
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
			const result = await pluginCommandGateway.scan(onScanProgress);
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

	const openBulk = (): void => {
		if (eligibleFiltered.length === 0) return;
		setBulkSelection({
			items: eligibleFiltered,
			excludedCount: filteredItems.filter(isPluginCommandUnavailable).length,
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
		<div className="pk-command-gateway-view">
			<div className="pk-command-gateway-view__header">
				<div className="pk-command-gateway-view__identity">
					<span className="pk-command-gateway-view__icon"><ShieldCheck aria-hidden="true" /></span>
					<span className="pk-command-gateway-view__title-copy">
						<span className="pk-command-gateway-view__title">{copy.viewTitle}</span>
						<span className="pk-command-gateway-view__sub">{copy.viewSub}</span>
					</span>
				</div>
				<Button size="sm" variant="primary" disabled={busyKey !== null} onClick={() => void runScan()}>
					<RefreshCw className={scanning ? 'pk-command-gateway-spin' : undefined} aria-hidden="true" />
					{scanning ? copy.scanning : copy.scanCommands}
				</Button>
			</div>

			<div className="pk-command-gateway-view__summary-row">
				<GatewaySummary copy={copy} summary={summary} />
				<span className="pk-command-gateway-view__last-scan">
					{formatLastScan(snapshot?.lastScannedAt ?? 0, copy)}
				</span>
			</div>

			{scanProgress && <GatewayScanProgress copy={copy} progress={scanProgress} />}
			{warning && <div className="pk-command-gateway-warning" role="status">{warning}</div>}
			{error && <div className="pk-command-gateway-error" role="alert">{error}</div>}

			<div className="pk-command-gateway-toolbar">
				<div className="pk-command-gateway-toolbar__filters">
					<label className="pk-command-gateway-search">
						<Search aria-hidden="true" />
						<input
							type="search"
							value={query}
							aria-label={copy.filters.searchPlaceholder}
							placeholder={copy.filters.searchPlaceholder}
							onChange={(event) => setQuery(event.currentTarget.value)}
						/>
					</label>
					<GatewaySelect
						label={copy.filters.pluginLabel}
						value={pluginId}
						options={[
							{ value: 'all', label: copy.filters.allPlugins },
							...plugins.map(([value, label]) => ({ value, label })),
						]}
						onChange={setPluginId}
					/>
					<GatewaySelect
						label={copy.filters.riskLabel}
						value={risk}
						options={[
							{ value: 'all', label: copy.filters.allRisks },
							...Object.entries(copy.risks).map(([value, label]) => ({ value, label })),
						]}
						onChange={(value) => setRisk(value as 'all' | PluginCommandRisk)}
					/>
					<Button size="sm" variant="ghost" onClick={clearFilters}>{copy.filters.clear}</Button>
				</div>
				<AccessFilter value={access} copy={copy} onChange={setAccess} />
			</div>

			<div className="pk-command-gateway-batch">
				<div className="pk-command-gateway-batch__summary">
					<strong>{formatPluginCommandCopy(copy.batch.commandsShown, { count: filteredItems.length })}</strong>
					<span>{formatPluginCommandCopy(copy.batch.eligibleForAllow, { count: eligibleFiltered.length })}</span>
				</div>
				<Button
					size="sm"
					variant="primary"
					disabled={busyKey !== null || eligibleFiltered.length === 0}
					onClick={openBulk}
				>
					<Check aria-hidden="true" />
					{formatPluginCommandCopy(copy.batch.allowFiltered, { count: eligibleFiltered.length })}
				</Button>
			</div>

			<div className="pk-command-gateway-view__workspace">
				<div className="pk-command-gateway-view__catalog">
					<div className="pk-command-gateway-columns" aria-hidden="true">
						<span>{copy.columns.command}</span>
						<span>{copy.columns.risk}</span>
						<span>{copy.columns.access}</span>
					</div>
					{snapshot && filteredItems.length === 0 && (
						<div className="pk-command-gateway-empty">
							<span>{items.length === 0 ? copy.empty : copy.noMatches}</span>
						</div>
					)}
					<PluginCommandGatewayReviewList
						groups={groups}
						copy={copy}
						busyKey={busyKey}
						scanning={scanning}
						selectedCommandId={selectedCommandId}
						onSelect={(item) => setSelectedCommandId(item.descriptor.commandId)}
						onToggle={toggleAccess}
					/>
				</div>
				<CommandDetailPanel item={selectedItem} copy={copy} />
			</div>

			<RecentCommandActivity
				copy={copy}
				snapshot={snapshot}
				open={activityOpen}
				onOpenChange={setActivityOpen}
			/>

			<BulkAllowDialog
				copy={copy}
				selection={bulkSelection}
				busy={busyKey === 'bulk'}
				onOpenChange={(open) => { if (!open && busyKey !== 'bulk') setBulkSelection(null); }}
				onConfirm={() => void confirmBulk()}
			/>
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
		</div>
	);
}

function SummaryStat(props: { label: string; value: number }): React.ReactElement {
	return <span className="pk-command-gateway-summary__stat"><span>{props.label}</span><strong>{props.value}</strong></span>;
}

function GatewayScanProgress(props: {
	copy: PluginCommandCopy;
	progress: PluginCommandGatewayScanProgress;
}): React.ReactElement {
	const ratio = pluginCommandScanRatio(props.progress);
	const explaining = props.progress.phase === 'explaining';
	const progressText = explaining
		? props.progress.processedCommands === 0
			? props.copy.scanMeta.waiting
			: formatPluginCommandCopy(props.copy.scanMeta.explanations, {
				processed: props.progress.processedCommands,
				total: props.progress.totalCommands,
			})
		: props.copy.scanPhases[props.progress.phase];
	return (
		<div className="pk-command-scan-progress" role="status" aria-live="polite">
			<LoaderCircle className="pk-command-gateway-spin" aria-hidden="true" />
			<span className="pk-command-scan-progress__body">
				<span className="pk-command-scan-progress__head">
					<span>{props.copy.scanPhases[props.progress.phase]}</span>
					<span>{progressText}</span>
				</span>
				<span className="pk-command-scan-progress__track" data-indeterminate={ratio === null} aria-hidden="true">
					<span style={ratio === null ? undefined : { width: `${Math.round(ratio * 100)}%` }} />
				</span>
				<span className="pk-command-scan-progress__meta">
					<span>{formatPluginCommandCopy(props.copy.scanMeta.plugins, { count: props.progress.pluginCount })}</span>
					<span>{formatPluginCommandCopy(props.copy.scanMeta.commands, { count: props.progress.totalCommands })}</span>
					<span>{props.copy.scanMeta.accessUnchanged}</span>
				</span>
			</span>
		</div>
	);
}

function GatewaySelect(props: {
	label: string;
	value: string;
	options: readonly { value: string; label: string }[];
	onChange: (value: string) => void;
}): React.ReactElement {
	return (
		<label className="pk-command-gateway-select">
			<span>{props.label}</span>
			<select value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)}>
				{props.options.map((option) => (
					<option key={option.value} value={option.value}>{option.label}</option>
				))}
			</select>
			<ChevronDown aria-hidden="true" />
		</label>
	);
}

function AccessFilter(props: {
	value: PluginCommandAccessFilter;
	copy: PluginCommandCopy;
	onChange: (value: PluginCommandAccessFilter) => void;
}): React.ReactElement {
	const options: Array<{ value: PluginCommandAccessFilter; label: string }> = [
		{ value: 'not-allowed', label: props.copy.access.reviewNeeded },
		{ value: 'allowed', label: props.copy.access.allowed },
		{ value: 'unavailable', label: props.copy.access.unavailable },
		{ value: 'all', label: props.copy.filters.allAccess },
	];
	return (
		<div className="pk-command-access-filter" aria-label={props.copy.filters.accessLabel}>
			{options.map((option) => (
				<Button
					key={option.value}
					size="sm"
					variant={props.value === option.value ? 'primary' : 'ghost'}
					aria-pressed={props.value === option.value}
					onClick={() => props.onChange(option.value)}
				>
					{option.label}
				</Button>
			))}
		</div>
	);
}

function CommandDetailPanel(props: {
	item: PluginCommandReviewItem | null;
	copy: PluginCommandCopy;
}): React.ReactElement {
	if (!props.item) {
		return (
			<div className="pk-command-detail pk-command-detail--empty">
				<Info aria-hidden="true" />
				<span>{props.copy.details.selectPrompt}</span>
			</div>
		);
	}
	const { item, copy } = props;
	const unavailable = isPluginCommandUnavailable(item);
	return (
		<div className="pk-command-detail">
			<span className="pk-command-detail__eyebrow">{copy.details.title}</span>
			<span className="pk-command-detail__title">{item.descriptor.commandName}</span>
			<span className="pk-command-detail__plugin">{item.descriptor.pluginName} · {item.descriptor.pluginVersion}</span>
			<div className="pk-command-detail__chips">
				<Chip variant={item.effectiveRisk === 'read' ? 'neutral' : item.effectiveRisk === 'edit' ? 'warning' : 'danger'}>
					{copy.risks[item.effectiveRisk]}
				</Chip>
				<Chip variant={item.approved ? 'success' : unavailable ? 'danger' : 'neutral'}>
					{item.approved ? copy.access.allowed : unavailable ? copy.access.unavailable : copy.access.notAllowed}
				</Chip>
				{isPluginCommandContextual(item) && <Chip variant="info">{copy.badges.requiresEditor}</Chip>}
			</div>
			<DetailField label={copy.details.explanation} value={item.finding?.summary ?? copy.details.metadataFallback} />
			<DetailField label={copy.details.commandId} value={item.descriptor.commandId} mono />
			{(unavailable || isPluginCommandContextual(item)) && (
				<DetailField label={copy.details.context} value={unavailableReason(item, copy)} />
			)}
		</div>
	);
}

function DetailField(props: { label: string; value: string; mono?: boolean }): React.ReactElement {
	return (
		<span className="pk-command-detail__field">
			<span>{props.label}</span>
			<span data-mono={props.mono}>{props.value}</span>
		</span>
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
						<Modal.Subtitle>{props.copy.batch.confirmFiltered}</Modal.Subtitle>
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
						{count > 6 && <span>{formatPluginCommandCopy(props.copy.batch.more, { count: count - 6 })}</span>}
					</div>
					{(props.selection?.excludedCount ?? 0) > 0 && (
						<div className="pk-command-bulk-confirm-exclusion">
							<LockKeyhole aria-hidden="true" />
							<span>{formatPluginCommandCopy(props.copy.batch.excluded, {
								count: props.selection?.excludedCount ?? 0,
							})}</span>
						</div>
					)}
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
	open: boolean;
	onOpenChange: (open: boolean) => void;
}): React.ReactElement | null {
	const runs = props.snapshot?.recentRuns ?? [];
	if (runs.length === 0) return null;
	return (
		<div className="pk-command-activity" data-open={props.open}>
			<Button size="sm" variant="ghost" className="pk-command-activity__toggle" onClick={() => props.onOpenChange(!props.open)}>
				<Activity aria-hidden="true" />
				<span>{props.copy.activity.title}</span>
				<Chip variant="neutral">{runs.length}</Chip>
				{props.open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
			</Button>
			{props.open && (
				<div className="pk-command-activity__list">
					{runs.map((run) => (
						<div key={run.runId} className="pk-command-activity__row">
							<Chip variant={run.status === 'completed' ? 'success' : 'danger'}>
								{run.status === 'completed' ? props.copy.activity.completed : props.copy.activity.failed}
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
			)}
		</div>
	);
}

function formatLastScan(lastScannedAt: number, copy: PluginCommandCopy): string {
	if (lastScannedAt <= 0) return copy.neverScanned;
	return formatPluginCommandCopy(copy.lastScanned, {
		time: new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		}).format(new Date(lastScannedAt)),
	});
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
