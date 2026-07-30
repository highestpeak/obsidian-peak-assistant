/**
 * Peak Composer — pointer-relative between-block insertion QA.
 *
 * This uses real pointer moves against the production ComposerRoot harness.
 * It proves that the plus follows pointer X, opens the type rail on hover
 * without a click, keeps the pointer corridor open, stays inside the paper,
 * and enters the existing NewBlockDraft transaction path.
 *
 * Run: node test/composer-between-block-hover-insert.qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3226;
const url = `http://localhost:${port}/composer.html`;
const shotsDir = path.join(
	repo,
	'.dev',
	'harness',
	'shots',
	'composer-between-block-hover-insert',
);
fs.mkdirSync(shotsDir, { recursive: true });

const vite = spawn(
	'npx',
	[
		'vite',
		'--config',
		'.dev/harness/vite.harness.config.mts',
		'--port',
		String(port),
		'--strictPort',
	],
	{
		cwd: repo,
		stdio: ['ignore', 'pipe', 'pipe'],
	},
);

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

async function leaveInsertionSurface(page) {
	await page.mouse.move(2, 2);
	await page.waitForTimeout(240);
}

async function openGapAt(page, gap, fraction) {
	await leaveInsertionSurface(page);
	const hitArea = gap.locator('.pk-between-block-insert__hit-area');
	await hitArea.scrollIntoViewIfNeeded();
	const hitBox = await hitArea.boundingBox();
	assert.ok(hitBox, 'between-block hit area has geometry');
	const pointer = {
		x: hitBox.x + hitBox.width * fraction,
		y: hitBox.y + hitBox.height / 2,
	};
	await page.mouse.move(pointer.x, hitBox.y + 1);
	await page.mouse.move(pointer.x, pointer.y);
	const menu = gap.locator('.pk-between-block-insert__menu');
	await menu.waitFor({ state: 'visible' });
	const triggerBox = await gap.locator('.pk-between-block-insert__trigger').boundingBox();
	assert.ok(triggerBox, 'hovered plus has geometry');
	const triggerCenterX = triggerBox.x + triggerBox.width / 2;
	assert.ok(
		Math.abs(triggerCenterX - pointer.x) <= 2,
		`plus follows pointer X (${triggerCenterX} vs ${pointer.x})`,
	);
	return { hitBox, menu, pointer };
}

try {
	await waitForVite();
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({
		viewport: { width: 1400, height: 980 },
		deviceScaleFactor: 2,
	});
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.peak-composer-root .pk-between-block-insert', {
		state: 'attached',
	});

	const gap = page.locator('.pk-between-block-insert[data-next-spacing="paragraph"]').first();
	const anchorBlockId = await gap.getAttribute('data-insert-after-block');
	assert.ok(anchorBlockId, 'gap records its real source insertion owner');
	const trigger = gap.locator('.pk-between-block-insert__trigger');
	await trigger.evaluate((element) => {
		window.__pkBetweenBlockTriggerClicks = 0;
		element.addEventListener('click', () => {
			window.__pkBetweenBlockTriggerClicks += 1;
		});
	});

	const leftOpen = await openGapAt(page, gap, 0.24);
	assert.equal(
		await page.evaluate(() => window.__pkBetweenBlockTriggerClicks),
		0,
		'hover opens the insertion menu without synthesizing a click',
	);
	assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'hovered plus reports its open state');
	const defaultItem = leftOpen.menu.locator('.pk-insert-type-menu__item[data-default]');
	assert.equal(await defaultItem.textContent(), '段落', 'paragraph remains the visible default');

	const triggerBox = await trigger.boundingBox();
	const menuBox = await leftOpen.menu.boundingBox();
	assert.ok(triggerBox && menuBox, 'trigger and menu have pointer-reachable geometry');
	const start = {
		x: triggerBox.x + triggerBox.width / 2,
		y: triggerBox.y + triggerBox.height / 2,
	};
	const end = {
		x: menuBox.x + Math.min(menuBox.width / 2, 140),
		y: menuBox.y + menuBox.height / 2,
	};
	for (let step = 1; step <= 12; step += 1) {
		const progress = step / 12;
		await page.mouse.move(
			start.x + (end.x - start.x) * progress,
			start.y + (end.y - start.y) * progress,
		);
	}
	await page.waitForTimeout(240);
	assert.equal(
		await leftOpen.menu.isVisible(),
		true,
		'crossing from plus to the menu keeps the hover corridor open',
	);

	const rightOpen = await openGapAt(page, gap, 0.97);
	const gapBox = await gap.boundingBox();
	const rightMenuBox = await rightOpen.menu.boundingBox();
	assert.ok(gapBox && rightMenuBox, 'right-edge menu has geometry');
	assert.ok(rightMenuBox.x >= gapBox.x - 1, 'menu stays inside the paper at its left edge');
	assert.ok(
		rightMenuBox.x + rightMenuBox.width <= gapBox.x + gapBox.width + 1,
		'menu shifts left instead of overflowing the paper at the right edge',
	);
	await page.screenshot({ path: path.join(shotsDir, 'hover-menu-right-edge.png') });

	await rightOpen.menu.locator('.pk-insert-type-menu__item[data-default]').click();
	const draft = page.locator('.pk-new-block-draft');
	await draft.waitFor({ state: 'visible' });
	assert.equal(
		await draft.evaluate((element) => element.parentElement?.dataset.composerSurfaceOwner),
		anchorBlockId,
		'type selection opens the existing draft after the real anchor block',
	);
	const draftInput = draft.locator('.pk-new-block-draft__input');
	assert.equal(
		await draftInput.evaluate((element) => element === element.ownerDocument.activeElement),
		true,
		'the existing draft receives focus',
	);
	await draftInput.press('Escape');
	await draft.waitFor({ state: 'hidden' });

	const listGap = page.locator('.pk-composer-list__gap-anchor[data-list-gap-index="1"]').first();
	await listGap.scrollIntoViewIfNeeded();
	const listGapBox = await listGap.boundingBox();
	assert.ok(listGapBox, 'list-item gap has geometry');
	const listTrigger = listGap.locator('.pk-composer-list__gap-trigger');
	await listTrigger.evaluate((element) => {
		window.__pkListGapTriggerClicks = 0;
		window.__pkListGapPointerProof = null;
		element.addEventListener('click', () => {
			window.__pkListGapTriggerClicks += 1;
		});
		element.addEventListener('pointerenter', (event) => {
			const rect = element.getBoundingClientRect();
			window.__pkListGapPointerProof = {
				clientX: event.clientX,
				centerX: rect.left + rect.width / 2,
			};
		});
	});
	await leaveInsertionSurface(page);
	const listPointer = {
		x: listGapBox.x + listGapBox.width * 0.72,
		y: listGapBox.y + listGapBox.height / 2,
	};
	await page.mouse.move(listPointer.x, listPointer.y - 6);
	await page.mouse.move(listPointer.x, listPointer.y);
	await page.mouse.move(listPointer.x + 1, listPointer.y);
	const listForm = listGap.locator('.pk-composer-list__gap-form');
	await listForm.waitFor({ state: 'visible' });
	const listProof = await page.evaluate(() => window.__pkListGapPointerProof);
	assert.ok(listProof, 'the moving list-item plus receives a real pointerenter');
	assert.ok(
		Math.abs(listProof.centerX - listProof.clientX) <= 2,
		'list-item plus is generated at the pointer X position',
	);
	assert.equal(
		await page.evaluate(() => window.__pkListGapTriggerClicks),
		0,
		'list-item form also opens on hover without a click',
	);
	await listForm.locator('input').press('Escape');
	await listForm.waitFor({ state: 'hidden' });

	assert.deepEqual(pageErrors, [], `harness emitted no page errors: ${pageErrors.join('; ')}`);
	await browser.close();
	console.log(`PASS composer-between-block-hover-insert → ${shotsDir}`);
} finally {
	vite.kill('SIGTERM');
}
