import React from 'react';
import { AppContext } from '@/app/context/AppContext';

/**
 * Strip #heading or #^block-id from wikilink target so we open the file, not the anchor.
 */
function stripWikilinkAnchor(target: string): string {
	if (!target || typeof target !== 'string') return target;
	const t = target.trim();
	const hashIdx = t.indexOf('#');
	if (hashIdx === -1) return t;
	return t.slice(0, hashIdx).trim();
}

/**
 * True if the string looks like a vault-relative file path (has slash or .md).
 */
function looksLikePath(s: string): boolean {
	if (!s || typeof s !== 'string') return false;
	const t = s.trim();
	return t.includes('/') || /\.(md|markdown)$/i.test(t);
}

/**
 * Resolve link text (e.g. "Note Title") to vault file path via metadataCache.
 * Returns resolved path or original if not found.
 */
function resolveWikilinkToPath(linkText: string): string {
	try {
		const app = AppContext.getInstance().app;
		const dest = app.metadataCache.getFirstLinkpathDest(linkText, '');
		if (dest && 'path' in dest) return dest.path;
	} catch {
		// ignore
	}
	return linkText;
}

/**
 * Returns a click handler for StreamdownIsolated that opens Obsidian wikilinks
 * when the user clicks [[...]] links (rendered as <a> or button[data-streamdown="link"]).
 * Strips #anchor, resolves title-only links to vault path via metadataCache, then opens.
 */
export function useStreamdownWikilinkClick(
	onOpenWikilink: ((path: string) => void | Promise<void>) | undefined
): React.MouseEventHandler<HTMLDivElement> {
	return React.useCallback(
		async (evt: React.MouseEvent<HTMLDivElement>) => {
			if (!onOpenWikilink) return;
			const path = evt.nativeEvent.composedPath?.() ?? [];
			const el = path.find((n): n is HTMLElement => {
				if (!(n instanceof HTMLElement)) return false;
				if (n.tagName === 'A') return true;
				if (n.getAttribute?.('data-streamdown') === 'link') return true;
				return false;
			});
			if (!el) return;
			let href =
				el.getAttribute?.('href') ??
				el.getAttribute?.('data-href') ??
				'';
			if (!href && el.getAttribute?.('data-streamdown') === 'link') {
				const text = (el.textContent ?? '').trim();
				const match = text.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
				if (match) href = `#peak-wikilink=${encodeURIComponent(match[1].trim())}`;
			}
			const isBlockAnchor = /^#block-[a-zA-Z0-9_-]+$/.test(href.trim());
			if (isBlockAnchor) {
				evt.preventDefault();
				evt.stopPropagation();
				const id = href.trim().slice(1);
				document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
				return;
			}
			const isHash = href.startsWith('#peak-wikilink=');
			const isPeak = href.startsWith('peak://wikilink/');
			const isObsidian = href.startsWith('obsidian://open');
			if (!isHash && !isPeak && !isObsidian) return;
			evt.preventDefault();
			evt.stopPropagation();
			let rawTarget = '';
			if (isHash) {
				const encoded = href.slice('#peak-wikilink='.length);
				rawTarget = decodeURIComponent(encoded || '').trim();
			} else if (isPeak) {
				const encoded = href.slice('peak://wikilink/'.length);
				rawTarget = decodeURIComponent(encoded || '').trim();
			} else {
				try {
					const url = new URL(href);
					const file = url.searchParams.get('file') || '';
					rawTarget = decodeURIComponent(file).trim();
				} catch {
					rawTarget = '';
				}
			}
			if (!rawTarget) return;
			// Do not open tag-only links (e.g. [[#tag]] or link text that is just a tag).
			if (rawTarget.startsWith('#')) return;
			const filePart = stripWikilinkAnchor(rawTarget);
			if (!filePart) return;
			const pathToOpen = looksLikePath(filePart)
				? filePart
				: resolveWikilinkToPath(filePart);
			await onOpenWikilink(pathToOpen);
		},
		[onOpenWikilink]
	);
}
