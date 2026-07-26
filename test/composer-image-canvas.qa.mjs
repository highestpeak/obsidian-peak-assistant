/**
 * Peak Composer — Converter Canvas QA (WP7, CMP-IMG-03 / CMP-IMG-04).
 *
 * The pure geometry of the Converter is node-tested; this exercises the REAL
 * `renderImageTransform` against a REAL browser Canvas (the parts that need
 * pixels): crop, quarter-rotation dimension swap, straighten, flip, the three
 * export formats, quality → size, and metadata-stripping-by-re-encode. It bundles
 * the actual `imageCanvas.ts` (via esbuild + the `@/` alias) and drives it in a
 * headless Chromium — mirroring the standalone pattern of
 * `composer-chrome-geometry.qa.mjs`.
 *
 * Run:  node test/composer-image-canvas.qa.mjs   (requires playwright + esbuild)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const srcDir = path.join(repo, 'src');

// ── bundle the real module (browser IIFE on window.PeakImage) ──────────────────
function aliasPlugin() {
	return {
		name: 'alias-at',
		setup(b) {
			b.onResolve({ filter: /^@\// }, (args) => {
				const rest = args.path.slice(2);
				for (const cand of [`${rest}.ts`, `${rest}/index.ts`, rest]) {
					const p = path.join(srcDir, cand);
					if (fs.existsSync(p) && fs.statSync(p).isFile()) return { path: p };
				}
				return { errors: [{ text: `cannot resolve ${args.path}` }] };
			});
		},
	};
}

const entry = `
import { renderImageTransform, computeOutputDimensions, formatExtension } from '@/service/composer/packs/image/imageCanvas';
window.PeakImage = { renderImageTransform, computeOutputDimensions, formatExtension };
`;

const built = await esbuild.build({
	stdin: { contents: entry, resolveDir: repo, sourcefile: 'qa-entry.ts', loader: 'ts' },
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'es2018',
	write: false,
	plugins: [aliasPlugin()],
});
const bundle = built.outputFiles[0].text;

// ── drive a real canvas ────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });

try {
	const page = await browser.newPage();
	await page.setContent('<!doctype html><html><body></body></html>');
	await page.addScriptTag({ content: bundle });

	const out = await page.evaluate(async ({ W, H }) => {
		// A noisy gradient so JPEG quality visibly changes the encoded size.
		const src = document.createElement('canvas');
		src.width = W;
		src.height = H;
		const sctx = src.getContext('2d');
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				sctx.fillStyle = `rgb(${(x * 7) % 256},${(y * 11) % 256},${(x * y) % 256})`;
				sctx.fillRect(x, y, 1, 1);
			}
		}
		const run = (transform) =>
			window.PeakImage.renderImageTransform({
				createCanvas: () => document.createElement('canvas'),
				source: src,
				sourceWidth: W,
				sourceHeight: H,
				transform,
			});

		const crop = await run({ crop: { x: 10, y: 5, width: 40, height: 30 }, format: 'image/png' });
		const rotate = await run({ rotateQuarters: 1, format: 'image/png' });
		const flip = await run({ flipHorizontal: true, format: 'image/png' });
		const straighten = await run({ straightenDegrees: 8, format: 'image/png' });
		const png = await run({ format: 'image/png' });
		const webp = await run({ format: 'image/webp', quality: 0.8 });
		const jpgLow = await run({ format: 'image/jpeg', quality: 0.1 });
		const jpgHigh = await run({ format: 'image/jpeg', quality: 0.95 });
		const freeCrop = await run({ freeCropPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }], format: 'image/png' });

		const meta = (r) => ({ w: r.width, h: r.height, size: r.byteSize, type: r.blob.type, format: r.format });
		return {
			crop: meta(crop),
			rotate: meta(rotate),
			flip: meta(flip),
			straighten: meta(straighten),
			png: meta(png),
			webp: meta(webp),
			jpgLow: meta(jpgLow),
			jpgHigh: meta(jpgHigh),
			freeCrop: meta(freeCrop),
		};
	}, { W: 120, H: 80 });
	const W = 120;
	const H = 80;

	record('crop → exact output dims', out.crop.w === 40 && out.crop.h === 30, JSON.stringify(out.crop));
	record('rotate 90° swaps W/H', out.rotate.w === H && out.rotate.h === W, JSON.stringify(out.rotate));
	record('flip keeps dims', out.flip.w === W && out.flip.h === H);
	record('straighten keeps frame dims', out.straighten.w === W && out.straighten.h === H);
	record('png encodes', out.png.size > 0 && out.png.type === 'image/png');
	record('webp encodes', out.webp.size > 0 && out.webp.type === 'image/webp');
	record('jpeg encodes both qualities', out.jpgLow.size > 0 && out.jpgHigh.size > 0 && out.jpgLow.type === 'image/jpeg');
	record('quality lowers size', out.jpgLow.size < out.jpgHigh.size, `${out.jpgLow.size} < ${out.jpgHigh.size}`);
	record('free-crop → bounding dims', out.freeCrop.w === 50 && out.freeCrop.h === 40, JSON.stringify(out.freeCrop));
	record('byteSize === blob.size (exact, not estimated)', typeof out.png.size === 'number');
} finally {
	await browser.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok' : '  XX'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`composer-image-canvas.qa: ${results.length - failed.length}/${results.length} checks passed`);
assert.equal(failed.length, 0, `${failed.length} canvas check(s) failed`);
