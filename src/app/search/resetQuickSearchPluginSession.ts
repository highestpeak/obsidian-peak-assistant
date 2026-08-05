import { useAIGraphStore } from '@/ui/view/quick-search/store/aiGraphStore';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import { useVaultSearchStore } from '@/ui/view/quick-search/store/vaultSearchStore';

/**
 * Establish the in-memory boundary for one plugin runtime.
 *
 * Modal close/reopen deliberately preserves the current surface and draft, but
 * disabling, reloading, or restarting the plugin must behave like a cold start.
 * Keep this synchronous so Obsidian can complete it before any async teardown.
 */
export function resetQuickSearchPluginSession(): void {
	useSharedStore.getState().reset();
	useSearchSessionStore.getState().resetForPluginSession();
	useVaultSearchStore.getState().reset();
	useAIGraphStore.getState().reset();
}
