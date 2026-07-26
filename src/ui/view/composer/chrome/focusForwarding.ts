/**
 * Peak Composer — block-click focus forwarding (FIX-1 F2 root cause fix).
 *
 * A browser only focuses a contenteditable when the mousedown TARGET is inside
 * it. The Composer block row is a flex wrapper (left 76px rail gutter, padding,
 * head row, inter-leaf gaps), so a click past the text's right edge, in the
 * row padding, or in a styled-run gap lands on the WRAPPER — the editable leaf
 * never receives focus and every subsequent keystroke goes to the workspace
 * (real-machine QA#1: "typing completely swallowed"). Mature editors forward
 * such clicks: focus the nearest editable line and place the caret at the
 * closest text position (click past line end ⇒ caret at end of line).
 *
 * Layering:
 *   - PURE decision layer (`shouldForwardClick`, `pickEditableBand`,
 *     `clampPointToRect`, `resolveCaretPlan`) — no DOM types, unit-tested in
 *     plain Node (test/composer-focus-forwarding.test.ts).
 *   - DOM shell (`forwardBlockClickToEditable`, `placeCaretNearPoint`) — thin
 *     adapters that read traits/rects and apply the plan.
 *
 * Caret placement timing: `leaf.focus()` triggers the styled-runs → source-
 * segments flip (EditableText re-renders its children). React 18 flushes
 * discrete-event state updates synchronously before yielding to rAF, so the
 * caret is resolved FROM COORDINATES inside a requestAnimationFrame — against
 * the post-flip DOM — never against nodes captured before the flip.
 */

// ── pure decision layer ──────────────────────────────────────────────────────

/** DOM-free traits of a mousedown target (read by the shell, decided here). */
export interface ClickTargetTraits {
	/** Target is inside a `[contenteditable="true"]` subtree (native handles it). */
	insideEditable: boolean;
	/** Target is inside `[data-chrome="true"]` (panels, action rows, candidates). */
	insideChrome: boolean;
	/** Target is an interactive control (button/input/link/checkbox/…). */
	interactive: boolean;
}

/**
 * Forward only "dead zone" clicks: wrapper whitespace that neither the browser
 * (inside the editable) nor a control (chrome/interactive) already owns.
 */
export function shouldForwardClick(traits: ClickTargetTraits): boolean {
	return !traits.insideEditable && !traits.insideChrome && !traits.interactive;
}

export interface VerticalBand {
	top: number;
	bottom: number;
}

/**
 * Pick the editable leaf for a click at `y`: the band containing y wins;
 * otherwise the vertically nearest band (click in the gap between list rows
 * goes to the closer row). Returns -1 for an empty list.
 */
export function pickEditableBand(bands: readonly VerticalBand[], y: number): number {
	let best = -1;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (let i = 0; i < bands.length; i++) {
		const band = bands[i];
		const distance = y < band.top ? band.top - y : y > band.bottom ? y - band.bottom : 0;
		if (distance === 0) return i;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	}
	return best;
}

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * Clamp a click point into a rect with a small inset so the caret probe hits
 * INSIDE the leaf's box (a point on/past the border resolves to the wrapper).
 * Click past the line's right edge ⇒ probe at the right edge ⇒ caret at the
 * nearest end-of-line text position (standard editor behaviour).
 */
export function clampPointToRect(x: number, y: number, rect: Rect, inset = 2): { x: number; y: number } {
	const maxX = Math.max(rect.left, rect.right - inset);
	const maxY = Math.max(rect.top, rect.bottom - inset);
	return {
		x: Math.min(Math.max(x, rect.left + inset), maxX),
		y: Math.min(Math.max(y, rect.top + inset), maxY),
	};
}

/** A caret candidate returned by the environment's point→position probe. */
export interface CaretProbeHit {
	node: unknown;
	offset: number;
}

export type CaretPlan = { kind: 'probe'; node: unknown; offset: number } | { kind: 'end' };

/**
 * Decide where the caret goes: clamp the point into the leaf's rect, ask the
 * environment probe (caretRangeFromPoint / caretPositionFromPoint), and accept
 * the hit only when it resolves INSIDE the leaf. Anything else — no API, null
 * hit, or a hit that escaped into a sibling — fails safe to end-of-content.
 */
export function resolveCaretPlan(args: {
	x: number;
	y: number;
	rect: Rect;
	probe: (x: number, y: number) => CaretProbeHit | null;
	containsNode: (node: unknown) => boolean;
}): CaretPlan {
	const point = clampPointToRect(args.x, args.y, args.rect);
	const hit = args.probe(point.x, point.y);
	if (hit && args.containsNode(hit.node)) {
		return { kind: 'probe', node: hit.node, offset: hit.offset };
	}
	return { kind: 'end' };
}

// ── DOM shell ────────────────────────────────────────────────────────────────

/**
 * Controls that own their own click behaviour. `.pk-composer-link` covers the
 * focusable link spans inside blurred styled runs (they open previews).
 */
const INTERACTIVE_SELECTOR =
	'button, input, textarea, select, a, [role="button"], [role="checkbox"], .pk-composer-link';

/** Read the DOM-free traits for the pure decision layer. Null ⇒ not an Element. */
export function readClickTargetTraits(target: unknown): ClickTargetTraits | null {
	const el = target as Element | null;
	if (!el || typeof el.closest !== 'function') return null;
	return {
		insideEditable: Boolean(el.closest('[contenteditable="true"]')),
		insideChrome: Boolean(el.closest('[data-chrome="true"]')),
		interactive: Boolean(el.closest(INTERACTIVE_SELECTOR)),
	};
}

/** The minimal mouse-event surface the forwarder needs (React or native). */
export interface ForwardableMouseEvent {
	target: unknown;
	clientX: number;
	clientY: number;
	preventDefault(): void;
}

/** Injectable focus+caret step (real one below; tests substitute a recorder). */
export type FocusAndPlaceCaret = (leaf: HTMLElement, clientX: number, clientY: number) => void;

/**
 * Forward a wrapper "dead zone" mousedown into the block's nearest editable
 * leaf. Returns true when the click was forwarded (and defaultPrevented so the
 * wrapper never steals focus/selection); false when native / chrome behaviour
 * should proceed untouched.
 */
export function forwardBlockClickToEditable(
	blockEl: HTMLElement,
	ev: ForwardableMouseEvent,
	focusAndPlace: FocusAndPlaceCaret = focusLeafAndPlaceCaret,
): boolean {
	const traits = readClickTargetTraits(ev.target);
	if (!traits || !shouldForwardClick(traits)) return false;
	const leaves = Array.from(
		blockEl.querySelectorAll<HTMLElement>('.pk-composer-editable[contenteditable="true"]'),
	);
	if (leaves.length === 0) return false; // folded summary / non-text block
	const bands = leaves.map((el) => {
		const r = el.getBoundingClientRect();
		return { top: r.top, bottom: r.bottom };
	});
	const index = pickEditableBand(bands, ev.clientY);
	if (index < 0) return false;
	ev.preventDefault();
	focusAndPlace(leaves[index], ev.clientX, ev.clientY);
	return true;
}

/** Real focus+caret step: focus now, resolve the caret post-flip (see header). */
function focusLeafAndPlaceCaret(leaf: HTMLElement, clientX: number, clientY: number): void {
	leaf.focus();
	const win = leaf.ownerDocument.defaultView ?? window;
	win.requestAnimationFrame(() => placeCaretNearPoint(leaf, clientX, clientY));
}

/**
 * Place the caret at the text position nearest to a client point inside the
 * leaf. Coordinate-based (never captures pre-flip nodes); falls back to
 * end-of-content when the probe misses or the API is unavailable.
 */
export function placeCaretNearPoint(leaf: HTMLElement, clientX: number, clientY: number): void {
	const doc = leaf.ownerDocument;
	const sel = doc.getSelection();
	if (!sel) return;
	const r = leaf.getBoundingClientRect();
	const plan = resolveCaretPlan({
		x: clientX,
		y: clientY,
		rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
		probe: makeCaretProbe(doc),
		containsNode: (node) => node instanceof Node && leaf.contains(node),
	});
	const range = doc.createRange();
	if (plan.kind === 'probe') {
		range.setStart(plan.node as Node, plan.offset);
		range.collapse(true);
	} else {
		range.selectNodeContents(leaf);
		range.collapse(false);
	}
	sel.removeAllRanges();
	sel.addRange(range);
}

/** Wrap whichever point→caret API this Document offers (WebKit or standard). */
function makeCaretProbe(doc: Document): (x: number, y: number) => CaretProbeHit | null {
	const d = doc as Document & {
		caretRangeFromPoint?(x: number, y: number): Range | null;
		caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
	};
	if (typeof d.caretRangeFromPoint === 'function') {
		return (x, y) => {
			const range = d.caretRangeFromPoint!(x, y);
			return range ? { node: range.startContainer, offset: range.startOffset } : null;
		};
	}
	if (typeof d.caretPositionFromPoint === 'function') {
		return (x, y) => {
			const pos = d.caretPositionFromPoint!(x, y);
			return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
		};
	}
	return () => null;
}
