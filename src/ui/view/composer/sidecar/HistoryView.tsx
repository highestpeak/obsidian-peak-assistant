import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import { composerTargetBlockId, type ComposerHistoryItem, type ComposerTransactionProjection } from '@/core/composer';
import { useSidecar } from './SidecarContext';

/**
 * Peak Composer — History view (WP9, handoff §12.1 / spec §History). Accepted
 * transactions only, newest first, each locatable and (when still on-top)
 * rollable. It reads the WP2 hub's history projection — the same ledger the
 * bottom Undo/Redo bar uses — so the Sidecar never keeps a second copy of
 * accepted-write state. The History bridge (run receipt ⇄ transaction link) is
 * owned by IntelligenceRuntime; this view just renders the ledger.
 */
export function HistoryView(): React.ReactElement {
	const { hub, config, onLocate } = useSidecar();
	const s = config.strings;
	const projection = useHubProjection(hub);
	const items = projection?.history ?? [];

	if (items.length === 0) {
		return <div className="pk-history pk-history--empty">{s.historyEmpty}</div>;
	}
	return (
		<div className="pk-history" data-testid="pk-history">
			{items.map((item) => (
				<HistoryRow
					key={item.historyId}
					item={item}
					onLocate={() => {
						const blockId = item.target ? composerTargetBlockId(item.target) : null;
						if (blockId) onLocate?.(blockId);
					}}
					onRollback={() => {
						void hub?.rollback(item.historyId).catch(() => undefined);
					}}
					rollbackLabel={config.strings.reviewClose}
				/>
			))}
		</div>
	);
}

function HistoryRow({
	item,
	onLocate,
	onRollback,
	rollbackLabel,
}: {
	item: ComposerHistoryItem;
	onLocate: () => void;
	onRollback: () => void;
	rollbackLabel: string;
}): React.ReactElement {
	return (
		<div className="pk-history-row" data-origin={item.origin}>
			<button type="button" className="pk-history-main" onClick={onLocate}>
				<span className="pk-history-label">{item.label}</span>
				<span className="pk-history-meta">
					+{item.stats.added} / -{item.stats.removed}
				</span>
			</button>
			{!item.isRollback && (
				<button type="button" className="pk-icon-btn" aria-label={rollbackLabel} onClick={onRollback}>
					<RotateCcw size={13} />
				</button>
			)}
		</div>
	);
}

/** Subscribe to the hub projection as a React external store (History-only slice). */
function useHubProjection(hub: ReturnType<typeof useSidecar>['hub']): ComposerTransactionProjection | null {
	const ref = React.useRef<ComposerTransactionProjection | null>(hub?.projection() ?? null);
	const subscribe = React.useCallback(
		(cb: () => void) => {
			if (!hub) return () => undefined;
			return hub.subscribe((p) => {
				ref.current = p;
				cb();
			});
		},
		[hub],
	);
	const getSnapshot = React.useCallback(() => ref.current, []);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
