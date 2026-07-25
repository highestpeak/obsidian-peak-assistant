/**
 * Peak Composer — 1:1 DOM raster for Easy Copy's image output (WP4, §7.6).
 *
 * Clones the block subtree, strips editing chrome (EASY_COPY_CHROME_SELECTORS),
 * inlines computed styles, and draws it through an SVG foreignObject onto a
 * canvas at the owner window's devicePixelRatio — a faithful snapshot of what
 * the block looks like, chrome excluded, no external library (WP0 S4: Canvas
 * API only, no sharp/jimp). All globals (canvas, Image, DPR) come from the
 * element's ownerDocument/ownerWindow, so popout windows raster correctly.
 */

import { EASY_COPY_CHROME_SELECTORS } from '@/service/composer';

export async function rasterizeElementToPngBlob(el: HTMLElement): Promise<Blob | null> {
	const doc = el.ownerDocument;
	const win = doc.defaultView;
	if (!win) return null;

	const rect = el.getBoundingClientRect();
	const width = Math.max(1, Math.ceil(rect.width));
	const height = Math.max(1, Math.ceil(rect.height));

	const clone = el.cloneNode(true) as HTMLElement;
	for (const sel of EASY_COPY_CHROME_SELECTORS) {
		clone.querySelectorAll(sel).forEach((n) => n.remove());
	}
	inlineStyles(el, clone, win);
	clone.removeAttribute('contenteditable');

	const xhtml = new win.XMLSerializer().serializeToString(clone);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
		`<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${xhtml}</div></foreignObject></svg>`;
	const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

	const img = new win.Image();
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('raster image failed to load'));
		img.src = url;
	}).catch(() => undefined);
	if (!img.complete || img.naturalWidth === 0) return null;

	const dpr = win.devicePixelRatio || 1;
	const canvas = doc.createElement('canvas');
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.scale(dpr, dpr);
	ctx.drawImage(img, 0, 0, width, height);
	return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Copy computed styles from the live tree onto the clone (element-pairwise). */
function inlineStyles(source: HTMLElement, clone: HTMLElement, win: Window): void {
	const srcWalk = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
	const dstWalk = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
	// After chrome removal the clone tree is shorter — walk by matching order of
	// remaining nodes via a parallel filtered walk on the source side.
	const kept = new Set(dstWalk.map((n) => nodeSignature(n)));
	let d = 0;
	for (const s of srcWalk) {
		if (d >= dstWalk.length) break;
		if (nodeSignature(s) !== nodeSignature(dstWalk[d])) continue;
		if (!kept.has(nodeSignature(s))) continue;
		const computed = win.getComputedStyle(s);
		dstWalk[d].style.cssText = computed.cssText;
		d += 1;
	}
}

function nodeSignature(el: HTMLElement): string {
	return `${el.tagName}.${el.className}`;
}
