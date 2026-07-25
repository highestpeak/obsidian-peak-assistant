import * as React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useComposerChrome } from './ComposerChromeContext';
import { useHubProjection } from './useHubProjection';
import type { ComposerTransactionEvent } from '@/core/composer';

/**
 * Transient, document-adjacent notice near the lower canvas edge (handoff §9.7
 * / component-consistency §2). After a commit / undo / redo it shows the state
 * (`改动已写入 / 已撤销 / 已重做`), the exact transaction label, and only the
 * currently-valid `撤销 / 重做` actions, then auto-hides — without clearing the
 * stack. It never becomes a second per-block toolbar.
 */
export function TransactionNotice(): React.ReactElement | null {
	const { runtime, config } = useComposerChrome();
	const hub = runtime.hub;
	const projection = useHubProjection(hub);
	const c = config.chrome.undo;
	const [notice, setNotice] = React.useState<{ state: string; label: string } | null>(null);
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	React.useEffect(() => {
		if (!hub) return;
		return hub.on((ev: ComposerTransactionEvent) => {
			const next = describe(ev, c);
			if (!next) return;
			setNotice(next);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setNotice(null), 4200);
		});
	}, [hub, c]);

	React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

	if (!notice) return null;
	return (
		<div className="pk-txn-notice" role="status" data-chrome="true">
			<span className="pk-txn-notice__state">{notice.state}</span>
			<span className="pk-txn-notice__label">{notice.label}</span>
			<span className="pk-txn-notice__actions">
				{projection.undo.canUndo && (
					<button type="button" className="pk-txn-notice__btn" onClick={() => void hub?.undo()}>
						<Undo2 size={13} /> {c.undo}
					</button>
				)}
				{projection.undo.canRedo && (
					<button type="button" className="pk-txn-notice__btn" onClick={() => void hub?.redo()}>
						<Redo2 size={13} /> {c.redo}
					</button>
				)}
			</span>
		</div>
	);
}

function describe(ev: ComposerTransactionEvent, c: { committed: string; undone: string; redone: string }): { state: string; label: string } | null {
	if (ev.type === 'committed') return { state: c.committed, label: ev.transaction.label };
	if (ev.type === 'undone') return { state: c.undone, label: ev.transactions.at(-1)?.label ?? '' };
	if (ev.type === 'redone') return { state: c.redone, label: ev.transactions[0]?.label ?? '' };
	if (ev.type === 'rolled-back') return { state: c.committed, label: ev.transaction.label };
	return null;
}
