/**
 * Focused browser regression for unitized Composer rail geometry.
 *
 * This renders the real ComposerRoot in the Chromium harness. It proves that
 * the first-row collection handle stays centered on its row without covering
 * the block disclosure, and that the pointer path into collection actions
 * remains reachable. Real Obsidian acceptance remains a separate boundary.
 *
 * Run: node test/composer-unitized-rail-geometry.qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3220;
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
		const logs = [];
		vite.stdout.on('data', (data) => {
			const text = String(data);
			logs.push(text);
			if (!text.includes('Local:')) return;
			clearTimeout(timer);
			resolve();
		});
		vite.stderr.on('data', (data) => logs.push(String(data)));
		vite.on('exit', (code) => reject(new Error(`vite exited ${code}\n${logs.join('')}`)));
	});
}

function boxesOverlap(a, b) {
	return !(
		a.x + a.width <= b.x ||
		b.x + b.width <= a.x ||
		a.y + a.height <= b.y ||
		b.y + b.height <= a.y
	);
}

try {
	await waitForVite();
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
		const pageErrors = [];
		page.on('pageerror', (error) => pageErrors.push(String(error)));
		await page.goto(`http://localhost:${port}/composer.html`, { waitUntil: 'networkidle' });

		const collection = page.locator(
			'.pk-composer-block[data-kind="list"][data-unitized="true"]',
		).last();
		await collection.evaluate((element) => element.scrollIntoView({ block: 'center' }));
		await page.waitForTimeout(120);
		await collection.evaluate((element) => {
			const scroller = element.closest('.peak-composer-root');
			const controlbar = scroller?.querySelector('.pk-composer-controlbar');
			if (!scroller || !controlbar) return;
			const overlap = controlbar.getBoundingClientRect().bottom + 24 - element.getBoundingClientRect().top;
			if (overlap > 0) scroller.scrollTop = Math.max(0, scroller.scrollTop - overlap);
		});

		const firstRow = collection.locator('.pk-composer-list__row').first();
		const firstRowBox = await firstRow.boundingBox();
		assert.ok(firstRowBox, 'first collection row has pointer geometry');
		await page.mouse.move(
			firstRowBox.x + Math.min(24, firstRowBox.width / 2),
			firstRowBox.y + firstRowBox.height / 2,
		);
		await page.waitForTimeout(180);

		const handle = collection.locator('.pk-composer-collection-handle');
		const initialHandleBox = await handle.boundingBox();
		assert.ok(initialHandleBox, 'first-row six-dot handle is visible');
		await page.mouse.move(
			initialHandleBox.x + initialHandleBox.width / 2,
			initialHandleBox.y + initialHandleBox.height / 2,
		);
		await page.waitForTimeout(460);
		assert.equal(
			await collection.getAttribute('data-collection-action-active'),
			'true',
			'hovering the first-row six-dot handle opens collection actions',
		);

		const handleBox = await handle.boundingBox();
		const disclosureBox = await collection.locator('.pk-composer-disclosure').boundingBox();
		const anchoredRowBox = await collection.locator(
			'.pk-composer-list__row[data-unit-collection-anchor]',
		).boundingBox();
		const labelBox = await collection.locator(
			'.pk-composer-collection-handle__label',
		).boundingBox();
		assert.ok(handleBox && disclosureBox && anchoredRowBox && labelBox, 'rail geometry is measurable');
		assert.equal(
			boxesOverlap(disclosureBox, handleBox),
			false,
			`disclosure and first-row handle must not overlap: disclosure=${JSON.stringify(disclosureBox)} handle=${JSON.stringify(handleBox)}`,
		);
		assert.ok(
			disclosureBox.x + disclosureBox.width <= handleBox.x,
			'disclosure uses the outer lane and the six-dot handle uses the inner lane',
		);
		assert.ok(
			Math.abs(
				(handleBox.y + handleBox.height / 2) -
				(anchoredRowBox.y + anchoredRowBox.height / 2),
			) <= 1,
			'first-row six-dot handle remains vertically centered on the authored row',
		);
		assert.ok(
			labelBox.x + labelBox.width <= disclosureBox.x,
			'the visible six-dot label clears the disclosure control',
		);

		const actionRow = collection.locator(
			'[data-unit-collection-action-for] .pk-block-action-row',
		);
		const actionBox = await actionRow.boundingBox();
		assert.ok(actionBox, 'collection action row has pointer geometry');
		const start = {
			x: handleBox.x + handleBox.width / 2,
			y: handleBox.y + handleBox.height / 2,
		};
		const end = {
			x: actionBox.x + Math.min(24, actionBox.width / 2),
			y: actionBox.y + actionBox.height / 2,
		};
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
				`collection actions remain open across pointer-corridor step ${step}`,
			);
		}

		await page.mouse.move(2, 2);
		await page.waitForTimeout(260);
		const paragraph = page.locator(
			'.pk-composer-block[data-kind="paragraph"][data-unitized="true"]',
		).first();
		await paragraph.evaluate((element) => element.scrollIntoView({ block: 'center' }));
		await page.waitForTimeout(120);
		const firstParagraphLine = paragraph.locator('.pk-composer-paragraph__line').first();
		const firstParagraphLineBox = await firstParagraphLine.boundingBox();
		assert.ok(firstParagraphLineBox, 'first authored paragraph line has pointer geometry');
		await page.mouse.move(
			firstParagraphLineBox.x + Math.min(24, firstParagraphLineBox.width / 2),
			firstParagraphLineBox.y + firstParagraphLineBox.height / 2,
		);
		await page.waitForTimeout(180);
		const paragraphHandle = paragraph.locator('.pk-composer-collection-handle');
		const paragraphHandleBox = await paragraphHandle.boundingBox();
		assert.ok(paragraphHandleBox, 'first-line paragraph six-dot handle is visible');
		await page.mouse.move(
			paragraphHandleBox.x + paragraphHandleBox.width / 2,
			paragraphHandleBox.y + paragraphHandleBox.height / 2,
		);
		await page.waitForTimeout(460);
		assert.equal(
			await paragraph.getAttribute('data-collection-action-active'),
			'true',
			'hovering the first-line paragraph handle opens paragraph actions',
		);
		const paragraphDisclosureBox = await paragraph.locator('.pk-composer-disclosure').boundingBox();
		const anchoredParagraphLineBox = await paragraph.locator(
			'.pk-composer-paragraph__line[data-unit-collection-anchor]',
		).boundingBox();
		const paragraphLabelBox = await paragraph.locator(
			'.pk-composer-collection-handle__label',
		).boundingBox();
		assert.ok(
			paragraphDisclosureBox && anchoredParagraphLineBox && paragraphLabelBox,
			'first-line paragraph rail geometry is measurable',
		);
		assert.equal(
			boxesOverlap(paragraphDisclosureBox, paragraphHandleBox),
			false,
			`paragraph disclosure and first-line handle must not overlap: disclosure=${JSON.stringify(paragraphDisclosureBox)} handle=${JSON.stringify(paragraphHandleBox)}`,
		);
		assert.ok(
			paragraphDisclosureBox.x + paragraphDisclosureBox.width <= paragraphHandleBox.x,
			'paragraph disclosure and six-dot handle keep their outer/inner lanes',
		);
		assert.ok(
			Math.abs(
				(paragraphHandleBox.y + paragraphHandleBox.height / 2) -
				(anchoredParagraphLineBox.y + anchoredParagraphLineBox.height / 2),
			) <= 1,
			`paragraph six-dot handle stays vertically centered on the first authored line: handle=${JSON.stringify(paragraphHandleBox)} row=${JSON.stringify(anchoredParagraphLineBox)}`,
		);
		assert.ok(
			paragraphLabelBox.x + paragraphLabelBox.width <= paragraphDisclosureBox.x,
			'the paragraph six-dot label clears the disclosure control',
		);

		await page.mouse.move(2, 2);
		await page.setViewportSize({ width: 680, height: 980 });
		await paragraph.evaluate((element) => element.scrollIntoView({ block: 'center' }));
		await page.waitForTimeout(300);
		const narrowFirstLineBox = await firstParagraphLine.boundingBox();
		assert.ok(narrowFirstLineBox, 'narrow first paragraph line has pointer geometry');
		await page.mouse.move(
			narrowFirstLineBox.x + Math.min(24, narrowFirstLineBox.width / 2),
			narrowFirstLineBox.y + narrowFirstLineBox.height / 2,
		);
		await page.waitForTimeout(180);
		const narrowHandleBox = await paragraphHandle.boundingBox();
		assert.ok(narrowHandleBox, 'narrow six-dot handle is visible');
		await page.mouse.move(
			narrowHandleBox.x + narrowHandleBox.width / 2,
			narrowHandleBox.y + narrowHandleBox.height / 2,
		);
		await page.waitForTimeout(460);
		const narrowDisclosureBox = await paragraph.locator('.pk-composer-disclosure').boundingBox();
		const mainBox = await page.locator('.pk-composer-main').boundingBox();
		assert.ok(narrowDisclosureBox && mainBox, 'narrow Composer rail bounds are measurable');
		assert.equal(
			boxesOverlap(narrowDisclosureBox, narrowHandleBox),
			false,
			'narrow disclosure and first-line six-dot handle remain in separate lanes',
		);
		assert.ok(
			narrowDisclosureBox.x >= mainBox.x &&
			narrowHandleBox.x + narrowHandleBox.width <= mainBox.x + mainBox.width,
			`both narrow rail lanes remain inside the Composer viewport: main=${JSON.stringify(mainBox)} disclosure=${JSON.stringify(narrowDisclosureBox)} handle=${JSON.stringify(narrowHandleBox)}`,
		);
		assert.deepEqual(pageErrors, [], `browser errors: ${pageErrors.join('\n')}`);
	} finally {
		await browser.close();
	}
	console.log('composer-unitized-rail-geometry: passed');
} finally {
	vite.kill('SIGTERM');
}
