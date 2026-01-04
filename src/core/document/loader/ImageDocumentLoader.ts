import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { generateContentHash } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings, SearchSettings } from '@/app/settings/types';
import { DEFAULT_SEARCH_SETTINGS } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { LLMRequest } from '@/core/providers/types';
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

	async readByPath(filePath: string): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) return null;
		const ext = file.extension.toLowerCase();
		if (!this.getSupportedExtensions().includes(ext)) return null;
		return await this.readImageFile(file);
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

	private async readImageFile(file: TFile): Promise<Document | null> {
		try {
			const content = await this.generateImageDescription(file);

			const contentHash = generateContentHash(content);

			return {
				id: generateDocIdFromPath(file.path),
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
					content, // OCR and AI description
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
			const base64 = Buffer.from(arrayBuffer).toString('base64');
			const mimeType = this.getMimeType(file.extension);
			const dataUrl = `data:${mimeType};base64,${base64}`;
			console.debug('[ImageDocumentLoader] dataUrl:', dataUrl);

			// Get model and provider from settings
			// Use imageDescriptionModel if configured, otherwise fallback to AI settings defaultModel
			let modelConfig = this.settings.imageDescriptionModel;
			console.debug('[ImageDocumentLoader] modelConfig from settings:', modelConfig);
			if (!modelConfig && this.aiServiceManager) {
				// Try to get defaultModel from AIServiceManager
				const aiSettings = (this.aiServiceManager as any).settings;
				if (aiSettings?.defaultModel) {
					modelConfig = aiSettings.defaultModel;
					console.debug('[ImageDocumentLoader] defaultModel from AIServiceManager:', modelConfig);
				}
			}
			// Final fallback to default settings
			if (!modelConfig) {
				modelConfig = DEFAULT_SEARCH_SETTINGS.imageDescriptionModel!;
				console.debug('[ImageDocumentLoader] defaultModel from DEFAULT_SEARCH_SETTINGS:', modelConfig);
			}

			// Get MultiProviderChatService through AIServiceManager
			const multiChat = this.aiServiceManager.getMultiChat();
			const request: LLMRequest = {
				provider: modelConfig.provider,
				model: modelConfig.modelId,
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Please describe this image in detail, including any text visible in the image (OCR), objects, scenes, and any other relevant information.',
							},
							{
								type: 'image_url',
								url: dataUrl,
							},
						],
					},
				],
			};

			// Call AI service
			const response = await multiChat.blockChat(request);
			console.debug('[ImageDocumentLoader] response:', response);
			return response.content || `[Image: ${file.basename}]`;
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

