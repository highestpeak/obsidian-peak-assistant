/** App-layer adapter for Obsidian's real Markdown/native embed renderer. */

import { Component, MarkdownRenderer, type App } from 'obsidian';
import type { ComposerNativeEmbedRendererPort } from '@/core/composer';

export class ObsidianComposerNativeEmbedRenderer implements ComposerNativeEmbedRendererPort {
	constructor(private readonly app: App) {}

	async render(request: Parameters<ComposerNativeEmbedRendererPort['render']>[0], host: HTMLElement): Promise<() => void> {
		const owner = new Component();
		owner.load();
		host.replaceChildren();
		try {
			await MarkdownRenderer.render(this.app, request.markdown, host, request.sourcePath, owner);
			if (host.childElementCount === 0 && !host.textContent?.trim()) {
				throw new Error(`native embed produced no content for '${request.target}'`);
			}
		} catch (error) {
			owner.unload();
			host.replaceChildren();
			throw error;
		}
		return () => {
			owner.unload();
			host.replaceChildren();
		};
	}
}
