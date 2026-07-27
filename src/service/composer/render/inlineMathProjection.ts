import { parseInlineRuns, type InlineRun } from './inlineRuns';

/**
 * Read-only / blurred projection for single-dollar inline math.
 *
 * This deliberately sits *after* `parseInlineRuns`: code runs are already
 * marked literal there, so a `$…$` sequence inside backticks can never become
 * a formula. The result remains source-aware: normal pieces retain their
 * normal `InlineRun` mapping, while a formula atom records the full source
 * interval that it replaces. Formula atoms must not participate in generic
 * text selection/direct-edit mapping; focus swaps the complete leaf back to
 * its verbatim source before any edit happens.
 */
export type InlineProjectionPart =
	| { kind: 'run'; run: InlineRun }
	| {
		kind: 'math';
		/** LaTeX inside the dollar delimiters, exactly as authored. */
		latex: string;
		/** Absolute source interval of `$latex$`, end-exclusive. */
		sourceFrom: number;
		sourceTo: number;
	};

/**
 * Replace only well-formed, unescaped `$…$` spans with math atoms.
 *
 * Double-dollar display math, escaped delimiters, blank/newline spans and
 * unbalanced delimiters remain ordinary verbatim text. This is intentionally
 * conservative: rendering a literal dollar as text is always safer than
 * hiding source that cannot round-trip through a focused editable leaf.
 */
export function projectInlineMath(runs: readonly InlineRun[]): InlineProjectionPart[] {
	const parts: InlineProjectionPart[] = [];
	for (const run of runs) {
		if (run.style.code) {
			parts.push({ kind: 'run', run });
			continue;
		}
		projectRun(run, parts);
	}
	return parts;
}

/**
 * Parse a complete editable leaf with inline math taking precedence over rich
 * marks. Scanning source first is important: LaTeX itself commonly contains
 * `_`, `^` and backslashes, none of which are Markdown emphasis inside a math
 * delimiter. Each non-math source interval then uses the normal rich-run
 * parser, preserving its existing offset and style contracts.
 */
export function parseInlineProjection(text: string, baseFrom: number): InlineProjectionPart[] {
	const intervals = findInlineMathIntervals(text);
	if (intervals.length === 0) return projectInlineMath(parseInlineRuns(text, baseFrom));

	const parts: InlineProjectionPart[] = [];
	let cursor = 0;
	for (const interval of intervals) {
		if (cursor < interval.from) parts.push(...projectInlineMath(parseInlineRuns(text.slice(cursor, interval.from), baseFrom + cursor)));
		parts.push({
			kind: 'math',
			latex: text.slice(interval.from + 1, interval.to - 1),
			sourceFrom: baseFrom + interval.from,
			sourceTo: baseFrom + interval.to,
		});
		cursor = interval.to;
	}
	if (cursor < text.length) parts.push(...projectInlineMath(parseInlineRuns(text.slice(cursor), baseFrom + cursor)));
	return parts;
}

function projectRun(run: InlineRun, out: InlineProjectionPart[]): void {
	const text = run.text;
	let cursor = 0;
	let plainStart = 0;
	while (cursor < text.length) {
		if (!isSingleDollar(text, cursor)) {
			cursor += 1;
			continue;
		}
		const close = findClosingDollar(text, cursor + 1);
		if (close < 0) {
			cursor += 1;
			continue;
		}
		pushPlain(run, plainStart, cursor, out);
		out.push({
			kind: 'math',
			latex: text.slice(cursor + 1, close),
			sourceFrom: run.from + cursor,
			sourceTo: run.from + close + 1,
		});
		cursor = close + 1;
		plainStart = cursor;
	}
	pushPlain(run, plainStart, text.length, out);
}

interface MathInterval { from: number; to: number }

function findInlineMathIntervals(text: string): MathInterval[] {
	const intervals: MathInterval[] = [];
	for (let cursor = 0; cursor < text.length; cursor += 1) {
		if (text[cursor] === '`' && !isEscaped(text, cursor)) {
			const codeEnd = findClosingBacktick(text, cursor + 1);
			if (codeEnd >= 0) {
				cursor = codeEnd;
				continue;
			}
		}
		if (!isSingleDollar(text, cursor)) continue;
		const close = findClosingDollar(text, cursor + 1);
		if (close < 0) continue;
		intervals.push({ from: cursor, to: close + 1 });
		cursor = close;
	}
	return intervals;
}

function pushPlain(run: InlineRun, from: number, to: number, out: InlineProjectionPart[]): void {
	if (to <= from) return;
	out.push({
		kind: 'run',
		run: { ...run, text: run.text.slice(from, to), from: run.from + from },
	});
}

function findClosingDollar(text: string, from: number): number {
	for (let index = from; index < text.length; index += 1) {
		if (text[index] === '\n') return -1;
		// Never let a malformed opener consume a display-math or inline-code
		// boundary further along the leaf. Treat it as literal and let the outer
		// scanner continue from the later construct instead.
		if (text[index] === '$' && (text[index - 1] === '$' || text[index + 1] === '$')) return -1;
		if (text[index] === '`' && !isEscaped(text, index)) return -1;
		if (!isSingleDollar(text, index)) continue;
		// Empty `$ $` / `$$` forms are not inline formulas. Whitespace inside is
		// allowed (for example `$E = mc^2$`) but the span cannot be blank.
		if (text.slice(from, index).trim().length === 0) return -1;
		return index;
	}
	return -1;
}

function findClosingBacktick(text: string, from: number): number {
	for (let index = from; index < text.length; index += 1) {
		if (text[index] === '`' && !isEscaped(text, index)) return index;
	}
	return -1;
}

function isSingleDollar(text: string, index: number): boolean {
	if (text[index] !== '$' || isEscaped(text, index)) return false;
	return text[index - 1] !== '$' && text[index + 1] !== '$';
}

function isEscaped(text: string, index: number): boolean {
	let backslashes = 0;
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) backslashes += 1;
	return backslashes % 2 === 1;
}
