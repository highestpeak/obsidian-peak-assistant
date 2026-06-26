import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import { BaseDocumentLoader } from './BaseDocumentLoader';

/**
 * Plain text document loader.
 * Uses size and overlap settings for chunking.
 */
export class TextDocumentLoader extends BaseDocumentLoader {
	constructor(app: App, aiServiceManager?: IDocSummarizer) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'txt';
	}

	getSupportedExtensions(): string[] {
		return ['txt'];
	}

	protected async readFile(file: TFile): Promise<Document | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const contentHash = hashString(content, 8);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'txt',
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
