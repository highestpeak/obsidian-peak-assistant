import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { BaseDocumentLoader } from './BaseDocumentLoader';

/**
 * Canvas document loader.
 * Extracts text from canvas JSON structure (nodes and edges).
 */
export class CanvasDocumentLoader extends BaseDocumentLoader {
	constructor(app: App, aiServiceManager?: AIServiceManager) {
		super(app, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'canvas';
	}

	getSupportedExtensions(): string[] {
		return ['canvas'];
	}

	protected override matchesPath(path: string): boolean {
		return this.getSupportedExtensions().some(ext => path.endsWith('.' + ext));
	}

	protected async readFile(file: TFile): Promise<Document | null> {
		try {
			const fileContents = await this.app.vault.cachedRead(file);
			const canvas: CanvasData = fileContents ? JSON.parse(fileContents) : {};

			const texts: string[] = [];

			// Extract text from nodes
			for (const node of canvas.nodes ?? []) {
				if (node.type === 'text' && node.text) {
					texts.push(node.text);
				} else if (node.type === 'file' && node.file) {
					texts.push(node.file);
				}
			}

			// Extract labels from edges
			for (const edge of (canvas.edges ?? []).filter(e => !!e.label)) {
				texts.push(edge.label!);
			}

			const content = texts.join('\r\n');
			const contentHash = hashString(content, 8);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'canvas',
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

/**
 * Canvas data structure.
 */
interface CanvasData {
	nodes?: CanvasNode[];
	edges?: CanvasEdge[];
}

interface CanvasNode {
	type: string;
	text?: string;
	file?: string;
}

interface CanvasEdge {
	label?: string;
}
