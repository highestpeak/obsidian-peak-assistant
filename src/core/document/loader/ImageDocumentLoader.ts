import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings, SearchSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateStableUuid } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';

/**
 * Image document loader.
 * Uses OCR and AI model to generate text description.
 */
export class ImageDocumentLoader implements DocumentLoader {
	constructor(
		private readonly app: App,
		private readonly settings: SearchSettings,
		private readonly aiServiceManager?: AIServiceManager
	) { }

	getDocumentType(): DocumentType {
		return 'image';
	}

	getSupportedExtensions(): string[] {
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
	}

	async readByPath(filePath: string, genCacheContent?: boolean): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) return null;
		const ext = file.extension.toLowerCase();
		if (!this.getSupportedExtensions().includes(ext)) return null;
		return await this.readImageFile(file, genCacheContent);
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
				type: 'image',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Get summary for an image document
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('ImageDocumentLoader requires AIServiceManager to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('ImageDocumentLoader.getSummary requires a Document, not a string');
		}
		const doc = source;
		const content = doc.cacheFileInfo.content;
		const title = doc.metadata.title || doc.sourceFileInfo.name;
		const path = doc.sourceFileInfo.path;

		const shortSummary = await this.aiServiceManager.chatWithPrompt(
			PromptId.ImageSummary,
			{ content, title, path },
			provider,
			modelId
		);

		return { shortSummary, fullSummary: shortSummary };
	}

	private async readImageFile(file: TFile, genCacheContent?: boolean): Promise<Document | null> {
		try {
			if (genCacheContent) {
				console.debug('[ImageDocumentLoader] reading image file:', file.path, 'genCacheContent:', genCacheContent);
			}
			const realContent = await this.app.vault.readBinary(file);
			const realContentHash = binaryContentHash(realContent);

			const cacheContent = genCacheContent ? await this.generateImageDescription(file) : '';
			// const cacheContentHash = generateContentHash(cacheContent);

			return {
				id: generateStableUuid(file.path),
				type: 'image',
				sourceFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: '', // Image has no text content in source
				},
				cacheFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: cacheContent, // OCR and AI description
				},
				metadata: {
					title: file.basename,
					tags: [],
				},
				contentHash: realContentHash,
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

	/**
	 * Generate image description using AI service or return placeholder.
	 */
	private async generateImageDescription(file: TFile): Promise<string> {
		if (!this.aiServiceManager) {
			// No AI service available, use placeholder
			return `[Image: ${file.basename}]`;
		}

		try {
			// Read image as base64
			const arrayBuffer = await this.app.vault.readBinary(file);
			// const base64 = Buffer.from(arrayBuffer).toString('base64');
			const mimeType = this.getMimeType(file.extension);
			// const dataUrl = `data:${mimeType};base64,${base64}`;
			// console.debug('[ImageDocumentLoader] dataUrl:', dataUrl);

			const response = await this.aiServiceManager.chatWithPrompt(
				PromptId.ImageDescription,
				null, // No variables needed for image description
				undefined,
				undefined,
				[
					{
						type: 'image',
						data: arrayBuffer,
						mediaType: mimeType,
					},
				]
			);
			console.debug('[ImageDocumentLoader] response:', response);
			return response || `[Image: ${file.basename}]`;
		} catch (error) {
			console.error('Error generating image description with AI:', error);
			// Fallback to placeholder
			return `[Image: ${file.basename}]`;
		}
	}

	/**
	 * Get MIME type for image extension.
	 */
	private getMimeType(extension: string): string {
		const ext = extension.toLowerCase();
		const mimeTypes: Record<string, string> = {
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'png': 'image/png',
			'gif': 'image/gif',
			'webp': 'image/webp',
			'bmp': 'image/bmp',
			'svg': 'image/svg+xml',
		};
		return mimeTypes[ext] || 'image/jpeg';
	}
}

