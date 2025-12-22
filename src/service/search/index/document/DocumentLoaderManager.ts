import type { App, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType } from '@/core/document/types';
import type { Document as CoreDocument } from '@/core/document/types';
import type { SearchSettings } from '@/app/settings/types';
import { MarkdownDocumentLoader } from './MarkdownDocumentLoader';

/**
 * Global singleton manager for document loaders.
 * Manages multiple document loaders for different file types using strategy pattern.
 */
export class DocumentLoaderManager {
	private static instance: DocumentLoaderManager | null = null;
	
	private readonly loaderMap = new Map<DocumentType, DocumentLoader>();
	private readonly extensionToLoaderMap = new Map<string, DocumentLoader>();
	private readonly settings: SearchSettings;

	/**
	 * Get the global singleton instance.
	 * Must be initialized with init() before first use.
	 */
	static getInstance(): DocumentLoaderManager {
		if (!DocumentLoaderManager.instance) {
			throw new Error('DocumentLoaderManager not initialized. Call init() first.');
		}
		return DocumentLoaderManager.instance;
	}

	/**
	 * Initialize the global singleton instance.
	 * Should be called once during plugin initialization.
	 */
	static init(app: App, settings: SearchSettings): DocumentLoaderManager {
		if (DocumentLoaderManager.instance) {
			console.warn('DocumentLoaderManager already initialized. Reinitializing with new settings.');
		}
		DocumentLoaderManager.instance = new DocumentLoaderManager(app, settings);
		return DocumentLoaderManager.instance;
	}

	private constructor(app: App, settings: SearchSettings) {
		this.settings = settings;
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
	 * Returns core Document model.
	 */
	async readByPath(path: string): Promise<CoreDocument | null> {
		// Extract extension from path
		const extension = path.split('.').pop()?.toLowerCase() || '';
		const loader = this.getLoaderForExtension(extension);
		if (!loader) return null;
		return await loader.readByPath(path);
	}

	/**
	 * Check if a document should be indexed based on settings.
	 */
	shouldIndexDocument(doc: CoreDocument): boolean {
		return (this.settings.includeDocumentTypes[doc.type] && this.loaderMap.has(doc.type)) ?? false;
	}

	/**
	 * Stream all documents from all registered loaders.
	 * Returns core Document models filtered by settings.
	 * Uses scanDocuments to get file list, then loads content on demand.
	 */
	async *loadAllDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<CoreDocument[]> {
		const batchSize = params?.batchSize ?? 25;
		let currentBatch: CoreDocument[] = [];

		// Scan all documents first to get file list
		for await (const scanBatch of this.scanDocuments(params)) {
			for (const docMeta of scanBatch) {
				// Filter by settings: only load enabled document types
				if (!this.shouldIndexDocument({ type: docMeta.type } as CoreDocument)) {
					continue;
				}

				// Load document content on demand
				const doc = await this.readByPath(docMeta.path);
				if (doc) {
					currentBatch.push(doc);
					if (currentBatch.length >= batchSize) {
						yield currentBatch;
						currentBatch = [];
					}
				}
			}
		}

		// Yield remaining documents
		if (currentBatch.length > 0) {
			yield currentBatch;
		}
	}

	/**
	 * Scan all documents metadata without loading content.
	 * Returns lightweight metadata: path, mtime, type.
	 * This is used for efficient index change detection.
	 */
	async *scanDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>> {
		const processedLoaders = new Set<DocumentLoader>();
		for (const loader of this.loaderMap.values()) {
			if (processedLoaders.has(loader)) continue;
			for await (const batch of loader.scanDocuments(params)) {
				yield batch;
			}
			processedLoaders.add(loader);
		}
	}
}

