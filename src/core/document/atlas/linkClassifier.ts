/**
 * File Atlas — link / embed classification helpers (Phase 0).
 *
 * Encodes the spec's hard rule that links are NOT one generic category:
 * vault links, external links, and embeds/attachments are distinct kinds. This
 * module is deterministic and does no network access (v1 requirement).
 *
 * The extension lists here are structural classification data (image vs other
 * file), not user-facing copy — kept as module constants rather than a template
 * config since they change only when the Markdown/Obsidian format changes, not
 * per locale/brand/deployment.
 */

import { RawBlockKind } from './types';

/** File extensions treated as inline images. */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic',
]);

/** File extensions treated as embedded file attachments (non-image media/docs). */
export const ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set([
	'pdf', 'mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'ogg', 'm4a',
	'zip', 'docx', 'pptx', 'xlsx', 'epub',
]);

/** True when a target string is an internet URL (http/https/mailto/protocol-like). */
export function isExternalUrl(target: string): boolean {
	if (!target) return false;
	if (/^https?:\/\//i.test(target)) return true;
	if (/^mailto:/i.test(target)) return true;
	// Protocol-relative or other scheme (ftp:, obsidian:, etc.).
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return true;
	if (target.startsWith('//')) return true;
	return false;
}

/**
 * Best-effort registrable host for an external URL / mailto target.
 * Returns null when no host can be derived.
 */
export function extractDomain(target: string): string | undefined {
	if (!target) return undefined;
	const mailto = target.match(/^mailto:(.+)$/i);
	if (mailto) {
		const at = mailto[1].indexOf('@');
		return at >= 0 ? mailto[1].slice(at + 1) : mailto[1];
	}
	try {
		const url = new URL(target.startsWith('//') ? `https:${target}` : target);
		return url.hostname || undefined;
	} catch {
		// Fall back to a naive host slice for strings URL() can't parse.
		const m = target.match(/^[a-z]+:\/\/([^/\s]+)/i);
		return m ? m[1] : undefined;
	}
}

/** Lowercased file extension without the dot, or empty string. */
export function fileExtension(target: string): string {
	// Strip any #heading / #^block fragment and query first.
	const clean = target.split('#')[0].split('?')[0].trim();
	const dot = clean.lastIndexOf('.');
	if (dot < 0) return '';
	return clean.slice(dot + 1).toLowerCase();
}

/**
 * Classify an `![[target]]` embed into image / attachment / generic embed.
 * `.canvas`, `.excalidraw`, and note embeds fall through to Embed.
 */
export function classifyEmbedTarget(target: string): {
	kind: typeof RawBlockKind.Image | typeof RawBlockKind.Attachment | typeof RawBlockKind.Embed;
	fileTarget: string;
} {
	const fileTarget = target.split('#')[0].trim();
	const ext = fileExtension(target);
	if (IMAGE_EXTENSIONS.has(ext)) return { kind: RawBlockKind.Image, fileTarget };
	if (ATTACHMENT_EXTENSIONS.has(ext)) return { kind: RawBlockKind.Attachment, fileTarget };
	return { kind: RawBlockKind.Embed, fileTarget };
}
