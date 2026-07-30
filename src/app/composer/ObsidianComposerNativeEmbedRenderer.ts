/** App-layer adapter for Obsidian's real Markdown/native embed renderer. */

import { Component, MarkdownRenderer, type App } from 'obsidian';
import type { ComposerNativeEmbedRendererPort } from '@/core/composer';

export class ObsidianComposerNativeEmbedRenderer implements ComposerNativeEmbedRendererPort {
	constructor(private readonly app: App) {}

	async render(request: Parameters<ComposerNativeEmbedRendererPort['render']>[0], host: HTMLElement): Promise<() => void> {
		const owner = new Component();
		const mount = host.ownerDocument.createElement('div');
		mount.className = 'pk-native-embed-render-root';
		host.appendChild(mount);
		owner.load();
		let cleaned = false;
		const cleanup = (): void => {
			if (cleaned) return;
			cleaned = true;
			try {
				owner.unload();
			} catch (error) {
				console.error('[Peak Composer] native Markdown owner cleanup failed', {
					target: request.target,
					error,
				});
			} finally {
				mount.remove();
			}
		};
		try {
			await MarkdownRenderer.render(this.app, request.markdown, mount, request.sourcePath, owner);
			if (mount.childElementCount === 0 && !mount.textContent?.trim()) {
				throw new Error(`native embed produced no content for '${request.target}'`);
			}
		} catch (error) {
			cleanup();
			throw error;
		}
		return cleanup;
	}
}
