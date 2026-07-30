import * as React from 'react';
import type { AppContext } from '@/app/context/AppContext';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { RelatedNotesPanel } from '@/ui/view/ambient-panel/RelatedNotesPanel';

/**
 * Window-local Ambient companion. The element is mounted inside Obsidian's
 * workspace DOM, so it remains above editors in this window but can never
 * become a macOS system-level always-on-top surface.
 */
export class AmbientFloatingPanelHost {
	private container: HTMLDivElement | null = null;
	private renderer: ReactRenderer | null = null;

	constructor(private readonly appContext: AppContext) {}

	open(): void {
		if (this.container?.isConnected) {
			this.container.hidden = false;
			this.container.focus({ preventScroll: true });
			return;
		}

		const workspaceEl = this.appContext.app.workspace.containerEl;
		const ownerDocument = workspaceEl.ownerDocument;
		const container = ownerDocument.createElement('div');
		container.className = 'peak-ambient-floating-host peak-design-root';
		container.tabIndex = -1;
		container.setAttribute('role', 'complementary');
		container.setAttribute('aria-label', 'Ambient related notes');
		workspaceEl.appendChild(container);
		this.container = container;
		this.renderer = new ReactRenderer(container);
		this.renderer.render(
			createReactElementWithServices(
				RelatedNotesPanel,
				{
					floating: true,
					onClose: () => this.close(),
				},
				this.appContext,
			),
		);
		container.focus({ preventScroll: true });
	}

	close(): void {
		const container = this.container;
		const renderer = this.renderer;
		this.container = null;
		this.renderer = null;
		if (renderer) renderer.unmount();
		container?.remove();
	}

	dispose(): void {
		this.close();
	}
}
