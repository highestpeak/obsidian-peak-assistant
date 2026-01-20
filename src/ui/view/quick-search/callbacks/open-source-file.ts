import { openFile, openFileAtLine } from '@/core/utils/obsidian-utils';
import { AppContext } from '@/app/context/AppContext';
import type { SearchResultItem } from '@/service/search/types';

/**
 * Callback function for handling source file opening operations.
 * Provides consistent file opening behavior across search components.
 * Supports go-to-line functionality when loc information is available.
 */
export function createOpenSourceCallback(onClose?: () => void, newTab: boolean = true) {
	return async (resultOrPath: string | SearchResultItem) => {
		try {
			onClose?.();

			const app = AppContext.getInstance().app;

			// Handle SearchResultItem with location info
			if (typeof resultOrPath === 'object' && resultOrPath.loc?.line) {
				const lineNumber = resultOrPath.loc.line;
				await openFileAtLine(app, resultOrPath.path, lineNumber - 1, newTab); // Convert to 0-based
			} else {
				// Handle simple path string
				const path = typeof resultOrPath === 'string' ? resultOrPath : resultOrPath.path;
				await openFile(app, path, newTab);
			}

		} catch (e) {
			console.error('Open source failed:', e);
		}
	};
}