import type { App } from 'obsidian';
import type { DocumentLoaderReadOptions } from './types';
import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import { PlaywrightWebBaseLoader } from '@langchain/community/document_loaders/web/playwright';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { BaseDocumentLoader } from './BaseDocumentLoader';
import { TFile } from 'obsidian';

/**
 * URL document loader using PlaywrightWebBaseLoader.
 *
 * Note: URLs are not files in the vault, so readByPath and scanDocuments
 * may need special handling. This loader is designed for URL indexing.
 */
export class UrlDocumentLoader extends BaseDocumentLoader {
	private readonly playwrightConfig = {
		launchOptions: {
			headless: true,
		},
		gotoOptions: {
			waitUntil: 'domcontentloaded' as const,
		},
	};

	constructor(app: App, aiServiceManager?: AIServiceManager) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'url';
	}

	getSupportedExtensions(): string[] {
		return ['url'];
	}

	protected override getContentForChunking(doc: Document): string {
		return doc.cacheFileInfo.content;
	}

	/**
	 * For URLs, path is the URL itself — not a vault file.
	 */
	override async readByPath(
		path: string,
		genCacheContent?: boolean,
		_readOptions?: DocumentLoaderReadOptions,
	): Promise<Document | null> {
		if (!this.isValidUrl(path)) return null;
		return this.readUrl(path, genCacheContent);
	}

	/**
	 * URLs are not vault files — nothing to scan.
	 */
	override async *scanDocuments(
		_params?: { limit?: number; batchSize?: number },
	): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>> {
		yield [];
	}

	/** Not used — readByPath is overridden. */
	protected async readFile(_file: TFile): Promise<Document | null> {
		return null;
	}

	private isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	private async readUrl(url: string, genCacheContent?: boolean): Promise<Document | null> {
		if (!this.isValidUrl(url)) return null;

		try {
			let content = '';
			const contentHash = hashString(url, 8);
			let title = '';
			if (genCacheContent) {
				const loader = new PlaywrightWebBaseLoader(url, this.playwrightConfig);

				const docs = await loader.load();
				content = docs.map(doc => doc.pageContent).join('\n\n');

				const urlObj = new URL(url);
				title = urlObj.hostname + urlObj.pathname;
			}

			return {
				id: generateDocIdFromPath(url),
				type: 'url',
				sourceFileInfo: {
					path: url,
					name: url,
					extension: 'url',
					size: content.length,
					mtime: Date.now(),
					ctime: Date.now(),
					content: '', // URL has no source content
				},
				cacheFileInfo: {
					path: url,
					name: url,
					extension: 'url',
					size: content.length,
					mtime: Date.now(),
					ctime: Date.now(),
					content, // Extracted web content
				},
				metadata: {
					title: title,
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
		} catch (error) {
			console.error('Error loading URL:', url, error);
			return null;
		}
	}
}
