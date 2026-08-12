import type { DocumentLoader, DocumentLoaderReadOptions } from '../types';
import type { DocumentType } from '@/core/document/types';
import type { Document as CoreDocument } from '@/core/document/types';
import type { SearchSettings } from '@/core/config/settingsTypes';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';
import type { VaultMetadataResolverPort } from '@/core/ports/VaultMetadataResolverPort';
import type { BinaryDocumentTextExtractorPort } from '@/core/ports/BinaryDocumentTextExtractorPort';
import type { DocumentSummaryConfig } from './DocumentLoaderHelpers';
import { createIgnoreMatcher, type IgnoreMatcher } from '@/core/utils/IgnoreMatcher';
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
import { UrlDocumentLoader } from '../UrlDocumentLoader';

/**
 * Resolve the user-owned include-folder boundary before any loader work starts.
 * Empty includes mean the whole Vault. Paths are Vault-relative and folder
 * matches are segment-aware (`Notes` must not also match `Notes-old`).
 */
export function isPathInKnowledgeScope(path: string, includeFolders: readonly string[]): boolean {
	if (includeFolders.length === 0) return true;
	const normalizedPath = path.replace(/^\/+|\/+$/g, '');
	return includeFolders.some((folder) => {
		const normalizedFolder = folder.trim().replace(/^\/+|\/+$/g, '');
		if (!normalizedFolder) return true;
		return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
	});
}

/**
 * Global singleton manager for document loaders.
 * Manages multiple document loaders for different file types using strategy pattern.
 *
 * T11K: depends on the narrow {@link DocumentVaultReaderPort} +
 * {@link VaultMetadataResolverPort} ports — no Obsidian `App` / `TFile`.
 */
export class DocumentLoaderManager {
	private static instance: DocumentLoaderManager | null = null;

	private readonly loaderMap = new Map<DocumentType, DocumentLoader>();
	private readonly extensionToLoaderMap = new Map<string, DocumentLoader>();
	private settings: SearchSettings;
	private readonly vault: DocumentVaultReaderPort;
	private readonly metadata: VaultMetadataResolverPort;
	private aiServiceManager?: IDocSummarizer;
	private readonly ignoreMatcher: IgnoreMatcher;

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
	 * Clear the global singleton instance.
	 * Call from plugin onunload to release memory.
	 */
	static clearInstance(): void {
		DocumentLoaderManager.instance?.dispose();
		DocumentLoaderManager.instance = null;
	}

	/**
	 * Initialize the global singleton instance.
	 * Should be called once during plugin initialization.
	 * @param vault Read-only document vault port (T11K).
	 * @param metadata Vault metadata resolver port (for markdown link resolution).
	 * @param settings Current search settings (drives `summaryConfig` defaults).
	 * @param aiServiceManager Optional AI service manager for loaders that need AI capabilities (e.g., image description).
	 */
	static init(
		vault: DocumentVaultReaderPort,
		metadata: VaultMetadataResolverPort,
		settings: SearchSettings,
		aiServiceManager?: IDocSummarizer,
		binaryTextExtractor?: BinaryDocumentTextExtractorPort,
	): DocumentLoaderManager {
		if (DocumentLoaderManager.instance) {
			console.warn('DocumentLoaderManager already initialized. Reinitializing with new settings.');
			DocumentLoaderManager.instance.dispose();
		}
		DocumentLoaderManager.instance = new DocumentLoaderManager(
			vault,
			metadata,
			settings,
			aiServiceManager,
			binaryTextExtractor,
		);
		return DocumentLoaderManager.instance;
	}

	private constructor(
		vault: DocumentVaultReaderPort,
		metadata: VaultMetadataResolverPort,
		settings: SearchSettings,
		aiServiceManager?: IDocSummarizer,
		private readonly binaryTextExtractor?: BinaryDocumentTextExtractorPort,
	) {
		this.vault = vault;
		this.metadata = metadata;
		this.settings = settings;
		this.aiServiceManager = aiServiceManager;
		this.ignoreMatcher = createIgnoreMatcher(settings.ignorePatterns);
		this.registerAllLoaders();
	}

	private get summaryConfig(): DocumentSummaryConfig {
		return {
			shortSummaryLength: this.settings.shortSummaryLength,
			fullSummaryLength: this.settings.fullSummaryLength,
		};
	}

	/**
	 * Register all document loaders.
	 */
	private registerAllLoaders(): void {
		const sc = this.summaryConfig;
		const v = this.vault;
		const ai = this.aiServiceManager;
		this.registerLoader(new MarkdownDocumentLoader(v, this.metadata, sc, ai));
		this.registerLoader(new TextDocumentLoader(v, sc, ai));
		this.registerLoader(new TableDocumentLoader(v, sc, ai));
		this.registerLoader(new JsonDocumentLoader(v, sc, ai));
		this.registerLoader(new HtmlXmlDocumentLoader(v, sc, ai));
		this.registerLoader(new PdfDocumentLoader(v, sc, ai));
		this.registerLoader(new ImageDocumentLoader(v, sc, this.settings, ai));
		if (this.binaryTextExtractor) {
			this.registerLoader(new DocxDocumentLoader(v, sc, ai, this.binaryTextExtractor));
			this.registerLoader(new PptxDocumentLoader(v, sc, ai, this.binaryTextExtractor));
		}
		this.registerLoader(new ExcalidrawDocumentLoader(v, sc, ai));
		this.registerLoader(new CanvasDocumentLoader(v, sc, ai));
		this.registerLoader(new UrlDocumentLoader(v, sc, ai));
	}

	/**
	 * Update settings and reload all loaders.
	 * Should be called when search settings are updated.
	 */
	updateSettings(settings: SearchSettings): void {
		this.settings = settings;
		this.ignoreMatcher.updatePatterns(settings.ignorePatterns);
		this.registerAllLoaders();
	}

	/**
	 * Late-bind the AI summarizer used by loaders that need AI capabilities
	 * (image description, markdown/text summarization). The manager must be
	 * `init()`-ed before `AIServiceManager` because the latter constructs
	 * `ResourceSummaryService` which calls `getInstance()` synchronously —
	 * so the AI dep is wired in after the cycle is broken.
	 */
	setAiServiceManager(aiServiceManager: IDocSummarizer): void {
		this.aiServiceManager = aiServiceManager;
		this.registerAllLoaders();
	}

	/**
	 * Expose the owned ignore matcher so other loader-cluster callers (e.g.
	 * `buildBackboneMap`) can reuse it without spinning up a parallel
	 * matcher or reaching through a module-level singleton.
	 */
	getIgnoreMatcher(): IgnoreMatcher {
		return this.ignoreMatcher;
	}

	private dispose(): void {
		this.binaryTextExtractor?.dispose();
		this.loaderMap.clear();
		this.extensionToLoaderMap.clear();
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
	 * Expose the underlying vault reader port. Used by resource-side helpers
	 * (`ResourceLoaderManager`, `ResourceKindDetector`) so they don't have to
	 * cross the service→app boundary just to reach an Obsidian-backed adapter.
	 */
	getVaultReader(): DocumentVaultReaderPort {
		return this.vault;
	}

	/**
	 * Get the appropriate loader for a vault path.
	 *
	 * T11K: replaces the previous `getLoaderForFile(file: TAbstractFile)` so
	 * callers do not need to hold Obsidian file handles. Callers (e.g. the
	 * indexer's vault event handlers) discriminate file-vs-folder themselves
	 * and pass `file.path` here.
	 */
	getLoaderForPath(path: string): DocumentLoader | null {
		const extension = path.split('.').pop();
		if (!extension) return null;
		return this.getLoaderForExtension(extension);
	}

	getTypeForPath(path: string): DocumentType | null {
		// Handle special cases first
		// Check for excalidraw files (ends with .excalidraw or .excalidraw.md)
		// This needs special handling because .excalidraw.md would be matched as 'md' extension
		if (path.endsWith('.excalidraw.md') || path.endsWith('.excalidraw')) {
			return 'excalidraw';
		}

		// Check if it's a URL (not a file path)
		if (path.startsWith('http://') || path.startsWith('https://')) {
			return 'url';
		}

		// Extract extension from path for normal files
		// Canvas files will be matched by their extension ('canvas')
		const extension = path.split('.').pop()?.toLowerCase() || '';
		return this.getLoaderForExtension(extension)?.getDocumentType() || null;
	}

	/**
	 * Read a document by its path using the appropriate loader.
	 * Returns core Document model.
	 */
	async readByPath(
		path: string,
		genCacheContent?: boolean,
		readOptions?: DocumentLoaderReadOptions,
	): Promise<CoreDocument | null> {
		if (genCacheContent === undefined || genCacheContent === null) {
			genCacheContent = true;
		}

		const type = this.getTypeForPath(path);
		if (!type) return null;

		const loader = this.loaderMap.get(type);
		if (!loader) return null;

		return await loader.readByPath(path, genCacheContent, readOptions);
	}

	/**
	 * Check if a document should be indexed based on settings and ignore patterns.
	 */
	shouldIndexDocument(doc: CoreDocument): boolean {
		// First check if document type is enabled
		if (!(this.settings.includeDocumentTypes[doc.type] && this.loaderMap.has(doc.type))) {
			return false;
		}

		// Then apply the canonical folder scope and ignore rules. The same method
		// is used by first scan, rebuilds and incremental indexing.
		if (doc.sourceFileInfo?.path) {
			if (!isPathInKnowledgeScope(doc.sourceFileInfo.path, this.settings.includeFolders)) return false;
			return !this.ignoreMatcher.shouldIgnore(doc.sourceFileInfo.path);
		}

		// If sourceFileInfo is not available, assume it should be indexed (ignore pattern check deferred)
		return true;
	}

	/**
	 * Stream all documents from all registered loaders.
	 * Returns core Document models filtered by settings.
	 * Uses scanDocuments to get file list, then loads content on demand.
	 */
	async *loadAllDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<CoreDocument[]> {
		const batchSize = params?.batchSize ?? 25;
		let currentBatch: CoreDocument[] = [];

		// track the start time of the batch read
		let batchReadStart: number | undefined;
		// Scan all documents first to get file list
		for await (const scanBatch of this.scanDocuments(params)) {
			batchReadStart = performance.now();
			for (const docMeta of scanBatch) {
				// Filter by settings: only load enabled document types and check ignore patterns
				const partialDoc = {
					type: docMeta.type,
					sourceFileInfo: { path: docMeta.path }
				} as CoreDocument;
				if (!this.shouldIndexDocument(partialDoc)) {
					continue;
				}

				// Load document content on demand
				const doc = await this.readByPath(docMeta.path);

				if (doc) {
					currentBatch.push(doc);
					if (currentBatch.length >= batchSize) {
						console.log(
							`[DocumentLoaderManager] Yielded a batch of documents, read time: ${(performance.now() - batchReadStart).toFixed(2)} ms`
						);
						yield currentBatch;
						currentBatch = [];
						batchReadStart = performance.now();
					}
				}
			}
		}

		// Yield remaining documents
		if (currentBatch.length > 0) {
			console.log(
				`[DocumentLoaderManager] Yielded final batch of documents, read time: ${(performance.now() - (batchReadStart ?? performance.now())).toFixed(2)} ms`
			);
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
