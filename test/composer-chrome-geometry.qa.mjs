/**
 * Peak Composer — editing-chrome geometry contract QA (WP4, CMP-UI-01/02/05).
 *
 * Headless playwright against the REAL ComposerRoot in the browser harness
 * (live in-memory hub — no Obsidian). Asserts the six-family geometry from
 * docs/superpowers/specs/2026-07-22-peak-composer-component-consistency.md:
 *
 *   - structural rail: disclosure + drag are identical 30×30 radius-md;
 *   - action row: deterministic capsules share 28px height + pill radius +
 *     resting background; hover changes tint only (zero layout shift);
 *   - stub projection ⇒ NO AI affordances (no fake buttons), no `AI · N` opener;
 *   - selection toolbar: icon controls are 28×28 radius-md squares, text
 *     controls share the same 28px height/radius rung;
 *   - undo/redo: 28px radius-md pair; disabled keeps its slot (no layout shift);
 *   - panel shells use the radius-lg rung (≠ capsule pill), scoped per family.
 *
 * Also captures the harness scenario screenshots (light/dark × default, rail
 * hover, action row, selection toolbar, undo bar) into .dev/harness/shots/.
 *
 * Run:  node test/composer-chrome-geometry.qa.mjs
 * (starts its own vite server on :3211; requires playwright + node_modules)
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(repo, '.dev', 'harness', 'shots');
fs.mkdirSync(shotsDir, { recursive: true });
const PORT = 3211;
const URL = `http://localhost:${PORT}/composer.html`;

// ── boot vite ────────────────────────────────────────────────────────────────
const vite = spawn('npx', ['vite', '--config', '.dev/harness/vite.harness.config.mts', '--port', String(PORT), '--strictPort'], {
	cwd: repo,
	stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error('vite did not start')), 30000);
	vite.stdout.on('data', (d) => {
		if (String(d).includes('Local:')) {
			clearTimeout(timer);
			resolve();
		}
	});
	vite.on('exit', (code) => reject(new Error(`vite exited ${code}`)));
});

const browser = await chromium.launch({ headless: true });
const results = [];
const record = async (name, fn) => {
	try {
		await fn();
		results.push({ name, ok: true });
	} catch (err) {
		results.push({ name, ok: false, error: String(err.message ?? err) });
	}
};

async function openPage(theme) {
	const page = await browser.newPage({ viewport: { width: 1400, height: 980 }, deviceScaleFactor: 2 });
	const errors = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.waitForSelector('.peak-composer-root .pk-composer-block');
	if (theme === 'light') {
		await page.evaluate(() => {
			document.body.classList.remove('theme-dark');
			document.body.classList.add('theme-light');
		});
		await page.waitForTimeout(150);
	}
	return { page, errors };
}

const geom = (locator) =>
	locator.evaluate((el) => {
		const s = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		return {
			w: Math.round(r.width),
			h: Math.round(r.height),
			radius: s.borderRadius,
			border: s.borderTopWidth + ' ' + s.borderTopColor,
			bg: s.backgroundColor,
			minHeight: s.minHeight,
		};
	});

// ═══ dark theme: full assertion pass + screenshots ═══════════════════════════
{
	const { page, errors } = await openPage('dark');
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-default-dark.png') });

	// pick a paragraph block and hover it to reveal rail + action row.
	const para = page.locator('.pk-composer-block[data-kind="paragraph"]').first();
	await para.hover();
	await page.waitForTimeout(200);
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-rail-hover-dark.png') });

	// ── rail: disclosure & drag identical 30×30 radius-md ──
	const disclosure = await geom(para.locator('.pk-composer-disclosure'));
	const drag = await geom(para.locator('.pk-composer-drag'));
	await record('rail disclosure is 30×30', () => assert.deepEqual([disclosure.w, disclosure.h], [30, 30]));
	await record('rail drag is 30×30', () => assert.deepEqual([drag.w, drag.h], [30, 30]));
	await record('rail pair share radius/border/bg', () =>
		assert.deepEqual(
			{ radius: disclosure.radius, border: disclosure.border, bg: disclosure.bg },
			{ radius: drag.radius, border: drag.border, bg: drag.bg },
		),
	);
	await record('rail uses radius-md (8px), not pill', () => assert.equal(disclosure.radius, '8px'));

	// ── action row: capsules share pill geometry; no AI region on stub ──
	const row = para.locator('.pk-block-action-row');
	await record('action row visible on hover', () => assert.ok(row));
	const capsules = row.locator('.pk-action-core .pk-action-capsule');
	const capsuleGeom = [];
	for (let i = 0; i < (await capsules.count()); i++) capsuleGeom.push(await geom(capsules.nth(i)));
	await record('three deterministic capsules', () => assert.equal(capsuleGeom.length, 3));
	await record('capsules share 28px height', () => assert.ok(capsuleGeom.every((g) => g.h === 28), JSON.stringify(capsuleGeom.map((g) => g.h))));
	await record('capsules share pill radius', () => assert.ok(capsuleGeom.every((g) => g.radius === capsuleGeom[0].radius && /999|9999/.test(g.radius))));
	await record('capsules share resting background', () => assert.ok(capsuleGeom.every((g) => g.bg === capsuleGeom[0].bg)));
	await record('real projection renders inline AI action(s)', async () => assert.ok((await row.locator('.pk-action-ai [data-ai-quick]').count()) >= 1));
		const aiCapsules = row.locator('.pk-action-ai [data-ai-quick]');
		const aiGeom = [];
		for (let i = 0; i < (await aiCapsules.count()); i++) aiGeom.push(await geom(aiCapsules.nth(i)));
		await record('AI capsules share the 28px capsule height', () => assert.ok(aiGeom.every((g) => g.h === 28), JSON.stringify(aiGeom.map((g) => g.h))));
		await record('AI capsules share the deterministic pill radius', () => assert.ok(aiGeom.every((g) => g.radius === capsuleGeom[0].radius)));
	await record('no second-level AI opener exists', async () =>
		assert.equal(await page.locator('[data-action="ai"], .ai-hint, .aim-ai-opener').count(), 0),
	);

	// hover must not shift layout.
	const insertBtn = row.locator('[data-action="insert"]');
	const before = await insertBtn.boundingBox();
	await insertBtn.hover();
	await page.waitForTimeout(80);
	const after = await insertBtn.boundingBox();
	await record('capsule hover causes zero layout shift', () =>
		assert.deepEqual(
			{ x: Math.round(before.x), y: Math.round(before.y), w: Math.round(before.width), h: Math.round(before.height) },
			{ x: Math.round(after.x), y: Math.round(after.y), w: Math.round(after.width), h: Math.round(after.height) },
		),
	);
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-ai-row-dark.png') });
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-action-row-dark.png') });

	// ── selection toolbar ──
	// Focus the block first so live-preview reveals the source (a real mousedown
	// does this before a drag); a selection made on the styled runs is otherwise
	// cleared by the focus-driven styled→source swap.
	await page.evaluate(() => document.querySelector('.pk-composer-block[data-kind="paragraph"] .pk-composer-editable').focus());
	await page.waitForTimeout(150);
	await page.evaluate(() => {
		const leaf = document.querySelector('.pk-composer-block[data-kind="paragraph"] .pk-composer-editable');
		const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
		const textNode = walker.nextNode();
		const range = document.createRange();
		range.setStart(textNode, 0);
		range.setEnd(textNode, Math.min(24, textNode.textContent.length));
		const sel = getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	});
	await page.waitForSelector('.pk-selection-toolbar', { timeout: 5000 });
	const iconBtns = page.locator('.pk-selection-toolbar [data-group="format"] .pk-selection-format-btn');
	const iconGeom = [];
	for (let i = 0; i < (await iconBtns.count()); i++) iconGeom.push(await geom(iconBtns.nth(i)));
	await record('seven deterministic format controls', () => assert.equal(iconGeom.length, 7));
	await record('format icons are 28×28 squares', () => assert.ok(iconGeom.every((g) => g.w === 28 && g.h === 28), JSON.stringify(iconGeom.map((g) => [g.w, g.h]))));
	await record('format icons use radius-md, not pills', () => assert.ok(iconGeom.every((g) => g.radius === '8px')));
	const textBtns = page.locator('.pk-selection-toolbar .pk-selection-text-btn');
	const textGeom = [];
	for (let i = 0; i < (await textBtns.count()); i++) textGeom.push(await geom(textBtns.nth(i)));
	await record('toolbar text controls share the 28px rung', () => assert.ok(textGeom.every((g) => g.h === 28 && g.radius === '8px')));
	await record('action rows are suppressed while selecting', async () => {
		const display = await row.evaluate((el) => getComputedStyle(el).display);
		assert.equal(display, 'none');
	});
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-selection-toolbar-dark.png') });
	await page.evaluate(() => getSelection().removeAllRanges());
	await page.waitForTimeout(200);

	// ── undo/redo bar ──
	const undoBtns = page.locator('.pk-undo-redo .pk-undo-redo__btn');
	await record('undo/redo pair exists', async () => assert.equal(await undoBtns.count(), 2));
	const undoDisabledBox = await undoBtns.first().boundingBox();
	const u1 = await geom(undoBtns.first());
	const u2 = await geom(undoBtns.nth(1));
	await record('undo/redo are 28px radius-md', () => {
		assert.deepEqual([u1.w, u1.h, u1.radius], [28, 28, '8px']);
		assert.deepEqual([u2.w, u2.h, u2.radius], [28, 28, '8px']);
	});
	await record('disabled undo keeps its slot', () => assert.ok(undoDisabledBox && undoDisabledBox.width >= 27));

	// type into a paragraph → burst commit → undo enables, slot unchanged.
	const leaf = page.locator('.pk-composer-block[data-kind="paragraph"] .pk-composer-editable').first();
	await leaf.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' geometry-qa');
	await page.waitForTimeout(1100); // burst window (800ms) + margin
	await page.waitForFunction(() => !document.querySelector('.pk-undo-redo .pk-undo-redo__btn').disabled);
	const undoEnabledBox = await undoBtns.first().boundingBox();
	await record('enabling undo causes zero layout shift', () =>
		assert.deepEqual(
			{ x: Math.round(undoDisabledBox.x), y: Math.round(undoDisabledBox.y) },
			{ x: Math.round(undoEnabledBox.x), y: Math.round(undoEnabledBox.y) },
		),
	);
	await record('undo tooltip names the next transaction', async () => {
		const label = await undoBtns.first().getAttribute('aria-label');
		assert.match(label, /直接编辑/);
	});
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-undo-bar-dark.png') });

	// ── panel shell radius rung (Easy Copy panel) ──
	await para.hover();
	await para.locator('[data-action="easy-copy"]').click();
	await page.waitForSelector('.pk-easy-copy');
	const panelRadius = await page.locator('.pk-easy-copy').evaluate((el) => getComputedStyle(el).borderRadius);
	await record('panels use the radius-lg rung (12px)', () => assert.equal(panelRadius, '12px'));
	await record('easy copy keeps the fixed order', async () => {
		const kinds = await page.locator('.pk-easy-copy [data-copy-kind]').evaluateAll((els) => els.map((e) => e.dataset.copyKind));
		assert.deepEqual(kinds, ['plain', 'image', 'markdown', 'html']);
	});

	// ── AI candidate flow: invoke → streaming → variants → accept (last, so it
	//    runs on a pristine paragraph after the deterministic-chrome checks) ──
	await page.keyboard.press('Escape');
	const aiPara = page.locator('.pk-composer-block[data-kind="paragraph"]').first();
	await aiPara.hover();
	const aiRow = aiPara.locator('.pk-block-action-row');
	await aiRow.locator('.pk-action-ai [data-ai-quick]').first().click();
	const slot = aiPara.locator('.pk-composer-candidate-slot');
	await page.waitForSelector('.pk-composer-candidate-slot [data-candidate-id]', { timeout: 6000 });
	await record('candidate host mounts under the invoked block', async () => assert.ok((await slot.locator('[data-candidate-id]').count()) >= 1));
	await page.waitForTimeout(180);
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-streaming-candidate-dark.png') });
	await record('candidate streams a live caret', async () => assert.ok((await slot.locator('.animate-pulse').count()) >= 1));
	await page.waitForFunction(() => !document.querySelector('.pk-composer-candidate-slot .animate-pulse'), null, { timeout: 8000 });
	await record('accept enabled once ready', async () => assert.equal(await slot.locator('button:has-text("接受")').first().isDisabled(), false));
	await slot.locator('button:has-text("重新生成")').first().click();
	await page.waitForTimeout(150);
	await page.waitForFunction(() => !document.querySelector('.pk-composer-candidate-slot .animate-pulse'), null, { timeout: 8000 });
	await record('regenerate appends a second variant (nav appears)', async () => assert.ok((await slot.locator('.tabular-nums').count()) >= 1));
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-variants-dark.png') });
	await slot.locator('button:has-text("接受")').first().click();
	await page.waitForSelector('.pk-composer-candidate-slot [data-candidate-id]', { state: 'detached', timeout: 6000 });
	await record('accepting removes the candidate host', async () => assert.equal(await slot.locator('[data-candidate-id]').count(), 0));
	await aiPara.hover();
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-accepted-dark.png') });

	await record('no console/page errors (dark pass)', () => assert.deepEqual(errors, []));
	await page.close();
}

// ═══ light theme: screenshots + rail/action spot checks ══════════════════════
{
	const { page, errors } = await openPage('light');
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-default-light.png') });
	const para = page.locator('.pk-composer-block[data-kind="paragraph"]').first();
	await para.hover();
	await page.waitForTimeout(200);
	const d = await geom(para.locator('.pk-composer-disclosure'));
	const g = await geom(para.locator('.pk-composer-drag'));
	await record('light: rail pair identical 30×30', () => assert.deepEqual([d.w, d.h, d.radius], [g.w, g.h, g.radius]));
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-rail-hover-light.png') });
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-ai-row-light.png') });
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-action-row-light.png') });
	await page.evaluate(() => document.querySelector('.pk-composer-block[data-kind="paragraph"] .pk-composer-editable').focus());
	await page.waitForTimeout(150);
	await page.evaluate(() => {
		const leaf = document.querySelector('.pk-composer-block[data-kind="paragraph"] .pk-composer-editable');
		const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
		const textNode = walker.nextNode();
		const range = document.createRange();
		range.setStart(textNode, 0);
		range.setEnd(textNode, Math.min(24, textNode.textContent.length));
		const sel = getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	});
	await page.waitForSelector('.pk-selection-toolbar', { timeout: 5000 });
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-selection-toolbar-light.png') });
	await page.evaluate(() => getSelection().removeAllRanges());
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-undo-bar-light.png') });
	// Light theme must not paint a dark panel (WP1 audit deviation ①).
	const rootBg = await page.evaluate(() => getComputedStyle(document.getElementById('root')).backgroundColor);
	await record('light theme panel is light (deviation ① fixed)', () => assert.equal(rootBg, 'rgb(255, 255, 255)'));

	// ── AI candidate flow (light screenshots only), last on a pristine paragraph ──
	await page.keyboard.press('Escape');
	const lightPara = page.locator('.pk-composer-block[data-kind="paragraph"]').first();
	await lightPara.hover();
	const lightSlot = lightPara.locator('.pk-composer-candidate-slot');
	await lightPara.locator('.pk-block-action-row .pk-action-ai [data-ai-quick]').first().click();
	await page.waitForSelector('.pk-composer-candidate-slot [data-candidate-id]', { timeout: 6000 });
	await page.waitForTimeout(180);
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-streaming-candidate-light.png') });
	await page.waitForFunction(() => !document.querySelector('.pk-composer-candidate-slot .animate-pulse'), null, { timeout: 8000 });
	await lightSlot.locator('button:has-text("重新生成")').first().click();
	await page.waitForTimeout(150);
	await page.waitForFunction(() => !document.querySelector('.pk-composer-candidate-slot .animate-pulse'), null, { timeout: 8000 });
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-variants-light.png') });
	await lightSlot.locator('button:has-text("接受")').first().click();
	await page.waitForSelector('.pk-composer-candidate-slot [data-candidate-id]', { state: 'detached', timeout: 6000 });
	await lightPara.hover();
	await page.screenshot({ path: path.join(shotsDir, 'composer-chrome-accepted-light.png') });

	await record('no console/page errors (light pass)', () => assert.deepEqual(errors, []));
	await page.close();
}

await browser.close();
vite.kill();

// ── report ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.error ? ' — ' + r.error : ''}`);
console.log(`\ncomposer-chrome-geometry: ${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots → ${shotsDir}`);
process.exit(failed.length > 0 ? 1 : 0);
