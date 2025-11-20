import { App, TFile, TFolder } from 'obsidian';
import { getFileType, FileType } from '../shared/file-utils';

export interface PendingFile {
	file: File;
	preview?: string;
	type: FileType;
}

/**
 * Handle file upload operations
 */
export class FileUploadHandler {
	private pendingFiles: PendingFile[] = [];

	constructor(private app: App) {}

	/**
	 * Add files to pending list
	 */
	async addFiles(files: File[]): Promise<void> {
		for (const file of files) {
			const type = getFileType(file);
			const fileItem: PendingFile = {
				file,
				type,
			};

			if (type === 'image') {
				try {
					const preview = await this.createImagePreview(file);
					fileItem.preview = preview;
				} catch (error) {
					console.error('Failed to create image preview:', error);
				}
			}

			this.pendingFiles.push(fileItem);
		}
	}

	/**
	 * Get pending files
	 */
	getPendingFiles(): PendingFile[] {
		return this.pendingFiles;
	}

	/**
	 * Clear pending files
	 */
	clearPendingFiles(): void {
		this.pendingFiles = [];
	}

	/**
	 * Remove file at index
	 */
	removeFile(index: number): void {
		this.pendingFiles.splice(index, 1);
	}

	/**
	 * Upload files to vault
	 */
	async uploadFiles(uploadFolder: string): Promise<string[]> {
		const uploadedPaths: string[] = [];
		
		if (this.pendingFiles.length === 0) {
			return uploadedPaths;
		}

		const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;
		
		await this.ensureFolderRecursive(normalizedFolder);

		for (const fileItem of this.pendingFiles) {
			try {
				const timestamp = Date.now();
				const sanitizedName = fileItem.file.name.replace(/[<>:"/\\|?*]/g, '_');
				const fileName = `${timestamp}-${sanitizedName}`;
				const filePath = `${normalizedFolder}/${fileName}`;
				
				const arrayBuffer = await fileItem.file.arrayBuffer();
				await this.app.vault.createBinary(filePath, arrayBuffer);
				
				const savedFile = this.app.vault.getAbstractFileByPath(filePath);
				if (savedFile && savedFile instanceof TFile) {
					uploadedPaths.push(filePath);
				}
			} catch (error) {
				console.error('Failed to upload file:', fileItem.file.name, error);
			}
		}

		return uploadedPaths;
	}

	/**
	 * Recursively create folder and all parent folders
	 */
	private async ensureFolderRecursive(folderPath: string): Promise<void> {
		const parts = folderPath.split('/').filter(p => p.length > 0);
		let currentPath = '';
		
		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			
			if (!existing) {
				try {
					await this.app.vault.createFolder(currentPath);
				} catch (error) {
					const checkAgain = this.app.vault.getAbstractFileByPath(currentPath);
					if (!checkAgain) {
						console.error('Failed to create folder:', currentPath, error);
						throw error;
					}
				}
			} else if (!(existing instanceof TFolder)) {
				throw new Error(`Path exists but is not a folder: ${currentPath}`);
			}
		}
	}

	/**
	 * Create image preview from file
	 */
	private createImagePreview(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (e.target?.result) {
					resolve(e.target.result as string);
				} else {
					reject(new Error('Failed to read file'));
				}
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}
}

