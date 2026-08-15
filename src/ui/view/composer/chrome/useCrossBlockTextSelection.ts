import * as React from 'react';
import {
	installCrossBlockTextSelection,
	type CrossBlockSelectionOptions,
} from './crossBlockTextSelection';

/**
 * React lifecycle wrapper for Composer's cross-contenteditable selection
 * bridge. Reinstalled only when editing availability changes.
 */
export function useCrossBlockTextSelection(
	containerRef: React.RefObject<HTMLElement | null>,
	enabled: boolean,
	options?: CrossBlockSelectionOptions,
): void {
	React.useEffect(() => {
		const root = containerRef.current;
		if (!root || !enabled) return;
		return installCrossBlockTextSelection(root, options);
	}, [containerRef, enabled, options]);
}
