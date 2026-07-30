/**
 * Peak Composer — inline styled-run projection (WP4.5 rich rendering).
 *
 * Projects a verbatim source slice into styled runs the renderer paints in the
 * NON-editing (blurred) state: bold / italic / strikethrough / inline-code /
 * underline / color / highlight and internal+external links. This is a RENDER
 * PROJECTION over the source bytes — it introduces NO second source of truth:
 * every run's `from` is an absolute source offset and its visible `text` is a
 * CONTIGUOUS source substring, so:
 *
 *   source.slice(run.from, run.from + run.text.length) === run.text        (∀ run)
 *
 * This invariant is what keeps DOM→source selection mapping exact in the styled
 * state (`data-src-text-from` + in-run text offset — see selectionMapping.ts):
 * the delimiters (`**`, `<mark …>`, `[…](…)`) are simply not represented as
 * selectable runs, exactly like a live-preview editor. Editing and patching
 * always run against source coordinates, never against these runs.
 *
 * The parser is recursive-descent and framework-neutral (no DOM/React/Obsidian),
 * so it is unit-tested in Node. Unknown / unbalanced syntax degrades to a plain
 * verbatim run — nothing is ever dropped or reshaped.
 */

export interface InlineRunStyle {
	bold?: boolean;
	italic?: boolean;
	strikethrough?: boolean;
	code?: boolean;
	underline?: boolean;
	/** Text color value from a `<span style="color: …">`. */
	color?: string;
	/** Highlight background value from a `<mark style="background: …">`. */
	highlight?: string;
}

/** Marks a rendered token can expose for direct, source-safe actions. */
export type InlineStyleToken = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'text-color' | 'highlight';

/** The exact outer source wrapper for every style currently applied to a run. */
export type InlineMarkRanges = Partial<Record<InlineStyleToken, { from: number; to: number }>>;

export interface InlineRun {
	/** Visible text — always a contiguous slice of the source (delimiters excluded). */
	text: string;
	/** Absolute source offset of the run's first VISIBLE character. */
	from: number;
	style: InlineRunStyle;
	/** Source ranges including the relevant Markdown/HTML wrappers, if styled. */
	markRanges?: InlineMarkRanges;
	/** Link target when this run is a link token. */
	linkTarget?: string;
	linkKind?: 'wikilink' | 'markdown' | 'bare-url' | 'html';
	/** Full source range of the link wrapper/autolink, including its destination. */
	linkRange?: { from: number; to: number };
}

const EMPTY_STYLE: InlineRunStyle = Object.freeze({});
const EMPTY_MARK_RANGES: InlineMarkRanges = Object.freeze({});

function merge(base: InlineRunStyle, patch: InlineRunStyle): InlineRunStyle {
	return { ...base, ...patch };
}

/** Parse a source slice `[baseFrom, baseFrom+text.length)` into styled runs. */
export function parseInlineRuns(text: string, baseFrom: number): InlineRun[] {
	const runs: InlineRun[] = [];
	parseInto(text, baseFrom, EMPTY_STYLE, runs, EMPTY_MARK_RANGES);
	if (runs.length === 0) runs.push({ text: '', from: baseFrom, style: EMPTY_STYLE });
	return runs;
}

/** A recognized inline span: how to slice out its inner content + the style it adds. */
interface SpanMatch {
	/** Length of the opening delimiter. */
	openLen: number;
	/** Length of the closing delimiter. */
	closeLen: number;
	/** Absolute index (into `text`) of the closing delimiter's first char. */
	closeAt: number;
	style: InlineRunStyle;
}

function parseInto(
	text: string,
	baseFrom: number,
	style: InlineRunStyle,
	out: InlineRun[],
	markRanges: InlineMarkRanges,
): void {
	let cursor = 0;
	let plainStart = 0;
	const flushPlain = (end: number): void => {
		if (end <= plainStart) return;
		out.push({
			text: text.slice(plainStart, end),
			from: baseFrom + plainStart,
			style,
			...(Object.keys(markRanges).length > 0 ? { markRanges } : {}),
		});
	};

	while (cursor < text.length) {
		const link = matchLink(text, cursor);
		if (link) {
			flushPlain(cursor);
			const linkStyle = merge(style, link.run.style);
			const linkRange = {
				from: baseFrom + cursor,
				to: baseFrom + link.end,
			};
			const linkMarkRanges = mergeMarkRanges(
				markRanges,
				link.run.style,
				linkRange,
			);
			out.push({
				...link.run,
				from: baseFrom + link.run.from,
				style: linkStyle,
				linkRange,
				...(Object.keys(linkMarkRanges).length > 0 ? { markRanges: linkMarkRanges } : {}),
			});
			cursor = link.end;
			plainStart = cursor;
			continue;
		}
		const span = matchSpan(text, cursor);
		if (span) {
			flushPlain(cursor);
			const innerStart = cursor + span.openLen;
			const inner = text.slice(innerStart, span.closeAt);
			const nextStyle = merge(style, span.style);
			const nextRanges = mergeMarkRanges(markRanges, span.style, {
				from: baseFrom + cursor,
				to: baseFrom + span.closeAt + span.closeLen,
			});
			if (span.style.code) {
				// Code content is literal — never re-parsed for nested marks.
				out.push({
					text: inner,
					from: baseFrom + innerStart,
					style: nextStyle,
					...(Object.keys(nextRanges).length > 0 ? { markRanges: nextRanges } : {}),
				});
			} else {
				parseInto(inner, baseFrom + innerStart, nextStyle, out, nextRanges);
			}
			cursor = span.closeAt + span.closeLen;
			plainStart = cursor;
			continue;
		}
		cursor += 1;
	}
	flushPlain(text.length);
}

function mergeMarkRanges(
	base: InlineMarkRanges,
	style: InlineRunStyle,
	range: { from: number; to: number },
): InlineMarkRanges {
	const tokens = inlineStyleTokenKinds(style);
	if (tokens.length === 0) return base;
	const next = { ...base };
	for (const token of tokens) next[token] = range;
	return next;
}

/** Stable UI-facing list of active style tokens; source remains in {@link InlineRun}. */
export function inlineStyleTokenKinds(style: InlineRunStyle): InlineStyleToken[] {
	const tokens: InlineStyleToken[] = [];
	if (style.bold) tokens.push('bold');
	if (style.italic) tokens.push('italic');
	if (style.underline) tokens.push('underline');
	if (style.strikethrough) tokens.push('strikethrough');
	if (style.color !== undefined) tokens.push('text-color');
	if (style.highlight !== undefined) tokens.push('highlight');
	return tokens;
}

// ── link tokens (mirror linkSegments.ts grammar, but yields a styled run) ─────

const WIKILINK_RE = /^!?\[\[([^\]]+)\]\]/;
const MDLINK_RE = /^\[([^\]]*)\]\((([^)\s]+)[^)]*)\)/;
const BARE_URL_RE = /^https?:\/\/[^\s)\]]+/;
const HTML_ANCHOR_RE = /^<a\s+href="([^"]*)"(?:\s+style="([^"]*)")?\s*>([^<]*)<\/a>/i;

interface LinkMatch {
	run: InlineRun;
	end: number;
}

function matchLink(text: string, at: number): LinkMatch | null {
	const rest = text.slice(at);
	const anchor = HTML_ANCHOR_RE.exec(rest);
	if (anchor) {
		const openEnd = anchor[0].indexOf('>') + 1;
		return {
			run: {
				text: anchor[3],
				from: at + openEnd,
				style: anchor[2] ? parseInlineStyleDeclaration(anchor[2]) : EMPTY_STYLE,
				linkTarget: decodeHtmlAttribute(anchor[1]),
				linkKind: 'html',
			},
			end: at + anchor[0].length,
		};
	}
	const wiki = WIKILINK_RE.exec(rest);
	if (wiki) {
		const inner = wiki[1];
		const pipe = inner.indexOf('|');
		const label = pipe >= 0 ? inner.slice(pipe + 1) : inner;
		// Visible label offset: skip `![[` / `[[` and (for aliases) the `target|`.
		const bracketLen = wiki[0].startsWith('!') ? 3 : 2;
		const labelOffset = at + bracketLen + (pipe >= 0 ? pipe + 1 : 0);
		return {
			run: { text: label, from: labelOffset, style: EMPTY_STYLE, linkTarget: inner.split('|')[0].trim(), linkKind: 'wikilink' },
			end: at + wiki[0].length,
		};
	}
	const md = MDLINK_RE.exec(rest);
	if (md) {
		const label = md[1];
		return {
			run: { text: label, from: at + 1, style: EMPTY_STYLE, linkTarget: md[3], linkKind: 'markdown' },
			end: at + md[0].length,
		};
	}
	const bare = BARE_URL_RE.exec(rest);
	if (bare) {
		return {
			run: { text: bare[0], from: at, style: EMPTY_STYLE, linkTarget: bare[0], linkKind: 'bare-url' },
			end: at + bare[0].length,
		};
	}
	return null;
}

// ── mark spans ────────────────────────────────────────────────────────────────

const SPAN_STYLE_RE = /^<span\s+style="([^"]*)"\s*>/i;
const MARK_OPEN_RE = /^<mark(?:\s+style="background:\s*([^"]*)"\s*)?>/i;

/** Try to match a mark span whose opening delimiter starts at `text[at]`. */
function matchSpan(text: string, at: number): SpanMatch | null {
	const ch = text[at];

	if (ch === '`') {
		const closeAt = text.indexOf('`', at + 1);
		if (closeAt > at) return { openLen: 1, closeLen: 1, closeAt, style: { code: true } };
		return null;
	}

	if (ch === '*' || ch === '_') {
		const double = text[at + 1] === ch;
		if (double) {
			const closeAt = findClose(text, at + 2, ch + ch);
			if (closeAt >= 0) return { openLen: 2, closeLen: 2, closeAt, style: { bold: true } };
		}
		const closeAt = findClose(text, at + 1, ch);
		if (closeAt >= 0) return { openLen: 1, closeLen: 1, closeAt, style: { italic: true } };
		return null;
	}

	if (ch === '~' && text[at + 1] === '~') {
		const closeAt = findClose(text, at + 2, '~~');
		if (closeAt >= 0) return { openLen: 2, closeLen: 2, closeAt, style: { strikethrough: true } };
		return null;
	}

	if (ch === '=' && text[at + 1] === '=') {
		// Obsidian's `==highlight==` (default highlight color).
		const closeAt = findClose(text, at + 2, '==');
		if (closeAt >= 0) return { openLen: 2, closeLen: 2, closeAt, style: { highlight: '' } };
		return null;
	}

	if (ch === '<') {
		const rest = text.slice(at);
		if (/^<u>/i.test(rest)) {
			const closeAt = findMatchingHtmlClose(text, at + 3, 'u');
			if (closeAt >= 0) return { openLen: 3, closeLen: 4, closeAt, style: { underline: true } };
			return null;
		}
		const mark = MARK_OPEN_RE.exec(rest);
		if (mark) {
			const closeAt = findMatchingHtmlClose(text, at + mark[0].length, 'mark');
			if (closeAt >= 0) {
				const style: InlineRunStyle = mark[1] ? { highlight: mark[1].trim() } : { highlight: '' };
				return { openLen: mark[0].length, closeLen: 7, closeAt, style };
			}
			return null;
		}
		const span = SPAN_STYLE_RE.exec(rest);
		if (span) {
			const closeAt = findMatchingHtmlClose(text, at + span[0].length, 'span');
			if (closeAt >= 0) return { openLen: span[0].length, closeLen: 7, closeAt, style: parseInlineStyleDeclaration(span[1]) };
			return null;
		}
	}

	return null;
}

export function parseInlineStyleDeclaration(styleText: string): InlineRunStyle {
	const style: InlineRunStyle = {};
	for (const rawDecl of styleText.split(';')) {
		const [rawName, ...rawValue] = rawDecl.split(':');
		const name = rawName?.trim().toLowerCase();
		const value = rawValue.join(':').trim();
		if (!name || !value) continue;
		if (name === 'color') style.color = value;
		if ((name === 'background' || name === 'background-color') && style.highlight === undefined) style.highlight = value;
		if (name === 'font-weight' && (value.toLowerCase() === 'bold' || Number.parseInt(value, 10) >= 600)) style.bold = true;
		if (name === 'font-style' && /^(italic|oblique)$/i.test(value)) style.italic = true;
		if (name === 'text-decoration' || name === 'text-decoration-line') {
			const normalized = value.toLowerCase();
			if (normalized.includes('underline')) style.underline = true;
			if (normalized.includes('line-through')) style.strikethrough = true;
		}
	}
	return style;
}

function decodeHtmlAttribute(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

/** Index of `delim` at/after `from`, requiring a non-whitespace char just before it. */
function findClose(text: string, from: number, delim: string): number {
	let i = text.indexOf(delim, from);
	while (i >= 0) {
		// A valid emphasis close is not preceded by whitespace and encloses content.
		if (i > from && !/\s/.test(text[i - 1])) return i;
		i = text.indexOf(delim, i + 1);
	}
	return -1;
}

/**
 * Match the close for a generated HTML inline mark with same-tag nesting.
 *
 * Selection formatting may legitimately apply a new color/highlight inside an
 * existing one. A flat `indexOf('</mark>')` closes the outer mark at the inner
 * boundary and leaks the remaining tag as visible text.
 */
function findMatchingHtmlClose(
	text: string,
	from: number,
	tagName: 'u' | 'mark' | 'span',
): number {
	let depth = 1;
	let cursor = from;
	const close = `</${tagName}>`;
	while (cursor < text.length) {
		const at = text.indexOf('<', cursor);
		if (at < 0) return -1;
		const rest = text.slice(at);
		if (rest.toLowerCase().startsWith(close)) {
			depth -= 1;
			if (depth === 0) return at;
			cursor = at + close.length;
			continue;
		}
		const openLength = matchingHtmlOpenLength(rest, tagName);
		if (openLength > 0) {
			depth += 1;
			cursor = at + openLength;
			continue;
		}
		cursor = at + 1;
	}
	return -1;
}

function matchingHtmlOpenLength(
	rest: string,
	tagName: 'u' | 'mark' | 'span',
): number {
	if (tagName === 'u') return /^<u>/i.exec(rest)?.[0].length ?? 0;
	if (tagName === 'mark') return MARK_OPEN_RE.exec(rest)?.[0].length ?? 0;
	return SPAN_STYLE_RE.exec(rest)?.[0].length ?? 0;
}
