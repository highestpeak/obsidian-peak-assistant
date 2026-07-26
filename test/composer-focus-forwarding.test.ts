/**
 * Peak Composer — block-click focus forwarding (FIX-1 F2 regression).
 *
 * Root cause locked here: a mousedown in a block row's dead zone (right of the
 * text edge, padding, run gaps) targets the WRAPPER, and browsers only focus a
 * contenteditable when the mousedown target is inside it — so typing went to
 * the workspace (real-machine QA#1). The fix forwards such clicks into the
 * nearest editable leaf with the caret at the closest text position.
 *
 * Covers the pure decision layer (no DOM needed) plus the DOM-shell
 * orchestration via fake elements: wrapper click → preventDefault → nearest
 * leaf receives focus+caret with the ORIGINAL coordinates; chrome/interactive/
 * inside-editable targets and leafless blocks are left untouched.
 */

import assert from 'assert';
import {
	clampPointToRect,
	forwardBlockClickToEditable,
	pickEditableBand,
	resolveCaretPlan,
	readClickTargetTraits,
	shouldForwardClick,
	type ClickTargetTraits,
	type ForwardableMouseEvent,
} from '@/ui/view/composer/chrome/focusForwarding';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

// ── fakes (no jsdom: plain objects with the members the shell touches) ──────

function traits(overrides: Partial<ClickTargetTraits> = {}): ClickTargetTraits {
	return { insideEditable: false, insideChrome: false, interactive: false, ...overrides };
}

/** Element-like fake whose `closest` answers from a set of matching selectors. */
function fakeTarget(matching: string[] = []): Element {
	return {
		closest: (selector: string) => (matching.some((m) => selector.includes(m)) ? ({} as Element) : null),
	} as unknown as Element;
}

interface FakeLeaf {
	el: HTMLElement;
	focusCalls: number;
}

function fakeLeaf(top: number, bottom: number): FakeLeaf {
	const leaf: FakeLeaf = { el: null as unknown as HTMLElement, focusCalls: 0 };
	leaf.el = {
		getBoundingClientRect: () => ({ top, bottom, left: 0, right: 800 }),
		focus: () => {
			leaf.focusCalls += 1;
		},
	} as unknown as HTMLElement;
	return leaf;
}

function fakeBlock(leaves: FakeLeaf[]): HTMLElement {
	return {
		querySelectorAll: () => leaves.map((l) => l.el),
	} as unknown as HTMLElement;
}

function fakeEvent(target: Element, x = 1037, y = 100): ForwardableMouseEvent & { prevented: number } {
	const ev = {
		target,
		clientX: x,
		clientY: y,
		prevented: 0,
		preventDefault() {
			ev.prevented += 1;
		},
	};
	return ev;
}

function main(): void {
	// ── shouldForwardClick ──────────────────────────────────────────────────
	check('dead-zone click forwards', shouldForwardClick(traits()));
	check('inside-editable click stays native', !shouldForwardClick(traits({ insideEditable: true })));
	check('chrome click untouched', !shouldForwardClick(traits({ insideChrome: true })));
	check('interactive control untouched', !shouldForwardClick(traits({ interactive: true })));

	// ── readClickTargetTraits ───────────────────────────────────────────────
	check('null target → null traits', readClickTargetTraits(null) === null);
	check('non-element target → null traits', readClickTargetTraits({}) === null);
	const editableTraits = readClickTargetTraits(fakeTarget(['contenteditable']));
	check('traits: contenteditable ancestor detected', editableTraits?.insideEditable === true);
	const chromeTraits = readClickTargetTraits(fakeTarget(['data-chrome']));
	check('traits: chrome ancestor detected', chromeTraits?.insideChrome === true);
	const buttonTraits = readClickTargetTraits(fakeTarget(['button']));
	check('traits: interactive ancestor detected', buttonTraits?.interactive === true);
	const linkTraits = readClickTargetTraits(fakeTarget(['.pk-composer-link']));
	check('traits: styled-run link span is interactive', linkTraits?.interactive === true);
	const plainTraits = readClickTargetTraits(fakeTarget([]));
	check(
		'traits: bare wrapper is fully forwardable',
		plainTraits !== null && shouldForwardClick(plainTraits),
	);

	// ── pickEditableBand ────────────────────────────────────────────────────
	const bands = [
		{ top: 0, bottom: 20 },
		{ top: 30, bottom: 50 },
		{ top: 60, bottom: 80 },
	];
	check('y inside a band picks it', pickEditableBand(bands, 40) === 1);
	check('y in a gap picks the nearer band', pickEditableBand(bands, 52) === 1);
	check('y in a gap (below midpoint) picks the lower band', pickEditableBand(bands, 58) === 2);
	check('y above all bands picks the first', pickEditableBand(bands, -10) === 0);
	check('y below all bands picks the last', pickEditableBand(bands, 500) === 2);
	check('empty band list → -1', pickEditableBand([], 10) === -1);

	// ── clampPointToRect ────────────────────────────────────────────────────
	const rect = { left: 100, top: 10, right: 700, bottom: 40 };
	const past = clampPointToRect(1037, 20, rect);
	check('x past right edge clamps to inside-right (line-end probe)', past.x === 698 && past.y === 20, JSON.stringify(past));
	const inside = clampPointToRect(300, 25, rect);
	check('point already inside is untouched', inside.x === 300 && inside.y === 25);
	const above = clampPointToRect(50, 0, rect);
	check('point above/left clamps to inside top-left', above.x === 102 && above.y === 12, JSON.stringify(above));

	// ── resolveCaretPlan ────────────────────────────────────────────────────
	const insideNode = { tag: 'text-in-leaf' };
	const outsideNode = { tag: 'sibling' };
	const planHit = resolveCaretPlan({
		x: 1037,
		y: 20,
		rect,
		probe: (x) => ({ node: x === 698 ? insideNode : outsideNode, offset: 7 }),
		containsNode: (n) => n === insideNode,
	});
	check('probe hit inside leaf → probe plan with clamped x', planHit.kind === 'probe' && (planHit as { offset: number }).offset === 7);
	const planEscaped = resolveCaretPlan({
		x: 300,
		y: 20,
		rect,
		probe: () => ({ node: outsideNode, offset: 3 }),
		containsNode: (n) => n === insideNode,
	});
	check('probe escaping the leaf → end-of-content fallback', planEscaped.kind === 'end');
	const planNoApi = resolveCaretPlan({
		x: 300,
		y: 20,
		rect,
		probe: () => null,
		containsNode: () => true,
	});
	check('no caret API → end-of-content fallback', planNoApi.kind === 'end');

	// ── forwardBlockClickToEditable orchestration ───────────────────────────
	{
		// End-of-line whitespace click (the QA#1 repro: x=1037, right of text edge).
		const para = fakeLeaf(90, 130);
		const block = fakeBlock([para]);
		const ev = fakeEvent(fakeTarget([]), 1037, 100);
		const placed: Array<{ leaf: HTMLElement; x: number; y: number }> = [];
		const forwarded = forwardBlockClickToEditable(block, ev, (leaf, x, y) => placed.push({ leaf, x, y }));
		check('dead-zone click is forwarded', forwarded);
		check('wrapper default is prevented (no focus steal)', ev.prevented === 1);
		check('nearest leaf receives the placement', placed.length === 1 && placed[0].leaf === para.el);
		check('original click coordinates are passed through', placed[0].x === 1037 && placed[0].y === 100);
	}
	{
		// Multi-leaf list block: the row whose band contains clientY wins.
		const rowA = fakeLeaf(0, 20);
		const rowB = fakeLeaf(30, 50);
		const block = fakeBlock([rowA, rowB]);
		const ev = fakeEvent(fakeTarget([]), 900, 42);
		const placed: HTMLElement[] = [];
		forwardBlockClickToEditable(block, ev, (leaf) => placed.push(leaf));
		check('list click forwards to the row under the pointer', placed.length === 1 && placed[0] === rowB.el);
	}
	{
		// Clicks native/chrome paths must NOT be hijacked.
		const para = fakeLeaf(0, 20);
		const block = fakeBlock([para]);
		let placements = 0;
		const evEditable = fakeEvent(fakeTarget(['contenteditable']));
		check('inside-editable click not forwarded', !forwardBlockClickToEditable(block, evEditable, () => placements++));
		check('inside-editable click not prevented', evEditable.prevented === 0);
		const evChrome = fakeEvent(fakeTarget(['data-chrome']));
		check('chrome click not forwarded', !forwardBlockClickToEditable(block, evChrome, () => placements++));
		const evButton = fakeEvent(fakeTarget(['button']));
		check('button click not forwarded', !forwardBlockClickToEditable(block, evButton, () => placements++));
		check('no placement side effects on skipped clicks', placements === 0);
	}
	{
		// Folded summary / non-text block: no editable leaves → untouched.
		const block = fakeBlock([]);
		const ev = fakeEvent(fakeTarget([]));
		check('leafless block not forwarded', !forwardBlockClickToEditable(block, ev, () => undefined));
		check('leafless block not prevented', ev.prevented === 0);
	}

	console.log(`composer-focus-forwarding: ${count - failures}/${count} checks passed`);
	if (failures > 0) {
		process.exit(1);
	}
}

main();
