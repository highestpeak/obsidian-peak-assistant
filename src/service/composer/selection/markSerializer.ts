/**
 * Peak Composer — mark-aware selection formatting serializer (WP4).
 *
 * Turns a frozen {@link ComposerSelection} into atomic source
 * {@link ComposerOperation}s that apply one inline mark across the selection.
 *
 * Hard rules (handoff §7.3 / §7.4, WP0 S2 gate):
 *   1. One patch per semantic inline unit — a cross-paragraph / cross-block /
 *      cross-item / cross-cell selection produces N `replaceRange` ops, one
 *      inside each unit's range. A structural node (`p`/`li`/`tr`/`td`) is NEVER
 *      wrapped in a single HTML wrapper.
 *   2. Mark-aware: an already-wrapped slice toggles OFF; whitespace-only slices
 *      are skipped; an adjacent identical mark is absorbed so we never emit an
 *      empty or doubled `****` / unpaired delimiter.
 *   3. All ops ride one transaction (the hub commits them atomically); if the
 *      selection touches a Code Block, rich formatting is refused whole (§7.4).
 *   4. Offsets stay strictly inside each unit's slice, so no patch swallows the
 *      inter-block / inter-cell separator (WP1/WP2 patch contract).
 */

import type {
	ComposerInlineMark,
	ComposerOperation,
	ComposerSelection,
	ComposerSelectionUnit,
	SelectionOpResult,
} from '@/core/composer';
import {
	openDelimiter,
	resolveFormattingSyntax,
	type FormattingSyntaxMap,
	type MarkSyntax,
} from './formattingSyntax';
import {
	visibleSelectionSegments,
	wrapVisibleSegments,
	type VisibleSelectionSegment,
} from './visibleSegments';

export interface ApplyMarkOptions {
	/** Swatch value for color / highlight marks (e.g. `#b42318`). Ignored otherwise. */
	value?: string;
	/** Override the domain syntax map (integration seam; tests use the default). */
	syntax?: Partial<FormattingSyntaxMap>;
	/** Human label for the resulting transaction (History / Undo). */
	label?: string;
}

/** A single unit's computed replacement, or `null` when the slice is skipped. */
interface UnitPatch {
	from: number;
	to: number;
	text: string;
}

/**
 * Apply `mark` across every unit of `selection`, returning atomic operations or
 * a typed refusal. Deterministic and pure — no DOM, no I/O.
 */
export function applyMarkToSelection(
	selection: ComposerSelection,
	mark: ComposerInlineMark,
	options: ApplyMarkOptions = {},
): SelectionOpResult {
	if (selection.collapsed || selection.units.length === 0) {
		return { ok: false, reason: 'empty-selection', message: 'Nothing selected.' };
	}
	// §7.4: a Code Block suppresses all rich formatting.
	if (selection.units.some((u) => u.blockKind === 'code')) {
		return {
			ok: false,
			reason: 'code-block-rich-format',
			message: 'Rich formatting is disabled inside a code block.',
		};
	}

	const map = resolveFormattingSyntax(options.syntax);
	const syntax = map[mark];
	const open = openDelimiter(syntax, options.value);

	const operations: ComposerOperation[] = [];
	for (const unit of selection.units) {
		const patch = wrapUnit(selection.sourceText, unit, mark, syntax, open, options.value);
		if (patch) operations.push({ kind: 'replaceRange', from: patch.from, to: patch.to, text: patch.text });
	}
	if (operations.length === 0) {
		return { ok: false, reason: 'empty-selection', message: 'Nothing formattable in the selection.' };
	}
	return { ok: true, operations, label: options.label ?? mark };
}

/**
 * Remove one parser-identified outer mark wrapper without touching nested source.
 *
 * The inline interaction layer calls this only with a range emitted by the
 * rich-text parser. That range includes the original delimiters, which lets
 * color/highlight values and Obsidian's `==highlight==` form round-trip exactly.
 */
export function removeInlineMarkWrapper(
	source: string,
	mark: ComposerInlineMark,
	range: { from: number; to: number },
): ComposerOperation | null {
	const wrapped = source.slice(range.from, range.to);
	const bounds = wrapperBounds(wrapped, mark);
	if (!bounds) return null;
	return {
		kind: 'replaceRange',
		from: range.from,
		to: range.to,
		text: wrapped.slice(bounds.open, wrapped.length - bounds.close),
	};
}

function wrapperBounds(text: string, mark: ComposerInlineMark): { open: number; close: number } | null {
	if (mark === 'bold') return text.startsWith('**') && text.endsWith('**') ? { open: 2, close: 2 } : null;
	if (mark === 'italic') return (
		(text.startsWith('*') && text.endsWith('*')) || (text.startsWith('_') && text.endsWith('_'))
	) ? { open: 1, close: 1 } : null;
	if (mark === 'strikethrough') return text.startsWith('~~') && text.endsWith('~~') ? { open: 2, close: 2 } : null;
	if (mark === 'underline') return /^<u>/i.test(text) && /<\/u>$/i.test(text) ? { open: 3, close: 4 } : null;
	if (mark === 'text-color') {
		const open = /^<span\s+style="[^"]*\bcolor\s*:[^"]*"\s*>/i.exec(text)?.[0];
		return open && /<\/span>$/i.test(text) ? { open: open.length, close: 7 } : null;
	}
	if (text.startsWith('==') && text.endsWith('==')) return { open: 2, close: 2 };
	const open = /^<mark(?:\s+style="[^"]*")?\s*>/i.exec(text)?.[0];
	return open && /<\/mark>$/i.test(text) ? { open: open.length, close: 7 } : null;
}

/**
 * Compute one unit's replacement. Returns `null` for a whitespace-only slice
 * (so we never write an empty `****`). Handles toggle-off, whitespace-outside
 * placement, and adjacent same-mark absorption.
 */
function wrapUnit(
	source: string,
	unit: ComposerSelectionUnit,
	mark: ComposerInlineMark,
	syntax: MarkSyntax,
	open: string,
	value?: string,
): UnitPatch | null {
	const { from, to } = unit;
	const inner = source.slice(from, to);
	if (!inner.trim()) return null;

	const close = syntax.close;
	// Toggle OFF: the slice is already exactly this mark → strip the delimiters.
	// (Uses the resolved `open`, so a color span with a value round-trips.)
	if (
		inner.length >= open.length + close.length &&
		inner.startsWith(open) &&
		inner.endsWith(close)
	) {
		return { from, to, text: inner.slice(open.length, inner.length - close.length) };
	}

	// Keep leading/trailing whitespace OUTSIDE the wrap.
	const lead = inner.length - inner.trimStart().length;
	const trail = inner.length - inner.trimEnd().length;
	let repFrom = from + lead;
	let repTo = to - trail;
	const segments = visibleSelectionSegments(source, {
		...unit,
		from: repFrom,
		to: repTo,
	});
	const applicable = segments.filter((segment) => !alreadyHasMark(segment, mark, value));
	if (applicable.length === 0) return null;

	// Keep the compact legacy form for a single plain interval. Apart from
	// preserving clean source, this retains adjacent-mark absorption.
	if (isSinglePlainInterval(applicable, repFrom, repTo)) {
		const core = source.slice(repFrom, repTo);
		let prefix = open;
		let suffix = close;
		if (source.slice(repFrom - close.length, repFrom) === close) {
			repFrom -= close.length;
			prefix = '';
		}
		if (source.slice(repTo, repTo + open.length) === open) {
			repTo += open.length;
			suffix = '';
		}
		return { from: repFrom, to: repTo, text: prefix + core + suffix };
	}

	return {
		from: repFrom,
		to: repTo,
		text: wrapVisibleSegments(source, repFrom, repTo, applicable, open, close),
	};
}

function isSinglePlainInterval(
	segments: readonly VisibleSelectionSegment[],
	from: number,
	to: number,
): boolean {
	if (segments.length !== 1) return false;
	const [segment] = segments;
	return segment.from === from &&
		segment.to === to &&
		Object.keys(segment.style).length === 0 &&
		!segment.linkTarget;
}

function alreadyHasMark(
	segment: VisibleSelectionSegment,
	mark: ComposerInlineMark,
	value?: string,
): boolean {
	if (mark === 'bold') return Boolean(segment.style.bold);
	if (mark === 'italic') return Boolean(segment.style.italic);
	if (mark === 'underline') return Boolean(segment.style.underline);
	if (mark === 'strikethrough') return Boolean(segment.style.strikethrough);
	if (mark === 'text-color') return segment.style.color !== undefined && segment.style.color === value;
	return segment.style.highlight !== undefined && segment.style.highlight === (value ?? '');
}
