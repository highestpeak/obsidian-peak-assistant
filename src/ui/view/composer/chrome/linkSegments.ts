/**
 * Peak Composer — link token segmentation for editable leaves (WP4, §7.7).
 *
 * Splits a verbatim source slice into plain / link segments so the renderer can
 * wrap wikilinks (`[[target]]`), Markdown links (`[text](url)`) and bare URLs in
 * focusable spans that drive the hover/keyboard link preview. Segments carry
 * their absolute source offset (data-src-text-from) so DOM selection → source
 * mapping stays exact. The segment TEXT is always the verbatim token — nothing
 * is hidden or reshaped, so `textContent` of the leaf equals the source slice.
 */

export interface LeafSegment {
	text: string;
	/** Absolute source offset of the segment's first character. */
	from: number;
	/** Link target when this segment is a link token. */
	linkTarget?: string;
	linkKind?: 'wikilink' | 'markdown' | 'bare-url';
}

const TOKEN_RE = /(!?\[\[([^\]]+)\]\])|(\[[^\]]*\]\(([^)\s]+)[^)]*\))|(https?:\/\/[^\s)\]]+)/g;

/** Segment `text` (whose first char sits at absolute offset `baseFrom`). */
export function segmentLinks(text: string, baseFrom: number): LeafSegment[] {
	const out: LeafSegment[] = [];
	let cursor = 0;
	for (const m of text.matchAll(TOKEN_RE)) {
		const idx = m.index ?? 0;
		if (idx > cursor) out.push({ text: text.slice(cursor, idx), from: baseFrom + cursor });
		if (m[1]) {
			out.push({ text: m[1], from: baseFrom + idx, linkTarget: m[2].split('|')[0].trim(), linkKind: 'wikilink' });
		} else if (m[3]) {
			out.push({ text: m[3], from: baseFrom + idx, linkTarget: m[4], linkKind: 'markdown' });
		} else if (m[5]) {
			out.push({ text: m[5], from: baseFrom + idx, linkTarget: m[5], linkKind: 'bare-url' });
		}
		cursor = idx + m[0].length;
	}
	if (cursor < text.length) out.push({ text: text.slice(cursor), from: baseFrom + cursor });
	if (out.length === 0) out.push({ text: '', from: baseFrom });
	return out;
}
