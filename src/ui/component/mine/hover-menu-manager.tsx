import React, { useCallback, useRef, useEffect } from 'react';

/**
 * Global registry to track all open menus (selectors, popovers, dropdowns)
 * When a new menu opens, it closes all others immediately
 */
const openMenus = new Set<() => void>();

/**
 * Close all open menus except the provided one
 */
function closeAllMenusExcept(exceptCloseFn?: () => void) {
	openMenus.forEach((closeFn) => {
		if (closeFn !== exceptCloseFn) {
			closeFn();
		}
	});
}

/**
 * Register a menu close function
 */
function registerMenu(closeFn: () => void) {
	openMenus.add(closeFn);
}

/**
 * Unregister a menu close function
 */
function unregisterMenu(closeFn: () => void) {
	openMenus.delete(closeFn);
}

/**
 * Release menu-owned React callbacks during plugin unload.
 *
 * This deliberately stays module-local. Publishing these functions on
 * `window` would let the renderer global retain an old plugin generation
 * across disable → enable, which in turn retains the full bundled module
 * context until the next generation replaces those globals.
 */
export function clearHoverMenusForUnload(): void {
	try {
		openMenus.forEach((closeMenu) => closeMenu());
	} catch (_) { /* a stale React callback must not interrupt unload */ }
	openMenus.clear();
}

export interface HoverMenuConfig {
	/** Unique identifier for the menu */
	id: string;
	/** Delay before closing menu on mouse leave (in ms) */
	closeDelay?: number;
	/** Whether to enable global menu coordination */
	enableCoordination?: boolean;
}

export interface HoverMenuResult {
	/** Whether the menu is open */
	isOpen: boolean;
	/** Function to manually open the menu */
	openMenu: () => void;
	/** Function to manually close the menu */
	closeMenu: () => void;
	/** Container ref for mouse event handling */
	containerRef: React.RefObject<HTMLDivElement>;
	/** Mouse enter handler for container */
	handleMouseEnter: () => void;
	/** Mouse leave handler for container */
	handleMouseLeave: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing hover-triggered menus with global coordination
 */
export function useHoverMenu(config: HoverMenuConfig): HoverMenuResult {
	const { closeDelay = 500, enableCoordination = true } = config;

	const [isOpen, setIsOpen] = React.useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Create a stable reference to the close function
	const closeMenu = useCallback(() => {
		setIsOpen(false);
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	// Create a stable reference to the open function
	const openMenu = useCallback(() => {
		// Clear any pending close timer first
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}

		if (enableCoordination) {
			closeAllMenusExcept(closeMenu);
			registerMenu(closeMenu);
		}

		setIsOpen(true);
	}, [closeMenu, enableCoordination]);

	// Handle mouse enter
	const handleMouseEnter = useCallback(() => {
		openMenu();
	}, [openMenu]);

	// Handle mouse leave
	const handleMouseLeave = useCallback(() => {
		// Set a timer to close the menu
		closeTimerRef.current = setTimeout(() => {
			setIsOpen(false);
		}, closeDelay);
	}, [closeDelay]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (enableCoordination) unregisterMenu(closeMenu);
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
			}
		};
	}, [closeMenu, enableCoordination]);

	return {
		isOpen,
		openMenu,
		closeMenu,
		containerRef,
		handleMouseEnter,
		handleMouseLeave,
	};
}
