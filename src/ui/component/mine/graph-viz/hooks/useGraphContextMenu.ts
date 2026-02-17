/**
 * Internal context menu state and close-on-outside / leave-timer logic.
 * Used when GraphVisualization is in nodeContextMenu mode.
 */

import { useEffect, useRef, useState } from 'react';
import type { GraphVizNodeInfo } from '../types';

export type ContextMenuState = {
	open: boolean;
	clientX: number;
	clientY: number;
	node: GraphVizNodeInfo | null;
};

const INITIAL_MENU: ContextMenuState = { open: false, clientX: 0, clientY: 0, node: null };

/** Selector for the context menu element (sibling of containerRef, so clicks inside must not close the menu). */
const CONTEXT_MENU_SELECTOR = '[data-graph-node-context-menu]';

export function useGraphContextMenu(
	enabled: boolean,
	containerRef: React.RefObject<HTMLDivElement | null>
) {
	const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_MENU);
	const menuLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const closeMenu = () => setContextMenu(INITIAL_MENU);

	useEffect(() => {
		if (!enabled) return;
		const onDocPointerDown = (evt: PointerEvent) => {
			if (!contextMenu.open) return;
			const el = containerRef.current;
			if (!el) return;
			const target = evt.target as Node;
			const insideContainer = el.contains(target);
			const insideMenu = target instanceof Element && target.closest(CONTEXT_MENU_SELECTOR);
			if (!insideContainer && !insideMenu) {
				if (menuLeaveTimerRef.current) {
					clearTimeout(menuLeaveTimerRef.current);
					menuLeaveTimerRef.current = null;
				}
				setContextMenu((m) => ({ ...m, open: false, node: null }));
			}
		};
		document.addEventListener('pointerdown', onDocPointerDown, { capture: true });
		return () => document.removeEventListener('pointerdown', onDocPointerDown, { capture: true });
	}, [enabled, contextMenu.open, containerRef]);

	useEffect(() => {
		if (!contextMenu.open && menuLeaveTimerRef.current) {
			clearTimeout(menuLeaveTimerRef.current);
			menuLeaveTimerRef.current = null;
		}
	}, [contextMenu.open]);

	return { contextMenu, setContextMenu, menuLeaveTimerRef, closeMenu };
}
