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
