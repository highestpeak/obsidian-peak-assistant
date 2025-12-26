import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { generateContentHash } from '@/core/utils/markdown-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';

/**
 * Canvas document loader.
 * Extracts text from canvas JSON structure (nodes and edges).
 */
export class CanvasDocumentLoader implements DocumentLoader {
	constructor(private readonly app: App) {}

	getDocumentType(): DocumentType {
		return 'canvas';
	}

	getSupportedExtensions(): string[] {
		return ['canvas'];
	}

	/**
	 * Check if a file path matches any of the supported extensions.
	 */
	private isSupportedPath(path: string): boolean {
		const supportedExts = this.getSupportedExtensions();
		return supportedExts.some(ext => path.endsWith('.' + ext));
	}

	async readByPath(filePath: string): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.isSupportedPath(filePath)) return null;
		return await this.readCanvasFile(file);
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
				type: 'canvas',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Get summary for a Canvas document
	 */
	async getSummary(
		source: Document | string,
		promptService: { chatWithPrompt: (promptId: string, variables: any, provider: string, model: string) => Promise<string> },
		provider: string,
		modelId: string
	): Promise<ResourceSummary> {
		if (typeof source === 'string') {
			throw new Error('CanvasDocumentLoader.getSummary requires a Document, not a string');
		}
		return getDefaultDocumentSummary(source, promptService, provider, modelId);
	}

	private async readCanvasFile(file: TFile): Promise<Document | null> {
		try {
			const fileContents = await this.app.vault.cachedRead(file);
			const canvas: CanvasData = fileContents ? JSON.parse(fileContents) : {};
			
			const texts: string[] = [];
			
			// Extract text from nodes
			for (const node of canvas.nodes ?? []) {
				if (node.type === 'text' && node.text) {
					texts.push(node.text);
				} else if (node.type === 'file' && node.file) {
					texts.push(node.file);
				}
			}
			
			// Extract labels from edges
			for (const edge of (canvas.edges ?? []).filter(e => !!e.label)) {
				texts.push(edge.label!);
			}
			
			const content = texts.join('\r\n');
			const contentHash = await generateContentHash(content);

			return {
				id: file.path,
				type: 'canvas',
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

/**
 * Canvas data structure.
 */
interface CanvasData {
	nodes?: CanvasNode[];
	edges?: CanvasEdge[];
}

interface CanvasNode {
	type: string;
	text?: string;
	file?: string;
}

interface CanvasEdge {
	label?: string;
}

