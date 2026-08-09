import type { PeakSheetAttachmentPort } from '@/core/ports/PeakSheetToolPort';
import type { PeakSheetFileRef } from '@/core/sheet';
import { getAIMediaFolder } from '@/core/config/folderPaths';
import { ObsidianMediaAttachmentWriter } from '@/app/platform/media/ObsidianMediaAttachmentWriter';
import type { App } from 'obsidian';

export class PeakSheetAttachmentAdapter implements PeakSheetAttachmentPort {
	private readonly writer: ObsidianMediaAttachmentWriter;

	constructor(app: App, private readonly aiRootFolder: string) {
		this.writer = new ObsidianMediaAttachmentWriter(app);
	}

	async copyExternalFile(input: {
		readonly name: string;
		readonly mediaType?: string;
		readonly bytes: Uint8Array;
	}): Promise<PeakSheetFileRef> {
		const { basename, extension } = safeFilename(input.name);
		const result = await this.writer.writeAttachment({
			attachmentFolder: getAIMediaFolder(this.aiRootFolder),
			basename: `sheet-${basename}`,
			extension,
			bytes: input.bytes,
		});
		return {
			kind: 'external-copy',
			vaultPath: result.path,
			mediaType: input.mediaType,
			displayName: input.name,
		};
	}
}

function safeFilename(name: string): { basename: string; extension: string } {
	const normalized = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
	const dot = normalized.lastIndexOf('.');
	const rawBase = dot > 0 ? normalized.slice(0, dot) : normalized;
	const rawExtension = dot > 0 ? normalized.slice(dot + 1) : 'bin';
	const basename = rawBase.replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'attachment';
	const extension = rawExtension.replace(/[^a-z0-9]+/gi, '').toLocaleLowerCase().slice(0, 16) || 'bin';
	return { basename, extension };
}
