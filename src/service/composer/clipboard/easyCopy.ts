/**
 * Peak Composer — Easy Copy payload builders (WP4, §7.6).
 *
 * Easy Copy exposes four outputs in ONE fixed order — plain text → image →
 * Markdown → HTML — and copies immediately on click with an in-place check (no
 * preview, no second confirmation). This module owns the framework-neutral,
 * testable half:
 *   - the canonical output order ({@link EASY_COPY_ORDER});
 *   - the text/Markdown/HTML serialization from a source slice, with Code Block
 *     newline/indentation/tab preservation (§7.4 / §7.6 L459);
 *   - the chrome-exclusion contract ({@link EASY_COPY_CHROME_SELECTORS}) the UI
 *     applies before rasterizing the 1:1 image snapshot (§7.6 L458).
 *
 * The image payload itself is a DOM raster produced in the UI (canvas snapshot
 * of the block minus chrome) — not expressible here without a DOM — so this
 * module deliberately stops at the three text formats + the exclusion list.
 */

import type { ComposerBlockKind } from '@/core/composer';

export type EasyCopyKind = 'plain' | 'image' | 'markdown' | 'html';

/** The owner-approved output order (asserted by the mock QA). */
export const EASY_COPY_ORDER: readonly EasyCopyKind[] = ['plain', 'image', 'markdown', 'html'];

/**
 * DOM chrome that must be stripped from the raster snapshot so the copied image
 * is the document content only (rail, action row, selection toolbar, popovers).
 * The UI clones the block subtree and removes nodes matching these selectors.
 */
export const EASY_COPY_CHROME_SELECTORS: readonly string[] = [
	'.pk-composer-rail',
	'.pk-block-action-row',
	'.pk-selection-toolbar',
	'.pk-block-history',
	'.pk-comment-editor',
	'.pk-link-popover',
	'[data-chrome="true"]',
];

export interface EasyCopySource {
	/** Verbatim Markdown source slice (a block, or a single-unit selection). */
	markdown: string;
	blockKind?: ComposerBlockKind;
}

export interface EasyCopyTextPayloads {
	plain: string;
	markdown: string;
	html: string;
}

const FENCE_RE = /^(```|~~~)/;

/** Build the three text payloads for a source slice. Markdown is verbatim. */
export function buildEasyCopyText(src: EasyCopySource): EasyCopyTextPayloads {
	return {
		plain: toPlainText(src.markdown, src.blockKind),
		markdown: src.markdown,
		html: toInlineHtml(src.markdown, src.blockKind),
	};
}

/**
 * Readable plain text. A Code Block (or any fenced block) preserves its body
 * verbatim — newlines, indentation and tabs intact; everything else has its
 * block/inline Markdown markers removed while line breaks are kept.
 */
export function toPlainText(markdown: string, blockKind?: ComposerBlockKind): string {
	if (blockKind === 'code' || FENCE_RE.test(markdown.trimStart())) {
		return stripFence(markdown);
	}
	return markdown
		.split(/\r?\n/)
		.map((line) => stripInlineMarks(stripBlockMarkers(line)))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Minimal inline HTML for the source slice (bold/italic/strike/code/links). */
export function toInlineHtml(markdown: string, blockKind?: ComposerBlockKind): string {
	if (blockKind === 'code' || FENCE_RE.test(markdown.trimStart())) {
		return `<pre><code>${escapeHtml(stripFence(markdown))}</code></pre>`;
	}
	const lines = markdown.split(/\r?\n/).map((line) => inlineToHtml(stripBlockMarkers(line)));
	return lines.filter((l) => l.length > 0).map((l) => `<p>${l}</p>`).join('');
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Drop the opening ```lang / ~~~ and the trailing fence, keep the body verbatim. */
function stripFence(markdown: string): string {
	const lines = markdown.split(/\r?\n/);
	let start = 0;
	let end = lines.length;
	if (FENCE_RE.test(lines[0]?.trimStart() ?? '')) start = 1;
	for (let i = lines.length - 1; i >= start; i--) {
		if (FENCE_RE.test(lines[i].trimStart())) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join('\n');
}

/** Remove leading list / heading / quote / task markers from one line. */
function stripBlockMarkers(line: string): string {
	return line
		.replace(/^\s*>\s?/, '')
		.replace(/^\s*#{1,6}\s+/, '')
		.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
		.replace(/^\s*[-*+]\s+/, '')
		.replace(/^\s*\d+\.\s+/, '');
}

/** Resolve inline Markdown/HTML marks to their visible text. */
function stripInlineMarks(text: string): string {
	return text
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/<\/?[a-z][^>]*>/gi, '')
		.replace(/(\*\*|__)(.*?)\1/g, '$2')
		.replace(/(\*|_)(.*?)\1/g, '$2')
		.replace(/~~(.*?)~~/g, '$1')
		.replace(/==(.*?)==/g, '$1')
		.replace(/`([^`]*)`/g, '$1');
}

function inlineToHtml(text: string): string {
	return escapeHtml(text)
		.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
		.replace(/(\*|_)(.+?)\1/g, '<em>$2</em>')
		.replace(/~~(.+?)~~/g, '<del>$1</del>')
		.replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
