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

export interface InlineRun {
	/** Visible text — always a contiguous slice of the source (delimiters excluded). */
	text: string;
	/** Absolute source offset of the run's first VISIBLE character. */
	from: number;
	style: InlineRunStyle;
	/** Link target when this run is a link token. */
	linkTarget?: string;
	linkKind?: 'wikilink' | 'markdown' | 'bare-url';
}

const EMPTY_STYLE: InlineRunStyle = Object.freeze({});

function merge(base: InlineRunStyle, patch: InlineRunStyle): InlineRunStyle {
	return { ...base, ...patch };
}

/** Parse a source slice `[baseFrom, baseFrom+text.length)` into styled runs. */
export function parseInlineRuns(text: string, baseFrom: number): InlineRun[] {
	const runs: InlineRun[] = [];
	parseInto(text, baseFrom, EMPTY_STYLE, runs);
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

function parseInto(text: string, baseFrom: number, style: InlineRunStyle, out: InlineRun[]): void {
	let cursor = 0;
	let plainStart = 0;
	const flushPlain = (end: number): void => {
		if (end <= plainStart) return;
		out.push({ text: text.slice(plainStart, end), from: baseFrom + plainStart, style });
	};

	while (cursor < text.length) {
		const link = matchLink(text, cursor);
		if (link) {
			flushPlain(cursor);
			out.push({ ...link.run, from: baseFrom + link.run.from, style });
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
			if (span.style.code) {
				// Code content is literal — never re-parsed for nested marks.
				out.push({ text: inner, from: baseFrom + innerStart, style: nextStyle });
			} else {
				parseInto(inner, baseFrom + innerStart, nextStyle, out);
			}
			cursor = span.closeAt + span.closeLen;
			plainStart = cursor;
			continue;
		}
		cursor += 1;
	}
	flushPlain(text.length);
}

// ── link tokens (mirror linkSegments.ts grammar, but yields a styled run) ─────

const WIKILINK_RE = /^!?\[\[([^\]]+)\]\]/;
const MDLINK_RE = /^\[([^\]]*)\]\((([^)\s]+)[^)]*)\)/;
const BARE_URL_RE = /^https?:\/\/[^\s)\]]+/;

interface LinkMatch {
	run: InlineRun;
	end: number;
}

function matchLink(text: string, at: number): LinkMatch | null {
	const rest = text.slice(at);
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

const SPAN_COLOR_RE = /^<span\s+style="color:\s*([^"]*)"\s*>/i;
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
			const closeAt = indexOfCase(text, '</u>', at + 3);
			if (closeAt >= 0) return { openLen: 3, closeLen: 4, closeAt, style: { underline: true } };
			return null;
		}
		const mark = MARK_OPEN_RE.exec(rest);
		if (mark) {
			const closeAt = indexOfCase(text, '</mark>', at + mark[0].length);
			if (closeAt >= 0) {
				const style: InlineRunStyle = mark[1] ? { highlight: mark[1].trim() } : { highlight: '' };
				return { openLen: mark[0].length, closeLen: 7, closeAt, style };
			}
			return null;
		}
		const color = SPAN_COLOR_RE.exec(rest);
		if (color) {
			const closeAt = indexOfCase(text, '</span>', at + color[0].length);
			if (closeAt >= 0) return { openLen: color[0].length, closeLen: 7, closeAt, style: { color: color[1].trim() } };
			return null;
		}
	}

	return null;
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

function indexOfCase(text: string, needle: string, from: number): number {
	return text.toLowerCase().indexOf(needle.toLowerCase(), from);
}
