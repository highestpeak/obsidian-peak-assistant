import { useSyncExternalStore } from 'react';
import {
	getCurrentContextUtilization,
	subscribeContextUtilization,
	type ContextUtilization,
} from './chatBridge';

/**
 * Hook that returns the current chat context utilization snapshot. Reads
 * from the chatBridge registry and re-renders when the chat worktree pushes
 * an update via `setCurrentContextUtilization`. When the chat side has not
 * yet wired up updates, this hook returns `{ used: 0, max: 0, ratio: 0 }`.
 *
 * Designed for `<ContextRing>` and any future composer-adjacent indicator.
 */
export function useCurrentContextUtilization(): ContextUtilization {
	return useSyncExternalStore(
		subscribeContextUtilization,
		getCurrentContextUtilization,
		getCurrentContextUtilization,
	);
}
