import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { BaseDocumentLoader } from './BaseDocumentLoader';

/**
 * Dataloom document loader.
 * Recursively extracts all 'content' fields from JSON structure.
 */
export class DataloomDocumentLoader extends BaseDocumentLoader {
	constructor(app: App, aiServiceManager?: AIServiceManager) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'dataloom';
	}

	getSupportedExtensions(): string[] {
		return ['loom', 'dataloom'];
	}

	protected override matchesPath(path: string): boolean {
		return this.getSupportedExtensions().some(ext => path.endsWith('.' + ext));
	}

	protected async readFile(file: TFile): Promise<Document | null> {
		try {
			const data = JSON.parse(await this.app.vault.cachedRead(file));

			// Recursively extract all 'content' fields
			const texts: string[] = [];
			const iterate = (obj: any) => {
				for (const key in obj) {
					if (typeof obj[key] === 'object' && obj[key] !== null) {
						iterate(obj[key]);
					} else if (key === 'content') {
						texts.push(obj[key]);
					}
				}
			};
			iterate(data);

			const content = texts.join('\r\n');
			const contentHash = hashString(content, 8);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'dataloom',
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
		} catch (e) {
			console.error('Error while parsing Dataloom file', file.path, e);
			return null;
		}
	}
}
