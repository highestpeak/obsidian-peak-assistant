import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import { BaseDocumentLoader } from './BaseDocumentLoader';

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
export class PdfDocumentLoader extends BaseDocumentLoader {
	constructor(app: App, aiServiceManager?: IDocSummarizer) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'pdf';
	}

	getSupportedExtensions(): string[] {
		return ['pdf'];
	}

	protected override getContentForChunking(doc: Document): string {
		return doc.cacheFileInfo.content;
	}

	protected async readFile(file: TFile, genCacheContent?: boolean): Promise<Document | null> {
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
