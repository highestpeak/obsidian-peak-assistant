import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { assembleIndexedChunks } from './helper/assembleIndexedChunks';
import { BaseDocumentLoader } from './BaseDocumentLoader';

/**
 * JSON document loader.
 * If JSON is an array, each item becomes a chunk.
 * Otherwise, the entire structure is one chunk, then split by size/overlap.
 */
export class JsonDocumentLoader extends BaseDocumentLoader {
	constructor(app: App, aiServiceManager?: AIServiceManager) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'json';
	}

	getSupportedExtensions(): string[] {
		return ['json'];
	}

	/**
	 * Custom chunking: JSON arrays get per-item chunks; objects use text splitting.
	 * Falls back to plain text splitting if JSON parse fails.
	 */
	override async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.sourceFileInfo.content;
		const minSize = settings.minDocumentSizeForChunking;

		try {
			const parsed = JSON.parse(content);

			// If it's an array, each item becomes a chunk
			if (Array.isArray(parsed)) {
				const chunks: Chunk[] = parsed.map((item, i) => ({
					docId: doc.id,
					chunkType: 'body_raw' as const,
					content: JSON.stringify(item, null, 2),
					chunkId: generateUuidWithoutHyphens(),
					chunkIndex: i,
				}));
				return assembleIndexedChunks(doc, chunks, settings);
			}

			// Otherwise, treat as single structure and split by size/overlap
			return this.splitAsText(doc, content, minSize, settings);
		} catch {
			// If JSON parsing fails, treat as plain text
			return this.splitAsText(doc, content, minSize, settings);
		}
	}

	private async splitAsText(
		doc: Document,
		content: string,
		minSize: number,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		if (content.length <= minSize) {
			return assembleIndexedChunks(
				doc,
				[{ docId: doc.id, chunkType: 'body_raw', content }],
				settings,
			);
		}

		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: settings.maxChunkSize,
			chunkOverlap: settings.chunkOverlap,
		});

		const langchainDocs = await splitter.createDocuments([content]);
		const chunks: Chunk[] = langchainDocs.map((lc, i) => ({
			docId: doc.id,
			chunkType: 'body_raw' as const,
			content: lc.pageContent,
			chunkId: generateUuidWithoutHyphens(),
			chunkIndex: i,
		}));

		return assembleIndexedChunks(doc, chunks, settings);
	}

	protected async readFile(file: TFile): Promise<Document | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const contentHash = hashString(content, 8);

			return {
				id: generateDocIdFromPath(file.path),
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
					topicTags: [],
					functionalTagEntries: [],
					keywordTags: [],
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
