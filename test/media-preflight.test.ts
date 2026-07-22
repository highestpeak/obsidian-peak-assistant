// Preflight is a pure function over (request, config, availability). These
// tests cover the branches called out in task-c1 §R3: fal has key vs missing,
// unsupported kind, video/music always-confirm, auto-route resolution when
// only fal is available.

import assert from 'assert';
import { preflightMediaRequest, type MediaRouteAvailability } from '@/service/media/preflight';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import type { MediaGenerationRequest } from '@/core/types/media-generation';

const FAL_CONFIGURED: MediaRouteAvailability = {
	fal: { configured: true, supportedKinds: ['tts', 'image', 'video', 'music'] },
	native: { configured: false, supportedKinds: [] },
};

const FAL_MISSING: MediaRouteAvailability = {
	fal: { configured: false, supportedKinds: ['tts', 'image', 'video', 'music'] },
	native: { configured: false, supportedKinds: [] },
};

function makeReq(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
	return {
		kind: 'image',
		prompt: 'a bright red flower',
		route: 'auto',
		presetId: 'default',
		...overrides,
	};
}

async function testFalMissingKeyBlocksImage() {
	const res = preflightMediaRequest(makeReq({ route: 'fal' }), DEFAULT_MEDIA_GENERATION_CONFIG, FAL_MISSING);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.strictEqual(res.executionRoute, 'fal');
	assert.ok(res.problems.some((p) => p.code === 'fal-missing-key'), 'expected fal-missing-key problem');
	console.log('  ✓ fal missing key → needs-configuration');
}

async function testFalWithKeyReadyForImage() {
	const res = preflightMediaRequest(makeReq({ route: 'fal' }), DEFAULT_MEDIA_GENERATION_CONFIG, FAL_CONFIGURED);
	assert.strictEqual(res.state, 'ready');
	assert.strictEqual(res.executionRoute, 'fal');
	assert.strictEqual(res.provider, 'fal');
	assert.ok(res.modelId && res.modelId.length > 0);
	assert.ok(res.estimate, 'estimate must be present');
	assert.strictEqual(res.estimate?.confidence, 'estimated');
	assert.strictEqual(res.problems.length, 0);
	console.log('  ✓ fal with key + supported kind → ready with estimate');
}

async function testAutoRouteCollapsesToFal() {
	const res = preflightMediaRequest(makeReq({ route: 'auto' }), DEFAULT_MEDIA_GENERATION_CONFIG, FAL_CONFIGURED);
	assert.strictEqual(res.state, 'ready');
	assert.strictEqual(res.executionRoute, 'fal', 'auto collapses to fal when native unavailable');
	console.log('  ✓ auto route collapses to fal when native unavailable');
}

async function testAutoRouteFailsWhenNothingConfigured() {
	const res = preflightMediaRequest(makeReq({ route: 'auto' }), DEFAULT_MEDIA_GENERATION_CONFIG, FAL_MISSING);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.ok(res.problems.some((p) => p.code === 'no-available-route'));
	console.log('  ✓ auto with no route configured → needs-configuration');
}

async function testUnsupportedKindOnFal() {
	const avail: MediaRouteAvailability = {
		fal: { configured: true, supportedKinds: ['tts', 'image'] },
		native: { configured: false, supportedKinds: [] },
	};
	const res = preflightMediaRequest(makeReq({ kind: 'video', route: 'fal' }), DEFAULT_MEDIA_GENERATION_CONFIG, avail);
	assert.strictEqual(res.state, 'unsupported');
	assert.strictEqual(res.executionRoute, 'fal');
	assert.ok(res.problems.some((p) => p.code === 'fal-unsupported-kind'));
	console.log('  ✓ kind not in adapter.supportedKinds() → unsupported');
}

async function testVideoRequiresConfirmation() {
	const res = preflightMediaRequest(makeReq({ kind: 'video', route: 'fal' }), DEFAULT_MEDIA_GENERATION_CONFIG, FAL_CONFIGURED);
	assert.strictEqual(res.state, 'needs-confirmation');
	assert.strictEqual(res.executionRoute, 'fal');
	assert.ok(res.estimate?.amountUsd && res.estimate.amountUsd > 0);
	console.log('  ✓ video → needs-confirmation with estimate');
}

async function testMusicRequiresConfirmation() {
	const res = preflightMediaRequest(makeReq({ kind: 'music', route: 'fal' }), DEFAULT_MEDIA_GENERATION_CONFIG, FAL_CONFIGURED);
	assert.strictEqual(res.state, 'needs-confirmation');
	assert.strictEqual(res.executionRoute, 'fal');
	console.log('  ✓ music → needs-confirmation');
}

async function testNativeRouteAlwaysUnavailableInC1() {
	const res = preflightMediaRequest(makeReq({ route: 'native' }), DEFAULT_MEDIA_GENERATION_CONFIG, FAL_CONFIGURED);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.strictEqual(res.executionRoute, 'native');
	assert.ok(res.problems.some((p) => p.code === 'native-not-configured'));
	console.log('  ✓ native route → needs-configuration in C1 baseline');
}

async function testInvalidFalEndpointSurfacesConfigProblem() {
	// Override the preset with a malformed endpoint id to prove the
	// startup-time validation surfaces via preflight rather than crashing
	// inside the adapter.
	const badConfig = {
		...DEFAULT_MEDIA_GENERATION_CONFIG,
		presets: {
			...DEFAULT_MEDIA_GENERATION_CONFIG.presets,
			image: {
				...DEFAULT_MEDIA_GENERATION_CONFIG.presets.image,
				default: {
					...DEFAULT_MEDIA_GENERATION_CONFIG.presets.image.default,
					model: '  bad endpoint  ',
				},
			},
		},
	};
	const res = preflightMediaRequest(makeReq({ route: 'fal' }), badConfig, FAL_CONFIGURED);
	assert.strictEqual(res.state, 'needs-configuration');
	assert.ok(res.problems.some((p) => p.code === 'fal-invalid-endpoint'));
	console.log('  ✓ malformed fal endpoint id → needs-configuration');
}

// ─── E2 R2#2 (E1 M-1): native quantity guard vs maxQuantityByModel ────────

async function testNativeQuantityOverMaxSurfacesPreflightConfig() {
	// A native profile IS available (openai) and the requested quantity
	// (4) exceeds the shipping gpt-image-1 cap of 1. Preflight must fail
	// with a needs-configuration problem carrying `native-quantity-exceeds-max`
	// so the user sees the honest configure card instead of the raw
	// provider 400.
	const NATIVE_READY: MediaRouteAvailability = {
		fal: { configured: true, supportedKinds: ['image'] },
		native: { configured: true, supportedKinds: ['image'], provider: 'openai' },
	};
	const res = preflightMediaRequest(
		makeReq({ route: 'native', kind: 'image', quantity: 4, presetId: 'native-default' }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		NATIVE_READY,
	);
	assert.strictEqual(res.state, 'needs-configuration', 'over-max quantity → needs-configuration');
	assert.strictEqual(res.executionRoute, 'native');
	const guard = res.problems.find((p) => p.code === 'native-quantity-exceeds-max');
	assert.ok(guard, 'expected native-quantity-exceeds-max problem');
	assert.strictEqual(guard!.configureAction, 'media', 'preflight guides user to Media Settings');
	// The template mentions the model + quantity + max — verify slots substituted.
	assert.ok(/gpt-image-1/.test(guard!.message), `message names the model: ${guard!.message}`);
	assert.ok(/4/.test(guard!.message), `message includes requested quantity: ${guard!.message}`);
	console.log('  ✓ E2 R2#2: native quantity>max is caught at preflight (honest configure receipt)');
}

async function testNativeQuantityAtMaxIsReady() {
	// Mirror: quantity==max is accepted (strict > guard). Also confirms
	// that the estimate/route are correctly filled instead of the earlier
	// needs-configuration path.
	const NATIVE_READY: MediaRouteAvailability = {
		fal: { configured: true, supportedKinds: ['image'] },
		native: { configured: true, supportedKinds: ['image'], provider: 'openai' },
	};
	const res = preflightMediaRequest(
		makeReq({ route: 'native', kind: 'image', quantity: 1, presetId: 'native-default' }),
		DEFAULT_MEDIA_GENERATION_CONFIG,
		NATIVE_READY,
	);
	assert.strictEqual(res.state, 'ready');
	assert.strictEqual(res.executionRoute, 'native');
	assert.strictEqual(res.provider, 'openai');
	assert.ok(!res.problems.some((p) => p.code === 'native-quantity-exceeds-max'));
	console.log('  ✓ E2 R2#2: native quantity==max is ready (strict > guard)');
}

async function main() {
	await testFalMissingKeyBlocksImage();
	await testFalWithKeyReadyForImage();
	await testAutoRouteCollapsesToFal();
	await testAutoRouteFailsWhenNothingConfigured();
	await testUnsupportedKindOnFal();
	await testVideoRequiresConfirmation();
	await testMusicRequiresConfirmation();
	await testNativeRouteAlwaysUnavailableInC1();
	await testInvalidFalEndpointSurfacesConfigProblem();
	await testNativeQuantityOverMaxSurfacesPreflightConfig();
	await testNativeQuantityAtMaxIsReady();
	console.log('media-preflight: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
