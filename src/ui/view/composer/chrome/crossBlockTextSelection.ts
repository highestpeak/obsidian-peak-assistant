/**
 * Bridge native mouse selection across Composer's sibling contenteditable
 * leaves.
 *
 * Each editable semantic unit is intentionally its own editing host so direct
 * input, IME composition and native undo remain local and predictable. Chromium
 * consequently stops an ordinary mouse drag at that host's boundary. Once a
 * drag enters a second Composer leaf, this controller takes ownership of the
 * live DOM Selection while preserving the original anchor point. The existing
 * selection mapping/partition pipeline then turns that DOM range into source
 * units and owns formatting/writeback.
 */

const EDITABLE_SELECTOR = '.pk-composer-editable[contenteditable="true"]';
export const CROSS_BLOCK_SELECTION_EVENT = 'peak-composer-cross-block-selection';
export const CROSS_BLOCK_SELECTION_CLEAR_EVENT = 'peak-composer-cross-block-selection-clear';

export interface CrossBlockSelectionDetail {
	range: Range;
	direction: 'forward' | 'backward';
}

export interface CrossBlockSelectionOptions {
	copyTextForRange?: (range: Range) => string | null;
	onSelectionChange?: (detail: CrossBlockSelectionDetail | null) => void;
}

interface CaretPoint {
	node: Node;
	offset: number;
}

interface SelectionDrag {
	anchor: CaretPoint;
	anchorHost: HTMLElement;
	managed: boolean;
}

interface CaretPositionDocument extends Document {
	caretPositionFromPoint?: (x: number, y: number) => {
		offsetNode: Node;
		offset: number;
	} | null;
	caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

/**
 * Install the cross-host selection bridge on one Composer document root.
 *
 * The bridge is dormant for ordinary selection inside one editable leaf. It
 * only prevents Chromium's default drag behavior after the pointer reaches a
 * different leaf, so direct editing and same-block text selection keep their
 * native browser path.
 */
export function installCrossBlockTextSelection(
	root: HTMLElement,
	options: CrossBlockSelectionOptions = {},
): () => void {
	const doc = root.ownerDocument;
	const win = doc.defaultView;
	let drag: SelectionDrag | null = null;
	let active: CrossBlockSelectionDetail | null = null;

	const clearActive = () => {
		if (!active && !root.hasAttribute('data-cross-block-selection')) return;
		active = null;
		root.removeAttribute('data-cross-block-selection');
		root.querySelector('[data-cross-block-selection-overlay]')?.remove();
		dispatchDetail(root, CROSS_BLOCK_SELECTION_EVENT, null);
		options.onSelectionChange?.(null);
	};

	const finish = () => {
		drag = null;
		doc.removeEventListener('mousemove', onMouseMove, true);
		doc.removeEventListener('mouseup', onMouseUp, true);
		win?.removeEventListener('blur', finish);
	};

	const updateManagedSelection = (ev: MouseEvent): boolean => {
		if (!drag) return false;
		const focus = caretPointFromClient(doc, ev.clientX, ev.clientY);
		if (!focus) return false;
		const focusHost = editableHostForPoint(root, focus);
		if (!focusHost) return false;
		if (!drag.managed && focusHost === drag.anchorHost) return false;

		drag.managed = true;
		ev.preventDefault();
		const next = buildSelectionDetail(doc, drag.anchor, focus);
		if (!next) return false;
		active = next;
		root.setAttribute('data-cross-block-selection', 'true');
		doc.getSelection()?.removeAllRanges();
		renderSelectionOverlay(root, next.range);
		dispatchDetail(root, CROSS_BLOCK_SELECTION_EVENT, next);
		options.onSelectionChange?.(next);
		return true;
	};

	function onMouseMove(ev: MouseEvent): void {
		if (!drag) return;
		if ((ev.buttons & 1) === 0) {
			finish();
			return;
		}
		updateManagedSelection(ev);
	}

	function onMouseUp(ev: MouseEvent): void {
		if (!drag) return;
		updateManagedSelection(ev);
		finish();
	}

	const onMouseDown = (ev: MouseEvent) => {
		if (ev.button !== 0 || ev.defaultPrevented) return;
		const target = eventElement(ev.target);
		if (target?.closest('[data-chrome="true"]')) return;
		clearActive();
		const anchor = caretPointFromClient(doc, ev.clientX, ev.clientY);
		if (!anchor) return;
		const anchorHost = editableHostForPoint(root, anchor);
		if (!anchorHost) return;

		finish();
		drag = { anchor, anchorHost, managed: false };
		doc.addEventListener('mousemove', onMouseMove, true);
		doc.addEventListener('mouseup', onMouseUp, true);
		win?.addEventListener('blur', finish);
	};

	const onCopy = (ev: ClipboardEvent) => {
		if (!active || !ev.clipboardData) return;
		ev.preventDefault();
		ev.clipboardData.setData(
			'text/plain',
			options.copyTextForRange?.(active.range) ?? active.range.toString(),
		);
	};

	const onKeyDown = (ev: KeyboardEvent) => {
		if (ev.key === 'Escape') clearActive();
	};

	const onClearRequest = () => clearActive();
	const onDocumentMouseDown = (ev: MouseEvent) => {
		const target = eventElement(ev.target);
		if (!target || root.contains(target)) return;
		clearActive();
	};

	root.addEventListener('mousedown', onMouseDown);
	root.addEventListener(CROSS_BLOCK_SELECTION_CLEAR_EVENT, onClearRequest);
	doc.addEventListener('mousedown', onDocumentMouseDown);
	doc.addEventListener('copy', onCopy);
	doc.addEventListener('keydown', onKeyDown);
	return () => {
		finish();
		clearActive();
		root.removeEventListener('mousedown', onMouseDown);
		root.removeEventListener(CROSS_BLOCK_SELECTION_CLEAR_EVENT, onClearRequest);
		doc.removeEventListener('mousedown', onDocumentMouseDown);
		doc.removeEventListener('copy', onCopy);
		doc.removeEventListener('keydown', onKeyDown);
	};
}

export function clearCrossBlockTextSelection(root: HTMLElement): void {
	dispatchDetail(root, CROSS_BLOCK_SELECTION_CLEAR_EVENT, undefined);
}

function caretPointFromClient(doc: Document, x: number, y: number): CaretPoint | null {
	const caretDoc = doc as CaretPositionDocument;
	const position = caretDoc.caretPositionFromPoint?.(x, y);
	if (position) {
		return {
			node: position.offsetNode,
			offset: clampOffset(position.offsetNode, position.offset),
		};
	}
	const range = caretDoc.caretRangeFromPoint?.(x, y);
	if (!range) return null;
	return {
		node: range.startContainer,
		offset: clampOffset(range.startContainer, range.startOffset),
	};
}

function editableHostForPoint(root: HTMLElement, point: CaretPoint): HTMLElement | null {
	const element = point.node.nodeType === 1
		? point.node as Element
		: point.node.parentElement;
	const host = element?.closest<HTMLElement>(EDITABLE_SELECTOR) ?? null;
	return host && root.contains(host) ? host : null;
}

function eventElement(target: EventTarget | null): Element | null {
	if (!target || !('nodeType' in target)) return null;
	const node = target as Node;
	return node.nodeType === 1 ? node as Element : node.parentElement;
}

function clampOffset(node: Node, offset: number): number {
	const max = node.nodeType === 3
		? (node.textContent ?? '').length
		: node.childNodes.length;
	return Math.max(0, Math.min(offset, max));
}

function buildSelectionDetail(
	doc: Document,
	anchor: CaretPoint,
	focus: CaretPoint,
): CrossBlockSelectionDetail | null {
	const range = doc.createRange();
	const anchorBeforeFocus = comparePoints(doc, anchor, focus) <= 0;
	const start = anchorBeforeFocus ? anchor : focus;
	const end = anchorBeforeFocus ? focus : anchor;
	try {
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
	} catch {
		return null;
	}
	return {
		range,
		direction: anchorBeforeFocus ? 'forward' : 'backward',
	};
}

function comparePoints(doc: Document, a: CaretPoint, b: CaretPoint): number {
	if (a.node === b.node) return a.offset - b.offset;
	const aRange = doc.createRange();
	const bRange = doc.createRange();
	aRange.setStart(a.node, a.offset);
	bRange.setStart(b.node, b.offset);
	return aRange.compareBoundaryPoints(Range.START_TO_START, bRange);
}

function renderSelectionOverlay(root: HTMLElement, range: Range): void {
	let overlay = root.querySelector<HTMLElement>('[data-cross-block-selection-overlay]');
	if (!overlay) {
		overlay = root.ownerDocument.createElement('div');
		overlay.setAttribute('data-cross-block-selection-overlay', '');
		overlay.setAttribute('data-chrome', 'true');
		root.append(overlay);
	}
	overlay.replaceChildren();
	const rootRect = root.getBoundingClientRect();
	for (const rect of Array.from(range.getClientRects())) {
		if (rect.width <= 0 || rect.height <= 0) continue;
		const fragment = root.ownerDocument.createElement('span');
		fragment.className = 'pk-cross-block-selection-fragment';
		fragment.style.left = `${rect.left - rootRect.left + root.scrollLeft}px`;
		fragment.style.top = `${rect.top - rootRect.top + root.scrollTop}px`;
		fragment.style.width = `${rect.width}px`;
		fragment.style.height = `${rect.height}px`;
		overlay.append(fragment);
	}
}

function dispatchDetail<T>(root: HTMLElement, type: string, detail: T): void {
	const EventCtor = root.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
	root.dispatchEvent(new EventCtor(type, { detail }));
}
