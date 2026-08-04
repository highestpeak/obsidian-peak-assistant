/**
 * Peak Composer — table object-toolbar hover transfer regression.
 *
 * The toolbar is visually above the table without reserving a blank internal
 * row. It remains an absolutely positioned child and overlaps the table edge,
 * so the pointer transfer stays inside one continuous hover owner.
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
	for (const label of ['Left', 'Center', 'Right']) {
		assert.equal(await toolbar.getByRole('button', { name: label, exact: true }).count(), 1, `${label} alignment is directly available without a menu`);
	}
	assert.equal(await toolbar.locator('.pk-table-menu').count(), 0, 'alignment does not require an intermediate popover');

	const structureActions = [
		['Add row', 'row', 'add'],
		['Remove row', 'row', 'remove'],
		['Add column', 'column', 'add'],
		['Remove column', 'column', 'remove'],
	];
	for (const [label, axis, operation] of structureActions) {
		const button = toolbar.getByRole('button', { name: label });
		const icon = button.locator(`.pk-table-tool__icon[data-axis="${axis}"][data-operation="${operation}"]`);
		assert.equal(await icon.count(), 1, `${label} exposes both ${axis} and ${operation} semantics`);
		assert.equal(await icon.locator('.pk-table-tool__icon-badge').count(), 1, `${label} renders a visible operation badge`);
	}
	const addColumn = toolbar.getByRole('button', { name: 'Add column' });
	assert.equal(await addColumn.evaluate((el) => getComputedStyle(el).height), '28px', 'table controls use the same 28px control height as the bottom action row');
	assert.equal(await addColumn.locator('.pk-table-tool__icon > svg').first().getAttribute('width'), '16', 'compact table controls keep a legible 16px base icon');
	assert.equal(await addColumn.getAttribute('title'), null, 'table controls do not create a second slow native title tooltip');
	await addColumn.hover();
	await page.waitForTimeout(100);
	const addColumnTooltip = addColumn.locator('xpath=..').getByRole('tooltip');
	assert.equal(await addColumnTooltip.evaluate((el) => getComputedStyle(el).opacity), '1', 'action tooltip appears without the native browser delay');
	assert.match(await addColumnTooltip.textContent(), /Add column.*Insert a column after the active column/, 'tooltip explains what the plus-column action does');

	const safeZone = await surface.evaluate((el) => {
		const style = getComputedStyle(el);
		return {
			paddingTop: style.paddingTop,
			marginTop: style.marginTop,
		};
	});
	assert.equal(safeZone.paddingTop, '0px', 'surface does not reserve a permanently empty toolbar row');
	assert.equal(safeZone.marginTop, '0px', 'surface does not leave clearance outside its hover box');

	const toolbarBox = await toolbar.boundingBox();
	assert.ok(toolbarBox, 'toolbar has layout before pointer transfer');
	const surfaceBox = await surface.boundingBox();
	assert.ok(surfaceBox, 'surface has layout before pointer transfer');
	const tableBox = await surface.locator('.pk-composer-table').boundingBox();
	assert.ok(tableBox, 'table has layout before pointer transfer');
	assert.ok(toolbarBox.y < surfaceBox.y, 'toolbar floats above the grid while remaining a surface child');
	const visualGap = tableBox.y - (toolbarBox.y + toolbarBox.height);
	assert.ok(visualGap >= -6 && visualGap <= 0, `toolbar overlaps the table edge to keep a continuous pointer path; got ${visualGap}px`);
	const bridgePoint = { x: toolbarBox.x + Math.min(16, toolbarBox.width / 2), y: surfaceBox.y + 2 };
	const bridgeTarget = await page.evaluate(({ x, y }) => {
		const el = document.elementFromPoint(x, y);
		return { inSurface: Boolean(el?.closest('.pk-table-surface')), className: el?.className, tagName: el?.tagName };
	}, bridgePoint);
	assert.equal(bridgeTarget.inSurface, true, `the overlap resolves pointer hit-testing inside the table surface; got ${JSON.stringify(bridgeTarget)}`);
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
