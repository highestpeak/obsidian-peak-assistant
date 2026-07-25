import * as React from 'react';
import type { ComposerTransactionHub } from '@/service/composer';
import type { ComposerTransactionProjection } from '@/core/composer';

const EMPTY: ComposerTransactionProjection = {
	revision: '',
	history: [],
	undo: { canUndo: false, canRedo: false, nextUndoLabel: null, nextRedoLabel: null, undoDepth: 0, redoDepth: 0 },
	candidates: [],
};

/**
 * Subscribe to the transaction hub's projection (History + Undo/Redo +
 * candidates). Re-renders on every commit / undo / candidate change. Returns a
 * stable empty projection when no hub is wired (read-only host / harness).
 *
 * The projection is cached in a ref updated by the hub's own notifications, so
 * `getSnapshot` returns a referentially-stable value between changes (required
 * by useSyncExternalStore — the hub mints a fresh projection each notify).
 */
export function useHubProjection(hub?: ComposerTransactionHub): ComposerTransactionProjection {
	const ref = React.useRef<ComposerTransactionProjection>(EMPTY);
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
	const getSnapshot = React.useCallback(() => (hub ? ref.current : EMPTY), [hub]);
	return React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
