import type {
	ComposerInlineMark,
	ComposerSelectionUnit,
	SelectionGuardReason,
} from '@/core/composer';
import { parseInlineProjection } from '../render/inlineMathProjection';
import {
	parseInlineRuns,
	parseInlineStyleDeclaration,
	type InlineRun,
	type InlineRunStyle,
} from '../render/inlineRuns';
import {
	CANONICAL_HTML_STYLE_SYNTAX,
	HTML_MARKS,
} from './formattingSyntax';
import type { VisibleSelectionSegment } from './visibleSegments';

export interface CanonicalInlinePatch {
	from: number;
	to: number;
	text: string;
}

export type CanonicalInlineResult =
	| { ok: true; patch: CanonicalInlinePatch }
	| { ok: false; reason: SelectionGuardReason };

type CanonicalMutation =
	| { kind: 'mark'; mark: ComposerInlineMark; value?: string }
	| { kind: 'external-link'; href: string };

interface SourceInterval {
	from: number;
	to: number;
}

interface CanonicalLeaf {
	text: string;
	style: InlineRunStyle;
	href?: string;
}

/**
 * Markdown remains the compact source form until an HTML-backed style appears.
 * Once a selected style stack is in the HTML domain, every overlapping visual
 * mark is serialized together as canonical HTML so operation order cannot
 * produce Markdown delimiters inside raw HTML.
 */
export function shouldCanonicalizeMarkAsHtml(
	source: string,
	mark: ComposerInlineMark,
	segments: readonly VisibleSelectionSegment[],
): boolean {
	if (HTML_MARKS.has(mark)) return true;
	return segments.some((segment) =>
		hasHtmlBackedStyle(segment.style) ||
		hasHtmlWrapper(source, segment) ||
		segment.linkKind === 'html',
	);
}

export function shouldCanonicalizeLinkAsHtml(
	source: string,
	segments: readonly VisibleSelectionSegment[],
): boolean {
	return segments.some((segment) =>
		hasHtmlBackedStyle(segment.style) ||
		hasHtmlWrapper(source, segment) ||
		segment.linkKind === 'html',
	);
}

export function canonicalizeMarkSelection(
	source: string,
	unit: ComposerSelectionUnit,
	segments: readonly VisibleSelectionSegment[],
	mark: ComposerInlineMark,
	value?: string,
): CanonicalInlineResult {
	return canonicalizeSelection(
		source,
		unit,
		segments.map(({ from, to }) => ({ from, to })),
		{ kind: 'mark', mark, value },
	);
}

export function canonicalizeExternalLinkSelection(
	source: string,
	unit: ComposerSelectionUnit,
	segments: readonly VisibleSelectionSegment[],
	href: string,
): CanonicalInlineResult {
	return canonicalizeSelection(
		source,
		unit,
		segments.map(({ from, to }) => ({ from, to })),
		{ kind: 'external-link', href },
	);
}

/** Deterministic style declaration order used by source, tests and docs. */
export function canonicalInlineStyle(style: InlineRunStyle): string {
	const declarations: string[] = [];
	const syntax = CANONICAL_HTML_STYLE_SYNTAX;
	if (style.bold) declarations.push(`${syntax.bold.property}: ${syntax.bold.value}`);
	if (style.italic) declarations.push(`${syntax.italic.property}: ${syntax.italic.value}`);
	const decorations = [
		style.underline ? 'underline' : '',
		style.strikethrough ? 'line-through' : '',
	].filter(Boolean);
	if (decorations.length > 0) {
		declarations.push(`${syntax.decoration}: ${decorations.join(' ')}`);
	}
	if (style.color !== undefined) declarations.push(`${syntax.color}: ${style.color}`);
	if (style.highlight !== undefined) {
		declarations.push(
			`${syntax.highlight}: ${style.highlight || syntax.defaultHighlight}`,
		);
	}
	return declarations.join('; ');
}

export function removeMarkFromCanonicalHtmlWrapper(
	text: string,
	mark: ComposerInlineMark,
): string | null {
	const span = /^<span\s+style="([^"]*)"\s*>([\s\S]*)<\/span>$/i.exec(text);
	if (!span) return null;
	const style = parseInlineStyleDeclaration(span[1]);
	if (!styleHasMark(style, mark)) return null;
	const declaration = removeMarkDeclaration(span[1], mark);
	return declaration
		? `<span style="${escapeHtmlAttribute(declaration)}">${span[2]}</span>`
		: span[2];
}

function canonicalizeSelection(
	source: string,
	unit: ComposerSelectionUnit,
	intervals: readonly SourceInterval[],
	mutation: CanonicalMutation,
): CanonicalInlineResult {
	if (intervals.length === 0) {
		return { ok: false, reason: 'empty-selection' };
	}
	const content = source.slice(unit.contentFrom, unit.contentTo);
	const runs = parseInlineRuns(content, unit.contentFrom);
	const cluster = expandFormattingCluster(runs, intervals);
	if (crossesUnsupportedSemanticBoundary(source, content, unit.contentFrom, runs, cluster)) {
		return { ok: false, reason: 'semantic-inline-html-format' };
	}
	const leaves = buildLeaves(source, runs, cluster, intervals, mutation);
	if (leaves.length === 0 || leaves.some((leaf) => !safeForHtml(leaf))) {
		return { ok: false, reason: 'semantic-inline-html-format' };
	}
	return {
		ok: true,
		patch: {
			from: cluster.from,
			to: cluster.to,
			text: mergeLeaves(leaves).map(serializeLeaf).join(''),
		},
	};
}

function expandFormattingCluster(
	runs: readonly InlineRun[],
	intervals: readonly SourceInterval[],
): SourceInterval {
	const cluster = {
		from: Math.min(...intervals.map((interval) => interval.from)),
		to: Math.max(...intervals.map((interval) => interval.to)),
	};
	let changed = true;
	while (changed) {
		changed = false;
		for (const run of runs) {
			const visible = { from: run.from, to: run.from + run.text.length };
			if (!overlaps(visible, cluster)) continue;
			for (const range of Object.values(run.markRanges ?? {})) {
				if (!range) continue;
				if (range.from < cluster.from) {
					cluster.from = range.from;
					changed = true;
				}
				if (range.to > cluster.to) {
					cluster.to = range.to;
					changed = true;
				}
			}
			if (run.linkRange) {
				if (run.linkRange.from < cluster.from) {
					cluster.from = run.linkRange.from;
					changed = true;
				}
				if (run.linkRange.to > cluster.to) {
					cluster.to = run.linkRange.to;
					changed = true;
				}
			}
		}
	}
	return cluster;
}

function crossesUnsupportedSemanticBoundary(
	source: string,
	content: string,
	contentFrom: number,
	runs: readonly InlineRun[],
	cluster: SourceInterval,
): boolean {
	const math = parseInlineProjection(content, contentFrom)
		.some((part) =>
			part.kind === 'math' &&
			overlaps({ from: part.sourceFrom, to: part.sourceTo }, cluster),
		);
	if (math) return true;
	for (const run of runs) {
		const visible = { from: run.from, to: run.from + run.text.length };
		if (!overlaps(visible, cluster)) continue;
		if (run.style.code || run.linkKind === 'wikilink') return true;
		if (run.linkKind === 'markdown' && run.linkRange) {
			const raw = source.slice(run.linkRange.from, run.linkRange.to);
			if (raw !== `[${run.text}](${run.linkTarget})`) return true;
		}
	}
	return false;
}

function buildLeaves(
	source: string,
	runs: readonly InlineRun[],
	cluster: SourceInterval,
	intervals: readonly SourceInterval[],
	mutation: CanonicalMutation,
): CanonicalLeaf[] {
	const leaves: CanonicalLeaf[] = [];
	for (const run of runs) {
		const visibleFrom = Math.max(run.from, cluster.from);
		const visibleTo = Math.min(run.from + run.text.length, cluster.to);
		if (visibleFrom >= visibleTo) continue;
		const cuts = new Set([visibleFrom, visibleTo]);
		for (const interval of intervals) {
			if (!overlaps({ from: visibleFrom, to: visibleTo }, interval)) continue;
			cuts.add(Math.max(visibleFrom, interval.from));
			cuts.add(Math.min(visibleTo, interval.to));
		}
		const ordered = [...cuts].sort((a, b) => a - b);
		for (let index = 0; index < ordered.length - 1; index += 1) {
			const from = ordered[index];
			const to = ordered[index + 1];
			if (from >= to) continue;
			const selected = intervals.some((interval) =>
				from >= interval.from && to <= interval.to,
			);
			const style = selected && mutation.kind === 'mark'
				? applyMark(run.style, mutation.mark, mutation.value)
				: run.style;
			const href = selected && mutation.kind === 'external-link'
				? mutation.href
				: run.linkTarget;
			leaves.push({
				text: source.slice(from, to),
				style,
				...(href ? { href } : {}),
			});
		}
	}
	return leaves;
}

function applyMark(
	style: InlineRunStyle,
	mark: ComposerInlineMark,
	value?: string,
): InlineRunStyle {
	const next = { ...style };
	if (mark === 'bold') next.bold = true;
	if (mark === 'italic') next.italic = true;
	if (mark === 'underline') next.underline = true;
	if (mark === 'strikethrough') next.strikethrough = true;
	if (mark === 'text-color') next.color = value ?? '';
	if (mark === 'highlight') next.highlight = value ?? '';
	return next;
}

function mergeLeaves(leaves: readonly CanonicalLeaf[]): CanonicalLeaf[] {
	const merged: CanonicalLeaf[] = [];
	for (const leaf of leaves) {
		const previous = merged[merged.length - 1];
		if (
			previous &&
			previous.href === leaf.href &&
			canonicalInlineStyle(previous.style) === canonicalInlineStyle(leaf.style)
		) {
			previous.text += leaf.text;
			continue;
		}
		merged.push({ ...leaf, style: { ...leaf.style } });
	}
	return merged;
}

function serializeLeaf(leaf: CanonicalLeaf): string {
	const style = canonicalInlineStyle(leaf.style);
	const styleAttribute = style ? ` style="${escapeHtmlAttribute(style)}"` : '';
	if (leaf.href) {
		return `<a href="${escapeHtmlAttribute(leaf.href)}"${styleAttribute}>${leaf.text}</a>`;
	}
	if (style) return `<span${styleAttribute}>${leaf.text}</span>`;
	return leaf.text;
}

function hasHtmlBackedStyle(style: InlineRunStyle): boolean {
	return Boolean(
		style.underline ||
		style.color !== undefined ||
		style.highlight !== undefined,
	);
}

function styleHasMark(
	style: InlineRunStyle,
	mark: ComposerInlineMark,
): boolean {
	if (mark === 'bold') return Boolean(style.bold);
	if (mark === 'italic') return Boolean(style.italic);
	if (mark === 'underline') return Boolean(style.underline);
	if (mark === 'strikethrough') return Boolean(style.strikethrough);
	if (mark === 'text-color') return style.color !== undefined;
	return style.highlight !== undefined;
}

function hasHtmlWrapper(
	source: string,
	segment: VisibleSelectionSegment,
): boolean {
	if (segment.linkKind === 'html') return true;
	return Object.values(segment.markRanges ?? {}).some((range) =>
		Boolean(range && source.slice(range.from, range.from + 1) === '<'),
	);
}

function safeForHtml(leaf: CanonicalLeaf): boolean {
	if (leaf.text.includes('<')) return false;
	if (/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(leaf.text)) return false;
	if (leaf.style.color !== undefined && !safeCssValue(leaf.style.color)) return false;
	if (leaf.style.highlight !== undefined && !safeCssValue(leaf.style.highlight)) return false;
	return true;
}

function removeMarkDeclaration(
	styleText: string,
	mark: ComposerInlineMark,
): string {
	const declarations: string[] = [];
	for (const rawDeclaration of styleText.split(';')) {
		const [rawName, ...rawValue] = rawDeclaration.split(':');
		const name = rawName?.trim();
		const value = rawValue.join(':').trim();
		if (!name || !value) continue;
		const normalizedName = name.toLowerCase();
		if (propertyOwnsMark(normalizedName, mark)) continue;
		if (
			(mark === 'underline' || mark === 'strikethrough') &&
			(normalizedName === 'text-decoration' || normalizedName === 'text-decoration-line')
		) {
			const target = mark === 'underline' ? 'underline' : 'line-through';
			const remaining = value
				.split(/\s+/)
				.filter((token) => token.toLowerCase() !== target);
			if (remaining.length > 0) declarations.push(`${name}: ${remaining.join(' ')}`);
			continue;
		}
		declarations.push(`${name}: ${value}`);
	}
	return declarations.join('; ');
}

function propertyOwnsMark(
	property: string,
	mark: ComposerInlineMark,
): boolean {
	if (mark === 'bold') return property === 'font-weight';
	if (mark === 'italic') return property === 'font-style';
	if (mark === 'text-color') return property === 'color';
	if (mark === 'highlight') {
		return property === 'background' || property === 'background-color';
	}
	return false;
}

function safeCssValue(value: string): boolean {
	if (value === '') return true;
	return !/[;"'<>]/.test(value);
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function overlaps(left: SourceInterval, right: SourceInterval): boolean {
	return left.from < right.to && right.from < left.to;
}
