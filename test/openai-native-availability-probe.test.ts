// Native availability probe: image + valid OpenAI profile → available;
// missing key → needs-configuration (missing-profile) with configureAction
// 'profiles'; video/music/tts → unsupported-kind; explicit nativeProfileId
// enforces that profile is a valid enabled OpenAI profile with key.
// Task C2 §R2 + §R5.2.

import assert from 'assert';
import {
	createOpenAiNativeAvailabilityProbe,
	resolveOpenAiProfile,
	type OpenAiProfileLookup,
} from '@/service/media/openaiNativeAvailabilityProbe';
import type { Profile } from '@/core/profiles/types';

function makeProfile(overrides: Partial<Profile>): Profile {
	return {
		id: 'p-openai',
		name: 'OpenAI',
		kind: 'openai',
		enabled: true,
		createdAt: 1,
		baseUrl: '',
		apiKey: 'sk-test',
		primaryModel: 'gpt-4o',
		fastModel: 'gpt-4o-mini',
		customHeaders: {},
		embeddingEndpoint: null,
		embeddingApiKey: null,
		embeddingModel: null,
		icon: null,
		description: null,
		...overrides,
	};
}

function makeLookup(profiles: Profile[]): OpenAiProfileLookup {
	return {
		getAllProfiles: () => profiles,
		getProfileById: (id) => profiles.find((p) => p.id === id) ?? null,
	};
}

async function testAvailableWhenValidOpenAiProfileExists() {
	const probe = createOpenAiNativeAvailabilityProbe(makeLookup([makeProfile({})]));
	const snap = probe({ kind: 'image' });
	assert.strictEqual(snap.configured, true);
	// Sora video adapter registers alongside the image adapter (zero-gap §5 B1),
	// so the probe advertises both kinds. Image supports generate + edit;
	// video generate only.
	assert.deepStrictEqual([...snap.supportedKinds], ['image', 'video']);
	assert.deepStrictEqual([...(snap.supportedOperations ?? [])], ['generate', 'edit']);
	assert.strictEqual(snap.provider, 'openai');
	assert.strictEqual(snap.reason, undefined);
	console.log('  ✓ enabled OpenAI profile with key → configured available for image + video');
}

async function testNeedsConfigurationWhenNoProfile() {
	const probe = createOpenAiNativeAvailabilityProbe(makeLookup([]));
	const snap = probe({ kind: 'image' });
	assert.strictEqual(snap.configured, false);
	assert.strictEqual(snap.reason, 'missing-profile');
	console.log('  ✓ no profiles → configured=false, reason=missing-profile');
}

async function testNeedsConfigurationWhenProfileHasNoKey() {
	const probe = createOpenAiNativeAvailabilityProbe(
		makeLookup([makeProfile({ apiKey: '' })]),
	);
	const snap = probe({ kind: 'image' });
	assert.strictEqual(snap.configured, false);
	assert.strictEqual(snap.reason, 'missing-profile');
	console.log('  ✓ OpenAI profile with empty apiKey → missing-profile');
}

async function testNeedsConfigurationWhenProfileDisabled() {
	const probe = createOpenAiNativeAvailabilityProbe(
		makeLookup([makeProfile({ enabled: false })]),
	);
	const snap = probe({ kind: 'image' });
	assert.strictEqual(snap.configured, false);
	console.log('  ✓ disabled OpenAI profile → configured=false');
}

async function testNonOpenAiProfileIgnored() {
	const probe = createOpenAiNativeAvailabilityProbe(
		makeLookup([makeProfile({ kind: 'anthropic', id: 'p-anthro' })]),
	);
	const snap = probe({ kind: 'image' });
	assert.strictEqual(snap.configured, false);
	console.log('  ✓ non-openai profiles do not count');
}

async function testUnsupportedKindReturnedForMusicTts() {
	// Sora adds video coverage — music and tts stay unsupported at the
	// native adapter (fal is the only route for those kinds today).
	const probe = createOpenAiNativeAvailabilityProbe(makeLookup([makeProfile({})]));
	for (const kind of ['music', 'tts'] as const) {
		const snap = probe({ kind });
		assert.strictEqual(snap.configured, true, `${kind}: adapter exists`);
		assert.strictEqual(snap.reason, 'unsupported-kind');
		assert.strictEqual(snap.supportedKinds.includes(kind as any), false);
	}
	console.log('  ✓ music/tts → unsupported-kind (no fake claims)');
}

async function testVideoIsSupportedWithSoraProbe() {
	const probe = createOpenAiNativeAvailabilityProbe(makeLookup([makeProfile({})]));
	const snap = probe({ kind: 'video' });
	assert.strictEqual(snap.configured, true);
	assert.strictEqual(snap.reason, undefined);
	assert.deepStrictEqual([...(snap.supportedOperations ?? [])], ['generate']);
	console.log('  ✓ video → configured (Sora), generate-only');
}

async function testExplicitProfileIdMustBeValidOpenAi() {
	const profiles = [
		makeProfile({ id: 'p-openai' }),
		makeProfile({ id: 'p-anthro', kind: 'anthropic' }),
	];
	const probe = createOpenAiNativeAvailabilityProbe(makeLookup(profiles));
	const good = probe({ kind: 'image', nativeProfileId: 'p-openai' });
	assert.strictEqual(good.configured, true);
	const bad = probe({ kind: 'image', nativeProfileId: 'p-anthro' });
	assert.strictEqual(bad.configured, false);
	assert.strictEqual(bad.reason, 'invalid-profile');
	const missing = probe({ kind: 'image', nativeProfileId: 'nope' });
	assert.strictEqual(missing.reason, 'invalid-profile');
	console.log('  ✓ nativeProfileId enforces enabled OpenAI + key');
}

async function testResolveOpenAiProfilePicksFirstValidWhenNotSpecified() {
	const profiles = [
		makeProfile({ id: 'p1', apiKey: '' }),
		makeProfile({ id: 'p2', apiKey: 'sk-good' }),
	];
	const resolved = resolveOpenAiProfile(makeLookup(profiles));
	assert.strictEqual(resolved?.id, 'p2');
	console.log('  ✓ resolveOpenAiProfile skips key-less profile');
}

async function main() {
	await testAvailableWhenValidOpenAiProfileExists();
	await testNeedsConfigurationWhenNoProfile();
	await testNeedsConfigurationWhenProfileHasNoKey();
	await testNeedsConfigurationWhenProfileDisabled();
	await testNonOpenAiProfileIgnored();
	await testUnsupportedKindReturnedForMusicTts();
	await testVideoIsSupportedWithSoraProbe();
	await testExplicitProfileIdMustBeValidOpenAi();
	await testResolveOpenAiProfilePicksFirstValidWhenNotSpecified();
	console.log('openai-native-availability-probe: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
