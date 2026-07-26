/**
 * Peak Composer — image caption adapter (WP7, CMP-IMG-05).
 *
 * The figcaption belongs to the SAME figure as the image — never a sibling prose
 * block. This module rebuilds an image block's source with an updated caption:
 *   - a plain Markdown embed (`![[path]]` / `![alt](path)`) is wrapped into an
 *     HTML `<figure>` carrying the vault path and a `<figcaption>` slot;
 *   - an existing `<figure>` has its `<figcaption>` updated IN PLACE (so the
 *     model-stream diff replaces only the caption region conceptually);
 *   - an empty caption leaves an empty figcaption SLOT (never removes the
 *     figure), matching "无 caption 时只创建 slot".
 *
 * Pure + framework-neutral; the caption capability's materializer calls
 * {@link applyCaption} with the streamed caption text and the block's frozen
 * source.
 */

/** Parsed shape of an image block (Markdown embed or HTML figure). */
export interface ParsedImageBlock {
	/** Vault path / URL the image points at. */
	path: string;
	alt?: string;
	caption?: string;
	/** True when the block is already an HTML `<figure>`. */
	isFigure: boolean;
}

const CAPTION_STYLE = 'margin:4px 0 0;font-size:0.85em;color:var(--text-muted,#888);text-align:center;';
const IMG_STYLE = 'width:100%;height:auto;display:block;';
const FIGURE_STYLE = 'margin:0;';

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Parse an image block's verbatim source into path / alt / caption. Null when it holds no image. */
export function parseImageBlock(source: string): ParsedImageBlock | null {
	const trimmed = source.trim();
	// HTML figure: <figure>...<img src="path" alt="alt">...<figcaption>cap</figcaption></figure>
	if (/<figure[\s>]/i.test(trimmed) || /<img[\s>]/i.test(trimmed)) {
		const src = trimmed.match(/<img[^>]*\ssrc\s*=\s*"([^"]*)"/i);
		if (!src) return null;
		const alt = trimmed.match(/<img[^>]*\salt\s*=\s*"([^"]*)"/i);
		const cap = trimmed.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
		return {
			path: decodeEntities(src[1]),
			...(alt && alt[1] ? { alt: decodeEntities(alt[1]) } : {}),
			...(cap ? { caption: decodeEntities(cap[1].trim()) } : {}),
			isFigure: true,
		};
	}
	// Wikilink embed: ![[path|alt]]
	const wiki = trimmed.match(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/);
	if (wiki) {
		return {
			path: wiki[1].trim(),
			...(wiki[2] && wiki[2].trim() ? { alt: wiki[2].trim() } : {}),
			isFigure: false,
		};
	}
	// Markdown image: ![alt](path)
	const md = trimmed.match(/!\[([^\]]*)\]\(([^)]+)\)/);
	if (md) {
		return {
			path: md[2].trim(),
			...(md[1].trim() ? { alt: md[1].trim() } : {}),
			isFigure: false,
		};
	}
	return null;
}

/**
 * Rebuild the block source with `caption` applied, KEEPING the block's kind (the
 * WP2 engine refuses a targeted commit that changes a block's kind). Three cases,
 * all one block, never a sibling:
 *   - an existing HTML `<figure>` → update its `<figcaption>` in place;
 *   - a Markdown image `![alt](path)` → carry the caption as the image caption
 *     (`![caption](path)` — the Markdown image caption adapter);
 *   - a wikilink embed `![[path]]` → caption via the display segment
 *     (`![[path|caption]]`), which keeps the block an embed.
 * An empty caption leaves an empty slot rather than removing anything.
 */
export function applyCaption(source: string, caption: string, altOverride?: string): string {
	const parsed = parseImageBlock(source);
	if (!parsed) {
		// Not a recognised image block — leave it untouched rather than corrupt it.
		return source;
	}
	const cap = caption.trim();
	if (parsed.isFigure) return buildCaptionedFigure(parsed.path, cap, altOverride ?? parsed.alt ?? '');
	if (/!\[\[/.test(source.trim())) return buildWikilinkCaption(parsed.path, cap);
	return buildMarkdownCaption(parsed.path, cap);
}

/** A wikilink embed carrying the caption in its display segment (kind: embed). */
export function buildWikilinkCaption(path: string, caption: string): string {
	return caption.length > 0 ? `![[${path}|${caption}]]` : `![[${path}]]`;
}

/** A Markdown image whose alt text IS the caption (kind: image). */
export function buildMarkdownCaption(path: string, caption: string): string {
	return `![${caption}](${path})`;
}

/** Build an HTML `<figure>` for an image with an (optionally empty) figcaption slot. */
export function buildCaptionedFigure(path: string, caption: string, alt = ''): string {
	const img = `<img src="${escapeAttr(path)}" alt="${escapeAttr(alt)}" style="${IMG_STYLE}" />`;
	const figcaption = `<figcaption style="${CAPTION_STYLE}">${escapeText(caption.trim())}</figcaption>`;
	return `<figure style="${FIGURE_STYLE}">${img}${figcaption}</figure>`;
}

function decodeEntities(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}
