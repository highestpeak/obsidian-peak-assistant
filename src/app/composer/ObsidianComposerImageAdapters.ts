/**
 * Peak Composer — Obsidian adapters for the WP7 image ports.
 *
 * The app-layer boundary that maps the framework-neutral image ports onto
 * Obsidian's vault / metadata cache / media generation service. This is the ONLY
 * image file allowed to import `obsidian`; the service pack stays portable and
 * node-tested. Attachment writes follow the plugin's existing convention
 * (`vault.createBinary` + dedup), rename delegates to `fileManager.renameFile`
 * (which updates every cross-document reference atomically), and AI edit routes
 * through the shared MediaGenerationService.
 */

import type { App, TFile } from 'obsidian';
import { TFile as ObsidianTFile } from 'obsidian';
import type { ProduceMediaInput, ProduceMediaOutcome } from '@/service/media/MediaGenerationService';
import type {
	ComposerImageAttachmentPort,
	ComposerImageEditPort,
	ComposerImageEditRequest,
	ComposerImageEditResult,
	ComposerImageReferenceLocation,
	ComposerImageReferencePort,
	ComposerImageSaveRequest,
	ComposerImageSaveResult,
} from '@/service/composer';
import { dedupeAttachmentPath } from '@/service/composer';

/** Structural view of the media producer (the real MediaGenerationService satisfies it). */
export interface ComposerMediaProducer {
	produce(input: ProduceMediaInput): Promise<ProduceMediaOutcome>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	const parts = folder.split('/').filter((p) => p.length > 0);
	let acc = '';
	for (const part of parts) {
		acc = acc.length > 0 ? `${acc}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(acc)) {
			try {
				await app.vault.createFolder(acc);
			} catch {
				// Already exists (race) — tolerate.
			}
		}
	}
}

/** Writes/serves image attachments in the vault. */
export class ObsidianComposerImageAttachmentAdapter implements ComposerImageAttachmentPort {
	constructor(
		private readonly app: App,
		/** Resolved media attachment folder (vault-relative), e.g. `<root>/Attachments/media`. */
		private readonly resolveFolder: () => string,
	) {}

	attachmentFolder(): string {
		return this.resolveFolder();
	}

	exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}

	async save(request: ComposerImageSaveRequest): Promise<ComposerImageSaveResult> {
		const folder = request.folder ?? this.resolveFolder();
		await ensureFolder(this.app, folder);
		const path = dedupeAttachmentPath(folder, request.baseName, request.extension, (p) => this.app.vault.getAbstractFileByPath(p) !== null);
		await this.app.vault.createBinary(path, toArrayBuffer(request.bytes));
		return { path };
	}

	async overwrite(path: string, bytes: Uint8Array): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof ObsidianTFile)) throw new Error(`overwrite target not found: ${path}`);
		await this.app.vault.modifyBinary(file, toArrayBuffer(bytes));
	}

	previewUri(path: string, sourcePath?: string): string {
		const linkedFile = sourcePath
			? this.app.metadataCache.getFirstLinkpathDest(path, sourcePath)
			: null;
		const file = linkedFile ?? this.app.vault.getAbstractFileByPath(path);
		if (file instanceof ObsidianTFile) return this.app.vault.getResourcePath(file);
		return path;
	}
}

/** Reference bookkeeping over the metadata cache + fileManager. */
export class ObsidianComposerImageReferenceAdapter implements ComposerImageReferencePort {
	constructor(private readonly app: App) {}

	async findReferences(assetPath: string): Promise<ComposerImageReferenceLocation[]> {
		const resolved = this.app.metadataCache.resolvedLinks as Record<string, Record<string, number>>;
		const out: ComposerImageReferenceLocation[] = [];
		for (const [fromPath, targets] of Object.entries(resolved)) {
			const count = targets[assetPath];
			if (count && count > 0) out.push({ documentPath: fromPath, count });
		}
		return out;
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(oldPath);
		if (!file || !(file instanceof ObsidianTFile)) throw new Error(`rename source not found: ${oldPath}`);
		await this.app.fileManager.renameFile(file, newPath);
	}

	async backup(path: string): Promise<{ backupPath: string }> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof ObsidianTFile)) throw new Error(`backup source not found: ${path}`);
		const dot = path.lastIndexOf('.');
		const stem = dot > 0 ? path.slice(0, dot) : path;
		const ext = dot > 0 ? path.slice(dot) : '';
		const backupPath = `${stem}.bak-${Date.now().toString(36)}${ext}`;
		await this.app.vault.copy(file, backupPath);
		return { backupPath };
	}
}

/** AI image edit / generation routed through the shared MediaGenerationService. */
export class ComposerMediaImageEditAdapter implements ComposerImageEditPort {
	constructor(
		private readonly producer: ComposerMediaProducer,
		/** Config-supplied preset id for composer image edits. */
		private readonly presetId: string,
	) {}

	async edit(request: ComposerImageEditRequest): Promise<ComposerImageEditResult> {
		const outcome = await this.producer.produce({
			request: {
				kind: 'image',
				prompt: request.instruction,
				operation: request.sourcePath ? 'edit' : 'generate',
				route: 'auto',
				presetId: this.presetId,
				...(request.variants ? { quantity: request.variants } : {}),
				...(request.sourcePath
					? { referenceImages: [{ sourceType: 'vault', ref: request.sourcePath }] }
					: {}),
				...(request.maskPath ? { maskImage: { sourceType: 'vault', ref: request.maskPath } } : {}),
			},
			runId: `composer-image-${Date.now().toString(36)}`,
		});
		return { paths: outcome.writtenPaths, mimeType: 'image/png' };
	}
}

/** A Canvas factory bound to the host element's ownerDocument (S4 ownerWindow rule). */
export function createOwnerCanvasFactory(hostEl: HTMLElement): () => HTMLCanvasElement {
	return () => hostEl.ownerDocument.createElement('canvas');
}

/** Narrowing helper for callers that already hold a TFile. */
export function asTFile(value: unknown): TFile | null {
	return value instanceof ObsidianTFile ? value : null;
}
