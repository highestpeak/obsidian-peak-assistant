import React from 'react';
import { AppContext } from '@/app/context/AppContext';

/**
 * Strip #heading or #^block-id from wikilink target so we open the file, not the anchor.
 */
export function stripWikilinkAnchor(target: string): string {
	if (!target || typeof target !== 'string') return target;
	const t = target.trim();
	const hashIdx = t.indexOf('#');
	if (hashIdx === -1) return t;
	return t.slice(0, hashIdx).trim();
}

/**
 * True if the string looks like a vault-relative file path (has slash or .md).
 */
export function looksLikePath(s: string): boolean {
	if (!s || typeof s !== 'string') return false;
	const t = s.trim();
	return t.includes('/') || /\.(md|markdown)$/i.test(t);
}

/**
 * Resolve link text (e.g. "Note Title") to vault file path via metadataCache.
 * Returns resolved path or original if not found.
 */
export function resolveWikilinkToPath(linkText: string): string {
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
 * Extract the vault path from a wikilink href (#peak-wikilink=, peak://wikilink/, obsidian://open).
 * Returns null for non-wikilink hrefs or block anchors.
 */
export function extractWikilinkPath(href: string): string | null {
	if (!href) return null;
	const isBlockAnchor = /^#block-[a-zA-Z0-9_-]+$/.test(href.trim());
	if (isBlockAnchor) return null;
	const isHash = href.startsWith('#peak-wikilink=');
	const isPeak = href.startsWith('peak://wikilink/');
	const isObsidian = href.startsWith('obsidian://open');
	if (!isHash && !isPeak && !isObsidian) return null;
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
	if (!rawTarget || rawTarget.startsWith('#')) return null;
	const filePart = stripWikilinkAnchor(rawTarget);
	if (!filePart) return null;
	return looksLikePath(filePart) ? filePart : resolveWikilinkToPath(filePart);
}

/**
 * Open a vault file path via Obsidian workspace.
 */
export function openWikilinkPath(path: string): void {
	try {
		AppContext.getInstance().app.workspace.openLinkText(path, '', true);
	} catch {
		// ignore
	}
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
			// Block anchor: scroll to element
			if (/^#block-[a-zA-Z0-9_-]+$/.test(href.trim())) {
				evt.preventDefault();
				evt.stopPropagation();
				const id = href.trim().slice(1);
				document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
				return;
			}
			const pathToOpen = extractWikilinkPath(href);
			if (!pathToOpen) return;
			evt.preventDefault();
			evt.stopPropagation();
			await onOpenWikilink(pathToOpen);
		},
		[onOpenWikilink]
	);
}
