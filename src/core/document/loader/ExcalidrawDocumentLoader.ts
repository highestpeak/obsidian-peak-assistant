import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import { BaseDocumentLoader } from './BaseDocumentLoader';

/**
 * Excalidraw document loader.
 * For .excalidraw.md files: checks frontmatter for excalidraw-plugin, removes comment sections.
 * For .excalidraw files: reads as plain text.
 */
export class ExcalidrawDocumentLoader extends BaseDocumentLoader {
	constructor(app: App, aiServiceManager?: IDocSummarizer) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'excalidraw';
	}

	getSupportedExtensions(): string[] {
		return ['excalidraw', 'excalidraw.md'];
	}

	/**
	 * Compound extensions need suffix-based matching.
	 */
	protected override matchesPath(path: string): boolean {
		return this.getSupportedExtensions().some(ext => path.endsWith('.' + ext));
	}

	private isExcalidrawMarkdown(content: string): boolean {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];
			return /^plugin:\s*excalidraw-plugin/m.test(frontmatter) || /^excalidraw-plugin/m.test(frontmatter);
		}
		return false;
	}

	protected async readFile(file: TFile): Promise<Document | null> {
		try {
			let content = await this.app.vault.cachedRead(file);

			// For .excalidraw.md files, check if it's an excalidraw plugin file
			if (file.path.endsWith('.excalidraw.md')) {
				if (this.isExcalidrawMarkdown(content)) {
					// Remove all comment sections (containing Excalidraw JSON data)
					content = content.replace(/```excalidraw[\s\S]*?```/g, '');
					content = content.replace(/```json[\s\S]*?```/g, '');
				}
			}

			const contentHash = hashString(content, 8);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'excalidraw',
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
