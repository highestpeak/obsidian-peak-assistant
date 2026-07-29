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
	// Inline styles while the live and cloned trees still have identical
	// structure. Chromium exposes an empty `cssText` on computed styles, so the
	// properties must be copied one by one; otherwise the PNG degenerates into
	// an unstyled text rendering instead of the visible Composer block.
	inlineStyles(el, clone, win);
	for (const sel of EASY_COPY_CHROME_SELECTORS) {
		clone.querySelectorAll(sel).forEach((n) => n.remove());
	}
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

/** Copy every computed property from the live tree onto its exact clone node. */
function inlineStyles(source: HTMLElement, clone: HTMLElement, win: Window): void {
	const sourceElements = [source, ...Array.from(source.querySelectorAll<HTMLElement | SVGElement>('*'))];
	const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement | SVGElement>('*'))];
	for (let index = 0; index < sourceElements.length; index += 1) {
		const sourceElement = sourceElements[index];
		const cloneElement = cloneElements[index];
		if (!sourceElement || !cloneElement || !('style' in cloneElement)) continue;
		const computed = win.getComputedStyle(sourceElement);
		for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
			const property = computed.item(propertyIndex);
			if (!property) continue;
			cloneElement.style.setProperty(
				property,
				computed.getPropertyValue(property),
				computed.getPropertyPriority(property),
			);
		}
	}
}
