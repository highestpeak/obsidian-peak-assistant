import type { DocumentType, Document } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import { BaseDocumentLoader, buildBinaryDocument } from './BaseDocumentLoader';
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
			const arrayBuffer = await this.vault.readBinary(file);
			const buffer = Buffer.from(arrayBuffer);
			const sourceContentHash = binaryContentHash(arrayBuffer);

			let cacheContent = '';
			if (genCacheContent) {
				const result = await mammoth.extractRawText({ buffer });
				cacheContent = result.value;
			}

			return buildBinaryDocument(file, 'docx', cacheContent, sourceContentHash);
		} catch {
			return null;
		}
	}
}
