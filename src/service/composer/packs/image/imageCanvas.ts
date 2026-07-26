/**
 * Peak Composer — Converter geometry + Canvas render (WP7, CMP-IMG-03/04).
 *
 * Two layers:
 *   1. PURE geometry (node-testable): output-dimension math for crop / rotate /
 *      flip, format↔MIME mapping, quality clamping. No DOM.
 *   2. Browser render (`renderImageTransform`): applies the transform on a
 *      Canvas and re-encodes. Per the S4 ownerWindow contract the canvas MUST be
 *      created from the host's `ownerDocument` — the caller injects a
 *      `createCanvas` factory, this module never touches `document` directly.
 *      Re-encoding from decoded pixels inherently strips EXIF/metadata (S4), and
 *      the exact output size is `blob.size` (no estimation).
 *
 * The Converter is NON-DESTRUCTIVE: it only produces new bytes; writing them
 * (new asset vs. confirmed overwrite) is the coordinator/port's job.
 */

import {
	ComposerImageTransformSchema,
	type ComposerImageFormat,
	type ComposerImageTransform,
} from '@/core/schemas/composer';

export interface ImageDimensions {
	width: number;
	height: number;
}

/** Canonical extension (no dot) for an export format. */
export function formatExtension(format: ComposerImageFormat): string {
	if (format === 'image/jpeg') return 'jpg';
	if (format === 'image/webp') return 'webp';
	return 'png';
}

/** Clamp lossy quality to `[0,1]`; PNG ignores quality entirely. */
export function normalizeQuality(format: ComposerImageFormat, quality: number | undefined): number | undefined {
	if (format === 'image/png') return undefined;
	if (quality === undefined) return undefined;
	return Math.min(1, Math.max(0, quality));
}

/**
 * Compute the output pixel dimensions for a transform applied to a source of
 * `source` size. Order: crop (rect) → rotate quarter-turns (swaps W/H on odd
 * quarters). Flip and straighten do not change the pixel dimensions (straighten
 * rotates content within the same frame). Free-crop keeps the bounding rect of
 * its path.
 */
export function computeOutputDimensions(
	source: ImageDimensions,
	transform: ComposerImageTransform,
): ImageDimensions {
	let width = source.width;
	let height = source.height;

	if (transform.crop) {
		width = Math.round(transform.crop.width);
		height = Math.round(transform.crop.height);
	} else if (transform.freeCropPath && transform.freeCropPath.length >= 3) {
		const xs = transform.freeCropPath.map((p) => p.x);
		const ys = transform.freeCropPath.map((p) => p.y);
		width = Math.round(Math.max(...xs) - Math.min(...xs));
		height = Math.round(Math.max(...ys) - Math.min(...ys));
	}

	const quarters = ((transform.rotateQuarters ?? 0) % 4 + 4) % 4;
	if (quarters === 1 || quarters === 3) return { width: height, height: width };
	return { width, height };
}

/** The bounding rect of a free-crop polygon, in source pixels. */
export function freeCropBounds(path: readonly { x: number; y: number }[]): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	const xs = path.map((p) => p.x);
	const ys = path.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Validate + normalise a transform (throws on an invalid shape). */
export function normalizeTransform(transform: ComposerImageTransform): ComposerImageTransform {
	return ComposerImageTransformSchema.parse(transform);
}

// ── Browser render (DOM; not exercised in node tests) ─────────────────────────

export interface RenderImageInput {
	/** Canvas factory bound to the host's ownerDocument (S4 ownerWindow rule). */
	createCanvas: () => HTMLCanvasElement;
	/** Decoded source image (natural dimensions read from the element/bitmap). */
	source: CanvasImageSource;
	sourceWidth: number;
	sourceHeight: number;
	transform: ComposerImageTransform;
	/** Default format when the transform omits one. */
	defaultFormat?: ComposerImageFormat;
	defaultQuality?: number;
}

export interface RenderImageOutput {
	blob: Blob;
	width: number;
	height: number;
	format: ComposerImageFormat;
	/** Exact output size — `blob.size` (never estimated). */
	byteSize: number;
}

/**
 * Apply a Converter transform on a Canvas and re-encode. Deterministic pipeline:
 * crop → (straighten + rotate + flip via one transform matrix) → toBlob.
 * Metadata is stripped by construction (we draw decoded pixels, never copy EXIF).
 */
export async function renderImageTransform(input: RenderImageInput): Promise<RenderImageOutput> {
	const t = normalizeTransform(input.transform);
	const format: ComposerImageFormat = t.format ?? input.defaultFormat ?? 'image/png';
	const quality = normalizeQuality(format, t.quality ?? input.defaultQuality);

	// 1. Resolve the crop rect (rectangular, free-crop bounds, or the whole image).
	const crop = t.crop
		? { x: t.crop.x, y: t.crop.y, width: t.crop.width, height: t.crop.height }
		: t.freeCropPath && t.freeCropPath.length >= 3
			? freeCropBounds(t.freeCropPath)
			: { x: 0, y: 0, width: input.sourceWidth, height: input.sourceHeight };

	const quarters = ((t.rotateQuarters ?? 0) % 4 + 4) % 4;
	const swap = quarters === 1 || quarters === 3;
	const outW = Math.max(1, Math.round(swap ? crop.height : crop.width));
	const outH = Math.max(1, Math.round(swap ? crop.width : crop.height));

	const canvas = input.createCanvas();
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('renderImageTransform: 2d context unavailable');

	ctx.save();
	// Move origin to output centre, apply rotate (quarter + straighten) and flip.
	ctx.translate(outW / 2, outH / 2);
	const straightenRad = ((t.straightenDegrees ?? 0) * Math.PI) / 180;
	ctx.rotate((quarters * Math.PI) / 2 + straightenRad);
	ctx.scale(t.flipHorizontal ? -1 : 1, t.flipVertical ? -1 : 1);

	// Free-crop: clip to the polygon (relative to the crop origin) before drawing.
	if (t.freeCropPath && t.freeCropPath.length >= 3 && !t.crop) {
		ctx.beginPath();
		t.freeCropPath.forEach((p, i) => {
			const px = p.x - crop.x - crop.width / 2;
			const py = p.y - crop.y - crop.height / 2;
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		});
		ctx.closePath();
		ctx.clip();
	}

	// Draw the cropped source region centred at the origin.
	ctx.drawImage(
		input.source,
		crop.x,
		crop.y,
		crop.width,
		crop.height,
		-crop.width / 2,
		-crop.height / 2,
		crop.width,
		crop.height,
	);
	ctx.restore();

	const blob = await canvasToBlob(canvas, format, quality);
	return { blob, width: outW, height: outH, format, byteSize: blob.size };
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	format: ComposerImageFormat,
	quality: number | undefined,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
			format,
			quality,
		);
	});
}
