/**
 * Peak Composer — multi-image layout HTML generation (WP7, CMP-IMG-08).
 *
 * Deterministic, framework-neutral rendering of a typed
 * {@link ComposerImageLayoutSpec} into Markdown-EMBEDDABLE HTML:
 *   - four modes: `row`, `grid`, `hero-thumbs`, `masonry`;
 *   - every image `src` is a VAULT attachment path — never a base64 data URI;
 *   - styling is INLINE so the block renders in a plain Obsidian reading view
 *     without the plugin's stylesheet;
 *   - a `data-pk-layout` marker lets the composer round-trip the block back into
 *     the typed spec for the layout editor.
 *
 * The HTML is the single source rendered in both the composer and Obsidian
 * preview; the typed spec is what the AI "smart layout" patch and the layout
 * editor manipulate.
 */

import type {
	ComposerImageLayoutItem,
	ComposerImageLayoutSpec,
} from '@/core/schemas/composer';
import type { ComposerOperation } from '@/core/composer';
import type { ComposerDocumentSession } from '../../documentSession';
import { DEFAULT_IMAGE_DOMAIN_CONFIG, type ImageLayoutConfig } from './imageConfig';
import type { ImageInsertionPlan } from './imageTransaction';

const DEFAULT_LAYOUT = DEFAULT_IMAGE_DOMAIN_CONFIG.layout;

/** Marker attribute identifying a composer-owned layout block. */
export const LAYOUT_MARKER_ATTR = 'data-pk-layout';

/** Peak fixture contract (production layout renderer path). */
export const PEAK_IMAGE_LAYOUT_CLASS = 'peak-image-layout';
export const PEAK_IMAGE_LAYOUT_DATA_LAYOUT = 'data-layout';
export const PEAK_IMAGE_LAYOUT_MODES = ['grid', 'hero', 'strip', 'story'] as const;
export type PeakImageLayoutMode = (typeof PEAK_IMAGE_LAYOUT_MODES)[number];

export interface ParsedPeakLayoutFigure {
	src: string;
	alt: string;
	caption: string;
}

export interface ParsedPeakImageLayout {
	kind: PeakImageLayoutMode;
	items: [ParsedPeakLayoutFigure, ParsedPeakLayoutFigure, ParsedPeakLayoutFigure, ParsedPeakLayoutFigure];
}

function decodePeakLayoutText(value: string): string {
	return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Decode HTML-source vault paths without throwing on malformed percent escapes. */
function decodeVaultPath(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function isSafePeakImagePath(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return normalized.length > 0 && !/^(?:data|javascript|vbscript):/.test(normalized) && !normalized.startsWith('//');
}

function htmlAttr(attrs: string, name: string): string | null {
	const re = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
	const m = attrs.match(re);
	return m ? m[2] : null;
}

function hasClassToken(attrs: string, token: string): boolean {
	const raw = htmlAttr(attrs, 'class');
	if (!raw) return false;
	return raw.split(/\s+/).some((part) => part === token);
}

function parsePeakImageLayoutFigure(rawFigure: string): ParsedPeakLayoutFigure | null {
	const figureMatch = rawFigure.match(/^\s*<figure\b[^>]*>([\s\S]*?)<\/figure>\s*$/i);
	if (!figureMatch) return null;
	const inner = figureMatch[1];

	const imgMatches = inner.match(/<img\b[^>]*>/gi) ?? [];
	if (imgMatches.length !== 1) return null;
	const figMatches = inner.match(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi) ?? [];
	if (figMatches.length !== 1) return null;

	const imgMatch = imgMatches[0];
	const imgAttrs = imgMatch.replace(/^<img/i, '').replace(/>$/, '');
	const src = htmlAttr(imgAttrs, 'src');
	if (!src || !isSafePeakImagePath(src)) return null;

	const alt = htmlAttr(imgAttrs, 'alt') ?? '';
	const captionMatch = figMatches[0].match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
	if (!captionMatch) return null;

	// Figure content must be exactly one image + one caption, nothing else.
	const withoutFigCaption = inner.replace(imgMatch, '').replace(figMatches[0], '').trim();
	if (withoutFigCaption.length > 0) return null;

	return {
		src: decodeVaultPath(decodePeakLayoutText(src.trim())),
		alt: decodePeakLayoutText(alt.trim()),
		caption: decodePeakLayoutText(captionMatch[1].trim()),
	};
}

/** Parse the exact fixture contract: `<div class="peak-image-layout" data-layout="hero">`. */
export function parsePeakImageLayout(raw: string): ParsedPeakImageLayout | null {
	const containerMatch = raw.match(/^\s*<div\b([^>]*)>([\s\S]*?)<\/div>\s*$/i);
	if (!containerMatch) return null;
	const attrText = containerMatch[1];
	if (!hasClassToken(attrText, PEAK_IMAGE_LAYOUT_CLASS)) return null;
	const layout = htmlAttr(attrText, PEAK_IMAGE_LAYOUT_DATA_LAYOUT);
	if (!layout || !PEAK_IMAGE_LAYOUT_MODES.includes(layout as PeakImageLayoutMode)) return null;

	const inner = containerMatch[2];
	const figureMatch = inner.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi) ?? [];
	if (figureMatch.length !== 4) return null;

	// Reject any non-whitespace, non-figure content outside the four figures.
	const remainder = inner.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, '').trim();
	if (remainder.length > 0) return null;

	const items = figureMatch.map((rawFigure) => parsePeakImageLayoutFigure(rawFigure));
	if (items.some((item) => !item)) return null;
	return { kind: layout as PeakImageLayoutMode, items: items as [ParsedPeakLayoutFigure, ParsedPeakLayoutFigure, ParsedPeakLayoutFigure, ParsedPeakLayoutFigure] };
}

/** Replace only the layout attribute of a verified fixture block. */
export function replacePeakImageLayoutMode(source: string, mode: PeakImageLayoutMode): string | null {
	if (!parsePeakImageLayout(source)) return null;
	return source.replace(/(data-layout\s*=\s*["'])[^"']*(["'])/i, `$1${mode}$2`);
}

/** Type guard for the current fixture contract. */
export function isPeakImageLayoutSource(raw: string): boolean {
	return parsePeakImageLayout(raw) !== null;
}

/** Escape a string for an HTML attribute value (structural, not i18n). */
function escapeAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Escape a string for HTML text content. */
function escapeText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function figureHtml(item: ComposerImageLayoutItem, imgStyle: string, wrapStyle: string): string {
	const alt = escapeAttr(item.alt ?? '');
	const src = escapeAttr(item.path);
	const img = `<img src="${src}" alt="${alt}" style="${imgStyle}" />`;
	if (!item.caption || item.caption.trim().length === 0) {
		return `<figure style="${wrapStyle}">${img}</figure>`;
	}
	const caption = escapeText(item.caption.trim());
	const capStyle = 'margin:4px 0 0;font-size:0.85em;color:var(--text-muted,#888);text-align:center;';
	return `<figure style="${wrapStyle}">${img}<figcaption style="${capStyle}">${caption}</figcaption></figure>`;
}

/**
 * Render the layout spec into a Markdown-embeddable HTML block. Deterministic:
 * the same spec always produces the same bytes.
 */
export function renderLayoutHtml(
	layout: ComposerImageLayoutSpec,
	config: ImageLayoutConfig = DEFAULT_LAYOUT,
): string {
	const gap = layout.gap ?? config.defaultGap;
	const columns = layout.columns ?? config.defaultColumns;
	const align = layout.alignment ?? 'stretch';
	const imgStyle = 'width:100%;height:auto;display:block;border-radius:4px;';
	const wrapStyle = 'margin:0;';
	const figures = layout.items.map((item) => figureHtml(item, imgStyle, wrapStyle));

	if (layout.mode === 'row') {
		const container = `display:flex;gap:${gap}px;align-items:${cssAlign(align)};`;
		const cells = layout.items.map((item) =>
			figureHtml(item, imgStyle, 'margin:0;flex:1 1 0;min-width:0;'),
		);
		return wrap('row', container, cells);
	}
	if (layout.mode === 'grid') {
		const container = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gap}px;align-items:${cssAlign(align)};`;
		return wrap('grid', container, figures);
	}
	if (layout.mode === 'masonry') {
		const container = `column-count:${columns};column-gap:${gap}px;`;
		const cells = layout.items.map((item) =>
			figureHtml(item, imgStyle, `margin:0 0 ${gap}px;break-inside:avoid;`),
		);
		return wrap('masonry', container, cells);
	}
	// hero-thumbs: first image full-width, the rest in a wrapping thumb row.
	const [hero, ...thumbs] = layout.items;
	const heroHtml = figureHtml(hero, imgStyle, 'margin:0;');
	const thumbCells = thumbs.map((item) =>
		figureHtml(item, imgStyle, 'margin:0;flex:1 1 0;min-width:0;'),
	);
	const thumbRow =
		thumbCells.length > 0
			? `<div style="display:flex;gap:${gap}px;margin-top:${gap}px;">${thumbCells.join('')}</div>`
			: '';
	const container = 'display:block;';
	return `<div class="pk-image-layout" ${LAYOUT_MARKER_ATTR}="hero-thumbs" style="${container}">${heroHtml}${thumbRow}</div>`;
}

function wrap(mode: string, containerStyle: string, cells: string[]): string {
	return `<div class="pk-image-layout" ${LAYOUT_MARKER_ATTR}="${mode}" style="${containerStyle}">${cells.join('')}</div>`;
}

function cssAlign(align: string): string {
	if (align === 'start') return 'flex-start';
	if (align === 'end') return 'flex-end';
	if (align === 'center') return 'center';
	return 'stretch';
}

/** True when a block's verbatim source is a composer-owned layout block. */
export function isLayoutBlockSource(source: string): boolean {
	return source.includes(LAYOUT_MARKER_ATTR + '=');
}

/** Plan inserting a NEW layout block after `afterBlockId` (or at document end). */
export function planLayoutInsert(
	session: ComposerDocumentSession,
	afterBlockId: string | null,
	html: string,
): ImageInsertionPlan {
	if (afterBlockId === null) {
		return {
			operations: [{ kind: 'insertBlock', at: session.snapshot.sourceText.length, text: `\n\n${html}`, blockKind: 'html' }],
			blockDelta: 1,
		};
	}
	const block = session.getBlock(afterBlockId);
	if (!block) throw new Error(`planLayoutInsert: unknown block '${afterBlockId}'`);
	return {
		operations: [{ kind: 'insertBlock', at: block.source.to, text: `\n\n${html}`, blockKind: 'html' }],
		blockDelta: 1,
	};
}

/** Plan replacing an EXISTING layout block's source with regenerated HTML. */
export function planLayoutReplace(
	session: ComposerDocumentSession,
	blockId: string,
	html: string,
): { operations: ComposerOperation[]; blockDelta: number } {
	const block = session.getBlock(blockId);
	if (!block) throw new Error(`planLayoutReplace: unknown block '${blockId}'`);
	return {
		operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text: html }],
		blockDelta: 0,
	};
}
