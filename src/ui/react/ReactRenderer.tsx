import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { PortalContainerProvider } from './PortalContainerContext';

/**
 * Utility for rendering React components in Obsidian views
 */
export class ReactRenderer {
	private root: Root | null = null;
	private container: HTMLElement;
	private pendingElement: React.ReactElement | null = null;
	private pendingRafId: number | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Render a React component
	 */
	render(element: React.ReactElement): void {
		// Determine target container:
		// For Obsidian Views: containerEl has structure [header, content], use children[1]
		// For PluginSettingTab: containerEl is the direct container
		const targetContainer = (this.container.children[1] as HTMLElement) || this.container;

		// Wrap with PortalContainerProvider so Radix-based primitives mounted
		// anywhere in this tree default to the right window's body — critical
		// for views opened in detached Obsidian windows where the global
		// `document.body` is the MAIN window, not this leaf's window.
		const wrapped = React.createElement(
			PortalContainerProvider,
			{ container: targetContainer.ownerDocument.body, children: element },
		);

		// Check if root exists and if it's still valid
		if (this.root) {
			try {
				this.root.render(wrapped);
				return;
			} catch (error) {
				// If render fails, the root may be invalid, so recreate it
				console.warn('[ReactRenderer] Error rendering to existing root, recreating:', error);
				this.root = null;
			}
		}

		// Ensure the container is in the DOM
		if (!targetContainer.isConnected) {
			this.pendingElement = element;
			this.pendingRafId = requestAnimationFrame(() => {
				this.pendingRafId = null;
				if (this.pendingElement) {
					const next = this.pendingElement;
					this.pendingElement = null;
					this.render(next);
				}
			});
			return;
		}

		targetContainer.classList.add('pktw-root');
		this.root = createRoot(targetContainer);
		this.root.render(wrapped);
	}

	/**
	 * Unmount the React component. Clears pending delayed render to avoid holding closures.
	 */
	unmount(): void {
		if (this.pendingRafId != null) {
			cancelAnimationFrame(this.pendingRafId);
			this.pendingRafId = null;
		}
		this.pendingElement = null;
		if (this.root) {
			try {
				this.root.unmount();
			} catch (error) {
				// Ignore errors if the container was already removed from DOM
				console.warn('[ReactRenderer] Error during unmount:', error);
			} finally {
				this.root = null;
			}
		}
	}
}
