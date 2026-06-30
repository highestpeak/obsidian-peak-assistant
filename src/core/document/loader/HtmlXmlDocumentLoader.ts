import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import type { Chunk } from '@/core/search/indexTypes';
import type { ChunkingSettings } from '@/core/config/settingsTypes';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import type { DocumentSummaryConfig } from './helper/DocumentLoaderHelpers';
import { assembleIndexedChunks } from './helper/assembleIndexedChunks';
import { BaseDocumentLoader, buildTextDocument } from './BaseDocumentLoader';

/**
 * HTML/XML document loader.
 * Splits by meaningful tags while respecting size/overlap constraints.
 */
export class HtmlXmlDocumentLoader extends BaseDocumentLoader {
	private static readonly MEANINGFUL_TAGS = ['div', 'section', 'article', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th'];
	private readonly tagPattern: RegExp;

	constructor(
		vault: DocumentVaultReaderPort,
		summaryConfig: DocumentSummaryConfig,
		aiServiceManager?: IDocSummarizer,
	) {
		super(vault, summaryConfig, aiServiceManager);
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

	/**
	 * Custom chunking: splits by meaningful HTML tags, then groups by size.
	 */
	override async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.sourceFileInfo.content;
		const maxChunkSize = settings.maxChunkSize;
		const overlap = settings.chunkOverlap;
		const minSize = settings.minDocumentSizeForChunking;

		if (content.length <= minSize) {
			return assembleIndexedChunks(
				doc,
				[{ docId: doc.id, chunkType: 'body_raw', content }],
				settings,
			);
		}

		// Split by meaningful tags while respecting size constraints
		const chunks: Chunk[] = [];
		let chunkIndex = 0;

		// Extract text content from HTML/XML by splitting on meaningful tags
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
					chunkType: 'body_raw',
					content: chunkContent,
					chunkId: generateUuidWithoutHyphens(),
					chunkIndex: chunkIndex++,
				});
				start = end - overlap;
				if (start >= content.length) break;
			}
			return assembleIndexedChunks(doc, chunks, settings);
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
						chunkType: 'body_raw',
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
						chunkType: 'body_raw',
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
					chunkType: 'body_raw',
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
				chunkType: 'body_raw',
				content: currentChunk,
				chunkId: generateUuidWithoutHyphens(),
				chunkIndex: chunkIndex++,
			});
		}

		return assembleIndexedChunks(doc, chunks, settings);
	}

	protected async readFile(file: VaultFileRef): Promise<Document | null> {
		try {
			const content = await this.vault.readText(file);
			return buildTextDocument(file, 'html', content, hashString(content, 8));
		} catch {
			return null;
		}
	}
}
