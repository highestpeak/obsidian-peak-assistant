import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { generateContentHash } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';

/**
 * Excalidraw document loader.
 * For .excalidraw.md files: checks frontmatter for excalidraw-plugin, removes comment sections.
 * For .excalidraw files: reads as plain text.
 */
export class ExcalidrawDocumentLoader implements DocumentLoader {
	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) {}

	getDocumentType(): DocumentType {
		return 'excalidraw';
	}

	getSupportedExtensions(): string[] {
		return ['excalidraw', 'excalidraw.md'];
	}

	/**
	 * Check if a file path matches any of the supported extensions.
	 * For excalidraw, we check the full path suffix since extensions can be compound.
	 */
	private isSupportedPath(path: string): boolean {
		const supportedExts = this.getSupportedExtensions();
		return supportedExts.some(ext => path.endsWith('.' + ext));
	}

	private isExcalidrawMarkdown(content: string): boolean {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];
			return /^plugin:\s*excalidraw-plugin/m.test(frontmatter) || /^excalidraw-plugin/m.test(frontmatter);
		}
		return false;
	}

	async readByPath(filePath: string): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.isSupportedPath(filePath)) return null;
		return await this.readExcalidrawFile(file);
	}

	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.sourceFileInfo.content;
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

		const files = this.app.vault.getFiles()
			.filter(f => this.isSupportedPath(f.path))
			.slice(0, limit);
		let batch: Array<{ path: string; mtime: number; type: DocumentType }> = [];

		for (const file of files) {
			batch.push({
				path: file.path,
				mtime: file.stat.mtime,
				type: 'excalidraw',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Get summary for an Excalidraw document
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('ExcalidrawDocumentLoader requires AIServiceManager to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('ExcalidrawDocumentLoader.getSummary requires a Document, not a string');
		}
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}

	private async readExcalidrawFile(file: TFile): Promise<Document | null> {
		try {
			let content = await this.app.vault.cachedRead(file);

			// For .excalidraw.md files, check if it's an excalidraw plugin file
			if (file.path.endsWith('.excalidraw.md')) {
				if (this.isExcalidrawMarkdown(content)) {
					// Remove all comment sections (containing Excalidraw JSON data)
					// Comment sections are typically in ```excalidraw code blocks
					content = content.replace(/```excalidraw[\s\S]*?```/g, '');
					// Also remove any JSON-like sections that might be comments
					content = content.replace(/```json[\s\S]*?```/g, '');
				}
				// Keep only the markdown text content
			}
			// For .excalidraw files, read as plain text (already done above)

			const contentHash = generateContentHash(content);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'excalidraw',
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

