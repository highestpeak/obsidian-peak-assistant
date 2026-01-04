import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { generateContentHash } from '@/core/utils/hash-utils';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';

/**
 * HTML/XML document loader.
 * Splits by meaningful tags while respecting size/overlap constraints.
 */
export class HtmlXmlDocumentLoader implements DocumentLoader {
	private static readonly MEANINGFUL_TAGS = ['div', 'section', 'article', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th'];
	private readonly tagPattern: RegExp;

	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) {
		// Initialize regex pattern once in constructor
		const tagsPattern = HtmlXmlDocumentLoader.MEANINGFUL_TAGS.join('|');
		this.tagPattern = new RegExp(`(<(?:${tagsPattern})[^>]*>)([\\s\\S]*?)(</(?:${tagsPattern})>)`, 'gi');
	}

	getDocumentType(): DocumentType {
		return 'html';
	}

	getSupportedExtensions(): string[] {
		return ['html', 'htm', 'xml'];
	}

	async readByPath(path: string): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
		return await this.readHtmlXmlFile(file);
	}

	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.sourceFileInfo.content;
		const maxChunkSize = settings.maxChunkSize;
		const overlap = settings.chunkOverlap;
		const minSize = settings.minDocumentSizeForChunking;

		if (content.length <= minSize) {
			return [{
				docId: doc.id,
				content: content,
			}];
		}

		// Split by meaningful tags while respecting size constraints
		const chunks: Chunk[] = [];
		let chunkIndex = 0;

		// Extract text content from HTML/XML by splitting on meaningful tags
		// This is a simplified approach - for production, consider using a proper HTML parser
		const segments: string[] = [];
		let lastIndex = 0;
		let match;

		// Reset regex lastIndex to ensure fresh matching
		this.tagPattern.lastIndex = 0;
		while ((match = this.tagPattern.exec(content)) !== null) {
			// Add text before the tag
			if (match.index > lastIndex) {
				const beforeText = content.substring(lastIndex, match.index);
				if (beforeText.trim()) {
					segments.push(beforeText.trim());
				}
			}
			// Add the tag content (text between opening and closing tags)
			const tagContent = match[2]?.trim();
			if (tagContent) {
				segments.push(tagContent);
			}
			lastIndex = this.tagPattern.lastIndex;
		}

		// Add remaining content
		if (lastIndex < content.length) {
			const remaining = content.substring(lastIndex).trim();
			if (remaining) {
				segments.push(remaining);
			}
		}

		// If no segments found, fall back to size-based splitting
		if (segments.length === 0) {
			let start = 0;
			while (start < content.length) {
				const end = Math.min(start + maxChunkSize, content.length);
				const chunkContent = content.substring(start, end);
				chunks.push({
					docId: doc.id,
					content: chunkContent,
					chunkId: generateUuidWithoutHyphens(),
					chunkIndex: chunkIndex++,
				});
				start = end - overlap;
				if (start >= content.length) break;
			}
			return chunks;
		}

		// Group segments into chunks respecting size constraints
		let currentChunk = '';
		for (const segment of segments) {
			// If segment itself is too large, split it
			if (segment.length > maxChunkSize) {
				// Save current chunk if any
				if (currentChunk.length > 0) {
					chunks.push({
						docId: doc.id,
						content: currentChunk,
						chunkId: generateUuidWithoutHyphens(),
						chunkIndex: chunkIndex++,
					});
					currentChunk = '';
				}
				// Split large segment
				let segStart = 0;
				while (segStart < segment.length) {
					const segEnd = Math.min(segStart + maxChunkSize, segment.length);
					const chunkContent = segment.substring(segStart, segEnd);
					chunks.push({
						docId: doc.id,
						content: chunkContent,
						chunkId: generateUuidWithoutHyphens(),
						chunkIndex: chunkIndex++,
					});
					segStart = segEnd - overlap;
					if (segStart >= segment.length) break;
				}
			} else if (currentChunk.length + segment.length > maxChunkSize && currentChunk.length > 0) {
				// Save current chunk and start new one with overlap
				chunks.push({
					docId: doc.id,
					content: currentChunk,
					chunkId: generateUuidWithoutHyphens(),
					chunkIndex: chunkIndex++,
				});
				const overlapText = currentChunk.slice(-overlap);
				currentChunk = overlapText + '\n' + segment;
			} else {
				// Add to current chunk
				currentChunk += (currentChunk ? '\n' : '') + segment;
			}
		}

		// Add remaining chunk
		if (currentChunk.length > 0) {
			chunks.push({
				docId: doc.id,
				content: currentChunk,
				chunkId: generateUuidWithoutHyphens(),
				chunkIndex: chunkIndex++,
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
				type: 'html',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Get summary for an HTML/XML document
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('HtmlXmlDocumentLoader requires AIServiceManager to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('HtmlXmlDocumentLoader.getSummary requires a Document, not a string');
		}
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}

	private async readHtmlXmlFile(file: TFile): Promise<Document | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const contentHash = generateContentHash(content);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'html',
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

