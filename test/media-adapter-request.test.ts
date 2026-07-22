// buildAdapterRequest — the single translation from domain
// MediaGenerationRequest to the port-level MediaGenerationRequest adapters
// consume. Guards the two contracts the runner+service depend on:
//   1. modelId is ALWAYS resolved (preflight.modelId ?? preset.model),
//      because before this shim the runner passed the domain request to
//      adapter.submit — and the domain request has no modelId, so every
//      real submit would have thrown.
//   2. References are materialised via the resolver at execution time; the
//      persisted job never carries base64.
//   3. `resolveReferences:false` skips byte fetching so the runner's
//      download stage can rebuild the port request without needing bytes.
//   4. Missing resolver + refs requested → throws loudly.

import assert from 'assert';
import { buildAdapterRequest } from '@/service/media/adapterRequest';
import { DEFAULT_MEDIA_GENERATION_CONFIG, resolvePreset } from '@/service/media/mediaGenerationConfig';
import type {
	MediaReferenceInput,
	MediaGenerationRequest,
	MediaPreflight,
} from '@/core/types/media-generation';
import type {
	MediaReferenceLimits,
	MediaReferenceResolver,
	ResolvedMediaReference,
} from '@/core/ports/MediaReferenceResolver';

function fakeResolver(byRef: Record<string, ResolvedMediaReference>): MediaReferenceResolver & { calls: MediaReferenceInput[][] } {
	const calls: MediaReferenceInput[][] = [];
	return {
		calls,
		async resolve(inputs: MediaReferenceInput[], _limits: MediaReferenceLimits) {
			calls.push(inputs);
			return inputs.map((input) => byRef[input.ref] ?? { ref: input.ref, mimeType: 'image/png', bytes: new Uint8Array([0]), dataUri: 'data:image/png;base64,AA==', filename: 'x.png' });
		},
	};
}

const IMAGE_PRESET = resolvePreset(DEFAULT_MEDIA_GENERATION_CONFIG, 'image', 'default')!;
const EDIT_PRESET = resolvePreset(DEFAULT_MEDIA_GENERATION_CONFIG, 'image', 'edit-default', 'edit')!;

function preflight(overrides: Partial<MediaPreflight> = {}): MediaPreflight {
	return {
		state: 'ready',
		executionRoute: 'fal',
		provider: 'fal',
		modelId: 'fal-ai/fast-sdxl',
		estimate: { billingUnit: 'image', confidence: 'estimated' },
		problems: [],
		...overrides,
	};
}

function req(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
	return {
		kind: 'image',
		prompt: 'a red mountain',
		route: 'fal',
		presetId: 'default',
		...overrides,
	};
}

let passed = 0;

async function testModelIdResolvedFromPreflightThenPreset() {
	// The runner-latent-bug guard: buildAdapterRequest MUST populate modelId
	// so `adapter.submit` never hits `modelId is required`.
	const port = await buildAdapterRequest({
		request: req(),
		preflight: preflight({ modelId: 'from-preflight' }),
		preset: IMAGE_PRESET,
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
	});
	assert.strictEqual(port.modelId, 'from-preflight');
	// When preflight omits modelId, preset.model takes over.
	const port2 = await buildAdapterRequest({
		request: req(),
		preflight: preflight({ modelId: undefined }),
		preset: IMAGE_PRESET,
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
	});
	assert.strictEqual(port2.modelId, IMAGE_PRESET.model, 'falls back to preset.model');
	console.log('  ✓ modelId always resolved (runner latent-bug guard)');
	passed += 1;
}

async function testReferencesResolvedAtExecutionTime() {
	const resolver = fakeResolver({
		'a.png': { ref: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]), dataUri: 'data:image/png;base64,AQID', filename: 'a.png' },
	});
	const port = await buildAdapterRequest({
		request: req({
			operation: 'edit',
			referenceImages: [{ sourceType: 'vault', ref: 'a.png' }],
		}),
		preflight: preflight({ modelId: EDIT_PRESET.model }),
		preset: EDIT_PRESET,
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		referenceResolver: resolver,
	});
	assert.strictEqual(port.operation, 'edit');
	assert.ok(port.references && port.references.length === 1);
	assert.strictEqual(port.references![0].ref, 'a.png');
	assert.strictEqual(resolver.calls.length, 1, 'resolver invoked once for refs');
	// editCodec is attached from preset for the fal adapter to consume.
	assert.deepStrictEqual(port.editCodec, EDIT_PRESET.editCodec);
	console.log('  ✓ references materialised via resolver + editCodec attached from preset');
	passed += 1;
}

async function testResolveReferencesFalseSkipsResolver() {
	// The runner's download stage doesn't need bytes — passing false must
	// leave `references` undefined so the resolver never fires (and cannot
	// fail on a deleted source file mid-render).
	let calls = 0;
	const resolver: MediaReferenceResolver = {
		async resolve() { calls += 1; return []; },
	};
	const port = await buildAdapterRequest({
		request: req({
			operation: 'edit',
			referenceImages: [{ sourceType: 'vault', ref: 'a.png' }],
		}),
		preflight: preflight({ modelId: EDIT_PRESET.model }),
		preset: EDIT_PRESET,
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		referenceResolver: resolver,
		resolveReferences: false,
	});
	assert.strictEqual(calls, 0, 'resolver skipped');
	assert.strictEqual(port.references, undefined);
	console.log('  ✓ resolveReferences:false skips resolver (download stage)');
	passed += 1;
}

async function testMissingResolverWithRefsThrows() {
	await assert.rejects(
		() => buildAdapterRequest({
			request: req({
				operation: 'edit',
				referenceImages: [{ sourceType: 'vault', ref: 'a.png' }],
			}),
			preflight: preflight({ modelId: EDIT_PRESET.model }),
			preset: EDIT_PRESET,
			config: DEFAULT_MEDIA_GENERATION_CONFIG,
		}),
		/reference resolution is not wired/i,
	);
	console.log('  ✓ refs + no resolver → loud throw (never silently drop refs)');
	passed += 1;
}

async function testMaskResolvedSeparately() {
	const resolver = fakeResolver({});
	const port = await buildAdapterRequest({
		request: req({
			operation: 'edit',
			referenceImages: [{ sourceType: 'vault', ref: 'base.png' }],
			maskImage: { sourceType: 'vault', ref: 'mask.png' },
		}),
		preflight: preflight({ modelId: EDIT_PRESET.model }),
		preset: EDIT_PRESET,
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		referenceResolver: resolver,
	});
	assert.ok(port.mask, 'mask resolved to bytes');
	assert.strictEqual(port.mask!.ref, 'mask.png');
	// Two separate resolver calls: one for refs, one for mask.
	assert.strictEqual(resolver.calls.length, 2);
	console.log('  ✓ mask resolved via separate resolver call');
	passed += 1;
}

async function main() {
	await testModelIdResolvedFromPreflightThenPreset();
	await testReferencesResolvedAtExecutionTime();
	await testResolveReferencesFalseSkipsResolver();
	await testMissingResolverWithRefsThrows();
	await testMaskResolvedSeparately();
	console.log(`\nmedia-adapter-request: PASS (${passed}/5)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
