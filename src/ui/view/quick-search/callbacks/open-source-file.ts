import { App } from 'obsidian';
import { openFile, openFileAtLine } from '@/core/utils/obsidian-utils';
import type { SearchResultItem } from '@/service/search/types';

/**
 * Callback function for handling source file opening operations.
 * Provides consistent file opening behavior across search components.
 * Supports go-to-line functionality when loc information is available.
 *
 * T11N: `appInstance` is mandatory. The previous `AppContext.getInstance()`
 * fallback hid a UI -> app-shell leak from the boundary audit; callers
 * always have an `app` reachable through `useServiceContext()` (or via
 * `useQuickSearchHost()` indirectly), so they pass it explicitly now.
 */
export function createOpenSourceCallback(
	onClose: (() => void) | undefined,
	newTab: boolean,
	appInstance: App,
) {
	return async (resultOrPath: string | SearchResultItem) => {
		try {
			onClose?.();

			// Handle SearchResultItem with location info
			if (typeof resultOrPath === 'object' && resultOrPath.loc?.line) {
				const lineNumber = resultOrPath.loc.line;
				await openFileAtLine(resultOrPath.path, lineNumber - 1, newTab, appInstance); // Convert to 0-based
			} else {
				// Handle simple path string
				const path = typeof resultOrPath === 'string' ? resultOrPath : resultOrPath.path;
				await openFile(path, newTab, appInstance);
			}

		} catch (e) {
			console.error('Open source failed:', e);
		}
	};
}
