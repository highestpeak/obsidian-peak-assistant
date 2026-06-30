import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import type { Chunk } from '@/core/search/indexTypes';
import type { ChunkingSettings } from '@/core/config/settingsTypes';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import { assembleIndexedChunks } from './helper/assembleIndexedChunks';
import { BaseDocumentLoader, buildTextDocument } from './BaseDocumentLoader';

/**
 * Table document loader for CSV and XLSX files.
 * Each row becomes a chunk. If a row is too long, it's truncated with overlap.
 */
export class TableDocumentLoader extends BaseDocumentLoader {
	getDocumentType(): DocumentType {
		return 'csv';
	}

	getSupportedExtensions(): string[] {
		return ['csv', 'xlsx'];
	}

	/**
	 * Custom chunking: each row becomes a chunk; long rows are split with overlap.
	 */
	override async chunkContent(
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
					chunkType: 'body_raw',
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
						chunkType: 'body_raw',
						content: chunkContent,
						chunkId: generateUuidWithoutHyphens(),
						chunkIndex: chunkIndex++,
					});
					start = end - overlap;
					if (start >= row.length) break;
				}
			}
		}

		return assembleIndexedChunks(doc, chunks, settings);
	}

	protected async readFile(file: VaultFileRef): Promise<Document | null> {
		try {
			let content = '';
			const ext = file.extension.toLowerCase();

			if (ext === 'csv') {
				content = await this.vault.readText(file);
			} else if (ext === 'xlsx') {
				console.warn('XLSX parsing not supported: no xlsx library available');
				return null;
			}

			return buildTextDocument(file, 'csv', content, hashString(content, 8));
		} catch {
			return null;
		}
	}
}
