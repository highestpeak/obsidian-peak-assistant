import type { DocumentType, Document } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import { BaseDocumentLoader } from './BaseDocumentLoader';
import mammoth from 'mammoth';

/**
 * DOCX document loader using mammoth.
 * Parses DOCX directly from buffer without temporary files.
 */
export class DocxDocumentLoader extends BaseDocumentLoader {
	getDocumentType(): DocumentType {
		return 'docx';
	}

	getSupportedExtensions(): string[] {
		return ['docx', 'doc'];
	}

	protected override getContentForChunking(doc: Document): string {
		return doc.cacheFileInfo.content;
	}

	protected async readFile(file: VaultFileRef, genCacheContent?: boolean): Promise<Document | null> {
		try {
			// Read DOCX as binary
			const arrayBuffer = await this.vault.readBinary(file);
			const buffer = Buffer.from(arrayBuffer);
			const sourceContentHash = binaryContentHash(arrayBuffer);

			// Parse DOCX directly from buffer using mammoth
			let cacheContent = '';
			if (genCacheContent) {
				const result = await mammoth.extractRawText({ buffer });
				cacheContent = result.value;
			}

			return {
				id: generateDocIdFromPath(file.path),
				type: 'docx',
				sourceFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: '', // DOCX has no text content in source
				},
				cacheFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: cacheContent, // Extracted text content
				},
				metadata: {
					title: file.basename,
					topicTags: [],
					functionalTagEntries: [],
					keywordTags: [],
				},
				contentHash: sourceContentHash,
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
