/**
 * Peak Composer — Obsidian native-file adapter (WP8, §10.12).
 *
 * The app-layer implementation of {@link ComposerNativeFilePort}: reads/writes
 * the SEPARATE native object files (`.base`, `.canvas`, `.excalidraw.md`) that
 * markdown embeds point at. Native patches never go through the Markdown
 * transaction hub — they target a different file — so they get their own
 * revision-guarded write (a native mirror of `ObsidianComposerWriteAdapter`).
 *
 * This is an additional composer file allowed to touch the vault (alongside the
 * WP1 source/write adapters). The service layer stays framework-neutral: it only
 * sees the {@link ComposerNativeFilePort} interface and the pure patch functions.
 */

import type { App, TFile } from 'obsidian';
import { TFile as ObsidianTFile } from 'obsidian';
import { ComposerConflictError } from '@/core/composer';
import type { ComposerNativeFileFormat } from '@/core/schemas/composer';
import type { ComposerNativeFilePort } from '@/service/composer';

export class ObsidianComposerNativeFileAdapter implements ComposerNativeFilePort {
	constructor(private readonly app: App) {}

	format(targetPath: string): ComposerNativeFileFormat | null {
		const lower = targetPath.toLowerCase();
		if (lower.endsWith('.base')) return 'base';
		if (lower.endsWith('.canvas')) return 'canvas';
		if (lower.endsWith('.excalidraw.md') || lower.endsWith('.excalidraw')) return 'excalidraw';
		return null;
	}

	async readNative(targetPath: string): Promise<string> {
		const file = this.resolve(targetPath);
		return this.app.vault.read(file);
	}

	async writeNative(targetPath: string, nextText: string, expectedBaseText: string): Promise<void> {
		const file = this.resolve(targetPath);
		await this.app.vault.process(file, (current) => {
			if (current !== expectedBaseText) {
				throw new ComposerConflictError(
					'revision-mismatch',
					`Composer native write conflict on ${targetPath}: file changed since snapshot`,
				);
			}
			return nextText;
		});
	}

	private resolve(targetPath: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(targetPath);
		if (!file || !(file instanceof ObsidianTFile)) {
			throw new Error(`Composer native file not found: ${targetPath}`);
		}
		return file;
	}
}
