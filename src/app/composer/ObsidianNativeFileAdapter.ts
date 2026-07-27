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

import type { App, EventRef, TFile } from 'obsidian';
import { normalizePath, TFile as ObsidianTFile } from 'obsidian';
import { ComposerConflictError } from '@/core/composer';
import type { ComposerNativeFileFormat } from '@/core/schemas/composer';
import type {
	ComposerNativeFilePort,
	ComposerNativePreviewPort,
	ComposerNativePreviewRequest,
	ComposerNativePreviewState,
} from '@/service/composer';
import { classifyComposerNativeTarget } from '@/service/composer';

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

export class ObsidianComposerNativePreviewAdapter implements ComposerNativePreviewPort {
	constructor(private readonly app: App) {}

	async resolveNativePreview(request: ComposerNativePreviewRequest): Promise<ComposerNativePreviewState> {
		const resolved = this.resolveTargetFile(request);
		if (!resolved) {
			return {
				status: 'missing',
				format: request.format,
				requestedTarget: request.target,
			};
		}
		if (this.format(resolved.path) !== request.format) {
			return {
				status: 'error',
				format: request.format,
				requestedTarget: request.target,
				targetPath: resolved.path,
				message: resolved.path,
			};
		}
		try {
			const text = await this.app.vault.read(resolved);
			return { status: 'loaded', format: request.format, targetPath: resolved.path, text };
		} catch (err) {
			return {
				status: 'error',
				format: request.format,
				requestedTarget: request.target,
				targetPath: resolved.path,
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	onNativePreviewChange(request: ComposerNativePreviewRequest, cb: () => void): () => void {
		let currentPath = this.resolveTargetFile(request)?.path ?? null;
		const refresh = (path: string, oldPath?: string): void => {
			if (currentPath && path !== currentPath && oldPath !== currentPath) return;
			currentPath = this.resolveTargetFile(request)?.path ?? null;
			cb();
		};
		const refs: EventRef[] = [
			this.app.vault.on('modify', (file) => {
				if (file instanceof ObsidianTFile) refresh(file.path);
			}),
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof ObsidianTFile) refresh(file.path, oldPath);
			}),
			this.app.vault.on('delete', (file) => {
				if (file instanceof ObsidianTFile) refresh(file.path);
			}),
		];
		return () => refs.forEach((ref) => this.app.vault.offref(ref));
	}

	private format(targetPath: string): ComposerNativeFileFormat | null {
		const kind = classifyComposerNativeTarget(targetPath);
		if (kind === 'base' || kind === 'canvas' || kind === 'excalidraw') return kind;
		return null;
	}

	private resolveTargetFile(request: ComposerNativePreviewRequest): TFile | null {
		const linkpath = request.target.replace(/#.*$/, '').replace(/\|.*$/, '').trim();
		if (!linkpath) return null;
		const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, request.sourcePath);
		if (dest instanceof ObsidianTFile) return dest;
		const exact = this.app.vault.getAbstractFileByPath(linkpath);
		if (exact instanceof ObsidianTFile) return exact;
		const folder = request.sourcePath.includes('/') ? request.sourcePath.slice(0, request.sourcePath.lastIndexOf('/')) : '';
		if (!folder) return null;
		const relative = this.app.vault.getAbstractFileByPath(normalizePath(`${folder}/${linkpath}`));
		return relative instanceof ObsidianTFile ? relative : null;
	}
}
