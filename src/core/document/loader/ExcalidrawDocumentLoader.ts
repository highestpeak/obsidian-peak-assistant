import type { DocumentType, Document } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import { BaseDocumentLoader, buildTextDocument } from './BaseDocumentLoader';

/**
 * Excalidraw document loader.
 * For .excalidraw.md files: checks frontmatter for excalidraw-plugin, removes comment sections.
 * For .excalidraw files: reads as plain text.
 */
export class ExcalidrawDocumentLoader extends BaseDocumentLoader {
	getDocumentType(): DocumentType {
		return 'excalidraw';
	}

	getSupportedExtensions(): string[] {
		return ['excalidraw', 'excalidraw.md'];
	}

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

	protected async readFile(file: VaultFileRef): Promise<Document | null> {
		try {
			let content = await this.vault.readText(file);

			if (file.path.endsWith('.excalidraw.md')) {
				if (this.isExcalidrawMarkdown(content)) {
					content = content.replace(/```excalidraw[\s\S]*?```/g, '');
					content = content.replace(/```json[\s\S]*?```/g, '');
				}
			}

			return buildTextDocument(file, 'excalidraw', content, hashString(content, 8));
		} catch {
			return null;
		}
	}
}
