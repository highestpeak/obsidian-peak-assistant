import React from 'react';

/**
 * Returns a click handler for StreamdownIsolated that opens Obsidian wikilinks
 * when the user clicks [[...]] links (rendered as <a> or button[data-streamdown="link"]).
 * Use composedPath() so it works inside Shadow DOM.
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
			const isHash = href.startsWith('#peak-wikilink=');
			const isPeak = href.startsWith('peak://wikilink/');
			const isObsidian = href.startsWith('obsidian://open');
			if (!isHash && !isPeak && !isObsidian) return;
			evt.preventDefault();
			evt.stopPropagation();
			let filePath = '';
			if (isHash) {
				const encoded = href.slice('#peak-wikilink='.length);
				filePath = decodeURIComponent(encoded || '').trim();
			} else if (isPeak) {
				const encoded = href.slice('peak://wikilink/'.length);
				filePath = decodeURIComponent(encoded || '').trim();
			} else {
				try {
					const url = new URL(href);
					const file = url.searchParams.get('file') || '';
					filePath = decodeURIComponent(file).trim();
				} catch {
					filePath = '';
				}
			}
			if (!filePath) return;
			await onOpenWikilink(filePath);
		},
		[onOpenWikilink]
	);
}
