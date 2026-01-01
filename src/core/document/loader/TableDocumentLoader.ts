import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { generateContentHash } from '@/core/utils/hash-utils';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';

/**
 * Table document loader for CSV and XLSX files.
 * Each row becomes a chunk. If a row is too long, it's truncated with overlap.
 */
export class TableDocumentLoader implements DocumentLoader {
	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) {}

	getDocumentType(): DocumentType {
		return 'csv';
	}

	getSupportedExtensions(): string[] {
		return ['csv', 'xlsx'];
	}

	async readByPath(path: string): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
		return await this.readTableFile(file);
	}

	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		const content = doc.sourceFileInfo.content;
		const rows = content.split('\n').filter(row => row.trim().length > 0);
		const maxChunkSize = settings.maxChunkSize;
		const overlap = settings.chunkOverlap;

		const chunks: Chunk[] = [];
		let chunkIndex = 0;

		for (const row of rows) {
			if (row.length <= maxChunkSize) {
				chunks.push({
					docId: doc.id,
					content: row,
					chunkId: generateUuidWithoutHyphens(),
					chunkIndex: chunkIndex++,
				});
			} else {
				// Split long row with overlap
				let start = 0;
				while (start < row.length) {
					const end = Math.min(start + maxChunkSize, row.length);
					const chunkContent = row.substring(start, end);
					chunks.push({
						docId: doc.id,
						content: chunkContent,
						chunkId: generateUuidWithoutHyphens(),
						chunkIndex: chunkIndex++,
					});
					start = end - overlap;
					if (start >= row.length) break;
				}
			}
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
				type: 'csv',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Get summary for a table document (CSV/XLSX)
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		if (!this.aiServiceManager) {
			throw new Error('TableDocumentLoader requires AIServiceManager to generate summaries');
		}
		if (typeof source === 'string') {
			throw new Error('TableDocumentLoader.getSummary requires a Document, not a string');
		}
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}

	private async readTableFile(file: TFile): Promise<Document | null> {
		try {
			let content = '';
			const ext = file.extension.toLowerCase();
			const supportedExts = this.getSupportedExtensions();

			if (ext === 'csv') {
				content = await this.app.vault.cachedRead(file);
			} else if (supportedExts.includes('xlsx') && ext === 'xlsx') {
				// For XLSX, we need to parse the Excel file
				// TODO: Parse XLSX using a library like xlsx or exceljs
				// Each row should become a chunk, with truncation and overlap for long rows
				// For now, return null to indicate we can't handle it yet
				// Example implementation would be:
				// const XLSX = require('xlsx');
				// const arrayBuffer = await this.app.vault.readBinary(file);
				// const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
				// const sheet = workbook.Sheets[workbook.SheetNames[0]];
				// const rows = XLSX.utils.sheet_to_csv(sheet).split('\n');
				// content = rows.join('\n');
				return null;
			}

			const contentHash = generateContentHash(content);

			return {
				id: file.path,
				type: 'csv',
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

