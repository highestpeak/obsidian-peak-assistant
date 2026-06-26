import type { ResourceKind } from '@/core/document/types';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';

/**
 * Helper class for detecting resource kind from source string.
 *
 * T11K: depends on {@link DocumentVaultReaderPort} for the folder probe
 * instead of `app.vault` + `instanceof TFolder`.
 */
export class ResourceKindDetector {
	constructor(private readonly vault: DocumentVaultReaderPort) {}

	/**
	 * Detect resource kind from source string
	 */
	detectResourceKind(source: string): ResourceKind {
		// Check for special resource types first
		if (/^https?:\/\//i.test(source)) {
			return 'url';
		}
		if (source.startsWith('#')) {
			return 'tag';
		}

		// Check if it looks like a folder path (wikilink or path without extension)
		if (source.includes('[[')) {
			const normalizedPath = source.replace(/^\[\[|\]\]$/g, '');
			if (this.vault.getFolder(normalizedPath)) {
				return 'folder';
			}
			// Otherwise assume it's a markdown note
			return 'markdown';
		}

		// Check if it's a folder path (no extension)
		if (source.includes('/')) {
			if (this.vault.getFolder(source)) {
				return 'folder';
			}
		}

		// Detect by extension
		const ext = source.split('.').pop()?.toLowerCase();
		if (ext === 'pdf') return 'pdf';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif'].includes(ext || '')) {
			return 'image';
		}
		if (ext === 'md' || ext === 'markdown') return 'markdown';
		if (ext === 'txt') return 'txt';
		if (ext === 'csv') return 'csv';
		if (ext === 'json') return 'json';
		if (ext === 'html' || ext === 'htm') return 'html';
		if (ext === 'xml') return 'xml';
		if (ext === 'docx') return 'docx';
		if (ext === 'xlsx') return 'xlsx';
		if (ext === 'pptx') return 'pptx';
		if (ext === 'excalidraw') return 'excalidraw';
		if (ext === 'canvas') return 'canvas';
		// Default to unknown if we can't determine
		return 'unknown';
	}
}
