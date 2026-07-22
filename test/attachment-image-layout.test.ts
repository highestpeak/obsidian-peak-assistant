/**
 * MSG-02 — pure-logic guard for the input-image cluster layout.
 *
 * Layout decisions live in `decideImageLayout(n)` so the renderer's branching
 * for 1 / 2 / 3 / 4 / 5–7 / 8+ image counts stays testable without React.
 * Every layout requirement in §7.4 of the 2026-07-15 Chat Studio spec is
 * exercised, including the "+N" fold-over count for the 8+ case.
 */

import assert from 'assert';
import { decideImageLayout } from '@/ui/view/chat-view/components/messages/attachmentImageLayout';

function testEmptyAndSingle(): void {
	assert.deepStrictEqual(decideImageLayout(0), {
		kind: 'single',
		visibleCount: 0,
		overflowCount: 0,
		template: 'single',
	}, 'empty input returns single/zero — renderer skips rendering entirely');
	const one = decideImageLayout(1);
	assert.strictEqual(one.kind, 'single');
	assert.strictEqual(one.visibleCount, 1);
	assert.strictEqual(one.overflowCount, 0);
	console.log('PASS: emptyAndSingle');
}

function testSmallGrids(): void {
	const two = decideImageLayout(2);
	assert.strictEqual(two.kind, 'grid-2');
	assert.strictEqual(two.template, 'cols-2');
	assert.strictEqual(two.visibleCount, 2);

	const three = decideImageLayout(3);
	assert.strictEqual(three.kind, 'grid-3');
	assert.strictEqual(three.template, 'cols-3');
	assert.strictEqual(three.visibleCount, 3);

	const four = decideImageLayout(4);
	assert.strictEqual(four.kind, 'grid-2x2');
	assert.strictEqual(four.template, 'cols-2');
	assert.strictEqual(four.visibleCount, 4);
	assert.strictEqual(four.overflowCount, 0);
	console.log('PASS: smallGrids');
}

function testHeroThumbs(): void {
	// 5 → hero + 4 thumbs
	const five = decideImageLayout(5);
	assert.strictEqual(five.kind, 'hero-thumbs');
	assert.strictEqual(five.template, 'hero');
	assert.strictEqual(five.visibleCount, 5);
	assert.strictEqual(five.overflowCount, 0);
	// 6 → hero + 4 thumbs (still, up to 4 thumbs cap by n-1 which is 5 → capped)
	const six = decideImageLayout(6);
	assert.strictEqual(six.kind, 'hero-thumbs');
	assert.strictEqual(six.visibleCount, 5, 'thumb cap is 4, so hero+4=5 visible');
	// 7 → hero + 4 thumbs
	const seven = decideImageLayout(7);
	assert.strictEqual(seven.kind, 'hero-thumbs');
	assert.strictEqual(seven.visibleCount, 5);
	console.log('PASS: heroThumbs');
}

function testOverflow(): void {
	// 8 → grid 2×2 with +4 on the last tile
	const eight = decideImageLayout(8);
	assert.strictEqual(eight.kind, 'grid-2x2-overflow');
	assert.strictEqual(eight.template, 'cols-2');
	assert.strictEqual(eight.visibleCount, 4);
	assert.strictEqual(eight.overflowCount, 4);
	// 12 → +8 on the last tile
	const twelve = decideImageLayout(12);
	assert.strictEqual(twelve.overflowCount, 8);
	// 100 → +96 (renderer clamps display, count is honest)
	const hundred = decideImageLayout(100);
	assert.strictEqual(hundred.overflowCount, 96);
	console.log('PASS: overflow');
}

function run(): void {
	testEmptyAndSingle();
	testSmallGrids();
	testHeroThumbs();
	testOverflow();
	console.log('attachment-image-layout: all guards passed');
}

run();
