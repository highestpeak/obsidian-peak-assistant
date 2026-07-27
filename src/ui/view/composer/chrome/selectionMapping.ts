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

/** Map a DOM Range within the composer root to source offsets, or null. */
export function mapDomRangeToSource(root: HTMLElement, range: Range): MappedRange | null {
	const start = mapPoint(root, range.startContainer, range.startOffset);
	const end = mapPoint(root, range.endContainer, range.endOffset);
	if (start === null || end === null) return null;
	return { from: Math.min(start, end), to: Math.max(start, end) };
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
