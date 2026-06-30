import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import { BaseDocumentLoader, buildTextDocument } from './BaseDocumentLoader';

/**
 * Plain text document loader.
 * Uses size and overlap settings for chunking.
 */
export class TextDocumentLoader extends BaseDocumentLoader {
	getDocumentType(): DocumentType {
		return 'txt';
	}

	getSupportedExtensions(): string[] {
		return ['txt'];
	}

	protected async readFile(file: VaultFileRef): Promise<Document | null> {
		try {
			const content = await this.vault.readText(file);
			return buildTextDocument(file, 'txt', content, hashString(content, 8));
		} catch {
			return null;
		}
	}
}
