import type { DocumentType, Document } from '@/core/document/types';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import { binaryContentHash } from '@/core/utils/hash-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import type { BinaryDocumentTextExtractorPort } from '@/core/ports/BinaryDocumentTextExtractorPort';
import { BaseDocumentLoader, buildBinaryDocument } from './BaseDocumentLoader';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';
import type { DocumentSummaryConfig } from './helper/DocumentLoaderHelpers';

/**
 * PPTX document loader using officeparser.
 * Parses PPTX directly from buffer without temporary files.
 */
export class PptxDocumentLoader extends BaseDocumentLoader {
	constructor(
		vault: DocumentVaultReaderPort,
		summaryConfig: DocumentSummaryConfig,
		aiServiceManager: IDocSummarizer | undefined,
		private readonly textExtractor: BinaryDocumentTextExtractorPort,
	) {
		super(vault, summaryConfig, aiServiceManager);
	}

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
			const sourceContentHash = binaryContentHash(arrayBuffer);

			let cacheContent = '';
			if (genCacheContent) {
				cacheContent = await this.textExtractor.extract('pptx', arrayBuffer);
			}

			return buildBinaryDocument(file, 'pptx', cacheContent, sourceContentHash);
		} catch {
			return null;
		}
	}
}
