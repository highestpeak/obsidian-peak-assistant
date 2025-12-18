import type { App, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader, IndexableDocument } from './types';
import type { DocumentType } from '@/core/Enums';
import { MarkdownDocumentLoader } from './MarkdownDocumentLoader';

/**
 * Manages multiple document loaders for different file types using strategy pattern.
 */
export class DocumentLoaderManager {
	private readonly loaderMap = new Map<DocumentType, DocumentLoader>();
	private readonly extensionToLoaderMap = new Map<string, DocumentLoader>();

	constructor(app: App) {
		// Register default loaders
		this.registerLoader(new MarkdownDocumentLoader(app));
		// TODO: Add PDF, Image, and other loaders here
	}

	/**
	 * Register a custom document loader.
	 * Automatically maps file extensions to loaders.
	 */
	registerLoader(loader: DocumentLoader): void {
		const docType = loader.getDocumentType();
		// If multiple loaders support the same type, the last one wins
		this.loaderMap.set(docType, loader);
		
		// Map all supported extensions to this loader
		for (const ext of loader.getSupportedExtensions()) {
			this.extensionToLoaderMap.set(ext.toLowerCase(), loader);
		}
	}

	/**
	 * Get the appropriate loader for a file extension.
	 */
	private getLoaderForExtension(extension: string): DocumentLoader | null {
		return this.extensionToLoaderMap.get(extension.toLowerCase()) || null;
	}

	/**
	 * Get the appropriate loader for a file.
	 */
	getLoaderForFile(file: TAbstractFile): DocumentLoader | null {
		if (!(file instanceof TFile)) return null;
		const extension = file.extension.toLowerCase();
		return this.getLoaderForExtension(extension);
	}

	/**
	 * Read a document by its path using the appropriate loader.
	 */
	async readByPath(path: string): Promise<IndexableDocument | null> {
		// Extract extension from path
		const extension = path.split('.').pop()?.toLowerCase() || '';
		const loader = this.getLoaderForExtension(extension);
		if (!loader) return null;
		return await loader.readByPath(path);
	}

	/**
	 * Stream all documents from all registered loaders.
	 */
	async *loadAllDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<IndexableDocument[]> {
		// Use a Set to avoid duplicate loaders
		const processedLoaders = new Set<DocumentLoader>();
		for (const loader of this.loaderMap.values()) {
			if (processedLoaders.has(loader)) continue;
			processedLoaders.add(loader);
			for await (const batch of loader.batchLoadDocuments(params)) {
				yield batch;
			}
		}
	}
}

