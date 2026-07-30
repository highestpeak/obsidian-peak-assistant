import * as React from 'react';
import { History as HistoryIcon } from 'lucide-react';
import {
	composerTargetBlockId,
	type ComposerHistoryItem,
	type ComposerTransactionProjection,
} from '@/core/composer';
import {
	activityMatchesBlock,
	projectComposerHistoryActivities,
	type ComposerHistoryActivity,
	type ComposerHistoryTransactionResolver,
	type ComposerWorkspaceIntelligenceProjection,
	type ComposerWorkspaceIntelligenceRuntime,
	type IntelligenceRuntime,
	type IntelligenceSessionProjection,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import {
	activitySourceLabel,
	activityStatusLabel,
	composerHistoryActivityLabels,
	formatHistoryTime,
} from '../sidecar/HistoryView';
import {
	DEFAULT_SIDECAR_CONFIG,
	loadSidecarConfig,
	type SidecarConfig,
} from '../sidecar/sidecarConfig';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * Compact block-local projection of the same unified activity ledger shown in
 * the Sidecar. It intentionally shows only the latest three activities; the
 * original/result/current comparison belongs to the shared wide detail modal.
 */
export function BlockHistoryPanel({
	blockId,
	onViewAll,
	onOpenActivity,
	onClose,
}: {
	blockId: string;
	onViewAll?: () => void;
	onOpenActivity: (activity: ComposerHistoryActivity) => void;
	onClose: () => void;
}): React.ReactElement {
	const { runtime, config, snapshot: liveSnapshot } = useComposerChrome();
	const workspace = useWorkspaceProjection(runtime.workspaceIntelligence);
	const session = useIntelligenceProjection(runtime.intelligence);
	const transactionProjection = useTransactionProjection(runtime.hub);
	const [sidecarConfig, setSidecarConfig] = React.useState<SidecarConfig>(
		DEFAULT_SIDECAR_CONFIG,
	);
	const snapshot = liveSnapshot ?? runtime.session?.snapshot;
	const documentId = snapshot?.documentId ?? '';
	const c = config.chrome.history;
	const s = sidecarConfig.strings;

	React.useEffect(() => {
		let alive = true;
		void loadSidecarConfig().then((loaded) => {
			if (alive) setSidecarConfig(loaded);
		});
		return () => {
			alive = false;
		};
	}, []);

	const transactionResolver = React.useMemo<ComposerHistoryTransactionResolver | undefined>(
		() => runtime.hub
			? {
					preview: (historyId) => runtime.hub!.historyPreview(historyId),
					transaction: (historyId) => runtime.hub!.historyTransaction(historyId),
				}
			: undefined,
		[runtime.hub, transactionProjection],
	);
	const allActivities = React.useMemo(
		() => projectComposerHistoryActivities({
			documentId,
			runs: workspace?.runs ?? [],
			receipts: session?.receipts ?? [],
			externalRunAliases: session?.externalRunAliases,
			history: transactionProjection?.history ?? [],
			labels: composerHistoryActivityLabels(s),
			transactionResolver,
		}),
		[
			documentId,
			workspace,
			session,
			transactionProjection,
			transactionResolver,
			s,
		],
	);
	const blockActivities = React.useMemo(
		() => allActivities.filter((activity) => activityMatchesBlock(activity, blockId)),
		[allActivities, blockId],
	);
	const visibleActivities = blockActivities.slice(0, 3);
	return (
		<div className="pk-block-history pk-composer-panel" data-chrome="true" aria-label={c.title}>
			<div className="pk-block-history__head">
				<HistoryIcon size={13} />
				<span>{c.title}</span>
				{blockActivities.length > 0 && <small>{blockActivities.length}</small>}
			</div>
			{visibleActivities.length === 0 && (
				<span className="pk-block-history__empty">{c.empty}</span>
			)}
			<div className="pk-block-history__list">
				{visibleActivities.map((activity) => (
					<Button
						key={activity.activityId}
						variant="ghost"
						className="pk-block-history__row"
						onClick={() => onOpenActivity(activity)}
						aria-label={`${s.historyOpenDetail}: ${activity.actionLabel}`}
					>
						<span className="pk-block-history__meta">
							<strong>{activity.actionLabel}</strong>
							<time>{formatHistoryTime(activity.occurredAt)}</time>
						</span>
						<span className="pk-block-history__context">
							{activitySourceLabel(activity.source, s)}
							<em data-status={activity.status}>
								{activityStatusLabel(activity.status, s)}
							</em>
						</span>
						{(activity.changeSummary || activity.targetLabel) && (
							<span className="pk-block-history__preview">
								{activity.changeSummary || activity.targetLabel}
							</span>
						)}
					</Button>
				))}
			</div>
			<div className="pk-block-history__footer">
				{blockActivities.length > 0 && onViewAll && (
					<Button
						variant="ghost"
						size="sm"
						className="pk-block-history__view-all"
						onClick={onViewAll}
					>
						{s.historyViewAll}
					</Button>
				)}
				<Button variant="ghost" size="sm" className="pk-block-history__close" onClick={onClose}>
					{config.chrome.copy.close}
				</Button>
			</div>

		</div>
	);
}

function useWorkspaceProjection(
	runtime: ComposerWorkspaceIntelligenceRuntime | undefined,
): ComposerWorkspaceIntelligenceProjection | null {
	const [projection, setProjection] = React.useState<ComposerWorkspaceIntelligenceProjection | null>(
		() => runtime?.projection() ?? null,
	);
	React.useEffect(() => {
		setProjection(runtime?.projection() ?? null);
		if (!runtime) return;
		return runtime.subscribe(setProjection);
	}, [runtime]);
	return projection;
}

function useIntelligenceProjection(
	runtime: IntelligenceRuntime | undefined,
): IntelligenceSessionProjection | null {
	const [projection, setProjection] = React.useState<IntelligenceSessionProjection | null>(
		() => runtime?.session.projection() ?? null,
	);
	React.useEffect(() => {
		setProjection(runtime?.session.projection() ?? null);
		if (!runtime) return;
		return runtime.session.subscribe(setProjection);
	}, [runtime]);
	return projection;
}

function useTransactionProjection(
	hub: ReturnType<typeof useComposerChrome>['runtime']['hub'],
): ComposerTransactionProjection | null {
	const [projection, setProjection] = React.useState<ComposerTransactionProjection | null>(
		() => hub?.projection() ?? null,
	);
	React.useEffect(() => {
		setProjection(hub?.projection() ?? null);
		if (!hub) return;
		return hub.subscribe(setProjection);
	}, [hub]);
	return projection;
}

/**
 * Flatten parents + children, keeping entries that target this block. This
 * compatibility helper remains exported for the ledger projection regression.
 */
export function collectHistoryForBlock(
	history: readonly ComposerHistoryItem[],
	blockId: string,
): ComposerHistoryItem[] {
	const prefix = `${blockId.split('-').slice(0, -1).join('-')}-`;
	const matches = (id: string) => id === blockId || id.startsWith(prefix);
	const out: ComposerHistoryItem[] = [];
	const visit = (item: ComposerHistoryItem): void => {
		const targetBlockId = item.target ? composerTargetBlockId(item.target) : null;
		if (targetBlockId && matches(targetBlockId)) out.push(item);
		item.children?.forEach(visit);
	};
	history.forEach(visit);
	return out;
}
