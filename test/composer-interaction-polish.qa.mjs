/**
 * Browser-harness regression for the 2026-08-04 Composer interaction polish.
 *
 * This is rendered Composer code, not real-Obsidian acceptance. It proves the
 * pointer corridor, table find geometry, external-link icon and radius hierarchy
 * in Chromium while the real host remains a separate verification boundary.
 *
 * Run: node test/composer-interaction-polish.qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3215;
const vite = spawn('npx', [
	'vite',
	'--config',
	'.dev/harness/vite.harness.config.mts',
	'--port',
	String(port),
	'--strictPort',
], {
	cwd: repo,
	stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitForVite() {
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('vite did not start')), 30000);
		vite.stdout.on('data', (data) => {
			if (!String(data).includes('Local:')) return;
			clearTimeout(timer);
			resolve();
		});
		vite.on('exit', (code) => reject(new Error(`vite exited ${code}`)));
	});
}

try {
	await waitForVite();
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(String(error)));
	await page.goto(`http://localhost:${port}/composer.html`, { waitUntil: 'networkidle' });

	const collection = page.locator('.pk-composer-block[data-kind="list"][data-unitized="true"]').last();
	await collection.evaluate((element) => element.scrollIntoView({ block: 'center' }));
	await page.waitForTimeout(120);
	await collection.evaluate((element) => {
		const scroller = element.closest('.peak-composer-root');
		const controlbar = scroller?.querySelector('.pk-composer-controlbar');
		if (!scroller || !controlbar) return;
		const overlap = controlbar.getBoundingClientRect().bottom + 24 - element.getBoundingClientRect().top;
		if (overlap > 0) scroller.scrollTop = Math.max(0, scroller.scrollTop - overlap);
	});
	await page.waitForTimeout(120);
	const collectionBox = await collection.boundingBox();
	assert.ok(collectionBox, 'collection block has pointer geometry');
	await page.mouse.move(collectionBox.x + collectionBox.width / 2, collectionBox.y + 12);
	await page.waitForTimeout(120);
	const drag = collection.locator('.pk-composer-drag');
	const initialDragBox = await drag.boundingBox();
	assert.ok(initialDragBox, 'six-dot rail has pointer geometry');
	await page.mouse.move(
		initialDragBox.x + initialDragBox.width / 2,
		initialDragBox.y + initialDragBox.height / 2,
	);
	await page.waitForTimeout(460);
	assert.equal(
		await collection.getAttribute('data-collection-action-active'),
		'true',
		'hovering the six-dot rail opens collection actions and the collection halo',
	);

	const actionRow = collection.locator('.pk-composer-block__body > .pk-block-action-row');
	const dragBox = await drag.boundingBox();
	const actionBox = await actionRow.boundingBox();
	assert.ok(dragBox && actionBox, 'rail and collection action row have pointer geometry');
	const start = { x: dragBox.x + dragBox.width / 2, y: dragBox.y + dragBox.height / 2 };
	const end = { x: actionBox.x + Math.min(24, actionBox.width / 2), y: actionBox.y + actionBox.height / 2 };
	const routeTargets = await page.evaluate(({ start, end }) => Array.from({ length: 14 }, (_, index) => {
		const progress = (index + 1) / 14;
		const x = start.x + (end.x - start.x) * progress;
		const y = start.y + (end.y - start.y) * progress;
		const target = document.elementFromPoint(x, y);
		return { x: Math.round(x), y: Math.round(y), className: String(target?.className ?? '') };
	}), { start, end });
	for (let step = 1; step <= 14; step++) {
		const progress = step / 14;
		await page.mouse.move(
			start.x + (end.x - start.x) * progress,
			start.y + (end.y - start.y) * progress,
		);
		await page.waitForTimeout(28);
		assert.equal(
			await collection.getAttribute('data-collection-action-active'),
			'true',
			`collection ownership survives pointer transfer step ${step}; route=${JSON.stringify(routeTargets)}`,
		);
	}
	assert.equal(await actionRow.evaluate((element) => getComputedStyle(element).pointerEvents), 'auto');
	await actionRow.locator('.pk-action-capsule').first().hover();

	await page.mouse.move(2, 2);
	await page.waitForTimeout(240);
	assert.equal(
		await collection.getAttribute('data-collection-action-active'),
		null,
		'collection actions still close after leaving the whole block',
	);

	await page.locator('.pk-composer-editable[contenteditable="true"]').first().focus();
	await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
	const findInput = page.locator('.pk-composer-find__input');
	await findInput.fill('service');
	await page.waitForTimeout(500);
	assert.deepEqual(pageErrors, [], `find overlay raised a browser error: ${pageErrors.join('\n')}`);
	const table = page.locator('.pk-composer-table').first();
	await table.scrollIntoViewIfNeeded();
	await page.waitForTimeout(120);
	const tableBox = await table.boundingBox();
	assert.ok(tableBox, 'table has geometry for find verification');
	const tableRuns = await table.locator('[data-src-text-from]').evaluateAll((elements) =>
		elements.map((element) => ({ from: element.getAttribute('data-src-text-from'), text: element.textContent })));
	const allHighlightBoxes = await page.locator('.pk-composer-find-highlight').evaluateAll((elements) =>
		elements.map((element) => {
			const rect = element.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		}));
	const findState = {
		value: await findInput.inputValue(),
		count: await page.locator('.pk-composer-find__count').textContent(),
	};
	const tableHighlights = await page.locator('.pk-composer-find-highlight').evaluateAll((elements, box) =>
		elements
			.map((element) => element.getBoundingClientRect())
			.filter((rect) => (
				rect.right > box.x
				&& rect.left < box.x + box.width
				&& rect.bottom > box.y
				&& rect.top < box.y + box.height
			))
			.map((rect) => ({ width: rect.width, height: rect.height })), tableBox);
	assert.ok(
		tableHighlights.length >= 1,
		`a source match inside the table receives a visible highlight; find=${JSON.stringify(findState)} runs=${JSON.stringify(tableRuns)} highlights=${JSON.stringify(allHighlightBoxes)}`,
	);
	assert.ok(
		tableHighlights.every((rect) => rect.width < tableBox.width / 2 && rect.height < 40),
		`table matches stay glyph-sized instead of painting the object: ${JSON.stringify(tableHighlights)}`,
	);

	await page.keyboard.press('Escape');
	const externalLink = page.locator(
		'.pk-composer-editable[contenteditable="true"] .pk-composer-link:not(.pk-composer-wikilink)',
	).first();
	await externalLink.scrollIntoViewIfNeeded();
	const externalIcon = await externalLink.evaluate((element) => {
		const style = getComputedStyle(element, '::after');
		return { width: style.width, height: style.height, mask: style.maskImage };
	});
	assert.deepEqual(
		{ width: externalIcon.width, height: externalIcon.height },
		{ width: '12px', height: '12px' },
		'editable external links expose a compact up-right icon',
	);
	assert.notEqual(externalIcon.mask, 'none', 'the external-link pseudo icon uses the Lucide mask');

	const radii = await page.locator('.pk-composer-controlbar').evaluate((controlbar) => {
		const switcher = controlbar.querySelector('.pk-composer-display-switch');
		const option = switcher?.querySelector('.pk-segmented__opt');
		return {
			controlbar: getComputedStyle(controlbar).borderRadius,
			switcher: switcher ? getComputedStyle(switcher).borderRadius : '',
			option: option ? getComputedStyle(option).borderRadius : '',
		};
	});
	assert.deepEqual(radii, { controlbar: '12px', switcher: '8px', option: '4px' });

	await browser.close();
	console.log('PASS composer-interaction-polish');
} finally {
	vite.kill('SIGTERM');
}
