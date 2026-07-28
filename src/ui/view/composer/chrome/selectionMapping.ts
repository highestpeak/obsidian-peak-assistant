/**
 * Peak Composer — DOM selection → source offset mapping (WP4, S2 决议).
 *
 * Every rendered text run carries `data-src-text-from` (the absolute source
 * offset of its first character) — set by the editable leaves and the read-only
 * kind views. A DOM point (node, offset) maps to a source offset by finding the
 * nearest ancestor-or-self run span and adding the in-run text offset. No
 * WeakMap, no live registry: the attributes ARE the mapping (S2 decision).
 */

export interface MappedRange {
	from: number;
	to: number;
}

export interface MappedSelection extends MappedRange {
	anchor: number;
	focus: number;
	direction: 'forward' | 'backward' | 'collapsed';
}

/** Map a DOM Range within the composer root to source offsets, or null. */
export function mapDomRangeToSource(root: HTMLElement, range: Range): MappedRange | null {
	const start = mapPoint(root, range.startContainer, range.startOffset);
	const end = mapPoint(root, range.endContainer, range.endOffset);
	if (start === null || end === null) return null;
	return { from: Math.min(start, end), to: Math.max(start, end) };
}

/** Map a real DOM Selection and retain anchor/focus direction. */
export function mapDomSelectionToSource(root: HTMLElement, selection: Selection): MappedSelection | null {
	if (selection.rangeCount === 0) return null;
	const range = mapDomRangeToSource(root, selection.getRangeAt(0));
	if (!range) return null;
	if (!selection.anchorNode || !selection.focusNode) return null;
	const anchor = mapPoint(root, selection.anchorNode, selection.anchorOffset);
	const focus = mapPoint(root, selection.focusNode, selection.focusOffset);
	if (anchor === null || focus === null) return null;
	const direction = anchor === focus ? 'collapsed' : anchor < focus ? 'forward' : 'backward';
	return { ...range, anchor, focus, direction };
}

/**
 * Restore a previously mapped source selection after React has replaced the
 * editable leaf's visual runs. Markdown / HTML delimiters have no visible run,
 * so a point inside one snaps to the nearest visible source boundary.
 */
export function restoreDomSelectionFromSource(
	root: HTMLElement,
	mapped: Pick<MappedSelection, 'anchor' | 'focus'>,
): boolean {
	const anchor = domPointForSource(root, mapped.anchor);
	const focus = domPointForSource(root, mapped.focus);
	if (!anchor || !focus) return false;
	const selection = root.ownerDocument.getSelection();
	if (!selection) return false;
	selection.removeAllRanges();
	if (typeof selection.setBaseAndExtent === 'function') {
		selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
		return true;
	}
	const range = root.ownerDocument.createRange();
	const anchorBeforeFocus = mapped.anchor <= mapped.focus;
	const start = anchorBeforeFocus ? anchor : focus;
	const end = anchorBeforeFocus ? focus : anchor;
	range.setStart(start.node, start.offset);
	range.setEnd(end.node, end.offset);
	selection.addRange(range);
	return true;
}

/** Resolve a source-coordinate range without mutating the user's live selection. */
export function domRangeForSource(root: HTMLElement, mapped: MappedRange): Range | null {
	const start = domPointForSource(root, Math.min(mapped.from, mapped.to));
	const end = domPointForSource(root, Math.max(mapped.from, mapped.to));
	if (!start || !end) return null;
	const range = root.ownerDocument.createRange();
	try {
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
		return range;
	} catch {
		return null;
	}
}

function mapPoint(root: HTMLElement, node: Node, offset: number): number | null {
	const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
	// A blurred `$…$` span is a visual KaTeX atom, not a compressed text run.
	// Mapping its MathML text back through a generic selection command would
	// produce invented offsets, so selection/direct-edit deliberately declines
	// it. A click focuses the owning leaf and restores the exact source first.
	if (el?.closest('[data-inline-math-atom]')) return null;
	const run = el?.closest<HTMLElement>('[data-src-text-from]');
	if (!run || !root.contains(run)) return null;
	const base = Number(run.dataset.srcTextFrom);
	if (!Number.isFinite(base)) return null;
	if (node.nodeType !== Node.TEXT_NODE) {
		// Element point: resolve to the start of the child at `offset` (or run end).
		return base + textOffsetOfChild(run, node as Element, offset);
	}
	// Text point: sum preceding text within the run + the in-node offset.
	let acc = 0;
	const walker = run.ownerDocument.createTreeWalker(run, NodeFilter.SHOW_TEXT);
	let current = walker.nextNode();
	while (current) {
		if (current === node) return base + acc + offset;
		acc += (current.textContent ?? '').length;
		current = walker.nextNode();
	}
	return base + acc;
}

interface DomPoint {
	node: Node;
	offset: number;
}

function domPointForSource(root: HTMLElement, sourceOffset: number): DomPoint | null {
	const runs = Array.from(root.querySelectorAll<HTMLElement>('[data-src-text-from]'))
		.filter((run) => !run.closest('[data-inline-math-atom]'))
		.map((run) => {
			const from = Number(run.dataset.srcTextFrom);
			return { run, from, to: from + (run.textContent ?? '').length };
		})
		.filter((entry) => Number.isFinite(entry.from));
	if (runs.length === 0) return pointAtTextOffset(root, Math.max(0, sourceOffset - Number(root.dataset.srcTextFrom ?? 0)));

	// At a run boundary, prefer the run that STARTS at the requested offset.
	// This keeps a caret after a hidden closing delimiter before the following
	// visible text rather than inside the previous styled run.
	const starting = runs.find((entry) => entry.from === sourceOffset);
	if (starting) return pointAtTextOffset(starting.run, 0);
	const containing = runs.find((entry) => entry.from < sourceOffset && sourceOffset <= entry.to);
	if (containing) return pointAtTextOffset(containing.run, sourceOffset - containing.from);

	let nearest = runs[0];
	let nearestOffset = sourceOffset <= nearest.from ? 0 : nearest.to - nearest.from;
	let nearestDistance = Math.min(Math.abs(sourceOffset - nearest.from), Math.abs(sourceOffset - nearest.to));
	for (const entry of runs.slice(1)) {
		const startDistance = Math.abs(sourceOffset - entry.from);
		const endDistance = Math.abs(sourceOffset - entry.to);
		const distance = Math.min(startDistance, endDistance);
		if (distance >= nearestDistance) continue;
		nearest = entry;
		nearestDistance = distance;
		nearestOffset = startDistance <= endDistance ? 0 : entry.to - entry.from;
	}
	return pointAtTextOffset(nearest.run, nearestOffset);
}

function pointAtTextOffset(root: HTMLElement, requestedOffset: number): DomPoint {
	const offset = Math.max(0, requestedOffset);
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let consumed = 0;
	let last: Node | null = null;
	let current = walker.nextNode();
	while (current) {
		last = current;
		const length = (current.textContent ?? '').length;
		if (offset <= consumed + length) return { node: current, offset: offset - consumed };
		consumed += length;
		current = walker.nextNode();
	}
	if (last) return { node: last, offset: (last.textContent ?? '').length };
	return { node: root, offset: 0 };
}

function textOffsetOfChild(run: HTMLElement, el: Element, childOffset: number): number {
	let acc = 0;
	const target = el.childNodes[childOffset] ?? null;
	const walker = run.ownerDocument.createTreeWalker(run, NodeFilter.SHOW_TEXT);
	let current = walker.nextNode();
	while (current) {
		if (target && (current === target || target.contains(current))) return acc;
		acc += (current.textContent ?? '').length;
		current = walker.nextNode();
	}
	return acc;
}
