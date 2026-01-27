import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { parseMarkdownWithRemark } from '@/core/utils/markdown-utils';
import { generateContentHash } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';

/**
 * Markdown document loader.
 *
 * This runs on the main thread because it uses Obsidian APIs.
 * Worker code must never import this module.
 */
export class MarkdownDocumentLoader implements DocumentLoader {
	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) { }

	getDocumentType(): DocumentType {
		return 'markdown';
	}

	getSupportedExtensions(): string[] {
		return ['md', 'markdown'];
	}

	/**
	 * Read a markdown document by its path.
	 * Returns core Document model.
	 */
	async readByPath(path: string, genCacheContent?: boolean): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
		return await this.readMarkdownFile(file, genCacheContent);
	}

	/**
	 * Chunk content from a document using LangChain's RecursiveCharacterTextSplitter.
	 * First calls getIndexableContent, then chunks the content using markdown-specific splitter.
	 */
	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.sourceFileInfo.content;
		const minSize = settings.minDocumentSizeForChunking;

		// If content is too small, return as single chunk
		if (content.length <= minSize) {
			return [{
				docId: doc.id,
				content: content,
			}];
		}

		// Use LangChain's RecursiveCharacterTextSplitter for markdown
		const splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
			chunkSize: settings.maxChunkSize,
			chunkOverlap: settings.chunkOverlap,
		});

		// Create documents using LangChain's API (expects array of strings)
		const langchainDocs = await splitter.createDocuments([content]);

		// Convert LangChain documents to Chunk format
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

	/**
	 * Scan markdown documents metadata without loading content.
	 * Returns lightweight metadata: path, mtime, type.
	 */
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
				type: 'markdown',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Read a markdown file and convert to core Document model.
	 */
	private async readMarkdownFile(file: TFile, genCacheContent?: boolean): Promise<Document | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const contentHash = generateContentHash(content);

			// Parse markdown using remark to extract title, tags and frontmatter
			const parseResult = await parseMarkdownWithRemark(content);

			// Extract title from parsed result or fallback to filename
			let title = parseResult.title || file.basename;

			const summaryContent = genCacheContent ? { shortSummary: null, fullSummary: null } : await this.getSummary(content);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'markdown',
				sourceFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content,
				},
				cacheFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: summaryContent.fullSummary ?? "",
				},
				metadata: {
					title,
					tags: parseResult.tags,
				},
				summary: summaryContent.shortSummary,
				contentHash,
				references: parseResult.references,
				lastProcessedAt: Date.now(),
			};
		} catch (error) {
			console.error('Error reading markdown file:', error);
			// Ignore read errors; indexing should be best-effort.
			return null;
		}
	}

	/**
	 * Get summary for a markdown document
	 * // todo implement getSummary. many types: raw knowledge base markdown, conv and project markdown, resources markdown
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}
}

