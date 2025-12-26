import type { App } from 'obsidian';
import { TFolder } from 'obsidian';
import type { ResourceKind, DocumentType } from '@/core/document/types';

/**
 * Helper class for detecting resource kind from source string
 */
export class ResourceKindDetector {
	constructor(private readonly app: App) {}

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
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (file instanceof TFolder) {
				return 'folder';
			}
			// Otherwise assume it's a markdown note
			return 'markdown';
		}
		
		// Check if it's a folder path (no extension)
		if (source.includes('/')) {
			const folder = this.app.vault.getAbstractFileByPath(source);
			if (folder instanceof TFolder) {
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
		if (ext === 'loom') return 'dataloom';
		
		// Default to unknown if we can't determine
		return 'unknown';
	}
}

