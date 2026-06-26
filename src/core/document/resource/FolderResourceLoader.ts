import type { ResourceLoader, ResourceSummary, ResourceKind } from '@/core/document/types';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';

/**
 * Resource loader for folder resources.
 *
 * T11K: depends on {@link DocumentVaultReaderPort} for folder lookups
 * instead of Obsidian `App` / `TFolder`.
 */
export class FolderResourceLoader implements ResourceLoader {
	constructor(private readonly vault: DocumentVaultReaderPort) {}

	getResourceType(): ResourceKind {
		return 'folder';
	}

    // todo implement getSummary. structures, semantic info about all files in the folder
	async getSummary(
		source: string | any,
		provider: string,
		modelId: string
	): Promise<ResourceSummary> {
		// For folders, return a basic summary based on the folder path
		const sourceStr = typeof source === 'string' ? source : '';
		const folderPath = sourceStr.replace(/^\[\[|\]\]$/g, '');
		const folder = this.vault.getFolder(folderPath);

		if (folder) {
			const { files, folders } = this.vault.listFolderChildren(folderPath);
			return {
				shortSummary: `Folder: ${folderPath} (${files.length} files, ${folders.length} subfolders)`,
				fullSummary: `This is a folder resource for "${folderPath}". The folder contains ${files.length} files and ${folders.length} subfolders.`,
			};
		}

		return {
			shortSummary: `Folder: ${folderPath}`,
			fullSummary: `This is a folder resource for "${folderPath}".`,
		};
	}
}
