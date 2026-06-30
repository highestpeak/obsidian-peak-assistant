import type { DocumentType, Document } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import { BaseDocumentLoader, buildBinaryDocument } from './BaseDocumentLoader';
import officeParser from 'officeparser';

/**
 * PPTX document loader using officeparser.
 * Parses PPTX directly from buffer without temporary files.
 */
export class PptxDocumentLoader extends BaseDocumentLoader {
	getDocumentType(): DocumentType {
		return 'pptx';
	}

	getSupportedExtensions(): string[] {
		return ['pptx'];
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
				cacheContent = await officeParser.parseOfficeAsync(buffer);
			}

			return buildBinaryDocument(file, 'pptx', cacheContent, sourceContentHash);
		} catch {
			return null;
		}
	}
}
