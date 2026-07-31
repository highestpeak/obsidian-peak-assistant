import React, { useEffect, useMemo, useState } from 'react';
import { PlugZap, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Button, Chip } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useSettingsStrings } from '../settingsStrings';
import type {
	PluginCommandGatewaySnapshot,
	PluginCommandPurpose,
	PluginCommandReviewInput,
	PluginCommandReviewItem,
	PluginCommandRisk,
} from '@/core/types/plugin-command-gateway';

type DraftMap = Record<string, Pick<PluginCommandReviewInput, 'risk' | 'purpose'>>;

export function PluginCommandGatewaySection(): React.ReactElement {
	const { pluginCommandGateway } = useServiceContext();
	const copy = useSettingsStrings().tools.pluginCommands;
	const [snapshot, setSnapshot] = useState<PluginCommandGatewaySnapshot | null>(null);
	const [drafts, setDrafts] = useState<DraftMap>({});
	const [query, setQuery] = useState('');
	const [busy, setBusy] = useState<'scan' | 'curate' | string | null>(null);
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

	const groups = useMemo(
		() => groupCommands(snapshot?.commands ?? [], query),
		[snapshot, query],
	);

	if (!pluginCommandGateway) {
		return <GatewaySectionShell><div className="pkset-empty"><span className="pkset-empty__text">{copy.unavailable}</span></div></GatewaySectionShell>;
	}

	const run = async (
		key: string,
		action: () => Promise<PluginCommandGatewaySnapshot>,
	): Promise<void> => {
		setBusy(key);
		setError(null);
		try {
			setSnapshot(await action());
		} catch (reason) {
			setError(toErrorMessage(reason));
		} finally {
			setBusy(null);
		}
	};

	const review = (
		item: PluginCommandReviewItem,
		decision: PluginCommandReviewInput['decision'],
	): Promise<void> => {
		const draft = drafts[item.descriptor.commandId] ?? {
			risk: item.effectiveRisk,
			purpose: item.effectivePurpose,
		};
		return run(item.descriptor.commandId, () =>
			pluginCommandGateway.review(item.descriptor.commandId, {
				decision,
				...draft,
			}),
		);
	};

	return (
		<GatewaySectionShell>
			<div className="pk-command-gateway-toolbar">
				<div className="pk-command-gateway-stats" aria-label="Command gateway status">
					<Chip variant="success">{snapshot?.approvedCount ?? 0} {copy.approved}</Chip>
					<Chip variant="danger">{snapshot?.blockedCount ?? 0} {copy.blocked}</Chip>
					{(snapshot?.staleCount ?? 0) > 0 && (
						<Chip variant="warning">{snapshot?.staleCount} {copy.stale}</Chip>
					)}
				</div>
				<div className="pk-command-gateway-actions">
					<Button
						size="sm"
						variant="secondary"
						disabled={busy !== null}
						onClick={() => void run('scan', () => pluginCommandGateway.refresh())}
					>
						<RefreshCw size={14} aria-hidden="true" />
						{copy.scan}
					</Button>
					<Button
						size="sm"
						variant="secondary"
						disabled={busy !== null || (snapshot?.commands.length ?? 0) === 0}
						onClick={() => void run('curate', () => pluginCommandGateway.curate())}
					>
						<Sparkles size={14} aria-hidden="true" />
						{busy === 'curate' ? copy.analyzing : copy.analyze}
					</Button>
				</div>
			</div>

			<label className="pk-command-gateway-search">
				<Search size={14} aria-hidden="true" />
				<input
					type="search"
					value={query}
					placeholder={copy.searchPlaceholder}
					onChange={(event) => setQuery(event.currentTarget.value)}
				/>
			</label>

			{error && <div className="pk-command-gateway-error" role="alert">{error}</div>}
			{groups.length === 0 && (
				<div className="pkset-empty"><span className="pkset-empty__text">{copy.empty}</span></div>
			)}
			{groups.map((group) => (
				<CommandPluginGroup
					key={group.pluginId}
					group={group}
					drafts={drafts}
					busy={busy}
					onDraft={(commandId, draft) =>
						setDrafts((current) => ({ ...current, [commandId]: draft }))
					}
					onAllow={(item) => void review(item, 'allow')}
					onDeny={(item) => void review(item, 'deny')}
					onClear={(item) =>
						void run(item.descriptor.commandId, () =>
							pluginCommandGateway.clearReview(item.descriptor.commandId),
						)
					}
				/>
			))}
			<RecentCommandRuns snapshot={snapshot} />
		</GatewaySectionShell>
	);
}

function GatewaySectionShell({ children }: { children: React.ReactNode }): React.ReactElement {
	const copy = useSettingsStrings().tools.pluginCommands;
	return (
		<div className="pkset-section pk-command-gateway">
			<div className="pkset-section__head">
				<span className="pkset-section__title pktw-flex pktw-items-center pktw-gap-2">
					<ShieldCheck size={16} aria-hidden="true" />
					{copy.sectionTitle}
				</span>
				<span className="pkset-section__sub">{copy.sectionSub}</span>
			</div>
			{children}
		</div>
	);
}

interface CommandGroup {
	pluginId: string;
	pluginName: string;
	pluginVersion: string;
	items: PluginCommandReviewItem[];
}

function CommandPluginGroup(props: {
	group: CommandGroup;
	drafts: DraftMap;
	busy: string | null;
	onDraft: (commandId: string, draft: DraftMap[string]) => void;
	onAllow: (item: PluginCommandReviewItem) => void;
	onDeny: (item: PluginCommandReviewItem) => void;
	onClear: (item: PluginCommandReviewItem) => void;
}): React.ReactElement {
	return (
		<div className="pk-command-plugin-group">
			<div className="pk-command-plugin-group__head">
				<span className="pk-command-plugin-group__name">
					<PlugZap size={15} aria-hidden="true" />
					{props.group.pluginName}
				</span>
				<span className="pk-command-plugin-group__meta">
					{props.group.pluginId} · {props.group.pluginVersion} · {props.group.items.length}
				</span>
			</div>
			<div className="pk-command-plugin-group__list">
				{props.group.items.map((item) => (
					<CommandReviewRow
						key={item.descriptor.commandId}
						item={item}
						draft={props.drafts[item.descriptor.commandId]}
						busy={props.busy === item.descriptor.commandId}
						onDraft={props.onDraft}
						onAllow={props.onAllow}
						onDeny={props.onDeny}
						onClear={props.onClear}
					/>
				))}
			</div>
		</div>
	);
}

function CommandReviewRow(props: {
	item: PluginCommandReviewItem;
	draft?: DraftMap[string];
	busy: boolean;
	onDraft: (commandId: string, draft: DraftMap[string]) => void;
	onAllow: (item: PluginCommandReviewItem) => void;
	onDeny: (item: PluginCommandReviewItem) => void;
	onClear: (item: PluginCommandReviewItem) => void;
}): React.ReactElement {
	const copy = useSettingsStrings().tools.pluginCommands;
	const { item } = props;
	const commandId = item.descriptor.commandId;
	const draft = props.draft ?? {
		risk: item.effectiveRisk,
		purpose: item.effectivePurpose,
	};
	const allowBlocked =
		props.busy ||
		item.descriptor.availability !== 'available' ||
		item.descriptor.interaction === 'modal' ||
		draft.risk === 'unknown' ||
		draft.risk === 'destructive';
	const status = item.stale
		? { label: copy.stale, variant: 'warning' as const }
		: item.approved
			? { label: copy.approved, variant: 'success' as const }
			: item.review?.decision === 'deny'
				? { label: copy.blocked, variant: 'danger' as const }
				: { label: copy.off, variant: 'neutral' as const };
	return (
		<div className="pk-command-review-row" data-command-id={commandId}>
			<div className="pk-command-review-row__main">
				<div className="pk-command-review-row__title-line">
					<span className="pk-command-review-row__title">{item.descriptor.commandName}</span>
					<Chip variant={status.variant}>{status.label}</Chip>
				</div>
				<span className="pk-command-review-row__id">{commandId}</span>
				{item.descriptor.availability !== 'available' && (
					<span className="pk-command-review-row__warning">
						{copy.commandUnavailable}:{' '}
						{item.descriptor.availabilityReason ?? item.descriptor.availability}
					</span>
				)}
				<span className="pk-command-review-row__summary">
					{item.finding?.summary ?? copy.noFinding}
				</span>
				{item.finding && item.finding.evidence.length > 0 && (
					<ul className="pk-command-review-row__evidence">
						{item.finding.evidence.slice(0, 3).map((entry) => <li key={entry}>{entry}</li>)}
					</ul>
				)}
				{item.stale && <span className="pk-command-review-row__warning">{copy.sourceChanged}</span>}
				{(
					draft.risk === 'unknown' ||
					draft.risk === 'destructive' ||
					item.descriptor.interaction === 'modal'
				) && (
					<span className="pk-command-review-row__warning">{copy.systemBlocked}</span>
				)}
			</div>
			<div className="pk-command-review-row__controls">
				<CommandSelect
					label={copy.riskLabel}
					value={draft.risk}
					options={copy.risks}
					onChange={(risk) => props.onDraft(commandId, { ...draft, risk })}
				/>
				<CommandSelect
					label={copy.purposeLabel}
					value={draft.purpose}
					options={copy.purposes}
					onChange={(purpose) => props.onDraft(commandId, { ...draft, purpose })}
				/>
				<div className="pk-command-review-row__buttons">
					<Button size="sm" variant="primary" disabled={allowBlocked} onClick={() => props.onAllow(item)}>
						{copy.allow}
					</Button>
					<Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onDeny(item)}>
						{copy.deny}
					</Button>
					{item.review && (
						<Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onClear(item)}>
							{copy.clear}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

function CommandSelect<T extends string>(props: {
	label: string;
	value: T;
	options: Record<T, string>;
	onChange: (value: T) => void;
}): React.ReactElement {
	return (
		<label className="pk-command-review-select">
			<span>{props.label}</span>
			<select value={props.value} onChange={(event) => props.onChange(event.currentTarget.value as T)}>
				{Object.entries(props.options).map(([value, label]) => (
					<option key={value} value={value}>{String(label)}</option>
				))}
			</select>
		</label>
	);
}

function RecentCommandRuns({ snapshot }: { snapshot: PluginCommandGatewaySnapshot | null }): React.ReactElement {
	const copy = useSettingsStrings().tools.pluginCommands;
	const runs = snapshot?.recentRuns ?? [];
	return (
		<div className="pk-command-runs">
			<span className="pk-command-runs__title">{copy.recentRuns}</span>
			{runs.length === 0 && <span className="pk-command-runs__empty">{copy.noRuns}</span>}
			{runs.map((run) => (
				<div key={run.runId} className="pk-command-run">
					<Chip variant={run.status === 'completed' ? 'success' : 'danger'}>{run.status}</Chip>
					<span className="pk-command-run__name">{run.commandName}</span>
					<span className="pk-command-run__summary">
						{run.observation?.observableChange
							? run.observation.summary
							: run.error ?? copy.noObservableChange}
					</span>
				</div>
			))}
		</div>
	);
}

function groupCommands(
	items: readonly PluginCommandReviewItem[],
	query: string,
): CommandGroup[] {
	const normalized = query.trim().toLocaleLowerCase();
	const groups = new Map<string, CommandGroup>();
	for (const item of items) {
		const descriptor = item.descriptor;
		const haystack = [
			descriptor.commandId,
			descriptor.commandName,
			descriptor.pluginId,
			descriptor.pluginName,
			item.finding?.summary ?? '',
		].join(' ').toLocaleLowerCase();
		if (normalized && !haystack.includes(normalized)) continue;
		let group = groups.get(descriptor.pluginId);
		if (!group) {
			group = {
				pluginId: descriptor.pluginId,
				pluginName: descriptor.pluginName,
				pluginVersion: descriptor.pluginVersion,
				items: [],
			};
			groups.set(descriptor.pluginId, group);
		}
		group.items.push(item);
	}
	return [...groups.values()];
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
