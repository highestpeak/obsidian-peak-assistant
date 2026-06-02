import React, { createContext, useContext } from 'react';

/**
 * Default portal-target container for the React tree mounted in this leaf.
 *
 * Why: Radix UI primitives (Popover, Dialog/Modal, DropdownMenu, ...) render
 * their floating surface via `React.createPortal` to a target element. The
 * Radix default is `document.body`, which in detached Obsidian windows is
 * the MAIN window's body — so any menu opened from a popout leaf renders
 * on the wrong screen, far from the click position.
 *
 * The leaf's React renderer (`ReactRenderer`) sets the context to its
 * target container's `ownerDocument.body`, so primitives mounted under that
 * leaf default to portalling within the correct window.
 *
 * Primitives still accept an explicit `container` prop — when set, it wins.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export const PortalContainerProvider: React.FC<{
	container: HTMLElement | null;
	children: React.ReactNode;
}> = ({ container, children }) => (
	<PortalContainerContext.Provider value={container}>
		{children}
	</PortalContainerContext.Provider>
);

/**
 * Returns the leaf-scoped portal container, or `null` if none was provided
 * (in which case callers should fall back to Radix's default).
 */
export function usePortalContainer(): HTMLElement | null {
	return useContext(PortalContainerContext);
}
