import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import { BaseDocumentLoader, buildTextDocument } from './BaseDocumentLoader';

/**
 * Canvas document loader.
 * Extracts text from canvas JSON structure (nodes and edges).
 */
export class CanvasDocumentLoader extends BaseDocumentLoader {
	getDocumentType(): DocumentType {
		return 'canvas';
	}

	getSupportedExtensions(): string[] {
		return ['canvas'];
	}

	protected override matchesPath(path: string): boolean {
		return this.getSupportedExtensions().some(ext => path.endsWith('.' + ext));
	}

	protected async readFile(file: VaultFileRef): Promise<Document | null> {
		try {
			const fileContents = await this.vault.readText(file);
			const canvas: CanvasData = fileContents ? JSON.parse(fileContents) : {};

			const texts: string[] = [];

			for (const node of canvas.nodes ?? []) {
				if (node.type === 'text' && node.text) {
					texts.push(node.text);
				} else if (node.type === 'file' && node.file) {
					texts.push(node.file);
				}
			}

			for (const edge of (canvas.edges ?? []).filter(e => !!e.label)) {
				texts.push(edge.label!);
			}

			const content = texts.join('\r\n');
			return buildTextDocument(file, 'canvas', content, hashString(content, 8));
		} catch {
			return null;
		}
	}
}

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
