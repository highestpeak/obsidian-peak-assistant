import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader, IndexableDocument } from './types';
import type { DocumentType } from '@/core/Enums';

/**
 * Markdown document loader.
 *
 * This runs on the main thread because it uses Obsidian APIs.
 * Worker code must never import this module.
 */
export class MarkdownDocumentLoader implements DocumentLoader {
	constructor(private readonly app: App) {}

	getDocumentType(): DocumentType {
		return 'markdown';
	}

	getSupportedExtensions(): string[] {
		return ['md', 'markdown'];
	}

	/**
	 * Read a markdown document by its path.
	 */
	async readByPath(path: string): Promise<IndexableDocument | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile) || file.extension !== 'md') return null;
		return await this.readMarkdownFile(file);
	}

	/**
	 * Stream markdown documents in batches.
	 */
	async *batchLoadDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<IndexableDocument[]> {
		const limit = params?.limit ?? Infinity;
		const batchSize = params?.batchSize ?? 20;

		const files = this.app.vault.getMarkdownFiles().slice(0, limit);
		let batch: IndexableDocument[] = [];

		for (const file of files) {
			const doc = await this.readMarkdownFile(file);
			if (doc) batch.push(doc);
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	private async readMarkdownFile(file: TFile): Promise<IndexableDocument | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			return {
				path: file.path,
				title: file.basename,
				type: 'markdown',
				content,
				mtime: file.stat.mtime,
			};
		} catch {
			// Ignore read errors; indexing should be best-effort.
			return null;
		}
	}
}

