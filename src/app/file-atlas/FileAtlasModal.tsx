/**
 * File Atlas — modal host (app layer).
 *
 * The `Open File Atlas` command opens this modal. It renders the standalone
 * File Atlas surface (left rail of open docs + Tree / Graph subviews) with a
 * composed host port. Services are provided so the Inspector can render mermaid
 * / math / tables through the shared StreamdownIsolated renderer.
 *
 * This replaced the old shortcut of hosting File Atlas as the CopilotPicker
 * modal's Atlas tab. Copilot / Ambient stay in the CopilotPicker (they move to
 * the Composer View later); File Atlas is its own surface now.
 */

import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { FileAtlasHost } from '@/ui/view/file-atlas/FileAtlasHost';
import { composeFileAtlasHost } from './composeFileAtlasHost';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';

export class FileAtlasModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private openToken = 0;
	private closed = true;

	constructor(
		private appContext: AppContext,
		private readonly requestedInitialPath?: string,
	) {
		super(appContext.app);
	}

	async onOpen(): Promise<void> {
		const token = ++this.openToken;
		this.closed = false;
		this.contentEl.empty();
		this.modalEl.addClass('peak-file-atlas-modal');
		this.modalEl.addClass('peak-design-root');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = 'min(1320px, 96vw)';
		this.modalEl.style.maxWidth = '96vw';
		this.modalEl.style.height = 'min(900px, calc(100vh - 64px))';
		this.modalEl.style.padding = '0';
		this.contentEl.style.padding = '0';

		const host = composeFileAtlasHost(this.appContext);
		const initialPath = this.requestedInitialPath ?? host.getActiveDocumentPath();
		let initialContent = '';
		if (initialPath) {
			initialContent = await host.readDoc(initialPath);
			if (this.closed || token !== this.openToken) return;
		}

		const ownerWindow = this.contentEl.ownerDocument.defaultView;
		const openBlock = (path: string, location: DocumentSourceLocation): void => {
			this.close();
			(ownerWindow ?? window).setTimeout(() => {
				void host.revealLocation(path, location);
			}, 0);
		};
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				FileAtlasHost,
				{
					host,
					initialPath,
					initialContent,
					ownerDocument: this.contentEl.ownerDocument,
					onOpenBlock: openBlock,
				},
				this.appContext,
			),
		);
	}

	onClose(): void {
		this.closed = true;
		this.openToken++;
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
