import * as React from 'react';
import { Crosshair, History as HistoryIcon, Undo2 } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import {
	composerTargetBlockId,
	type ComposerHistoryItem,
} from '@/core/composer';
import { useComposerChrome } from './ComposerChromeContext';
import { useHubProjection } from './useHubProjection';

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
	const hub = runtime.hub;
	const projection = useHubProjection(hub);
	const c = config.chrome.history;
	const [refusedId, setRefusedId] = React.useState<string | null>(null);

	const items = React.useMemo(
		() => collectHistoryForBlock(projection.history, blockId),
		[projection.history, blockId],
	);

	const rollback = async (historyId: string) => {
		if (!hub) return;
		try {
			await hub.rollback(historyId);
			setRefusedId(null);
		} catch {
			setRefusedId(historyId);
		}
	};

	return (
		<div className="pk-block-history pk-composer-panel" data-chrome="true" aria-label={c.title}>
			<div className="pk-block-history__head">
				<HistoryIcon size={13} />
				<span>{c.title}</span>
			</div>
			{items.length === 0 && <span className="pk-block-history__empty">{c.empty}</span>}
			{items.map((item) => (
				<div key={item.historyId} className="pk-block-history__row" data-origin={item.origin}>
					<div className="pk-block-history__meta">
						<span className="pk-block-history__label">{item.label}</span>
						<span className="pk-block-history__stats">{`+${item.stats.added} −${item.stats.removed}`}</span>
					</div>
					<div className="pk-block-history__actions">
						<Button variant="secondary" size="sm" className="pk-review-action" onClick={onLocate}>
							<Crosshair size={12} /> {c.locate}
						</Button>
						<Button
							variant="secondary"
							size="sm"
							className="pk-review-action"
							disabled={!hub || item.isRollback}
							title={refusedId === item.historyId ? c.rollbackRefused : undefined}
							onClick={() => void rollback(item.historyId)}
						>
							<Undo2 size={12} /> {c.rollback}
						</Button>
					</div>
					{refusedId === item.historyId && <span className="pk-block-history__refused">{c.rollbackRefused}</span>}
				</div>
			))}
			<Button variant="ghost" size="sm" className="pk-block-history__close" onClick={onClose}>
				{config.chrome.copy.close}
			</Button>
		</div>
	);
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
