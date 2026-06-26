import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { SearchSettings } from '@/core/config/settingsTypes';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import { PromptId } from '@/core/prompt/PromptId';
import { BaseDocumentLoader } from './BaseDocumentLoader';

/**
 * Image document loader.
 * Uses OCR and AI model to generate text description.
 */
export class ImageDocumentLoader extends BaseDocumentLoader {
	constructor(
		app: App,
		private readonly settings: SearchSettings,
		aiServiceManager?: IDocSummarizer,
	) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'image';
	}

	getSupportedExtensions(): string[] {
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
	}

	protected override getContentForChunking(doc: Document): string {
		return doc.cacheFileInfo.content;
	}

	/**
	 * Custom summary: uses AI image description prompt instead of default text summary.
	 */
	override async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string,
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('ImageDocumentLoader requires IDocSummarizer to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('ImageDocumentLoader.getSummary requires a Document, not a string');
		}
		const doc = source;
		const content = doc.cacheFileInfo.content;
		const title = doc.metadata.title || doc.sourceFileInfo.name;
		const path = doc.sourceFileInfo.path;

		const shortSummary = await this.aiServiceManager.queryText(
			PromptId.ImageSummary,
			{ content, title, path } as any,
		);

		return { shortSummary, fullSummary: shortSummary };
	}

	protected async readFile(file: TFile, genCacheContent?: boolean): Promise<Document | null> {
		try {
			if (genCacheContent) {
				console.debug('[ImageDocumentLoader] reading image file:', file.path, 'genCacheContent:', genCacheContent);
			}
			const realContent = await this.app.vault.readBinary(file);
			const realContentHash = binaryContentHash(realContent);

			const cacheContent = genCacheContent ? await this.generateImageDescription(file) : '';

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
					content: cacheContent, // OCR and AI description
				},
				metadata: {
					title: file.basename,
					topicTags: [],
					functionalTagEntries: [],
					keywordTags: [],
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
			// TODO: queryText does not support multimodal parts yet; image data is not sent.
			const response = await this.aiServiceManager.queryText(
				PromptId.ImageDescription,
				null as any,
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
