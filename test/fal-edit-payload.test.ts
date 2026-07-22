// falPayload — the shared fal wire-protocol helpers used by both the sync
// FalMediaAdapter and the async FalAsyncMediaAdapter. Guards the edit
// codec branches (nano-banana list vs flux fill single+mask) and the
// image batch fan-out (extractFalMediaUrls returns every URL).

import assert from 'assert';
import {
	buildFalPayload,
	extractFalMediaUrls,
	falSupportedOperations,
	FAL_FALLBACK_VIDEO_ENUM,
} from '@/app/platform/media/falPayload';
import type { MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';
import type { ResolvedMediaReference } from '@/core/ports/MediaReferenceResolver';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';

function ref(refName: string, byte = 1): ResolvedMediaReference {
	return {
		ref: refName,
		mimeType: 'image/png',
		bytes: new Uint8Array([byte]),
		dataUri: `data:image/png;base64,${Buffer.from([byte]).toString('base64')}`,
		filename: refName,
	};
}

let passed = 0;

async function testListCodec() {
	// nano-banana/edit expects `image_urls` as a list; every reference
	// data URI ends up in that array.
	const req: MediaGenerationRequest = {
		kind: 'image',
		prompt: 'add a bird',
		operation: 'edit',
		editCodec: { imageField: 'image_urls', imageMode: 'list' },
		references: [ref('a', 1), ref('b', 2)],
	};
	const payload = buildFalPayload(req, DEFAULT_MEDIA_GENERATION_CONFIG);
	assert.ok(Array.isArray((payload as any).image_urls));
	assert.strictEqual((payload as any).image_urls.length, 2);
	assert.strictEqual((payload as any).image_urls[0], 'data:image/png;base64,AQ==');
	assert.strictEqual((payload as any).prompt, 'add a bird');
	console.log('  ✓ list codec: every ref lands in image_urls[]');
	passed += 1;
}

async function testSingleCodecWithMask() {
	// flux-pro/v1/fill expects `image_url` + `mask_url`.
	const req: MediaGenerationRequest = {
		kind: 'image',
		prompt: 'fill the area',
		operation: 'edit',
		editCodec: { imageField: 'image_url', imageMode: 'single', maskField: 'mask_url', maskRequired: true },
		references: [ref('base', 1)],
		mask: ref('mask', 9),
	};
	const payload = buildFalPayload(req, DEFAULT_MEDIA_GENERATION_CONFIG);
	assert.strictEqual((payload as any).image_url, 'data:image/png;base64,AQ==');
	assert.strictEqual((payload as any).mask_url, 'data:image/png;base64,CQ==');
	console.log('  ✓ single codec + mask lands in mask_url');
	passed += 1;
}

async function testEditWithoutCodecThrows() {
	const req: MediaGenerationRequest = {
		kind: 'image',
		prompt: 'x',
		operation: 'edit',
		references: [ref('a')],
	};
	assert.throws(
		() => buildFalPayload(req, DEFAULT_MEDIA_GENERATION_CONFIG),
		/editCodec/,
	);
	console.log('  ✓ edit + missing codec → throws');
	passed += 1;
}

async function testEditWithoutReferencesThrows() {
	const req: MediaGenerationRequest = {
		kind: 'image',
		prompt: 'x',
		operation: 'edit',
		editCodec: { imageField: 'image_urls', imageMode: 'list' },
		references: [],
	};
	assert.throws(
		() => buildFalPayload(req, DEFAULT_MEDIA_GENERATION_CONFIG),
		/at least one/i,
	);
	console.log('  ✓ edit + no references → throws');
	passed += 1;
}

async function testMaskOnCodecWithoutMaskFieldThrows() {
	const req: MediaGenerationRequest = {
		kind: 'image',
		prompt: 'x',
		operation: 'edit',
		editCodec: { imageField: 'image_urls', imageMode: 'list' }, // no maskField
		references: [ref('a')],
		mask: ref('m'),
	};
	assert.throws(
		() => buildFalPayload(req, DEFAULT_MEDIA_GENERATION_CONFIG),
		/maskField/,
	);
	console.log('  ✓ mask + codec without maskField → throws (no silent drop)');
	passed += 1;
}

async function testGenerateQuantityAddsNumImages() {
	const req: MediaGenerationRequest = {
		kind: 'image',
		prompt: 'x',
		quantity: 3,
	};
	const payload = buildFalPayload(req, DEFAULT_MEDIA_GENERATION_CONFIG);
	assert.strictEqual((payload as any).num_images, 3);
	console.log('  ✓ quantity>1 threads through as num_images');
	passed += 1;
}

async function testExtractMultipleImages() {
	const urls = extractFalMediaUrls('image', {
		images: [{ url: 'https://x/a.png' }, { url: 'https://x/b.png' }, { url: 'https://x/c.webp' }],
	} as any);
	assert.deepStrictEqual(urls, ['https://x/a.png', 'https://x/b.png', 'https://x/c.webp']);
	console.log('  ✓ extractFalMediaUrls returns every image URL');
	passed += 1;
}

async function testExtractSingleImageFallback() {
	const urls = extractFalMediaUrls('image', { image: { url: 'https://x/one.png' } } as any);
	assert.deepStrictEqual(urls, ['https://x/one.png']);
	console.log('  ✓ extractFalMediaUrls falls back to single image shape');
	passed += 1;
}

async function testExtractVideoUrl() {
	const urls = extractFalMediaUrls('video', { video: { url: 'https://x/v.mp4' } } as any);
	assert.deepStrictEqual(urls, ['https://x/v.mp4']);
	console.log('  ✓ extractFalMediaUrls video shape');
	passed += 1;
}

async function testSupportedOperationsPerKind() {
	assert.deepStrictEqual([...falSupportedOperations('image')], ['generate', 'edit']);
	assert.deepStrictEqual([...falSupportedOperations('video')], ['generate']);
	assert.deepStrictEqual([...falSupportedOperations('music')], ['generate']);
	assert.deepStrictEqual([...falSupportedOperations('tts')], ['generate']);
	console.log('  ✓ falSupportedOperations: image = generate+edit, others generate-only');
	passed += 1;
}

async function testFallbackVideoEnum() {
	// A broken template (no videoDurationEnum for the requested model) must
	// still produce a valid duration string — no crash, no undefined.
	const req: MediaGenerationRequest = {
		kind: 'video',
		prompt: 'x',
		modelId: 'fal-ai/veo3.1',
		durationSeconds: 5,
	};
	const payload = buildFalPayload(req, FAL_FALLBACK_VIDEO_ENUM as any);
	assert.ok(typeof (payload as any).duration === 'string');
	console.log('  ✓ fallback enum yields a valid duration string');
	passed += 1;
}

async function main() {
	await testListCodec();
	await testSingleCodecWithMask();
	await testEditWithoutCodecThrows();
	await testEditWithoutReferencesThrows();
	await testMaskOnCodecWithoutMaskFieldThrows();
	await testGenerateQuantityAddsNumImages();
	await testExtractMultipleImages();
	await testExtractSingleImageFallback();
	await testExtractVideoUrl();
	await testSupportedOperationsPerKind();
	await testFallbackVideoEnum();
	console.log(`\nfal-edit-payload: PASS (${passed}/11)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
