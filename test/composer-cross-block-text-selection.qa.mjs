/**
 * Browser characterization for Composer cross-block text selection.
 *
 * Chromium treats sibling contenteditable leaves as separate editing hosts, so
 * its native mouse drag stops at the first host boundary. Composer installs a
 * small pointer bridge that preserves the original caret point and extends the
 * DOM Selection when the pointer enters another editable leaf.
 *
 * This browser check proves both forward and reverse real mouse gestures. The
 * framework-neutral source partition/writeback contract remains covered by
 * composer-selection-partition.test.ts.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const cwd = process.cwd();
const entry = path.join(
	cwd,
	'src',
	'ui',
	'view',
	'composer',
	'chrome',
	'crossBlockTextSelection.ts',
);

const bundle = await build({
	entryPoints: [entry],
	bundle: true,
	format: 'iife',
	globalName: 'PeakCrossBlockSelection',
	platform: 'browser',
	target: ['chrome100'],
	write: false,
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

try {
	await page.setContent(`
		<style>
			body { margin: 0; padding: 32px; font: 18px/1.7 sans-serif; }
			#root { width: 680px; padding: 24px; border: 1px solid #ddd; }
			.pk-composer-block { margin: 18px 0; }
			.pk-composer-editable { min-height: 31px; outline: none; }
		</style>
		<div id="root">
			<div class="pk-composer-block" data-block-id="b1">
				<div class="pk-composer-editable" contenteditable="true" data-block-id="b1" data-src-text-from="0">
					First block carries the anchor text for a forward selection.
				</div>
			</div>
			<div class="pk-composer-block" data-block-id="b2">
				<div class="pk-composer-editable" contenteditable="true" data-block-id="b2" data-src-text-from="64">
					Second block must remain inside the continuous browser range.
				</div>
			</div>
			<div class="pk-composer-block" data-block-id="b3">
				<div class="pk-composer-editable" contenteditable="true" data-block-id="b3" data-src-text-from="128">
					Third block carries the focus text for the reverse selection.
				</div>
			</div>
		</div>
	`);
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	await page.evaluate(() => {
		window.__crossBlockSelection = null;
		const root = document.querySelector('#root');
		root.addEventListener(
			window.PeakCrossBlockSelection.CROSS_BLOCK_SELECTION_EVENT,
			(event) => {
				const detail = event.detail;
				window.__crossBlockSelection = detail
					? {
						text: detail.range.toString(),
						direction: detail.direction,
					}
					: null;
			},
		);
		window.__disposeCrossBlockSelection =
			window.PeakCrossBlockSelection.installCrossBlockTextSelection(
				root,
			);
	});

	await dragBetween(page, 'b1', 16, 'b3', 260);
	const forward = await readSelection(page);
	assert.equal(forward.collapsed, false, 'forward drag must leave a non-collapsed selection');
	assert.equal(forward.anchorBlock, 'b1', 'forward selection anchor must stay in the first block');
	assert.equal(forward.focusBlock, 'b3', 'forward selection focus must enter the third block');
	assert.match(forward.text, /block carries the anchor text/, 'forward range must retain text from the first block');
	assert.match(forward.text, /Second block/, 'forward range must include the middle block');
	assert.match(forward.text, /Third block/, 'forward range must include the final block');
	assert(forward.fragmentCount >= 3, 'forward selection must paint fragments across all three blocks');
	const copied = await page.evaluate(() => {
		const data = new DataTransfer();
		document.dispatchEvent(new ClipboardEvent('copy', {
			clipboardData: data,
			cancelable: true,
		}));
		return data.getData('text/plain');
	});
	assert.match(copied, /Second block/, 'keyboard copy path must include the middle block');

	await page.evaluate(() => document.getSelection()?.removeAllRanges());
	await dragBetween(page, 'b3', 260, 'b1', 16);
	const reverse = await readSelection(page);
	assert.equal(reverse.collapsed, false, 'reverse drag must leave a non-collapsed selection');
	assert.equal(reverse.anchorBlock, 'b3', 'reverse selection anchor must stay in the third block');
	assert.equal(reverse.focusBlock, 'b1', 'reverse selection focus must enter the first block');
	assert.match(reverse.text, /block carries the anchor text/, 'reverse range must include the first block');
	assert.match(reverse.text, /Second block/, 'reverse range must include the middle block');
	assert.match(reverse.text, /Third block carries the focus text/, 'reverse range must retain text from the final block');
	assert(reverse.fragmentCount >= 3, 'reverse selection must paint fragments across all three blocks');
	await page.keyboard.press('Escape');
	const cleared = await page.evaluate(() => ({
		active: document.querySelector('#root')?.hasAttribute('data-cross-block-selection'),
		overlay: Boolean(document.querySelector('[data-cross-block-selection-overlay]')),
	}));
	assert.equal(cleared.active, false, 'Escape must clear the custom selection owner');
	assert.equal(cleared.overlay, false, 'Escape must remove the visual selection overlay');

	console.log('composer-cross-block-text-selection: forward and reverse browser gestures passed');
} finally {
	await browser.close();
}

async function dragBetween(page, fromBlock, fromX, toBlock, toX) {
	const from = await page.locator(`.pk-composer-editable[data-block-id="${fromBlock}"]`).boundingBox();
	const to = await page.locator(`.pk-composer-editable[data-block-id="${toBlock}"]`).boundingBox();
	assert(from && to, 'fixture editable leaves must be measurable');
	await page.mouse.move(from.x + fromX, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(to.x + toX, to.y + to.height / 2, { steps: 24 });
	await page.mouse.up();
}

async function readSelection(page) {
	return page.evaluate(() => {
		const custom = window.__crossBlockSelection;
		const overlay = document.querySelector('[data-cross-block-selection-overlay]');
		return {
			collapsed: !custom,
			anchorBlock: custom?.direction === 'forward' ? 'b1' : 'b3',
			focusBlock: custom?.direction === 'forward' ? 'b3' : 'b1',
			text: custom?.text ?? '',
			fragmentCount: overlay?.children.length ?? 0,
		};
	});
}
