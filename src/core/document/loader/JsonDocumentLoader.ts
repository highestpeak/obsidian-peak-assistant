import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { generateContentHash } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';

/**
 * JSON document loader.
 * If JSON is an array, each item becomes a chunk.
 * Otherwise, the entire structure is one chunk, then split by size/overlap.
 */
export class JsonDocumentLoader implements DocumentLoader {
	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) {}

	getDocumentType(): DocumentType {
		return 'json';
	}

	getSupportedExtensions(): string[] {
		return ['json'];
	}

	async readByPath(path: string): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
		return await this.readJsonFile(file);
	}

	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.sourceFileInfo.content;
		const minSize = settings.minDocumentSizeForChunking;

		try {
			const parsed = JSON.parse(content);
			
			// If it's an array, each item becomes a chunk
			if (Array.isArray(parsed)) {
				const chunks: Chunk[] = [];
				for (let i = 0; i < parsed.length; i++) {
					const itemContent = JSON.stringify(parsed[i], null, 2);
					chunks.push({
						docId: doc.id,
						content: itemContent,
						chunkId: generateUuidWithoutHyphens(),
						chunkIndex: i,
					});
				}
				return chunks;
			}

			// Otherwise, treat as single structure and split by size/overlap
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
		} catch {
			// If JSON parsing fails, treat as plain text
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
				type: 'json',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Get summary for a JSON document
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('JsonDocumentLoader requires AIServiceManager to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('JsonDocumentLoader.getSummary requires a Document, not a string');
		}
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}

	private async readJsonFile(file: TFile): Promise<Document | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const contentHash = generateContentHash(content);

			return {
				id: file.path,
				type: 'json',
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
					content,
				},
				metadata: {
					title: file.basename,
					tags: [],
				},
				contentHash,
				references: {
					outgoing: [],
					incoming: [],
				},
				lastProcessedAt: Date.now(),
			};
		} catch {
			return null;
		}
	}
}

