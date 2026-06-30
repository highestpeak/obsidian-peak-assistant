import type { VaultNavigationPort } from '@/core/ports/VaultNavigationPort';
import type { SearchResultItem } from '@/core/search/searchTypes';

/**
 * Callback function for handling source file opening operations.
 * Provides consistent file opening behavior across search components.
 * Supports go-to-line functionality when loc information is available.
 *
 * T11P (Track D): `app` replaced with the narrow `VaultNavigationPort`.
 * UI surfaces pass `vaultNavigation` from `useServiceContext()` so the
 * Quick Search modal / VaultSearchResult / V2SourcesView / RecentAIAnalysis
 * never touch raw `app.workspace.openLinkText` again.
 */
export function createOpenSourceCallback(
	onClose: (() => void) | undefined,
	newTab: boolean,
	vaultNavigation: VaultNavigationPort,
) {
	return async (resultOrPath: string | SearchResultItem) => {
		try {
			onClose?.();
			await vaultNavigation.openSearchResult(resultOrPath, { newLeaf: newTab });
		} catch (e) {
			console.error('Open source failed:', e);
		}
	};
}
