import { createRoot, Root } from 'react-dom/client';
import React from 'react';

/**
 * Utility for rendering React components in Obsidian views
 */
export class ReactRenderer {
	private root: Root | null = null;
	private container: HTMLElement;
	private pendingElement: React.ReactElement | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Render a React component
	 */
	render(element: React.ReactElement): void {
		// Check if root exists and if it's still valid
		if (this.root) {
			try {
				this.root.render(element);
				return;
			} catch (error) {
				// If render fails, the root may be invalid, so recreate it
				console.warn('[ReactRenderer] Error rendering to existing root, recreating:', error);
				this.root = null;
			}
		}

		// Determine target container:
		// For Obsidian Views: containerEl has structure [header, content], use children[1]
		// For PluginSettingTab: containerEl is the direct container
		const targetContainer = (this.container.children[1] as HTMLElement) || this.container;
		
		// Ensure the container is in the DOM
		if (!targetContainer.isConnected) {
			// Store element for retry and schedule a delayed render
			this.pendingElement = element;
			requestAnimationFrame(() => {
				if (this.pendingElement) {
					this.render(this.pendingElement);
					this.pendingElement = null;
				}
			});
			return;
		}

		this.root = createRoot(targetContainer);
		this.root.render(element);
	}

	/**
	 * Unmount the React component
	 */
	unmount(): void {
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

