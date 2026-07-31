/**
 * Browser regression for the standalone Composer fluid-writing mock.
 *
 * Locks the user-recorded failure path:
 * select a Markdown line -> Cmd+Shift+B -> keep the visible selection ->
 * ignore a duplicate browser format event -> toggle cleanly -> delete without
 * leaving orphan delimiters.
 *
 * Run: node test/composer-fluid-writing-mock.qa.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const mockPath = path.resolve(
	process.cwd(),
	'docs/gstack/peak-composer-fluid-writing-2026-07-30/index.html',
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
	await page.goto(pathToFileURL(mockPath).href);
	await page.locator('#insertMarkdown').click();
	const editor = page.locator('#markdownEditor');
	await editor.focus();
	await page.keyboard.type('first');
	await page.keyboard.press('Enter');
	await page.keyboard.type('plain');
	assert.equal(await readMarkdownSource(page), 'first\n\nplain', 'fixture starts as canonical Markdown source');
	await page.keyboard.press('Meta+Z');
	assert.equal(
		await readMarkdownSource(page),
		'first\n\n',
		'undo removes the latest native typing burst',
	);
	await page.keyboard.press('Meta+Shift+Z');
	assert.equal(
		await readMarkdownSource(page),
		'first\n\nplain',
		'redo restores the typing burst and its caret',
	);

	await page.keyboard.press('Meta+Shift+ArrowLeft');
	assert.equal(await page.evaluate(() => document.getSelection()?.toString()), 'plain');
	await page.keyboard.press('Meta+Shift+B');

	assert.equal(
		await readMarkdownSource(page),
		'first\n\n**plain**',
		'Cmd+Shift+B emits exactly one bold wrapper',
	);
	assert.equal(
		await editor.locator('[data-inline-mark="bold"]').textContent(),
		'plain',
		'bold source projects as bold visible text',
	);
	assert.equal(
		await page.evaluate(() => document.getSelection()?.toString()),
		'plain',
		'formatting preserves the selected visible text',
	);
	await page.keyboard.press('Meta+Z');
	assert.equal(await readMarkdownSource(page), 'first\n\nplain', 'formatting is one undo step');
	await page.keyboard.press('Meta+Shift+Z');
	assert.equal(await readMarkdownSource(page), 'first\n\n**plain**', 'redo reapplies the format step');
	assert.equal(
		await page.evaluate(() => document.getSelection()?.toString()),
		'plain',
		'format history restores the visible selection',
	);

	const duplicatePrevented = await editor.evaluate((el) => {
		const duplicate = new InputEvent('beforeinput', {
			bubbles: true,
			cancelable: true,
			inputType: 'formatItalic',
		});
		return !el.dispatchEvent(duplicate);
	});
	assert.equal(duplicatePrevented, true, 'the browser follow-up format event is consumed');
	assert.equal(
		await readMarkdownSource(page),
		'first\n\n**plain**',
		'a duplicate or mismatched beforeinput cannot create triple delimiters',
	);

	await page.keyboard.press('Meta+B');
	assert.equal(await readMarkdownSource(page), 'first\n\nplain', 'repeating bold toggles the wrapper off');
	assert.equal(
		await page.evaluate(() => document.getSelection()?.toString()),
		'plain',
		'toggling off also preserves the selected text',
	);

	await page.keyboard.press('Meta+B');
	assert.equal(await readMarkdownSource(page), 'first\n\n**plain**');
	await page.keyboard.press('Backspace');
	assert.equal(
		await readMarkdownSource(page),
		'first\n\n',
		'deleting the selected formatted text removes its empty delimiter shell',
	);
	assert.equal(
		await editor.locator('[data-inline-token]').count(),
		0,
		'no orphan inline syntax remains in the DOM',
	);

	await page.keyboard.type('next');
	assert.equal(await readMarkdownSource(page), 'first\n\nnext', 'typing continues at the repaired caret');
	await selectLastBlockBackward(page);
	await page.keyboard.press('Meta+B');
	assert.equal(await readMarkdownSource(page), 'first\n\n**next**');
	assert.equal(
		await page.evaluate(() => readSourceSelection()?.direction),
		'backward',
		'formatting preserves a reverse selection',
	);

	await page.keyboard.press('Meta+I');
	assert.equal(
		await readMarkdownSource(page),
		'first\n\n***next***',
		'bold and italic compose as canonical triple delimiters',
	);
	assert.equal(
		await editor.locator('[data-inline-mark="bold-italic"]').textContent(),
		'next',
		'combined emphasis projects without exposing literal stars',
	);
	await page.keyboard.press('Meta+I');
	assert.equal(await readMarkdownSource(page), 'first\n\n**next**');
	await page.keyboard.press('Meta+B');
	assert.equal(await readMarkdownSource(page), 'first\n\nnext');

	await page.keyboard.press('Meta+I');
	assert.equal(await readMarkdownSource(page), 'first\n\n*next*');
	assert.equal(await editor.locator('[data-inline-mark="italic"]').textContent(), 'next');
	await page.keyboard.press('Meta+I');
	assert.equal(await readMarkdownSource(page), 'first\n\nnext');

	await page.keyboard.press('Meta+U');
	assert.equal(await readMarkdownSource(page), 'first\n\n<u>next</u>');
	assert.equal(await editor.locator('[data-inline-mark="underline"]').textContent(), 'next');
	await page.keyboard.press('Meta+U');
	assert.equal(await readMarkdownSource(page), 'first\n\nnext');

	for (const formattingCase of [
		{ shortcut: 'Meta+B', source: '**marked**', mark: 'bold' },
		{ shortcut: 'Meta+I', source: '*marked*', mark: 'italic' },
		{ shortcut: 'Meta+U', source: '<u>marked</u>', mark: 'underline' },
	]) {
		await page.locator('#cancelDraft').click();
		await page.locator('#insertMarkdown').click();
		await editor.focus();
		await page.keyboard.type('marked');
		await page.keyboard.press('Meta+Shift+ArrowLeft');
		await page.keyboard.press(formattingCase.shortcut);
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Enter');
		await page.keyboard.type('continued');
		assert.equal(
			await readMarkdownSource(page),
			`${formattingCase.source}\n\ncontinued`,
			`${formattingCase.mark} closes before the paragraph break`,
		);
		assert.equal(
			await editor
				.locator(`[data-inline-mark="${formattingCase.mark}"]`)
				.textContent(),
			'marked',
			`${formattingCase.mark} remains intact after Enter`,
		);
	}

	await page.locator('#cancelDraft').click();
	await page.locator('#insertMarkdown').click();
	await editor.focus();
	await page.keyboard.type('- parent');
	await page.keyboard.press('Enter');
	await page.keyboard.type('child');
	assert.equal(await readMarkdownSource(page), '- parent\n- child');
	await page.keyboard.press('Tab');
	assert.equal(
		await readMarkdownSource(page),
		'- parent\n\t- child',
		'Tab indents the current list item instead of leaving the editor',
	);
	assert.equal(
		await page.evaluate(() => document.activeElement?.id),
		'markdownEditor',
		'list indentation retains editor focus',
	);
	await page.keyboard.press('Meta+Shift+ArrowLeft');
	await page.keyboard.press('Meta+B');
	assert.equal(
		await readMarkdownSource(page),
		'- parent\n\t- **child**',
		'formatting a whole list line excludes its hidden structural prefix',
	);
	assert.equal(
		await page.evaluate(() => document.getSelection()?.toString()),
		'child',
		'the restored list selection contains only visible item text',
	);
	assert.equal(
		await editor.locator('[data-structural-token="list"]').count(),
		2,
		'formatting does not turn a list marker into literal text',
	);
	await page.keyboard.press('Meta+B');
	assert.equal(await readMarkdownSource(page), '- parent\n\t- child');
	await page.keyboard.press('Meta+B');
	assert.equal(await readMarkdownSource(page), '- parent\n\t- **child**');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	assert.equal(
		await readMarkdownSource(page),
		'- parent\n\t- **child**\n\t- ',
		'Enter exits inline formatting before continuing a nested list',
	);
	await page.keyboard.press('Shift+Tab');
	assert.equal(
		await readMarkdownSource(page),
		'- parent\n\t- **child**\n- ',
		'Shift+Tab outdents the continued nested item',
	);
	assert.deepEqual(pageErrors, [], `mock must not raise page errors: ${pageErrors.join('\n')}`);
	console.log('composer-fluid-writing-mock: browser formatting and deletion flow passed');
} finally {
	await browser.close();
}

async function readMarkdownSource(page) {
	return page.evaluate(() => readEditorSource());
}

async function selectLastBlockBackward(page) {
	await page.evaluate(() => {
		const block = document.querySelector('.markdown-block:last-child');
		const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
		const node = walker.nextNode();
		const selection = document.getSelection();
		selection.removeAllRanges();
		selection.setBaseAndExtent(
			node,
			node.textContent.length,
			node,
			0,
		);
	});
}
