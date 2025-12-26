import type { App } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import type { ResourceLoader, ResourceSummary, ResourceKind } from '@/core/document/types';

/**
 * Resource loader for folder resources
 */
export class FolderResourceLoader implements ResourceLoader {
	constructor(private readonly app: App) {}

	getResourceType(): ResourceKind {
		return 'folder';
	}

    // todo implement getSummary. structures, semantic info about all files in the folder
	async getSummary(
		source: string | any,
		promptService: { chatWithPrompt: (promptId: string, variables: any, provider: string, model: string) => Promise<string> },
		provider: string,
		modelId: string
	): Promise<ResourceSummary> {
		// For folders, return a basic summary based on the folder path
		const sourceStr = typeof source === 'string' ? source : '';
		const folderPath = sourceStr.replace(/^\[\[|\]\]$/g, '');
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		
		if (folder instanceof TFolder && folder.children) {
			const fileCount = folder.children.filter((f): f is TFile => f instanceof TFile).length;
			const folderCount = folder.children.filter((f): f is TFolder => f instanceof TFolder).length;
			return {
				shortSummary: `Folder: ${folderPath} (${fileCount} files, ${folderCount} subfolders)`,
				fullSummary: `This is a folder resource for "${folderPath}". The folder contains ${fileCount} files and ${folderCount} subfolders.`,
			};
		}
		
		return {
			shortSummary: `Folder: ${folderPath}`,
			fullSummary: `This is a folder resource for "${folderPath}".`,
		};
	}
}

