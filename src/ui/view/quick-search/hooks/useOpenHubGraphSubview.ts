import { useCallback } from 'react';
import { getHubMembers } from '@/service/search/inspectorService';
import { useVaultSearchStore } from '../store/vaultSearchStore';
import { useSharedStore } from '../store/sharedStore';

/**
 * T7 (2026-07-07 hub graph subview): shared handler used by both
 * `HubReferenceBlock` (Inspector row Cmd+click / Waypoints icon) and
 * `HubAnchorNode` (Result Graph View Cmd+click on a hub anchor).
 *
 * Effect: pin the Vault Search result set to the hub's constituent doc paths
 * and force the result view into graph mode. `useVaultSearch` post-filters
 * `lastSearchResults` by `pinnedResultDocIds`, so ResultGraphView (which reads
 * `lastSearchResults` from the store) picks up the scoped node set on its
 * next rebuild without an imperative call.
 *
 * Clearing the pin is the user's job — via the "Pinned to hub" chip in
 * `ResultPaneHeader` or by leaving `all` mode.
 *
 * Match the direct-import pattern used by other inspector consumers
 * (`getHubReferencesForDoc`, `getConnectedLinks`) rather than routing through
 * ServiceContext — those services are singletons over `sqliteStoreManager`.
 */
export function useOpenHubGraphSubview(): (hubNodeId: string) => Promise<void> {
	return useCallback(async (hubNodeId: string) => {
		try {
			const members = await getHubMembers(hubNodeId);
			if (!members.length) return;

			// Clear query text — mode resolves to `'all'` via `updateParsedQuery`.
			useSharedStore.getState().setVaultSearchQuery('');

			const store = useVaultSearchStore.getState();
			store.setPinnedResultDocIds(members);
			store.setResultView('graph');
		} catch (err) {
			console.error('[useOpenHubGraphSubview] failed to load hub members', err);
		}
	}, []);
}
