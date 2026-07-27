/**
 * Peak Composer — block instruction morph and rail reachability QA.
 *
 * This deliberately uses real pointer moves against the ComposerRoot harness.
 * It locks the owner-approved interaction chain:
 * hover -> 指令 -> same-shell morph -> input -> leave whole block closes and
 * clears -> re-enter shows the original action pills.
 *
 * Run: node test/composer-block-instruction.qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3216;
const url = `http://localhost:${port}/composer.html`;
const shotsDir = path.join(repo, '.dev', 'harness', 'shots', 'composer-block-instruction');
fs.mkdirSync(shotsDir, { recursive: true });

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

async function waitForMode(page, row, mode) {
	await page.waitForFunction(
		({ selector, expected }) => document.querySelector(selector)?.getAttribute('data-mode') === expected,
		{ selector: await row.evaluate((el) => {
			el.setAttribute('data-instruction-qa-row', 'true');
			return '[data-instruction-qa-row="true"]';
		}), expected: mode },
		{ timeout: 2500 },
	);
}

function numeric(value) {
	return Number.parseFloat(value);
}

try {
	await waitForVite();
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1400, height: 980 }, deviceScaleFactor: 2 });
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.waitForSelector('.peak-composer-root .pk-composer-block[data-kind="paragraph"]');

	const block = page.locator('.pk-composer-block[data-kind="paragraph"]').first();
	const row = block.locator('.pk-block-action-row');
	const shell = row.locator('.pk-block-action-row__shell');
	const trigger = row.locator('.pk-action-tail .pk-action-capsule').last();
	const input = row.locator('.pk-block-action-row__instruction');
	const close = row.locator('.pk-block-action-row__close');
	await row.evaluate((el) => { window.__pkInstructionRoot = el; });

	await block.hover();
	await page.waitForTimeout(180);
	assert.equal(await row.getAttribute('data-mode'), 'actions', 'hover starts in action-pill mode');
	assert.equal(await shell.evaluate((el) => getComputedStyle(el).minHeight), '38px', 'visible shell keeps the 38px action rung');
	assert.ok((await row.locator('.pk-action-core .pk-action-capsule').count()) >= 3, 'original deterministic actions render');
	const visibleHeight = await row.evaluate((el) => el.getBoundingClientRect().height);
	assert.ok(visibleHeight >= 38, `hovered action wrapper reveals its shell (${visibleHeight}px)`);

	await trigger.click();
	await page.screenshot({ path: path.join(shotsDir, 'instruction-morph-000ms.png') });
	assert.equal(await row.getAttribute('data-mode'), 'instruction', 'instruction click changes the existing wrapper mode');
	const identityIsStable = await row.evaluate((el) => el === window.__pkInstructionRoot);
	assert.equal(identityIsStable, true, 'morph keeps the same action-row root node');
	const transition = await row.locator('.pk-block-action-row__options').evaluate((el) => getComputedStyle(el).transitionDuration);
	assert.match(transition, /0\.32s/, 'options use the reference 0.32s morph duration');

	await page.waitForTimeout(120);
	await page.screenshot({ path: path.join(shotsDir, 'instruction-morph-120ms.png') });
	const middle = await row.evaluate((el) => {
		const options = el.querySelector('.pk-block-action-row__options');
		const field = el.querySelector('.pk-block-action-row__instruction-shell');
		return {
			optionsOpacity: getComputedStyle(options).opacity,
			fieldOpacity: getComputedStyle(field).opacity,
			fieldMaxWidth: getComputedStyle(field).maxWidth,
		};
	});
	assert.ok(numeric(middle.optionsOpacity) < 1, `options are fading at 120ms (${middle.optionsOpacity})`);
	assert.ok(numeric(middle.fieldOpacity) > 0, `input is fading in at 120ms (${middle.fieldOpacity})`);

	await page.waitForTimeout(250);
	await page.screenshot({ path: path.join(shotsDir, 'instruction-morph-350ms.png') });
	const finalMorph = await row.evaluate((el) => {
		const options = el.querySelector('.pk-block-action-row__options');
		const field = el.querySelector('.pk-block-action-row__instruction-shell');
		return {
			optionsMaxWidth: getComputedStyle(options).maxWidth,
			optionsVisibility: getComputedStyle(options).visibility,
			fieldMaxWidth: getComputedStyle(field).maxWidth,
			fieldVisibility: getComputedStyle(field).visibility,
		};
	});
	assert.equal(finalMorph.optionsMaxWidth, '0px', 'options finish collapsed');
	assert.equal(finalMorph.optionsVisibility, 'hidden', 'collapsed options cannot receive pointer focus');
	assert.equal(finalMorph.fieldMaxWidth, '640px', 'input shell reaches the reference max width');
	assert.equal(finalMorph.fieldVisibility, 'visible', 'input shell finishes visible');
	assert.equal(await input.evaluate((el) => el === el.ownerDocument.activeElement), true, 'instruction input receives focus after the morph');
	const hiddenOptionTabStops = await row.evaluate((el) =>
		[...el.querySelectorAll('.pk-block-action-row__options button')].filter((button) => button.tabIndex >= 0).length,
	);
	assert.equal(hiddenOptionTabStops, 0, 'collapsed option buttons are removed from keyboard tab order');

	const inputBox = await input.boundingBox();
	assert.ok(inputBox, 'input has a pointer-reachable box');
	await page.mouse.move(inputBox.x + 12, inputBox.y + inputBox.height / 2);
	assert.equal(await row.getAttribute('data-mode'), 'instruction', 'moving into the child input does not close the block panel');
	await input.fill('discard this unfinished instruction');

	const blockBox = await block.boundingBox();
	assert.ok(blockBox, 'block has a bounding box');
	await page.mouse.move(blockBox.x + blockBox.width + 80, blockBox.y + 8);
	await waitForMode(page, row, 'actions');
	assert.equal(await input.inputValue(), '', 'whole-block leave clears the unfinished instruction');

	await block.hover();
	await page.waitForTimeout(180);
	assert.equal(await row.getAttribute('data-mode'), 'actions', 're-enter returns to original action options');
	assert.equal(await row.locator('.pk-action-core [data-action="insert"]').count(), 1, 're-enter restores insert action');
	assert.equal(await row.locator('.pk-block-action-row__options').evaluate((el) => getComputedStyle(el).visibility), 'visible', 'action pills are visible after re-enter');

	await trigger.click();
	await input.press('Escape');
	await waitForMode(page, row, 'actions');
	await trigger.click();
	await close.click();
	await waitForMode(page, row, 'actions');
	await trigger.click();
	await input.fill('make the paragraph tighter');
	await input.press('Enter');
	await waitForMode(page, row, 'actions');

	await page.mouse.move(2, 2);
	await page.waitForTimeout(520);
	const hiddenRow = await row.evaluate((el) => {
		const style = getComputedStyle(el);
		return { height: el.getBoundingClientRect().height, marginTop: style.marginTop, visibility: style.visibility };
	});
	assert.equal(hiddenRow.height, 0, `hidden action wrapper occupies no document flow (${hiddenRow.height}px)`);
	assert.equal(hiddenRow.marginTop, '0px', 'hidden action wrapper has no inter-block margin');
	assert.equal(hiddenRow.visibility, 'hidden', 'hidden action wrapper is not reachable');

	await block.hover();
	await page.waitForTimeout(190);
	const disclosure = block.locator('.pk-composer-disclosure');
	const drag = block.locator('.pk-composer-drag');
	const [disclosureBox, dragBox] = await Promise.all([disclosure.boundingBox(), drag.boundingBox()]);
	assert.ok(disclosureBox && dragBox, 'rail controls have layout');
	assert.deepEqual(
		[Math.round(disclosureBox.width), Math.round(disclosureBox.height), Math.round(dragBox.width), Math.round(dragBox.height)],
		[30, 30, 30, 30],
		'rail pair stays 30×30',
	);
	assert.equal(Math.round(dragBox.y - (disclosureBox.y + disclosureBox.height)), 6, 'rail pair keeps the reference 6px gap');
	assert.equal(Math.round(disclosureBox.x - blockBox.x), -43, 'rail starts 43px into the left gutter');
	assert.equal(Math.round(disclosureBox.y - blockBox.y), 4, 'rail control starts after the 4px corridor inset');

	const proseStart = { x: blockBox.x + 20, y: blockBox.y + 10 };
	const railTarget = { x: disclosureBox.x + 15, y: disclosureBox.y + 15 };
	await page.mouse.move(proseStart.x, proseStart.y);
	for (let x = proseStart.x - 2; x >= railTarget.x; x -= 2) await page.mouse.move(x, railTarget.y);
	await page.waitForTimeout(160);
	const railState = await disclosure.evaluate((el) => {
		const rail = el.closest('.pk-composer-rail');
		const style = getComputedStyle(rail);
		return { opacity: style.opacity, visibility: style.visibility, pointerEvents: style.pointerEvents };
	});
	assert.deepEqual(railState, { opacity: '1', visibility: 'visible', pointerEvents: 'auto' }, 'pointer can cross the rail corridor without losing the controls');

	const gaps = await page.evaluate(() => {
		const expected = { title: '28px', heading: '32px', paragraph: '12px', lead: '18px', detail: '8px', list: '12px', task: '12px', math: '12px', quote: '16px', table: '56px' };
		return Object.fromEntries(Object.keys(expected).map((role) => {
			const el = document.querySelector(`.pk-composer-block[data-spacing="${role}"]`);
			return [role, el ? getComputedStyle(el).marginTop : null];
		}));
	});
	for (const [role, expected] of Object.entries({ title: '28px', heading: '32px', paragraph: '12px', lead: '18px', detail: '8px', list: '12px', task: '12px', math: '12px', quote: '16px', table: '56px' })) {
		if (gaps[role] === null) continue;
		assert.equal(gaps[role], expected, `${role} spacing matches the reference semantic gap`);
	}

	await page.screenshot({ path: path.join(shotsDir, 'rail-corridor.png') });
	await browser.close();
	console.log(`PASS composer-block-instruction → ${shotsDir}`);
} finally {
	vite.kill('SIGTERM');
}
