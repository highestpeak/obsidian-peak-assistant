import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader, DocumentLoaderReadOptions } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';
import { assembleIndexedChunks } from './helper/assembleIndexedChunks';

/**
 * Base class for document loaders that share common boilerplate.
 *
 * Provides default implementations for:
 * - {@link scanDocuments} — vault file scanning with extension filtering
 * - {@link getSummary} — delegates to {@link getDefaultDocumentSummary}
 * - {@link chunkContent} — RecursiveCharacterTextSplitter-based splitting
 * - {@link readByPath} — file resolution + extension check + delegation to {@link readFile}
 *
 * Subclasses must implement:
 * - {@link getDocumentType} / {@link getSupportedExtensions} (identity)
 * - {@link readFile} (file → Document conversion)
 *
 * Subclasses may override any default method when custom logic is needed
 * (e.g. JSON array chunking, HTML tag-aware splitting).
 */
export abstract class BaseDocumentLoader implements DocumentLoader {
	constructor(
		protected readonly app: App,
		protected readonly aiServiceManager?: AIServiceManager,
	) {}

	// ── Identity (subclass must implement) ──────────────────────────

	abstract getDocumentType(): DocumentType;
	abstract getSupportedExtensions(): string[];

	// ── File reading ────────────────────────────────────────────────

	/**
	 * Read a single file and produce a Document.
	 * This is the only reading method subclasses must implement.
	 */
	protected abstract readFile(
		file: TFile,
		genCacheContent?: boolean,
		readOptions?: DocumentLoaderReadOptions,
	): Promise<Document | null>;

	/**
	 * Check whether a vault path matches this loader's supported extensions.
	 * Override for compound extensions like `.excalidraw.md`.
	 */
	protected matchesPath(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase() ?? '';
		return this.getSupportedExtensions().includes(ext);
	}

	async readByPath(
		path: string,
		genCacheContent?: boolean,
		readOptions?: DocumentLoaderReadOptions,
	): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.matchesPath(path)) return null;
		return this.readFile(file, genCacheContent, readOptions);
	}

	// ── Chunking (default: RecursiveCharacterTextSplitter) ──────────

	/**
	 * Returns the content string to chunk.
	 * Default uses `sourceFileInfo.content`; binary-source loaders (Docx, Pptx, PDF, Image)
	 * should override to return `cacheFileInfo.content`.
	 */
	protected getContentForChunking(doc: Document): string {
		return doc.sourceFileInfo.content;
	}

	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = this.getContentForChunking(doc);
		const minSize = settings.minDocumentSizeForChunking;

		if (content.length <= minSize) {
			return assembleIndexedChunks(
				doc,
				[{ docId: doc.id, chunkType: 'body_raw', content }],
				settings,
			);
		}

		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: settings.maxChunkSize,
			chunkOverlap: settings.chunkOverlap,
		});

		const langchainDocs = await splitter.createDocuments([content]);
		const chunks: Chunk[] = langchainDocs.map((lc, i) => ({
			docId: doc.id,
			chunkType: 'body_raw' as const,
			content: lc.pageContent,
			chunkId: generateUuidWithoutHyphens(),
			chunkIndex: i,
		}));

		return assembleIndexedChunks(doc, chunks, settings);
	}

	// ── Scanning ────────────────────────────────────────────────────

	async *scanDocuments(
		params?: { limit?: number; batchSize?: number },
	): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>> {
		const limit = params?.limit ?? Infinity;
		const batchSize = params?.batchSize ?? 100;
		const docType = this.getDocumentType();

		const files = this.app.vault
			.getFiles()
			.filter(f => this.matchesPath(f.path))
			.slice(0, limit);

		let batch: Array<{ path: string; mtime: number; type: DocumentType }> = [];
		for (const file of files) {
			batch.push({ path: file.path, mtime: file.stat.mtime, type: docType });
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	// ── Summary ─────────────────────────────────────────────────────

	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string,
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error(
				`${this.constructor.name} requires AIServiceManager to generate summaries`,
			);
		}
		if (typeof source === 'string') {
			throw new Error(
				`${this.constructor.name}.getSummary requires a Document, not a string`,
			);
		}
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}
}
