import { parseInlineProjection } from './inlineMathProjection';
import type { InlineMarkRanges, InlineRunStyle } from './inlineRuns';

export interface HiddenSourceRange {
	from: number;
	to: number;
}

export interface SourceVisualProjectionOptions {
	hiddenRanges?: readonly HiddenSourceRange[];
	mathMode?: 'atom' | 'source';
}

export type SourceVisualPart =
	| {
		kind: 'hidden';
		text: string;
		from: number;
		to: number;
	}
	| {
		kind: 'run';
		text: string;
		from: number;
		to: number;
		style: InlineRunStyle;
		markRanges?: InlineMarkRanges;
		linkTarget?: string;
		linkKind?: 'wikilink' | 'markdown' | 'bare-url';
	}
	| {
		kind: 'math';
		latex: string;
		from: number;
		to: number;
		visibleFrom: number;
		visibleTo: number;
	};

interface CandidatePart {
	kind: 'run' | 'math';
	from: number;
	to: number;
	text?: string;
	latex?: string;
	visibleFrom?: number;
	visibleTo?: number;
	style?: InlineRunStyle;
	markRanges?: InlineMarkRanges;
	linkTarget?: string;
	linkKind?: 'wikilink' | 'markdown' | 'bare-url';
}

/**
 * Live-preview source projection for editable leaves.
 *
 * The visible parts hide Markdown/HTML syntax, while hidden parts keep the
 * exact source bytes in DOM order. A leaf's `textContent` therefore remains a
 * valid source replacement even while the user sees rich text.
 */
export function projectSourceVisualParts(
	text: string,
	baseFrom: number,
	options: SourceVisualProjectionOptions = {},
): SourceVisualPart[] {
	const forcedHidden = normalizeHiddenRanges(options.hiddenRanges ?? [], baseFrom, baseFrom + text.length);
	const candidates = visibleCandidates(text, baseFrom, options.mathMode ?? 'atom');
	const visible = candidates.flatMap((candidate) => subtractHidden(candidate, forcedHidden, text, baseFrom));
	return mergeWithHiddenGaps(text, baseFrom, visible);
}

/**
 * Whether a native text edit changed the leaf's visual syntax structure.
 *
 * Plain text changes inside an existing run do not need a React DOM rebuild.
 * Completing/removing a delimiter, link, HTML mark or inline formula does. The
 * signature deliberately ignores absolute offsets and visible run text so
 * typing inside an already-styled run stays browser-native.
 */
export function hasSourceVisualSyntaxChange(
	beforeText: string,
	afterText: string,
	baseFrom: number,
	options: SourceVisualProjectionOptions = {},
): boolean {
	return syntaxSignature(beforeText, baseFrom, options) !== syntaxSignature(afterText, baseFrom, options);
}

function syntaxSignature(
	text: string,
	baseFrom: number,
	options: SourceVisualProjectionOptions,
): string {
	const signature: string[] = [];
	for (const part of projectSourceVisualParts(text, baseFrom, options)) {
		if (part.kind === 'hidden') {
			signature.push(`hidden:${part.text}`);
			continue;
		}
		if (part.kind === 'math') {
			signature.push('math');
			continue;
		}
		const style = styleSignature(part.style);
		if (style || part.linkTarget) {
			signature.push(`run:${style}:${part.linkKind ?? ''}:${part.linkTarget ?? ''}`);
		}
	}
	return JSON.stringify(signature);
}

function styleSignature(style: InlineRunStyle): string {
	return [
		style.bold ? 'bold' : '',
		style.italic ? 'italic' : '',
		style.underline ? 'underline' : '',
		style.strikethrough ? 'strike' : '',
		style.code ? 'code' : '',
		style.color ? `color=${style.color}` : '',
		style.highlight !== undefined ? `highlight=${style.highlight}` : '',
	].filter(Boolean).join(',');
}

function visibleCandidates(text: string, baseFrom: number, mathMode: 'atom' | 'source'): CandidatePart[] {
	const out: CandidatePart[] = [];
	for (const part of parseInlineProjection(text, baseFrom)) {
		if (part.kind === 'run') {
			out.push({
				kind: 'run',
				from: part.run.from,
				to: part.run.from + part.run.text.length,
				text: part.run.text,
				style: part.run.style,
				markRanges: part.run.markRanges,
				linkTarget: part.run.linkTarget,
				linkKind: part.run.linkKind,
			});
			continue;
		}
		if (mathMode === 'source') {
			out.push({
				kind: 'run',
				from: part.sourceFrom + 1,
				to: part.sourceTo - 1,
				text: part.latex,
				style: {},
			});
			continue;
		}
		out.push({
			kind: 'math',
			from: part.sourceFrom,
			to: part.sourceTo,
			visibleFrom: part.sourceFrom + 1,
			visibleTo: part.sourceTo - 1,
			latex: part.latex,
		});
	}
	return out;
}

function subtractHidden(
	candidate: CandidatePart,
	hiddenRanges: readonly HiddenSourceRange[],
	sourceText: string,
	baseFrom: number,
): CandidatePart[] {
	if (candidate.kind === 'math') return [candidate];
	let segments: Array<{ from: number; to: number }> = [{ from: candidate.from, to: candidate.to }];
	for (const hidden of hiddenRanges) {
		const next: Array<{ from: number; to: number }> = [];
		for (const segment of segments) {
			if (hidden.to <= segment.from || hidden.from >= segment.to) {
				next.push(segment);
				continue;
			}
			if (segment.from < hidden.from) next.push({ from: segment.from, to: hidden.from });
			if (hidden.to < segment.to) next.push({ from: hidden.to, to: segment.to });
		}
		segments = next;
	}
	return segments
		.filter((segment) => segment.from <= segment.to)
		.map((segment) => ({
			...candidate,
			from: segment.from,
			to: segment.to,
			text: sourceText.slice(segment.from - baseFrom, segment.to - baseFrom),
		}));
}

function mergeWithHiddenGaps(
	text: string,
	baseFrom: number,
	visible: readonly CandidatePart[],
): SourceVisualPart[] {
	const sourceEnd = baseFrom + text.length;
	const sorted = [...visible].sort((a, b) => a.from - b.from || a.to - b.to);
	const out: SourceVisualPart[] = [];
	let cursor = baseFrom;
	for (const part of sorted) {
		if (part.from > cursor) pushHidden(out, text, baseFrom, cursor, part.from);
		if (part.kind === 'math') {
			out.push({
				kind: 'math',
				latex: part.latex ?? '',
				from: part.from,
				to: part.to,
				visibleFrom: part.visibleFrom ?? part.from,
				visibleTo: part.visibleTo ?? part.to,
			});
		} else {
			out.push({
				kind: 'run',
				text: part.text ?? '',
				from: part.from,
				to: part.to,
				style: part.style ?? {},
				...(part.markRanges ? { markRanges: part.markRanges } : {}),
				linkTarget: part.linkTarget,
				linkKind: part.linkKind,
			});
		}
		cursor = Math.max(cursor, part.to);
	}
	if (cursor < sourceEnd) pushHidden(out, text, baseFrom, cursor, sourceEnd);
	if (out.length === 0) {
		out.push({ kind: 'run', text: '', from: baseFrom, to: baseFrom, style: {} });
	}
	return out;
}

function pushHidden(
	out: SourceVisualPart[],
	text: string,
	baseFrom: number,
	from: number,
	to: number,
): void {
	if (to <= from) return;
	out.push({
		kind: 'hidden',
		text: text.slice(from - baseFrom, to - baseFrom),
		from,
		to,
	});
}

function normalizeHiddenRanges(
	ranges: readonly HiddenSourceRange[],
	from: number,
	to: number,
): HiddenSourceRange[] {
	return ranges
		.map((range) => ({ from: Math.max(from, range.from), to: Math.min(to, range.to) }))
		.filter((range) => range.from < range.to)
		.sort((a, b) => a.from - b.from || a.to - b.to)
		.reduce<HiddenSourceRange[]>((acc, range) => {
			const last = acc[acc.length - 1];
			if (!last || range.from > last.to) {
				acc.push(range);
				return acc;
			}
			last.to = Math.max(last.to, range.to);
			return acc;
		}, []);
}
