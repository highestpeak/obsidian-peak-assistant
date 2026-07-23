/**
 * Measure main.js module-eval memory in plain Node — no Obsidian needed.
 *
 * Stubs every external module (obsidian, electron, codemirror, …) with a
 * Proxy that can be `extends`-ed, called, or property-accessed, then
 * requires the built bundle and reports RSS / heap before and after.
 *
 * Usage: node --expose-gc scripts/measure-eval-mem.mjs
 */
import { createRequire } from 'module';
import Module from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// --- generic stub factory: works as class base, function, and namespace ---
function makeStub(name) {
	const fn = function StubClass() {};
	fn.prototype = Object.create(Object.prototype);
	return new Proxy(fn, {
		get(target, prop) {
			if (prop === Symbol.hasInstance) return () => false;
			if (prop === 'prototype') return target.prototype;
			if (prop === '__esModule') return true;
			if (prop === 'default') return target;
			if (typeof prop === 'symbol') return undefined;
			if (!target[prop]) target[prop] = makeStub(`${name}.${String(prop)}`);
			return target[prop];
		},
		construct() { return {}; },
		apply() { return makeStub(`${name}()`); },
	});
}

const STUBBED = new Set([
	...(process.env.STUB_PKGS ?? '').split(',').filter(Boolean),
	'obsidian', 'electron',
	'@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands',
	'@codemirror/language', '@codemirror/lint', '@codemirror/search',
	'@codemirror/state', '@codemirror/view',
	'@lezer/common', '@lezer/highlight', '@lezer/lr',
	'playwright', 'playwright-core', 'chromium-bidi',
	'pdfjs-dist',
]);

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
	if (STUBBED.has(request)) return makeStub(request);
	return origLoad.call(this, request, parent, isMain);
};

function mb(n) { return (n / 1048576).toFixed(1); }
function snap(label) {
	global.gc();
	const m = process.memoryUsage();
	console.log(
		`${label.padEnd(14)} rss=${mb(m.rss).padStart(7)}MB  heapUsed=${mb(m.heapUsed).padStart(7)}MB  external=${mb(m.external).padStart(6)}MB`,
	);
	return m;
}

const before = snap('before');
const t0 = Date.now();
require(path.join(__dirname, '..', 'main.js'));
const evalMs = Date.now() - t0;
const after = snap('after require');

// settle: give lazy top-level promises a tick to run
await new Promise(r => setTimeout(r, 3000));
const settled = snap('after settle');

console.log('---');
console.log(`module eval took ${evalMs}ms`);
console.log(`EVAL COST: rss +${mb(settled.rss - before.rss)}MB, heapUsed +${mb(settled.heapUsed - before.heapUsed)}MB`);
process.exit(0);
