/**
 * Browser-level keyboard contract for the app-owned Key Tips runtime.
 *
 * Run with: node test/keyboard-keytips-runtime.qa.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
	entryPoints: ['src/app/keyboard/PeakKeyboardRuntime.ts'],
	bundle: true,
	format: 'iife',
	globalName: 'PeakKeyboardTest',
	platform: 'browser',
	target: 'es2020',
	tsconfig: 'tsconfig.json',
	write: false,
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

try {
	await page.setContent(`
		<style>
			body { margin: 0; }
			.surface { display: flex; flex-direction: column; width: 800px; height: 560px; }
			.zone { position: relative; min-height: 64px; margin: 6px; }
			.pk-keytip-layer { position: fixed; inset: 0; pointer-events: none; }
			.pk-keytip { position: absolute; display: inline-flex; }
		</style>
		<button id="outside">Outside trigger</button>
		<div id="surface" class="surface">
			<div class="zone" data-peak-keyboard-zone="vs-query"><input id="query" /></div>
			<div class="zone" data-peak-keyboard-zone="vs-view-toolbar"><button>View</button></div>
			<div class="zone" data-peak-keyboard-zone="vs-results"><button>Result</button></div>
		</div>
	`);
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	await page.evaluate(() => {
		const runtime = new window.PeakKeyboardTest.PeakKeyboardRuntime();
		window.__peakRuntime = runtime;
		runtime.registerSurface('vault-search', document.querySelector('#surface'));
		document.querySelector('#outside').focus();
	});

	// A command-opened surface must work even while focus remains on its trigger.
	await page.keyboard.down('Alt');
	await page.waitForTimeout(220);
	assert.equal(await page.locator('#surface').getAttribute('data-peak-keytips'), 'visible');
	assert.equal(await page.locator('[data-peak-keytip="Q"]').count(), 1);
	assert.equal(await page.locator('[data-peak-keytip="Q"] > kbd').count(), 1);
	assert.equal(await page.locator('[data-peak-keytip="Q"] > :not(kbd)').count(), 0);
	assert.equal(await page.locator('#surface [data-peak-keytip]').count(), 0);
	await page.keyboard.up('Alt');
	assert.equal(await page.locator('#surface').getAttribute('data-peak-keytips'), 'visible');
	await page.keyboard.press('q');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'query');

	// Quick tap remains supported, and a second tap dismisses without reopening.
	await page.keyboard.press('Alt');
	assert.equal(await page.locator('#surface').getAttribute('data-peak-keytips'), 'visible');
	await page.keyboard.press('Alt');
	assert.equal(await page.locator('#surface').getAttribute('data-peak-keytips'), null);

	// Alt+character remains a host/editor combination and never arms Key Tips.
	await page.keyboard.down('Alt');
	await page.keyboard.press('q');
	await page.keyboard.up('Alt');
	assert.equal(await page.locator('#surface').getAttribute('data-peak-keytips'), null);

	// A newly mounted foreground Surface wins over focus left in the old Surface.
	await page.evaluate(() => {
		window.__peakRuntime.dispose();
		document.body.innerHTML = `
			<div id="old-studio" class="surface">
				<div class="zone" data-peak-keyboard-zone="cs-left-navigation"><button id="old-focus">Old chat</button></div>
			</div>
			<div id="new-search" class="surface">
				<div class="zone" data-peak-keyboard-zone="vs-query"><input /></div>
			</div>`;
		const runtime = new window.PeakKeyboardTest.PeakKeyboardRuntime();
		window.__peakRuntime = runtime;
		runtime.registerSurface('chat-studio', document.querySelector('#old-studio'));
		document.querySelector('#old-focus').focus();
		runtime.registerSurface('vault-search', document.querySelector('#new-search'));
	});
	await page.keyboard.press('Alt');
	assert.equal(await page.locator('#new-search').getAttribute('data-peak-keytips'), 'visible');
	assert.equal(await page.locator('#old-studio').getAttribute('data-peak-keytips'), null);

	// A visible session follows dynamically mounted Studio destinations.
	await page.evaluate(() => {
		window.__peakRuntime.dispose();
		document.body.innerHTML = `
			<button id="outside">Outside trigger</button>
			<div id="studio" class="surface">
				<div class="zone" data-peak-keyboard-zone="cs-left-navigation"><button>Chats</button></div>
				<div class="zone" data-peak-keyboard-zone="cs-message-timeline"><button>Message</button></div>
				<div class="zone" data-peak-keyboard-zone="cs-composer"><input /></div>
			</div>`;
		const runtime = new window.PeakKeyboardTest.PeakKeyboardRuntime();
		window.__peakRuntime = runtime;
		const studio = document.querySelector('#studio');
		runtime.registerSurface('chat-studio', studio);
		document.querySelector('#outside').focus();
	});
	await page.keyboard.press('Alt');
	assert.equal(await page.locator('[data-peak-keytip="I"]').count(), 0);
	await page.evaluate(() => {
		const index = document.createElement('div');
		index.className = 'zone';
		index.dataset.peakKeyboardZone = 'cs-conversation-index';
		index.innerHTML = '<button>Index</button>';
		document.querySelector('#studio').appendChild(index);
	});
	await page.waitForTimeout(50);
	assert.equal(await page.locator('[data-peak-keytip="I"]').count(), 1);

	// Exact-control Key Tips focus without clicking; Enter performs the action.
	await page.evaluate(() => {
		window.__peakRuntime.dispose();
		document.body.innerHTML = `
			<button id="outside">Outside trigger</button>
			<div id="atlas" class="surface">
				<div class="zone" data-peak-keyboard-zone="fa-file-rail"><button id="files">Files</button></div>
				<div class="zone" data-peak-keyboard-zone="fa-view-filters">
					<button id="tree" data-peak-keytip-key="T" data-peak-keytip-label="Tree">Tree</button>
					<button id="graph" data-peak-keytip-key="G" data-peak-keytip-label="Graph">Graph</button>
				</div>
				<div class="zone" data-peak-keyboard-zone="fa-atlas"><button>Tree item</button></div>
			</div>`;
		const atlas = document.querySelector('#atlas');
		const runtime = new window.PeakKeyboardTest.PeakKeyboardRuntime();
		window.__peakRuntime = runtime;
		window.__peakClicks = 0;
		document.querySelector('#graph').addEventListener('click', () => { window.__peakClicks += 1; });
		runtime.registerSurface('file-atlas', atlas);
		document.querySelector('#outside').focus();
	});
	await page.keyboard.press('Alt');
	assert.equal(await page.locator('[data-peak-keytip="T"]').count(), 1);
	assert.equal(await page.locator('[data-peak-keytip="G"]').count(), 1);
	await page.keyboard.press('g');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'graph');
	assert.equal(await page.evaluate(() => window.__peakClicks), 0);
	await page.keyboard.press('Enter');
	assert.equal(await page.evaluate(() => window.__peakClicks), 1);

	// Composer phase 2 uses the same focus-first contract, including an
	// adapter-owned document entry that is not a fixed header button.
	await page.evaluate(() => {
		window.__peakRuntime.dispose();
		document.body.innerHTML = `
			<button id="outside">Outside trigger</button>
			<div id="composer" class="surface">
				<div class="zone" data-peak-keyboard-zone="cv-controlbar">
					<button id="edit" data-peak-keytip-key="E" data-peak-keytip-label="Edit">Edit</button>
				</div>
				<div class="zone" data-peak-keyboard-zone="cv-document">
					<div id="editor" contenteditable="true" tabindex="0">Document</div>
				</div>
			</div>`;
		const runtime = new window.PeakKeyboardTest.PeakKeyboardRuntime();
		window.__peakRuntime = runtime;
		window.__composerClicks = 0;
		document.querySelector('#edit').addEventListener('click', () => { window.__composerClicks += 1; });
		runtime.registerSurface('composer', document.querySelector('#composer'), {
			getKeyTipAnchor(actionId) {
				return actionId === 'document' ? document.querySelector('#editor') : null;
			},
		});
		document.querySelector('#outside').focus();
	});
	await page.keyboard.press('Alt');
	assert.equal(await page.locator('[data-peak-keytip="E"] > kbd').textContent(), 'E');
	assert.equal(await page.locator('[data-peak-keytip="Q"] > kbd').textContent(), 'Q');
	await page.keyboard.press('e');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'edit');
	assert.equal(await page.evaluate(() => window.__composerClicks), 0);
	await page.keyboard.press('Enter');
	assert.equal(await page.evaluate(() => window.__composerClicks), 1);
	await page.keyboard.press('Alt');
	await page.keyboard.press('q');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'editor');

	console.log('keyboard-keytips-runtime.qa: passed');
} finally {
	await browser.close();
}
