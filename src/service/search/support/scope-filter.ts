import type { SearchMode, SearchScope } from '../types';

/**
 * Filter engine hits by UI scope.
 */
export function shouldKeepPathByScope(params: {
	mode: SearchMode;
	scope?: SearchScope;
	path: string;
}): boolean {
	const { mode, scope, path } = params;

	if (mode === 'inFile') {
		return Boolean(scope?.currentFilePath && path === scope.currentFilePath);
	}
	if (mode === 'inFolder') {
		const folderPath = scope?.folderPath;
		if (!folderPath) return true;
		const prefix = `${folderPath}/`;
		return path === folderPath || path.startsWith(prefix);
	}
	return true;
}

