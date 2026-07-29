import * as React from 'react';
import { ChevronDown, MapPin, RotateCcw, X } from 'lucide-react';
import { composerTargetBlockId, type ComposerHistoryItem, type ComposerTransactionProjection } from '@/core/composer';
import { Button, IconButton } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import type { SidecarStrings } from './sidecarConfig';
import { useSidecar } from './SidecarContext';

/**
 * The History view reads the one transaction ledger used by Undo/Redo. It is a
 * document history, rather than a flat list of controls: newest committed work
 * is grouped by local day, batches can expand to their independent writes, and
 * every locatable/rollbackable child keeps its real transaction identity.
 */
export function HistoryView(): React.ReactElement {
	const { hub, config, onLocate } = useSidecar();
	const s = config.strings;
	const projection = useHubProjection(hub);
	const items = projection?.history ?? [];
	const [expandedGroups, setExpandedGroups] = React.useState<ReadonlySet<string>>(() => new Set());
	const [selectedHistoryId, setSelectedHistoryId] = React.useState<string | null>(null);
	const preview = selectedHistoryId ? hub?.historyPreview(selectedHistoryId) ?? null : null;

	if (items.length === 0) {
		return <div className="pk-history pk-history--empty">{s.historyEmpty}</div>;
	}
	const groups = groupHistoryByDay(items, s, new Date());
	return (
		<div className="pk-history" data-testid="pk-history">
			<header className="pk-history-heading">
				<div>
					<span className="pk-history-title">{s.historyTitle}</span>
					<span className="pk-history-intro">{s.historyIntro}</span>
				</div>
				<span className="pk-history-total">{formatCount(s.historyTransactionCount, countTransactions(items))}</span>
			</header>
			{groups.map((group) => (
				<section key={group.key} className="pk-history-day">
					<header className="pk-history-day-head">
						<span>{group.label}</span>
						<span>{formatCount(s.historyTransactionCount, countTransactions(group.items))}</span>
					</header>
					<div className="pk-history-list">
						{group.items.map((item) => {
							const groupKey = item.historyId;
							const expanded = expandedGroups.has(groupKey);
							return item.children && item.children.length > 1 ? (
								<HistoryBatch
									key={item.historyId}
									item={item}
									expanded={expanded}
									onSelect={setSelectedHistoryId}
									onToggle={() => {
										setExpandedGroups((current) => {
											const next = new Set(current);
											if (next.has(groupKey)) next.delete(groupKey);
											else next.add(groupKey);
											return next;
										});
									}}
									strings={s}
								/>
							) : (
								<HistoryRow
									key={item.historyId}
									item={item}
									onSelect={setSelectedHistoryId}
									strings={s}
								/>
							);
						})}
					</div>
				</section>
			))}
			{preview && (
				<HistoryDetail
					item={preview.item}
					beforeText={preview.beforeText}
					afterText={preview.afterText}
					onClose={() => setSelectedHistoryId(null)}
					onLocate={onLocate}
					onRollback={(historyId) => {
						void hub?.rollback(historyId).then(() => setSelectedHistoryId(null)).catch(() => undefined);
					}}
					strings={s}
				/>
			)}
		</div>
	);
}

function HistoryBatch({
	item,
	expanded,
	onSelect,
	onToggle,
	strings,
}: {
	item: ComposerHistoryItem;
	expanded: boolean;
	onSelect: (historyId: string) => void;
	onToggle: () => void;
	strings: SidecarStrings;
}): React.ReactElement {
	const children = item.children ?? [];
	const label = item.origin === 'direct'
		? formatCount(strings.historyBatchDirect, children.length)
		: formatCount(strings.historyBatchCopilot, children.length);
	return (
		<section className="pk-history-batch" data-origin={item.origin}>
			<Button variant="ghost" className="pk-history-batch-summary" onClick={onToggle} aria-expanded={expanded}>
				<HistoryDot origin={item.origin} />
				<HistoryCopy label={label} item={item} originLabel={originLabel(item, strings)} strings={strings} />
				<span className="pk-history-meta">
					<time>{formatHistoryTime(item.timestamp)}</time>
					<strong>{formatCount(strings.historyBatchMeta, children.length)}</strong>
					<ChevronDown className={cn('pk-history-batch-chevron', expanded && 'pk-history-batch-chevron--expanded')} size={13} />
				</span>
			</Button>
			{expanded && (
				<div className="pk-history-batch-entries">
					{[...children].reverse().map((child) => (
						<HistoryRow
							key={child.historyId}
							item={child}
							nested
							onSelect={onSelect}
							strings={strings}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function HistoryRow({
	item,
	nested = false,
	onSelect,
	strings,
}: {
	item: ComposerHistoryItem;
	nested?: boolean;
	onSelect: (historyId: string) => void;
	strings: SidecarStrings;
}): React.ReactElement {
	return (
		<div className={cn('pk-history-row', nested && 'pk-history-row--nested')} data-origin={item.origin}>
			<Button
				variant="ghost"
				className="pk-history-main"
				onClick={() => onSelect(item.historyId)}
			>
				<HistoryDot origin={item.origin} />
				<HistoryCopy label={item.label} item={item} originLabel={originLabel(item, strings)} strings={strings} />
				<span className="pk-history-meta">
					<time>{formatHistoryTime(item.timestamp)}</time>
					<strong>{formatDelta(item)}</strong>
				</span>
			</Button>
		</div>
	);
}

function HistoryDetail({
	item,
	beforeText,
	afterText,
	onClose,
	onLocate,
	onRollback,
	strings,
}: {
	item: ComposerHistoryItem;
	beforeText: string;
	afterText: string;
	onClose: () => void;
	onLocate?: (blockId: string) => void;
	onRollback: (historyId: string) => void;
	strings: SidecarStrings;
}): React.ReactElement {
	const blockId = item.target ? composerTargetBlockId(item.target) : null;
	const hasText = Boolean(beforeText || afterText);
	return (
		<aside className="pk-history-detail" aria-label={strings.historyPreviewTitle}>
			<header>
				<div>
					<span>{strings.historyPreviewTitle}</span>
					<strong>{item.label}</strong>
				</div>
				<IconButton label={strings.close} onClick={onClose}>
					<X size={14} />
				</IconButton>
			</header>
			{hasText ? (
				<div className="pk-history-diff">
					<div data-kind="before">
						<span>{strings.historyBefore}</span>
						<pre>{beforeText || strings.historyPreviewUnavailable}</pre>
					</div>
					<div data-kind="after">
						<span>{strings.historyAfter}</span>
						<pre>{afterText || strings.historyPreviewUnavailable}</pre>
					</div>
				</div>
			) : (
				<span className="pk-history-detail-empty">{strings.historyPreviewUnavailable}</span>
			)}
			<footer>
				{blockId && (
					<Button variant="outline" onClick={() => onLocate?.(blockId)}>
						<MapPin size={13} />
						{strings.locateInDocument}
					</Button>
				)}
				{!item.isRollback && (
					<Button variant="outline" onClick={() => onRollback(item.historyId)}>
						<RotateCcw size={13} />
						{strings.historyRollbackAction}
					</Button>
				)}
			</footer>
		</aside>
	);
}

function HistoryCopy({
	label,
	item,
	originLabel,
	strings,
}: {
	label: string;
	item: ComposerHistoryItem;
	originLabel: string;
	strings: SidecarStrings;
}): React.ReactElement {
	return (
		<span className="pk-history-copy">
			<span className="pk-history-title-row">
				<strong>{label}</strong>
				<em>{originLabel}</em>
			</span>
			<small>{targetLabel(item, originLabel, strings)}</small>
		</span>
	);
}

function HistoryDot({ origin }: { origin: ComposerHistoryItem['origin'] }): React.ReactElement {
	return <i className="pk-history-dot" data-origin={origin} aria-hidden />;
}

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
		const date = new Date(item.timestamp);
		const key = localDateKey(date);
		const group = byDay.get(key) ?? [];
		group.push(item);
		byDay.set(key, group);
	}
	return [...byDay.entries()].map(([key, grouped]) => ({
		key,
		label: key === localDateKey(now)
			? strings.historyToday
			: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(grouped[0].timestamp)),
		items: grouped,
	}));
}

export function countTransactions(items: readonly ComposerHistoryItem[]): number {
	return items.reduce((total, item) => total + (item.children?.length ?? 1), 0);
}

function originLabel(item: ComposerHistoryItem, strings: SidecarStrings): string {
	if (item.isRollback || item.origin === 'system-rollback') return strings.historyRollback;
	if (item.origin === 'direct') return strings.historyDirect;
	return strings.historyAiAccepted;
}

function targetLabel(item: ComposerHistoryItem, fallback: string, strings: SidecarStrings): string {
	switch (item.target?.kind) {
		case 'document': return strings.historyDocumentTarget;
		case 'block': return strings.historyBlockTarget;
		case 'unit': return strings.historyUnitTarget;
		case 'selection': return strings.historySelectionTarget;
		default: return fallback || strings.historyNoTarget;
	}
}

function formatHistoryTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp));
}

function formatDelta(item: ComposerHistoryItem): string {
	return `+${item.stats.added} / -${item.stats.removed}`;
}

function formatCount(template: string, count: number): string {
	return template.replace('{count}', String(count));
}

function localDateKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Subscribe to the hub projection as a React external store (History-only slice). */
function useHubProjection(hub: ReturnType<typeof useSidecar>['hub']): ComposerTransactionProjection | null {
	const ref = React.useRef<ComposerTransactionProjection | null>(hub?.projection() ?? null);
	const subscribe = React.useCallback(
		(cb: () => void) => {
			if (!hub) return () => undefined;
			return hub.subscribe((projection) => {
				ref.current = projection;
				cb();
			});
		},
		[hub],
	);
	const getSnapshot = React.useCallback(() => ref.current, []);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
