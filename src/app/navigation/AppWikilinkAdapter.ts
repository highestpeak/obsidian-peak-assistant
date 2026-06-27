// T11P (Track I): Obsidian implementation of `WikilinkPort`. Owns the
// name → path resolution via `metadataCache.getFirstLinkpathDest` and the
// streamdown href parsing.

import type { App } from 'obsidian';
import type { WikilinkPort } from '@/service/navigation/WikilinkPort';

function stripAnchor(target: string): string {
	if (!target || typeof target !== 'string') return target;
	const t = target.trim();
	const hashIdx = t.indexOf('#');
	if (hashIdx === -1) return t;
	return t.slice(0, hashIdx).trim();
}

function looksLikePath(s: string): boolean {
	if (!s || typeof s !== 'string') return false;
	const t = s.trim();
	return t.includes('/') || /\.(md|markdown)$/i.test(t);
}

export class AppWikilinkAdapter implements WikilinkPort {
	constructor(private readonly app: App) {}

	resolveTarget(rawTarget: string): string | null {
		const t = (rawTarget ?? '').trim();
		if (!t || t.startsWith('#')) return null;
		const filePart = stripAnchor(t);
		if (!filePart) return null;
		if (looksLikePath(filePart)) return filePart;
		try {
			const dest = this.app.metadataCache.getFirstLinkpathDest(filePart, '');
			if (dest && 'path' in dest) return dest.path;
		} catch {
			// ignore
		}
		return filePart;
	}

	resolveHref(href: string): string | null {
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
		return this.resolveTarget(rawTarget);
	}
}
