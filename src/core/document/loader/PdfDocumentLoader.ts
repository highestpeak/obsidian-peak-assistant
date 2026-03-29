import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader, DocumentLoaderReadOptions } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateDocIdFromPath, generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';
import { assembleIndexedChunks } from './helper/assembleIndexedChunks';

/** CDN base for pdfjs-dist worker; avoids bundling the heavy worker. */
const PDFJS_CDN_VERSION = '5.4.394';
const PDF_JS_DOC_OPTIONS = {
	standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/standard_fonts/`,
	cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/cmaps/`,
	cMapPacked: true,
};

let pdfWorkerSrcConfigured = false;

/**
 * Ensures GlobalWorkerOptions.workerSrc is set once (CDN). Call before getDocument.
 * Keeps worker out of bundle and avoids static import of pdf.worker.mjs.
 */
function ensurePdfWorkerSrc(): void {
	if (pdfWorkerSrcConfigured) return;
	try {
		const pdfjs = require('pdfjs-dist') as typeof import('pdfjs-dist');
		if (pdfjs.GlobalWorkerOptions) {
			pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/build/pdf.worker.mjs`;
			pdfWorkerSrcConfigured = true;
		}
	} catch (e) {
		console.warn('[PdfDocumentLoader] pdfjs-dist not available (external); PDF text extraction will fail.', e);
	}
}

/**
 * Extracts plain text from a PDF buffer. Isolated function: no closure over loader/app/prompts.
 * Loads pdfjs-dist only when called (lazy). Calls loadingTask.destroy() and page.cleanup() for disposal.
 */
async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
	ensurePdfWorkerSrc();
	const pdfjs = require('pdfjs-dist') as typeof import('pdfjs-dist');
	const uint8Array = new Uint8Array(arrayBuffer);
	const loadingOptions = {
		data: uint8Array,
		...PDF_JS_DOC_OPTIONS,
	};
	const loadingTask = pdfjs.getDocument(loadingOptions);
	try {
		const pdfDocument = await loadingTask.promise;
		const pageTexts: string[] = [];
		for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
			const page = await pdfDocument.getPage(pageNum);
			try {
				const textContent = await page.getTextContent();
				const pageText = (textContent.items as { str?: string }[])
					.map((item) => item.str ?? '')
					.join(' ');
				pageTexts.push(pageText);
			} finally {
				if (typeof page.cleanup === 'function') page.cleanup();
			}
		}
		if (typeof pdfDocument.cleanup === 'function') pdfDocument.cleanup();
		return pageTexts.join('\n\n');
	} finally {
		if (typeof loadingTask.destroy === 'function') loadingTask.destroy();
	}
}

/**
 * PDF document loader using Mozilla's pdfjs-dist (loaded at runtime when needed).
 * Worker loaded from CDN; no static import of pdfjs or worker to keep bundle small.
 */
export class PdfDocumentLoader implements DocumentLoader {
	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) { }

	getDocumentType(): DocumentType {
		return 'pdf';
	}

	getSupportedExtensions(): string[] {
		return ['pdf'];
	}

	async readByPath(
		filePath: string,
		genCacheContent?: boolean,
		_readOptions?: DocumentLoaderReadOptions,
	): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
		return await this.readPdfFile(file, genCacheContent);
	}

	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.cacheFileInfo.content;
		const minSize = settings.minDocumentSizeForChunking;

		if (content.length <= minSize) {
			return assembleIndexedChunks(
				doc,
				[
					{
						docId: doc.id,
						chunkType: 'body_raw',
						content: content,
					},
				],
				settings,
			);
		}

		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: settings.maxChunkSize,
			chunkOverlap: settings.chunkOverlap,
		});

		const langchainDocs = await splitter.createDocuments([content]);
		const chunks: Chunk[] = [];
		for (let i = 0; i < langchainDocs.length; i++) {
			const langchainDoc = langchainDocs[i];
			chunks.push({
				docId: doc.id,
				chunkType: 'body_raw',
				content: langchainDoc.pageContent,
				chunkId: generateUuidWithoutHyphens(),
				chunkIndex: i,
			});
		}

		return assembleIndexedChunks(doc, chunks, settings);
	}

	async *scanDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>> {
		const limit = params?.limit ?? Infinity;
		const batchSize = params?.batchSize ?? 100;

		const supportedExts = this.getSupportedExtensions();
		const files = this.app.vault.getFiles()
			.filter(f => supportedExts.includes(f.extension.toLowerCase()))
			.slice(0, limit);
		let batch: Array<{ path: string; mtime: number; type: DocumentType }> = [];

		for (const file of files) {
			batch.push({
				path: file.path,
				mtime: file.stat.mtime,
				type: 'pdf',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('PdfDocumentLoader requires AIServiceManager to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('PdfDocumentLoader.getSummary requires a Document, not a string');
		}
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}

	private async readPdfFile(file: TFile, genCacheContent?: boolean): Promise<Document | null> {
		try {
			const arrayBuffer = await this.app.vault.readBinary(file);
			const sourceContentHash = binaryContentHash(arrayBuffer);

			let cacheContent = '';
			if (genCacheContent) {
				cacheContent = await extractTextFromPdfBuffer(arrayBuffer);
			}

			return {
				id: generateDocIdFromPath(file.path),
				type: 'pdf',
				sourceFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: '',
				},
				cacheFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: cacheContent,
				},
				metadata: {
					title: file.basename,
					topicTags: [],
					functionalTagEntries: [],
					keywordTags: [],
				},
				contentHash: sourceContentHash,
				references: {
					outgoing: [],
					incoming: [],
				},
				lastProcessedAt: Date.now(),
			};
		} catch (error) {
			console.error('[PdfDocumentLoader] error reading PDF file:', file.path, error);
			return null;
		}
	}
}
