import * as React from 'react';
import { Crosshair, History as HistoryIcon, Undo2 } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import {
	composerTargetBlockId,
	type ComposerHistoryItem,
} from '@/core/composer';
import {
	groupComposerGenerationRuns,
	type ComposerGenerationGroup,
	type ComposerWorkspaceIntelligenceProjection,
	type ComposerWorkspaceIntelligenceRuntime,
	type FrozenComposerRunEnvelope,
} from '@/service/composer';
import { generationPreview, restoreGenerationReview } from '../generationHistory';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * Per-block History panel (WP4). Lists the REAL hub-projection ledger entries
 * whose target is this block (grouped bursts contribute their children), with
 * locate / diff summary / rollback. Rollback appends an inverse transaction via
 * hub.rollback — it never deletes the original entry; an anchor-drift refusal
 * surfaces as an inline reason. Review actions use the 30px radius-md family.
 */
export function BlockHistoryPanel({
	blockId,
	onLocate,
	onClose,
}: {
	blockId: string;
	onLocate: () => void;
	onClose: () => void;
}): React.ReactElement {
	const { runtime, config } = useComposerChrome();
	const projection = useWorkspaceProjection(runtime.workspaceIntelligence);
	const c = config.chrome.history;
	const documentId = runtime.session?.snapshot.documentId;
	const groups = React.useMemo(() => {
		const runs = (projection?.runs ?? []).filter((run) => targetMatchesBlock(run.target, blockId));
		return groupComposerGenerationRuns(runs, documentId);
	}, [projection, blockId, documentId]);

	return (
		<div className="pk-block-history pk-composer-panel" data-chrome="true" aria-label={c.title}>
			<div className="pk-block-history__head">
				<HistoryIcon size={13} />
				<span>{c.title}</span>
			</div>
			{groups.length === 0 && <span className="pk-block-history__empty">{c.empty}</span>}
			{groups.map((group) => {
				const latest = group.latest;
				const restorable = [...group.runs]
					.reverse()
					.find((run) => run.disposition === 'not-adopted' && run.review);
				return (
				<div
					key={group.candidateId}
					className="pk-block-history__row"
					data-status={latest.status}
					data-disposition={latest.disposition}
				>
					<div className="pk-block-history__meta">
						<span className="pk-block-history__label">{group.label}</span>
						<span className="pk-block-history__stats">
							{`${formatCount(c.versions, group.runs.length)} · ${blockGenerationStatus(group, c)}`}
						</span>
					</div>
					{generationPreview(latest) && (
						<span className="pk-block-history__preview">{generationPreview(latest)}</span>
					)}
					<div className="pk-block-history__actions">
						<Button variant="secondary" size="sm" className="pk-review-action" onClick={onLocate}>
							<Crosshair size={12} /> {c.locate}
						</Button>
						{restorable && (
							<Button
								variant="secondary"
								size="sm"
								className="pk-review-action"
								onClick={() => restoreGenerationReview(runtime, restorable)}
							>
								<Undo2 size={12} /> {c.restore}
							</Button>
						)}
					</div>
				</div>
				);
			})}
			<Button variant="ghost" size="sm" className="pk-block-history__close" onClick={onClose}>
				{config.chrome.copy.close}
			</Button>
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
		if (!runtime) {
			setProjection(null);
			return;
		}
		return runtime.subscribe(setProjection);
	}, [runtime]);
	return projection;
}

function targetMatchesBlock(target: FrozenComposerRunEnvelope['target'], blockId: string): boolean {
	const targetBlockId = composerTargetBlockId(target);
	if (!targetBlockId) return false;
	const prefix = blockId.split('-').slice(0, -1).join('-') + '-';
	return targetBlockId === blockId || targetBlockId.startsWith(prefix);
}

function blockGenerationStatus(
	group: ComposerGenerationGroup,
	strings: {
		accepted: string;
		notAdopted: string;
		pending: string;
		failed: string;
		cancelled: string;
	},
): string {
	if (group.runs.some((run) => run.disposition === 'accepted')) return strings.accepted;
	if (group.latest.disposition === 'not-adopted') return strings.notAdopted;
	if (group.latest.status === 'failed') return strings.failed;
	if (group.latest.status === 'cancelled' || group.latest.status === 'interrupted') {
		return strings.cancelled;
	}
	return strings.pending;
}

function formatCount(template: string, count: number): string {
	return template.replace('{count}', String(count));
}

/**
 * Flatten parents + children, keeping entries that target this block. A block's
 * id changes with its content (`kind-ordinal-fp8`), so past entries are matched
 * by the stable `kind-ordinal-` prefix — the same positional fallback
 * `matchBlocks` uses. Reorder-heavy documents may under-match old entries; the
 * full cross-revision identity chain is integration-task scope.
 */
export function collectHistoryForBlock(
	history: readonly ComposerHistoryItem[],
	blockId: string,
): ComposerHistoryItem[] {
	const prefix = blockId.split('-').slice(0, -1).join('-') + '-';
	const matches = (id: string) => id === blockId || id.startsWith(prefix);
	const out: ComposerHistoryItem[] = [];
	const visit = (item: ComposerHistoryItem) => {
		const targetBlockId = item.target ? composerTargetBlockId(item.target) : null;
		if (targetBlockId && matches(targetBlockId)) out.push(item);
		item.children?.forEach(visit);
	};
	history.forEach(visit);
	return out;
}
