/**
 * Peak Composer — table object-toolbar hover transfer regression.
 *
 * The toolbar is visually above the table, so a pointer can leave the table
 * before it reaches a toolbar control. The surface clearance must therefore be
 * inside the hover owner, without making the toolbar permanently visible.
 *
 * Run: node test/composer-table-toolbar-hover.qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3214;
const url = `http://localhost:${port}/composer.html`;
const vite = spawn('npx', ['vite', '--config', '.dev/harness/vite.harness.config.mts', '--port', String(port), '--strictPort'], {
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
	await page.goto(url, { waitUntil: 'networkidle' });

	const surface = page.locator('.pk-table-surface').first();
	const toolbar = surface.locator('.pk-table-toolbar');
	await surface.hover();
	await page.waitForTimeout(160);
	assert.equal(await toolbar.evaluate((el) => getComputedStyle(el).opacity), '1', 'table hover reveals the toolbar');
	assert.equal(await toolbar.evaluate((el) => getComputedStyle(el).pointerEvents), 'auto', 'revealed toolbar accepts pointer input');

	const safeZone = await surface.evaluate((el) => {
		const style = getComputedStyle(el);
		return {
			paddingTop: style.paddingTop,
			marginTop: style.marginTop,
		};
	});
	assert.ok(Number.parseFloat(safeZone.paddingTop) >= 40, `surface padding owns the hover-safe clearance; got ${safeZone.paddingTop}`);
	assert.equal(safeZone.marginTop, '0px', 'surface does not leave clearance outside its hover box');

	const toolbarBox = await toolbar.boundingBox();
	assert.ok(toolbarBox, 'toolbar has layout before pointer transfer');
	const surfaceBox = await surface.boundingBox();
	assert.ok(surfaceBox, 'surface has layout before pointer transfer');
	const tableBox = await surface.locator('.pk-composer-table').boundingBox();
	assert.ok(tableBox, 'table has layout before pointer transfer');
	assert.ok(toolbarBox.y >= surfaceBox.y, 'toolbar remains inside the surface hover owner');
	const visualGap = tableBox.y - (toolbarBox.y + toolbarBox.height);
	assert.ok(visualGap >= 8 && visualGap <= 16, `toolbar keeps its intended visual air gap; got ${visualGap}px`);
	const bridgePoint = { x: toolbarBox.x + Math.min(16, toolbarBox.width / 2), y: surfaceBox.y + 2 };
	const bridgeTarget = await page.evaluate(({ x, y }) => {
		const el = document.elementFromPoint(x, y);
		return { isSurface: el?.classList.contains('pk-table-surface'), className: el?.className, tagName: el?.tagName };
	}, bridgePoint);
	assert.equal(bridgeTarget.isSurface, true, `the clearance resolves pointer hit-testing to the table surface; got ${JSON.stringify(bridgeTarget)}`);
	await page.mouse.move(bridgePoint.x, bridgePoint.y);
	await page.waitForTimeout(100);
	assert.equal(await toolbar.evaluate((el) => getComputedStyle(el).opacity), '1', 'pointer can cross the safe zone without hiding the toolbar');
	await toolbar.locator('button').first().focus();
	assert.equal(await toolbar.locator('button').first().evaluate((el) => el === el.ownerDocument.activeElement), true, 'toolbar remains keyboard reachable');
	await toolbar.locator('button').first().evaluate((el) => el.blur());

	await page.mouse.move(2, 2);
	await page.waitForTimeout(180);
	assert.equal(await toolbar.evaluate((el) => getComputedStyle(el).opacity), '0', 'toolbar still closes after pointer leaves the table and bridge');

	await browser.close();
	console.log('PASS composer-table-toolbar-hover');
} finally {
	vite.kill('SIGTERM');
}
