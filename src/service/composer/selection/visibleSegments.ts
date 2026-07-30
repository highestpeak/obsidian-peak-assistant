import type { ComposerSelectionUnit } from '@/core/composer';
import {
	parseInlineRuns,
	type InlineMarkRanges,
	type InlineRunStyle,
} from '../render/inlineRuns';

export interface VisibleSelectionSegment {
	from: number;
	to: number;
	style: InlineRunStyle;
	markRanges?: InlineMarkRanges;
	linkTarget?: string;
	linkKind?: 'wikilink' | 'markdown' | 'bare-url' | 'html';
	linkRange?: { from: number; to: number };
}

/**
 * Return only visible source intervals touched by a selection.
 *
 * Known Markdown / HTML delimiters sit in the gaps between these segments.
 * Formatting each visible interval independently therefore cannot create a
 * crossing pair such as `<mark new>…</mark old>…</mark new>`.
 */
export function visibleSelectionSegments(
	source: string,
	unit: ComposerSelectionUnit,
): VisibleSelectionSegment[] {
	const content = source.slice(unit.contentFrom, unit.contentTo);
	const runs = parseInlineRuns(content, unit.contentFrom);
	const segments: VisibleSelectionSegment[] = [];
	for (const run of runs) {
		const from = Math.max(unit.from, run.from);
		const to = Math.min(unit.to, run.from + run.text.length);
		if (from >= to) continue;
		const selected = source.slice(from, to);
		const lead = selected.length - selected.trimStart().length;
		const trail = selected.length - selected.trimEnd().length;
		const visibleFrom = from + lead;
		const visibleTo = to - trail;
		if (visibleFrom >= visibleTo) continue;
		segments.push({
			from: visibleFrom,
			to: visibleTo,
			style: run.style,
			markRanges: run.markRanges,
			linkTarget: run.linkTarget,
			linkKind: run.linkKind,
			linkRange: run.linkRange,
		});
	}
	return segments;
}

/** Insert the same wrapper around non-overlapping visible intervals in one patch. */
export function wrapVisibleSegments(
	source: string,
	from: number,
	to: number,
	segments: readonly Pick<VisibleSelectionSegment, 'from' | 'to'>[],
	open: string,
	close: string,
): string {
	let text = source.slice(from, to);
	const ordered = [...segments].sort((a, b) => b.from - a.from || b.to - a.to);
	for (const segment of ordered) {
		const relativeFrom = segment.from - from;
		const relativeTo = segment.to - from;
		text =
			text.slice(0, relativeFrom) +
			open +
			text.slice(relativeFrom, relativeTo) +
			close +
			text.slice(relativeTo);
	}
	return text;
}
