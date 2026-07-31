/**
 * Production browser regression for the shared Composer Markdown editor.
 *
 * Runs the real ComposerRoot harness (session + hub + transaction engine) and
 * covers both adapters:
 * - local new-block draft history and Markdown structure commands;
 * - persisted leaf formatting/history and persisted list indentation.
 *
 * Run: node test/composer-shared-markdown-editor.qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3213;
const url = `http://localhost:${port}/composer.html`;
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

await waitForVite(vite);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
	if (message.type() === 'error') errors.push(message.text());
});

try {
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.locator('.peak-composer-root .pk-composer-block').first().waitFor();

	// Draft adapter: one command, canonical source, source history and no orphan
	// wrappers after selected deletion.
	const draft = await openMarkdownDraft(page);
	await draft.focus();
	await page.keyboard.type('marked');
	await selectText(draft, 'marked');
	await page.keyboard.press('Meta+B');
	assert.equal(await sourceOf(draft), '**marked**');
	assert.equal(await sourceOf(draft), '**marked**', 'one physical format command edits once');

	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	assert.equal(
		await sourceOf(draft),
		'**marked**\n\n',
		'Enter exits hidden closing delimiters before the paragraph break',
	);
	await page.keyboard.press('Meta+Z');
	assert.equal(await sourceOf(draft), '**marked**', 'draft Undo restores the prior source step');
	await page.keyboard.press('Meta+Shift+Z');
	assert.equal(await sourceOf(draft), '**marked**\n\n', 'draft Redo restores the break');
	await page.keyboard.press('Meta+Z');
	await selectText(draft, 'marked');
	await page.keyboard.press('Backspace');
	assert.equal(await sourceOf(draft), '', 'selected deletion removes the empty format shell');
	for (const format of [
		{ shortcut: 'Meta+I', source: '*styled*' },
		{
			shortcut: 'Meta+U',
			source: '<span style="text-decoration-line: underline">styled</span>',
		},
	]) {
		await page.keyboard.type('styled');
		await selectText(draft, 'styled');
		await page.keyboard.press(format.shortcut);
		assert.equal(await sourceOf(draft), format.source);
		await selectText(draft, 'styled');
		await page.keyboard.press(format.shortcut);
		assert.equal(await sourceOf(draft), 'styled', `${format.shortcut} toggles cleanly`);
		await selectText(draft, 'styled');
		await page.keyboard.press('Backspace');
		assert.equal(await sourceOf(draft), '');
	}

	// Same draft surface: list continuation and multi-level Tab never move focus
	// out of the editor.
	await page.keyboard.type('- parent');
	await page.keyboard.press('Enter');
	await page.keyboard.type('child');
	assert.equal(await sourceOf(draft), '- parent\n- child');
	await page.keyboard.press('Tab');
	assert.equal(await sourceOf(draft), '- parent\n\t- child');
	assert.equal(
		await draft.evaluate((element) => element.ownerDocument.activeElement === element),
		true,
		'Tab retains the Markdown editor focus',
	);
	await selectText(draft, 'child');
	await page.keyboard.press('Meta+B');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	assert.equal(
		await sourceOf(draft),
		'- parent\n\t- **child**\n\t- ',
		'nested continuation starts outside inline formatting',
	);
	await page.keyboard.press('Shift+Tab');
	assert.equal(await sourceOf(draft), '- parent\n\t- **child**\n- ');

	await page.locator('.pk-new-block-draft__actions button').first().click();

	// Persisted adapter: the same B command uses DirectEditController + hub and
	// the same editor maps the source selection back after the transaction.
	let paragraph = page.locator(
		'.pk-composer-block[data-kind="paragraph"] .pk-composer-editable',
	).first();
	await paragraph.focus();
	await selectText(paragraph, 'The');
	await page.keyboard.press('Meta+B');
	await page.waitForFunction(() => {
		const leaf = document.querySelector(
			'.pk-composer-block[data-kind="paragraph"] .pk-composer-editable',
		);
		return leaf?.textContent?.startsWith('**The**');
	});
	paragraph = page.locator(
		'.pk-composer-block[data-kind="paragraph"] .pk-composer-editable',
	).first();
	assert.ok((await sourceOf(paragraph)).startsWith('**The**'));
	await paragraph.focus();
	await page.keyboard.press('Meta+Z');
	await page.waitForFunction(() => {
		const leaf = document.querySelector(
			'.pk-composer-block[data-kind="paragraph"] .pk-composer-editable',
		);
		return leaf?.textContent?.startsWith('The editing');
	});

	// Persisted list markers live outside each text leaf. Tab is delegated to
	// the list structure owner, then focus is restored to the re-parsed item.
	const topRows = page.locator(
		'.pk-composer-block[data-kind="list"] .pk-composer-list__row[data-list-top-level="true"]',
	);
	const secondRow = topRows.nth(1);
	const secondText = secondRow.locator('.pk-composer-editable');
	await secondText.focus();
	await page.keyboard.press('Tab');
	await page.waitForFunction(() => {
		const rows = document.querySelectorAll(
			'.pk-composer-block[data-kind="list"] .pk-composer-list__row',
		);
		return rows[1]?.getAttribute('data-list-depth') === '1';
	});
	let nestedText = page.locator(
		'.pk-composer-block[data-kind="list"] .pk-composer-list__row[data-list-depth="1"] .pk-composer-editable',
	).first();
	assert.equal(
		await nestedText.evaluate((element) => element.ownerDocument.activeElement === element),
		true,
		'persisted indentation restores focus to the same semantic item',
	);
	await page.keyboard.press('Shift+Tab');
	await page.waitForFunction(() => {
		const rows = document.querySelectorAll(
			'.pk-composer-block[data-kind="list"] .pk-composer-list__row',
		);
		return rows[1]?.getAttribute('data-list-depth') === '0';
	});

	assert.deepEqual(errors, [], `shared editor must not raise page errors:\n${errors.join('\n')}`);
	console.log('composer-shared-markdown-editor: production browser flow passed');
} finally {
	await browser.close();
	vite.kill('SIGTERM');
}

async function openMarkdownDraft(page) {
	const paragraph = page.locator('.pk-composer-block[data-kind="paragraph"]').first();
	await paragraph.hover();
	await paragraph.locator('[data-action="insert"]').click();
	const draft = page.locator('.pk-new-block-draft__editor');
	await draft.waitFor();
	return draft;
}

async function sourceOf(locator) {
	return locator.evaluate((element) => element.textContent ?? '');
}

async function selectText(locator, text) {
	await locator.evaluate((element, expected) => {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node = walker.nextNode();
		while (node && !node.textContent?.includes(expected)) node = walker.nextNode();
		if (!node) {
			throw new Error(`missing visible text: ${expected}; source=${element.textContent ?? ''}`);
		}
		const from = node.textContent.indexOf(expected);
		const selection = element.ownerDocument.getSelection();
		selection.removeAllRanges();
		selection.setBaseAndExtent(node, from, node, from + expected.length);
	}, text);
}

function waitForVite(process) {
	return new Promise((resolve, reject) => {
		const logs = [];
		const timer = setTimeout(
			() => reject(new Error(`vite did not start\n${logs.join('')}`)),
			30000,
		);
		process.stdout.on('data', (chunk) => {
			const text = String(chunk);
			logs.push(text);
			if (!text.includes('Local:')) return;
			clearTimeout(timer);
			resolve();
		});
		process.stderr.on('data', (chunk) => logs.push(String(chunk)));
		process.on('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`vite exited ${code}\n${logs.join('')}`));
		});
	});
}
