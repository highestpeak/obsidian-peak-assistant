import { TFile, type App } from 'obsidian';
import type { MediaAttachmentWriter } from '@/service/media/MediaRingService';
import { ensureFolder } from '@/app/platform/vault/vault-helpers';

// Obsidian-side vault attachment writer for MediaRingService. Creates the
// attachment folder if missing and applies a timestamp suffix on collision.

export class ObsidianMediaAttachmentWriter implements MediaAttachmentWriter {
	constructor(private readonly app: App) {}

	async writeAttachment(input: {
		attachmentFolder: string;
		basename: string;
		extension: string;
		bytes: Uint8Array;
	}): Promise<{ path: string }> {
		const folder = input.attachmentFolder.replace(/^\/+|\/+$/g, '');
		if (folder.length > 0) {
			await ensureFolder(folder, this.app);
		}
		let path = folder
			? `${folder}/${input.basename}.${input.extension}`
			: `${input.basename}.${input.extension}`;
		if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) {
			const suffix = Date.now().toString(36);
			path = folder
				? `${folder}/${input.basename}-${suffix}.${input.extension}`
				: `${input.basename}-${suffix}.${input.extension}`;
		}
		await this.app.vault.createBinary(path, input.bytes.buffer as ArrayBuffer);
		return { path };
	}
}
