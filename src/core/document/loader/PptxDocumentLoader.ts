import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document } from '@/core/document/types';
import { binaryContentHash } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { BaseDocumentLoader } from './BaseDocumentLoader';
import officeParser from 'officeparser';

/**
 * PPTX document loader using officeparser.
 * Parses PPTX directly from buffer without temporary files.
 */
export class PptxDocumentLoader extends BaseDocumentLoader {
	constructor(app: App, aiServiceManager?: AIServiceManager) {
		super(app, aiServiceManager);
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

	protected async readFile(file: TFile, genCacheContent?: boolean): Promise<Document | null> {
		try {
			// Read PPTX as binary
			const arrayBuffer = await this.app.vault.readBinary(file);
			const buffer = Buffer.from(arrayBuffer);
			const sourceContentHash = binaryContentHash(arrayBuffer);

			// Parse PPTX directly from buffer using officeparser
			let cacheContent = '';
			if (genCacheContent) {
				const content = await officeParser.parseOfficeAsync(buffer);
				cacheContent = content;
			}

			return {
				id: generateDocIdFromPath(file.path),
				type: 'pptx',
				sourceFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content: '', // PPTX has no text content in source
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
