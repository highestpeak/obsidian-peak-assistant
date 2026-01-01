import type { App, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from '../types';
import type { DocumentType } from '@/core/document/types';
import type { Document as CoreDocument } from '@/core/document/types';
import type { SearchSettings } from '@/app/settings/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { MarkdownDocumentLoader } from '../MarkdownDocumentLoader';
import { TextDocumentLoader } from '../TextDocumentLoader';
import { TableDocumentLoader } from '../TableDocumentLoader';
import { JsonDocumentLoader } from '../JsonDocumentLoader';
import { HtmlXmlDocumentLoader } from '../HtmlXmlDocumentLoader';
import { PdfDocumentLoader } from '../PdfDocumentLoader';
import { ImageDocumentLoader } from '../ImageDocumentLoader';
import { DocxDocumentLoader } from '../DocxDocumentLoader';
import { PptxDocumentLoader } from '../PptxDocumentLoader';
import { ExcalidrawDocumentLoader } from '../ExcalidrawDocumentLoader';
import { CanvasDocumentLoader } from '../CanvasDocumentLoader';
import { DataloomDocumentLoader } from '../DataloomDocumentLoader';
import { UrlDocumentLoader } from '../UrlDocumentLoader';

/**
 * Global singleton manager for document loaders.
 * Manages multiple document loaders for different file types using strategy pattern.
 */
export class DocumentLoaderManager {
	private static instance: DocumentLoaderManager | null = null;
	
	private readonly loaderMap = new Map<DocumentType, DocumentLoader>();
	private readonly extensionToLoaderMap = new Map<string, DocumentLoader>();
	private settings: SearchSettings;
	private readonly app: App;
	private aiServiceManager?: AIServiceManager;

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
	 * @param aiServiceManager Optional AI service manager for loaders that need AI capabilities (e.g., image description).
	 */
	static init(app: App, settings: SearchSettings, aiServiceManager?: AIServiceManager): DocumentLoaderManager {
		if (DocumentLoaderManager.instance) {
			console.warn('DocumentLoaderManager already initialized. Reinitializing with new settings.');
		}
		DocumentLoaderManager.instance = new DocumentLoaderManager(app, settings, aiServiceManager);
		return DocumentLoaderManager.instance;
	}

	private constructor(app: App, settings: SearchSettings, aiServiceManager?: AIServiceManager) {
		this.app = app;
		this.settings = settings;
		this.aiServiceManager = aiServiceManager;
		this.registerAllLoaders();
	}

	/**
	 * Register all document loaders.
	 */
	private registerAllLoaders(): void {
		// Register all document loaders
		this.registerLoader(new MarkdownDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new TextDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new TableDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new JsonDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new HtmlXmlDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new PdfDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new ImageDocumentLoader(this.app, this.settings, this.aiServiceManager));
		this.registerLoader(new DocxDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new PptxDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new ExcalidrawDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new CanvasDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new DataloomDocumentLoader(this.app, this.aiServiceManager));
		this.registerLoader(new UrlDocumentLoader(this.app, this.aiServiceManager));
	}

	/**
	 * Update settings and reload all loaders.
	 * Should be called when search settings are updated.
	 */
	updateSettings(settings: SearchSettings): void {
		this.settings = settings;
		// Re-register all loaders with updated settings
		this.registerAllLoaders();
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
	 * Get the appropriate loader for a document type.
	 */
	getLoaderForDocumentType(documentType: DocumentType): DocumentLoader | null {
		return this.loaderMap.get(documentType) || null;
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
		// Handle special cases first
		// Check for excalidraw files (ends with .excalidraw or .excalidraw.md)
		// This needs special handling because .excalidraw.md would be matched as 'md' extension
		if (path.endsWith('.excalidraw.md') || path.endsWith('.excalidraw')) {
			const loader = this.loaderMap.get('excalidraw');
			if (loader) return await loader.readByPath(path);
		}
		
		// Check if it's a URL (not a file path)
		if (path.startsWith('http://') || path.startsWith('https://')) {
			const loader = this.loaderMap.get('url');
			if (loader) return await loader.readByPath(path);
		}
		
		// Extract extension from path for normal files
		// Canvas and dataloom files will be matched by their extensions ('canvas', 'loom')
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

