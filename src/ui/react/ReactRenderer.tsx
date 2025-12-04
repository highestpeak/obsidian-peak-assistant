import { createRoot, Root } from 'react-dom/client';
import React from 'react';

/**
 * Utility for rendering React components in Obsidian views
 */
export class ReactRenderer {
	private root: Root | null = null;
	private container: HTMLElement;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Render a React component
	 */
	render(element: React.ReactElement): void {
		if (!this.root) {
			// Use containerEl.children[1] like the reference implementation
			// containerEl has structure: [header, content]
			const targetContainer = (this.container.children[1] as HTMLElement) || this.container;
			this.root = createRoot(targetContainer);
		}
		this.root.render(element);
	}

	/**
	 * Unmount the React component
	 */
	unmount(): void {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}
}

