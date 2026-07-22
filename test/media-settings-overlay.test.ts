// Task E1 — pure tests for the Media Generation settings overlay, local
// validation, and configureAction → settings tab routing.

import assert from 'assert';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import {
	applyMediaSettingsOverlay,
	pickConfigureActionFromProblems,
	problemsByRoute,
	resolveConfigureTab,
	validateMediaConfiguration,
	listOpenAiProfilesForNative,
} from '@/service/media/mediaSettingsOverlay';
import type { AIServiceSettings } from '@/core/config/settingsTypes';
import type { Profile } from '@/core/profiles/types';

function baseAI(overrides: Partial<AIServiceSettings> = {}): AIServiceSettings {
	return {
		rootFolder: 'ChatFolder',
		defaultModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
		llmProviderConfigs: {},
		falApiKey: 'k-live-abc',
		mediaAttachmentFolder: '',
		...overrides,
	} as AIServiceSettings;
}

function fakeProfile(id: string, opts: Partial<Profile> = {}): Profile {
	return {
		id,
		name: opts.name ?? id,
		kind: opts.kind ?? 'openai',
		enabled: opts.enabled ?? true,
		apiKey: opts.apiKey ?? 'sk-real-key',
		baseUrl: opts.baseUrl,
	} as unknown as Profile;
}

// ─── overlay merge ─────────────────────────────────────────────────────────

function testOverlayNoOpWhenEmpty() {
	const out = applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, undefined);
	assert.strictEqual(out, DEFAULT_MEDIA_GENERATION_CONFIG, 'undefined overlay → same object');
	const out2 = applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, {});
	assert.strictEqual(out2, DEFAULT_MEDIA_GENERATION_CONFIG, 'empty overlay → same object');
	console.log('  ✓ empty overlay returns the base config unchanged');
}

function testOverlayReplacesDefaultRoute() {
	const out = applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, { defaultRoute: 'fal' });
	assert.strictEqual(out.defaultRoute, 'fal');
	console.log('  ✓ defaultRoute overlay wins');
}

function testOverlayDefaultPresetIdSwap() {
	// image has a `native-dalle3` preset; overlay should promote it into the
	// `default` slot so callers passing presetId='default' pick it up.
	const out = applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, {
		defaultPresetIds: { image: 'native-dalle3' },
	});
	assert.strictEqual(out.presets.image.default.model, 'dall-e-3', 'default slot swapped to dall-e-3');
	// Original preset stays reachable under its own id.
	assert.strictEqual(out.presets.image['native-dalle3'].model, 'dall-e-3');
	// Unknown id → no swap.
	const out2 = applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, {
		defaultPresetIds: { image: 'not-a-real-preset' },
	});
	assert.strictEqual(out2.presets.image.default.model, DEFAULT_MEDIA_GENERATION_CONFIG.presets.image.default.model, 'unknown id ignored');
	console.log('  ✓ defaultPresetIds swaps preset into default slot');
}

function testOverlayFieldOverridesMerge() {
	const out = applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, {
		presetOverrides: {
			video: { durationSeconds: 12, maxDurationSeconds: 20, model: 'fal-ai/custom/video' },
			image: { quantity: 3 },
		},
	});
	assert.strictEqual(out.presets.video.default.durationSeconds, 12);
	assert.strictEqual(out.presets.video.default.maxDurationSeconds, 20);
	assert.strictEqual(out.presets.video.default.model, 'fal-ai/custom/video');
	// Untouched fields preserved.
	assert.strictEqual(out.presets.video.default.billingUnit, DEFAULT_MEDIA_GENERATION_CONFIG.presets.video.default.billingUnit);
	assert.strictEqual(out.presets.image.default.quantity, 3);
	console.log('  ✓ presetOverrides merge field-by-field, preserve untouched fields');
}

function testOverlayDoesNotMutateInputs() {
	const base = JSON.parse(JSON.stringify(DEFAULT_MEDIA_GENERATION_CONFIG));
	const before = JSON.stringify(base);
	applyMediaSettingsOverlay(base, {
		defaultRoute: 'native',
		presetOverrides: { image: { quantity: 4 } },
		defaultPresetIds: { video: 'default' },
	});
	assert.strictEqual(JSON.stringify(base), before, 'base config not mutated');
	console.log('  ✓ overlay never mutates the base config');
}

// ─── validation ────────────────────────────────────────────────────────────

function testValidateMissingFalKey() {
	const result = validateMediaConfiguration({
		settings: baseAI({ falApiKey: '' }),
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
	});
	assert.ok(!result.ok, 'not ok when fal key missing');
	assert.ok(result.problems.some((p) => p.code === 'fal-key-missing'));
	console.log('  ✓ validate: fal key missing surfaces a problem');
}

function testValidateNativeMissingProfile() {
	const result = validateMediaConfiguration({
		settings: baseAI({
			mediaDefaults: { defaultRoute: 'native' },
		}),
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		profileLookup: { getAllProfiles: () => [] },
	});
	assert.ok(result.problems.some((p) => p.code === 'native-profile-missing' && p.route === 'native'));
	console.log('  ✓ validate: native default without profile surfaces native-profile-missing');
}

function testValidateNativeInvalidProfile() {
	const result = validateMediaConfiguration({
		settings: baseAI({
			mediaDefaults: { nativeProfileId: 'ghost-profile' },
		}),
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
	});
	assert.ok(result.problems.some((p) => p.code === 'native-profile-invalid'));
	console.log('  ✓ validate: named profile that does not resolve → invalid-profile');
}

function testValidatePresetMissingReferenced() {
	const result = validateMediaConfiguration({
		settings: baseAI({ mediaDefaults: { defaultPresetIds: { image: 'not-real' } } }),
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
	});
	assert.ok(result.problems.some((p) => p.code === 'preset-missing'));
	console.log('  ✓ validate: unknown preset id in overlay surfaces preset-missing');
}

function testValidatePresetOverrideDurationSanity() {
	const result = validateMediaConfiguration({
		settings: baseAI({ mediaDefaults: { presetOverrides: { video: { durationSeconds: 20, maxDurationSeconds: 5 } } } }),
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
	});
	assert.ok(result.problems.some((p) => p.code === 'preset-override-invalid' && /duration/i.test(p.detail)));
	console.log('  ✓ validate: duration > maxDuration flagged');
}

function testValidateHappyPathTimestamp() {
	let now = 0;
	const result = validateMediaConfiguration(
		{
			settings: baseAI(),
			config: DEFAULT_MEDIA_GENERATION_CONFIG,
			profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
		},
		() => (now += 1234),
	);
	assert.strictEqual(result.ok, true);
	assert.strictEqual(result.problems.length, 0);
	assert.strictEqual(result.validatedAt, 1234, 'timestamp comes from injected now()');
	console.log('  ✓ validate: happy path returns ok + timestamp');
}

function testValidateNeverPerformsNetworkCall() {
	// Poison globalThis.fetch — the pure validator MUST NOT call it.
	const originalFetch = (globalThis as any).fetch;
	let called = false;
	(globalThis as any).fetch = () => { called = true; throw new Error('fetch called from validate'); };
	try {
		validateMediaConfiguration({
			settings: baseAI(),
			config: DEFAULT_MEDIA_GENERATION_CONFIG,
			profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
		});
		assert.strictEqual(called, false, 'validate must be network-free');
	} finally {
		(globalThis as any).fetch = originalFetch;
	}
	console.log('  ✓ validate: never hits the network (no live cost checks)');
}

// ─── configureAction → tab ────────────────────────────────────────────────

function testResolveConfigureTab() {
	assert.strictEqual(resolveConfigureTab('media'), 'mediaGeneration');
	assert.strictEqual(resolveConfigureTab('profiles'), 'aiSetup');
	assert.strictEqual(resolveConfigureTab('mcp'), 'tools');
	assert.strictEqual(resolveConfigureTab('permissions'), 'aiSetup');
	assert.strictEqual(resolveConfigureTab(undefined), 'mediaGeneration', 'undefined falls back to media tab');
	assert.strictEqual(resolveConfigureTab('unknown'), 'mediaGeneration', 'unknown falls back to media tab');
	console.log('  ✓ resolveConfigureTab covers all documented actions');
}

function testPickConfigureActionFromProblemsPrefersPerRoute() {
	const picked = pickConfigureActionFromProblems([
		{ code: 'no-available-route', configureAction: 'media' },
		{ code: 'native-missing-profile', configureAction: 'profiles' },
		{ code: 'fal-missing-key', configureAction: 'media' },
	]);
	assert.strictEqual(picked, 'profiles', 'first per-route entry wins over aggregate');
	console.log('  ✓ pickConfigureActionFromProblems prefers per-route over aggregate');
}

function testPickConfigureActionFallsBackToAggregate() {
	const picked = pickConfigureActionFromProblems([
		{ code: 'no-available-route', configureAction: 'media' },
	]);
	assert.strictEqual(picked, 'media', 'aggregate used when nothing else');
	console.log('  ✓ pickConfigureActionFromProblems falls back to aggregate');
}

function testProblemsByRouteBuckets() {
	const grouped = problemsByRoute({
		ok: false,
		validatedAt: 0,
		problems: [
			{ code: 'fal-key-missing', route: 'fal', detail: 'x' },
			{ code: 'native-profile-invalid', route: 'native', detail: 'x' },
			{ code: 'preset-missing', route: 'shared', detail: 'x' },
			{ code: 'fal-endpoint-invalid', route: 'fal', detail: 'x' },
		],
	});
	assert.strictEqual(grouped.fal.length, 2);
	assert.strictEqual(grouped.native.length, 1);
	assert.strictEqual(grouped.shared.length, 1);
	console.log('  ✓ problemsByRoute groups the problems array by route');
}

// ─── OpenAI profile snapshot ───────────────────────────────────────────────

function testListOpenAiProfilesForNativeShape() {
	const list = listOpenAiProfilesForNative({
		getAllProfiles: () => [
			fakeProfile('op1', { kind: 'openai', enabled: true, apiKey: 'sk-1' }),
			fakeProfile('op2', { kind: 'anthropic', enabled: true, apiKey: 'a-1' }),
			fakeProfile('op3', { kind: 'openai', enabled: false, apiKey: '' }),
		],
	});
	assert.strictEqual(list.length, 2, 'anthropic filtered out');
	assert.deepStrictEqual(
		list.map((p) => ({ id: p.id, hasKey: p.hasKey, enabled: p.enabled })),
		[
			{ id: 'op1', hasKey: true, enabled: true },
			{ id: 'op3', hasKey: false, enabled: false },
		],
	);
	console.log('  ✓ listOpenAiProfilesForNative reports OpenAI-kind profiles with flags');
}

// ─── E2 R2#1 (E1 I-2): detail strings come from config.strings, not code ───

function testValidationDetailStringsSourceFromConfig() {
	// A config-driven template with obviously distinct sentinel values lets
	// us assert that `detail` came from `config.strings.validate*` +
	// `fmt()` substitution (E2 R2#1 / E1 I-2 fix), not a hardcoded English
	// literal in mediaSettingsOverlay.ts.
	const sentinelConfig = {
		...DEFAULT_MEDIA_GENERATION_CONFIG,
		strings: {
			...DEFAULT_MEDIA_GENERATION_CONFIG.strings,
			validateFalKeyMissingDetail: 'SENTINEL: fal key gone',
			validateNativeProfileInvalidDetail: 'SENTINEL: profile {profileId} bad',
			validatePresetMissingDetail: 'SENTINEL: preset {presetId} for {kind} gone',
		},
	};
	const result = validateMediaConfiguration({
		settings: baseAI({
			falApiKey: '',
			mediaDefaults: { nativeProfileId: 'ghost', defaultPresetIds: { image: 'nope' } },
		}),
		config: sentinelConfig,
		profileLookup: { getAllProfiles: () => [] },
	});
	const falMissing = result.problems.find((p) => p.code === 'fal-key-missing');
	const invalidProfile = result.problems.find((p) => p.code === 'native-profile-invalid');
	const presetMissing = result.problems.find((p) => p.code === 'preset-missing');
	assert.strictEqual(falMissing?.detail, 'SENTINEL: fal key gone', 'fal detail from config');
	assert.strictEqual(
		invalidProfile?.detail,
		'SENTINEL: profile ghost bad',
		'{profileId} slot substituted',
	);
	assert.strictEqual(
		presetMissing?.detail,
		'SENTINEL: preset nope for image gone',
		'{presetId} and {kind} substituted',
	);
	console.log('  ✓ E2 R2#1: validation detail strings come from config + fmt() substitution');
}

// ─── E2 R2#2 (E1 M-1): quantity vs native maxQuantityByModel ────────────────

function testValidateNativeQuantityOverrideAgainstModelMax() {
	// gpt-image-1 is capped at 1 per the shipping config. An override that
	// asks for 4 must surface a preset-override-invalid problem with
	// route='native' and a detail that mentions BOTH the requested
	// quantity AND the model id + max (so the user can fix the right thing).
	const result = validateMediaConfiguration({
		settings: baseAI({
			mediaDefaults: {
				// Swap the default preset to a NATIVE one (native-default uses gpt-image-1),
				// then override quantity to something the model refuses.
				defaultPresetIds: { image: 'native-default' },
				presetOverrides: { image: { quantity: 4 } },
			},
		}),
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
	});
	// Locate the M-1 problem specifically.
	const guard = result.problems.find(
		(p) => p.code === 'preset-override-invalid' && p.route === 'native' && /maximum/i.test(p.detail),
	);
	assert.ok(guard, 'quantity=4 against gpt-image-1 max=1 surfaces preset-override-invalid');
	assert.ok(/gpt-image-1/i.test(guard!.detail), 'detail names the model');
	assert.ok(/4/.test(guard!.detail), 'detail includes the requested quantity');
	assert.ok(/1/.test(guard!.detail), 'detail includes the max');
	console.log('  ✓ E2 R2#2: overlay quantity beyond native maxQuantityByModel is flagged');
}

function testValidateNativeQuantityUnderMaxIsAccepted() {
	// The mirror case — asking for quantity=1 against gpt-image-1 (max=1)
	// must NOT surface a preset-override-invalid problem. Confirms the
	// guard uses `>` and not `>=`.
	const result = validateMediaConfiguration({
		settings: baseAI({
			mediaDefaults: {
				defaultPresetIds: { image: 'native-default' },
				presetOverrides: { image: { quantity: 1 } },
			},
		}),
		config: DEFAULT_MEDIA_GENERATION_CONFIG,
		profileLookup: { getAllProfiles: () => [fakeProfile('op1')] },
	});
	const guard = result.problems.find((p) => p.code === 'preset-override-invalid' && p.route === 'native');
	assert.strictEqual(guard, undefined, 'quantity=1 against max=1 passes');
	console.log('  ✓ E2 R2#2: quantity==max is accepted (strict > guard, no off-by-one)');
}

// ─── run ───────────────────────────────────────────────────────────────────

async function main() {
	testOverlayNoOpWhenEmpty();
	testOverlayReplacesDefaultRoute();
	testOverlayDefaultPresetIdSwap();
	testOverlayFieldOverridesMerge();
	testOverlayDoesNotMutateInputs();
	testValidateMissingFalKey();
	testValidateNativeMissingProfile();
	testValidateNativeInvalidProfile();
	testValidatePresetMissingReferenced();
	testValidatePresetOverrideDurationSanity();
	testValidateHappyPathTimestamp();
	testValidateNeverPerformsNetworkCall();
	testResolveConfigureTab();
	testPickConfigureActionFromProblemsPrefersPerRoute();
	testPickConfigureActionFallsBackToAggregate();
	testProblemsByRouteBuckets();
	testListOpenAiProfilesForNativeShape();
	testValidationDetailStringsSourceFromConfig();
	testValidateNativeQuantityOverrideAgainstModelMax();
	testValidateNativeQuantityUnderMaxIsAccepted();
	console.log('media-settings-overlay: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
