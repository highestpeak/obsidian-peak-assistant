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

// Export functions for external use
(window as any).closeAllMenusExcept = closeAllMenusExcept;
(window as any).registerMenu = registerMenu;
(window as any).unregisterMenu = unregisterMenu;

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

		// Close all other menus immediately when opening a new one
		if (enableCoordination && (window as any).closeAllMenusExcept) {
			(window as any).closeAllMenusExcept(closeMenu);
		}

		// Register this menu
		if (enableCoordination && (window as any).registerMenu) {
			(window as any).registerMenu(closeMenu);
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
			if (enableCoordination && (window as any).unregisterMenu) {
				(window as any).unregisterMenu(closeMenu);
			}
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

/**
 * Higher-order component that wraps children with hover menu functionality
 */
export interface HoverMenuWrapperProps extends HoverMenuConfig {
	children: (menuState: HoverMenuResult) => React.ReactNode;
	className?: string;
}

export const HoverMenuWrapper: React.FC<HoverMenuWrapperProps> = ({
	children,
	className,
	...config
}) => {
	const menuState = useHoverMenu(config);

	return (
		<div
			ref={menuState.containerRef}
			className={className}
			onMouseEnter={menuState.handleMouseEnter}
			onMouseLeave={menuState.handleMouseLeave}
		>
			{children(menuState)}
		</div>
	);
};
