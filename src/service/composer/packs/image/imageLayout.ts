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

/** The source must carry enough geometry for ordinary Markdown Reading view. */
export function isPeakImageLayoutPortable(source: string): boolean {
	return /<div\b[^>]*\bclass\s*=\s*(["'])[^"']*\bpeak-image-layout\b[^"']*\1[^>]*\bstyle\s*=/i.test(source);
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

/**
 * Replace a verified layout with its portable canonical form. This intentionally
 * upgrades old class-only fixture blocks on the next user-triggered layout
 * change, while preserving the class/data hooks Composer needs to reopen it.
 */
export function replacePeakImageLayoutMode(
	source: string,
	mode: PeakImageLayoutMode,
	config: ImageLayoutConfig = DEFAULT_LAYOUT,
): string | null {
	const parsed = parsePeakImageLayout(source);
	return parsed ? renderPeakImageLayoutHtml({ ...parsed, kind: mode }, config) : null;
}

/** Type guard for the current fixture contract. */
export function isPeakImageLayoutSource(raw: string): boolean {
	return parsePeakImageLayout(raw) !== null;
}

/** Render the four-image Peak fixture contract with self-contained layout CSS. */
export function renderPeakImageLayoutHtml(
	layout: ParsedPeakImageLayout,
	config: ImageLayoutConfig = DEFAULT_LAYOUT,
): string {
	const containerStyle = peakContainerStyle(layout.kind, config);
	const figures = layout.items.map((item, index) => peakFigureHtml(item, layout.kind, index));
	return `<div class="${PEAK_IMAGE_LAYOUT_CLASS}" ${PEAK_IMAGE_LAYOUT_DATA_LAYOUT}="${layout.kind}" style="${containerStyle}">${figures.join('')}</div>`;
}

/** A whole composition stays readable in ordinary Markdown Reading view. */
function readingViewFrameStyle(config: ImageLayoutConfig): string {
	const requested = Math.floor(config.readingViewWidthPercent);
	const width = Number.isFinite(requested) ? Math.min(100, Math.max(1, requested)) : DEFAULT_LAYOUT.readingViewWidthPercent;
	return `width:${width}%;max-width:100%;margin:0 auto;`;
}

function peakContainerStyle(mode: PeakImageLayoutMode, config: ImageLayoutConfig): string {
	const frame = readingViewFrameStyle(config);
	if (mode === 'grid') {
		return `${frame}display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(158px,1fr));gap:8px;padding:6px;`;
	}
	if (mode === 'hero') {
		return `${frame}display:grid;grid-template-columns:minmax(0,1.65fr) minmax(170px,.8fr);grid-template-rows:repeat(3,minmax(104px,1fr));gap:8px;padding:6px;`;
	}
	if (mode === 'strip') {
		return `${frame}display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(230px,1fr);gap:8px;padding:6px;overflow-x:auto;`;
	}
	return `${frame}display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(220px,1fr) minmax(105px,1fr);gap:8px;padding:6px;`;
}

function peakFigureHtml(item: ParsedPeakLayoutFigure, mode: PeakImageLayoutMode, index: number): string {
	const figureStyle = [
		'position:relative',
		'overflow:hidden',
		'min-width:0',
		'min-height:0',
		'margin:0',
		'border-radius:7px',
		'background:var(--background-secondary,#f5f5f5)',
		mode === 'hero' && index === 0 ? 'grid-row:1 / 4' : '',
		mode === 'story' && index === 0 ? 'grid-column:1 / 4' : '',
	].filter(Boolean).join(';') + ';';
	const imageStyle = 'display:block;width:100%;height:100%;object-fit:cover;';
	const captionStyle = [
		'position:absolute',
		mode === 'strip' ? 'right:6px;bottom:6px;left:auto;max-height:110px;writing-mode:vertical-rl;' : 'right:7px;bottom:7px;left:7px;',
		'width:auto',
		'padding:5px 7px',
		'border:0',
		'border-radius:5px',
		'background:rgba(18,25,36,.7)',
		'color:#fff',
		'font-size:.75em',
		'line-height:normal',
	].join(';') + ';';
	const src = escapeAttr(item.src);
	const alt = escapeAttr(item.alt);
	const caption = escapeText(item.caption);
	return `<figure style="${figureStyle}"><img src="${src}" alt="${alt}" style="${imageStyle}" />${caption ? `<figcaption style="${captionStyle}">${caption}</figcaption>` : ''}</figure>`;
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
	const frame = readingViewFrameStyle(config);
	const imgStyle = 'width:100%;height:auto;display:block;border-radius:4px;';
	const wrapStyle = 'margin:0;';
	const figures = layout.items.map((item) => figureHtml(item, imgStyle, wrapStyle));

	if (layout.mode === 'row') {
		const container = `${frame}display:flex;gap:${gap}px;align-items:${cssAlign(align)};`;
		const cells = layout.items.map((item) =>
			figureHtml(item, imgStyle, 'margin:0;flex:1 1 0;min-width:0;'),
		);
		return wrap('row', container, cells);
	}
	if (layout.mode === 'grid') {
		const container = `${frame}display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gap}px;align-items:${cssAlign(align)};`;
		return wrap('grid', container, figures);
	}
	if (layout.mode === 'masonry') {
		const container = `${frame}column-count:${columns};column-gap:${gap}px;`;
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
	const container = `${frame}display:block;`;
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
