import { App } from 'obsidian';
import { openFile, openFileAtLine } from '@/core/utils/obsidian-utils';
import { AppContext } from '@/app/context/AppContext';
import type { SearchResultItem } from '@/service/search/types';

/**
 * Callback function for handling source file opening operations.
 * Provides consistent file opening behavior across search components.
 * Supports go-to-line functionality when loc information is available.
 *
 * Pass `appInstance` to avoid AppContext.getInstance() inside the callback —
 * callers that have access to the host or app should prefer passing it.
 * Falls back to AppContext.getInstance() when not provided for backward compat.
 */
export function createOpenSourceCallback(onClose?: () => void, newTab: boolean = true, appInstance?: App) {
	return async (resultOrPath: string | SearchResultItem) => {
		try {
			onClose?.();

			const app = appInstance ?? AppContext.getInstance().app;

			// Handle SearchResultItem with location info
			if (typeof resultOrPath === 'object' && resultOrPath.loc?.line) {
				const lineNumber = resultOrPath.loc.line;
				await openFileAtLine(resultOrPath.path, lineNumber - 1, newTab, app); // Convert to 0-based
			} else {
				// Handle simple path string
				const path = typeof resultOrPath === 'string' ? resultOrPath : resultOrPath.path;
				await openFile(path, newTab, app);
			}

		} catch (e) {
			console.error('Open source failed:', e);
		}
	};
}
