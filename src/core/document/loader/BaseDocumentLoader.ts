import type { DocumentLoader, DocumentLoaderReadOptions } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/core/search/indexTypes';
import type { ChunkingSettings } from '@/core/config/settingsTypes';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import {
	getDefaultDocumentSummary,
	type DocumentSummaryConfig,
} from './helper/DocumentLoaderHelpers';
import { assembleIndexedChunks } from './helper/assembleIndexedChunks';

/**
 * Base class for document loaders that share common boilerplate.
 *
 * T11K: loaders depend on the narrow {@link DocumentVaultReaderPort} and
 * neutral {@link VaultFileRef} shapes. They never see Obsidian `TFile`.
 */
export abstract class BaseDocumentLoader implements DocumentLoader {
	constructor(
		protected readonly vault: DocumentVaultReaderPort,
		protected readonly summaryConfig: DocumentSummaryConfig,
		protected readonly aiServiceManager?: IDocSummarizer,
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
		file: VaultFileRef,
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
		const file = this.vault.getFile(path);
		if (!file) return null;
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

		const files = this.vault
			.listFiles()
			.filter((f) => this.matchesPath(f.path))
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
				`${this.constructor.name} requires IDocSummarizer to generate summaries`,
			);
		}
		if (typeof source === 'string') {
			throw new Error(
				`${this.constructor.name}.getSummary requires a Document, not a string`,
			);
		}
		return getDefaultDocumentSummary(source, this.summaryConfig, this.aiServiceManager, provider, modelId);
	}
}
