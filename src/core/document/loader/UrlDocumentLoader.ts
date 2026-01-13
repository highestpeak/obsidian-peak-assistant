import type { App } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { generateContentHash } from '@/core/utils/hash-utils';
import { PlaywrightWebBaseLoader } from '@langchain/community/document_loaders/web/playwright';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';

/**
 * URL document loader using PlaywrightWebBaseLoader.
 * 
 * Note: URLs are not files in the vault, so readByPath and scanDocuments
 * may need special handling. This loader is designed for URL indexing.
 */
export class UrlDocumentLoader implements DocumentLoader {
	private readonly playwrightConfig = {
		launchOptions: {
			headless: true,
		},
		gotoOptions: {
			waitUntil: 'domcontentloaded' as const,
		},
	};

	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) { }

	getDocumentType(): DocumentType {
		return 'url';
	}

	getSupportedExtensions(): string[] {
		return ['url'];
	}

	async readByPath(path: string, genCacheContent?: boolean): Promise<Document | null> {
		// For URLs, path is the URL itself
		if (!this.isValidUrl(path)) return null;
		return await this.readUrl(path, genCacheContent);
	}

	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.cacheFileInfo.content;
		const minSize = settings.minDocumentSizeForChunking;

		if (content.length <= minSize) {
			return [{
				docId: doc.id,
				content: content,
			}];
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
				content: langchainDoc.pageContent,
				chunkId: generateUuidWithoutHyphens(),
				chunkIndex: i,
			});
		}

		return chunks;
	}

	async *scanDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>> {
		// URLs are not files in the vault, so this may return empty
		// In practice, URLs might be stored in a special index or metadata
		yield [];
	}

	/**
	 * Get summary for a URL document
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('UrlDocumentLoader requires AIServiceManager to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('UrlDocumentLoader.getSummary requires a Document, not a string');
		}
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}

	private isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	private async readUrl(url: string, genCacheContent?: boolean): Promise<Document | null> {
		// Validate URL before creating loader instance
		if (!this.isValidUrl(url)) {
			return null;
		}

		try {
			let content = '';
			const contentHash = generateContentHash(url);
			let title = '';
			if (genCacheContent) {
				const loader = new PlaywrightWebBaseLoader(url, this.playwrightConfig);

				const docs = await loader.load();
				content = docs.map(doc => doc.pageContent).join('\n\n');

				// Use URL as the document ID
				const urlObj = new URL(url);
				title = urlObj.hostname + urlObj.pathname;
			}

			return {
				id: generateDocIdFromPath(url),
				type: 'url',
				sourceFileInfo: {
					path: url,
					name: url,
					extension: 'url',
					size: content.length,
					mtime: Date.now(),
					ctime: Date.now(),
					content: '', // URL has no source content
				},
				cacheFileInfo: {
					path: url,
					name: url,
					extension: 'url',
					size: content.length,
					mtime: Date.now(),
					ctime: Date.now(),
					content, // Extracted web content
				},
				metadata: {
					title: title,
					tags: [],
				},
				contentHash,
				references: {
					outgoing: [],
					incoming: [],
				},
				lastProcessedAt: Date.now(),
			};
		} catch (error) {
			console.error('Error loading URL:', url, error);
			return null;
		}
	}
}

