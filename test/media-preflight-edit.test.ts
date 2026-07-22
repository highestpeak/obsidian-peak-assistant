// Zero-gap plan §4 A1/A3 — preflight matrix for edit requests. Complements
// media-preflight.test.ts, which is generate-only.

import assert from 'assert';
import { preflightMediaRequest, type MediaRouteAvailability } from '@/service/media/preflight';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import type { MediaGenerationRequest } from '@/core/types/media-generation';

const FAL_EDIT_READY: MediaRouteAvailability = {
	fal: {
		configured: true,
		supportedKinds: ['tts', 'image', 'video', 'music'],
		supportedOperations: ['generate', 'edit'],
	},
	native: {
		configured: true,
		supportedKinds: ['image', 'video'],
		supportedOperations: ['generate', 'edit'],
		provider: 'openai',
	},
};

const FAL_GENERATE_ONLY: MediaRouteAvailability = {
	fal: {
		configured: true,
		supportedKinds: ['image'],
		supportedOperations: ['generate'],
	},
	native: {
		configured: true,
		supportedKinds: ['image'],
		supportedOperations: ['generate'],
		provider: 'openai',
	},
};

function makeReq(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
	return {
		kind: 'image',
		prompt: 'add a bird to the scene',
		route: 'fal',
		presetId: 'edit-default',
		operation: 'edit',
		referenceImages: [{ sourceType: 'vault', ref: 'in.png' }],
		...overrides,
	};
}

let passed = 0;

async function testEditUnsupportedKindIsUnsupported() {
	// Editing video is not on the roadmap today — must land as `unsupported`
	// (not `needs-configuration`, which would suggest the user can fix it).
	const res = preflightMediaRequest(
		makeReq({ kind: 'video', presetId: 'default' }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_EDIT_READY,
	);
	assert.strictEqual(res.state, 'unsupported');
	assert.ok(res.problems.some((p) => p.code === 'edit-unsupported-kind'));
	console.log('  ✓ edit + video kind → unsupported');
	passed += 1;
}

async function testEditMissingBaseImageIsNeedsConfiguration() {
	const res = preflightMediaRequest(
		makeReq({ referenceImages: [] }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_EDIT_READY,
	);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.ok(res.problems.some((p) => p.code === 'edit-missing-base-image'));
	console.log('  ✓ edit + no reference → needs-configuration');
	passed += 1;
}

async function testEditPresetOperationMismatchBlocks() {
	// text-to-image preset (`default`) with operation:edit must fail — no
	// silent substitution onto a generate preset.
	const res = preflightMediaRequest(
		makeReq({ presetId: 'default' }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_EDIT_READY,
	);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.ok(res.problems.some((p) => p.code === 'preset-operation-mismatch'));
	console.log('  ✓ edit-op + generate-preset → preset-operation-mismatch');
	passed += 1;
}

async function testEditFillWithoutMaskFailsLoud() {
	// edit-fill is a maskRequired preset — asking for it without a mask
	// must surface `edit-mask-required`.
	const res = preflightMediaRequest(
		makeReq({ presetId: 'edit-fill' }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_EDIT_READY,
	);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.ok(res.problems.some((p) => p.code === 'edit-mask-required'));
	console.log('  ✓ edit-fill without mask → edit-mask-required');
	passed += 1;
}

async function testEditDefaultWithMaskFailsMaskNotSupported() {
	// nano-banana/edit does not accept a mask (`editCodec.maskField` absent)
	// — passing one must fail loudly.
	const res = preflightMediaRequest(
		makeReq({
			presetId: 'edit-default',
			maskImage: { sourceType: 'vault', ref: 'm.png' },
		}),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_EDIT_READY,
	);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.ok(res.problems.some((p) => p.code === 'edit-mask-not-supported'));
	console.log('  ✓ edit-default + mask → edit-mask-not-supported');
	passed += 1;
}

async function testEditRouteUnsupportedFal() {
	// If the fal snapshot advertises generate-only, edit routing to fal must
	// surface `fal-edit-unsupported` (not `unsupported`).
	const res = preflightMediaRequest(
		makeReq({ route: 'fal' }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_GENERATE_ONLY,
	);
	assert.strictEqual(res.state, 'unsupported');
	assert.ok(res.problems.some((p) => p.code === 'fal-edit-unsupported'));
	console.log('  ✓ fal route + generate-only snapshot → fal-edit-unsupported');
	passed += 1;
}

async function testEditRouteUnsupportedNative() {
	const res = preflightMediaRequest(
		makeReq({ route: 'native', presetId: 'native-edit' }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_GENERATE_ONLY,
	);
	assert.strictEqual(res.state, 'unsupported');
	assert.ok(res.problems.some((p) => p.code === 'native-edit-unsupported'));
	console.log('  ✓ native route + generate-only snapshot → native-edit-unsupported');
	passed += 1;
}

async function testEditReadyOnValidCombination() {
	const res = preflightMediaRequest(
		makeReq(),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		FAL_EDIT_READY,
	);
	assert.strictEqual(res.state, 'ready');
	assert.strictEqual(res.executionRoute, 'fal');
	assert.strictEqual(res.modelId, 'fal-ai/nano-banana/edit');
	console.log('  ✓ edit-default + fal edit-ready snapshot → ready');
	passed += 1;
}

async function main() {
	await testEditUnsupportedKindIsUnsupported();
	await testEditMissingBaseImageIsNeedsConfiguration();
	await testEditPresetOperationMismatchBlocks();
	await testEditFillWithoutMaskFailsLoud();
	await testEditDefaultWithMaskFailsMaskNotSupported();
	await testEditRouteUnsupportedFal();
	await testEditRouteUnsupportedNative();
	await testEditReadyOnValidCombination();
	console.log(`\nmedia-preflight-edit: PASS (${passed}/8)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
