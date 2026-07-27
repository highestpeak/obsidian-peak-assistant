import type { ComposerNativeKind } from '@/core/composer';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif']);
const ATTACHMENT_EXTS = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'zip', 'mp3', 'mp4', 'mov', 'wav', 'csv']);

/** Strip Obsidian alias / anchor syntax from a wikilink or markdown-link target. */
export function normalizeComposerNativeTarget(target: string): string {
	return target.split('|')[0].trim();
}

/** Shared native/embed classification for the parser and link-analysis pass. */
export function classifyComposerNativeTarget(target: string): ComposerNativeKind {
	const clean = normalizeComposerNativeTarget(target);
	const path = clean.split('#')[0].toLowerCase();
	if (path.endsWith('.excalidraw.md') || path.endsWith('.excalidraw')) return 'excalidraw';
	const ext = path.split('.').pop() ?? '';
	if (ext === 'base') return 'base';
	if (ext === 'canvas') return 'canvas';
	if (IMAGE_EXTS.has(ext)) return 'image';
	if (ATTACHMENT_EXTS.has(ext)) return 'attachment';
	if (/^https?:\/\//.test(clean)) return 'image';
	return 'embed';
}
