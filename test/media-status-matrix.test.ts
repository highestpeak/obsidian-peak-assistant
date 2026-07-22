// Fix round 2 — real-UI defect tests (2026-07-21).
//
// V1: fal route rows were showing '—' in the Reason column when the fal API
//     key was absent. Root cause: the inline routeInfo builder never populated
//     `reason` for fal rows — it was always `undefined`, so the fallback
//     `routeInfo.reason ?? (ready ? '' : '—')` rendered '—'.
//     Fix: buildMatrixRowInfo returns reason='missing-key' when !fal.configured.
//
// V2: fal×tts row showed "Not supported / unsupported-kind" even though TTS
//     via fal (kokoro) is a shipping command capability. Root cause: the
//     probeSyncAvailability() snapshot only covers Chat tool kinds
//     (image/video/music); tts is excluded because TTS is a command path.
//     The old inline code hit `perKind = null` for kind='tts' and fell through
//     to a hardcoded `{configured:false, supported:false, reason:'unsupported-kind'}`.
//     Fix: buildMatrixRowInfo borrows the shared fal snapshot (via
//     perKind.image.routes.fal) to probe tts support honestly — fal's
//     supportedKinds includes 'tts', so when fal is configured the row shows
//     Ready; when the key is absent it shows Not ready / missing-key.

import assert from 'assert';
import { buildMatrixRowInfo } from '@/ui/view/settings/tabs/MediaGenerationTab';
import type { MediaKind } from '@/core/types/media-generation';

// ─── snapshot helpers ─────────────────────────────────────────────────────────

type FalSnap = { configured: boolean; supportedKinds: readonly MediaKind[] };
type NativeSnap = { configured: boolean; supportedKinds: readonly MediaKind[]; reason?: string };
type PerKindEntry = { anyRouteReady: boolean; routes: { native: NativeSnap; fal: FalSnap } };

function makeSnapshot(
	fal: FalSnap,
	native: NativeSnap = { configured: false, supportedKinds: [] },
): { perKind: Record<'image' | 'video' | 'music', PerKindEntry> } {
	const entry = (): PerKindEntry => ({
		anyRouteReady: (native.configured && native.supportedKinds.length > 0) ||
			(fal.configured && fal.supportedKinds.length > 0),
		routes: { native, fal },
	});
	return { perKind: { image: entry(), video: entry(), music: entry() } };
}

// ─── V1: fal route reason='missing-key' when key absent ─────────────────────

function testV1FalImageMissingKeyReasonIsMissingKey() {
	const snap = makeSnapshot({ configured: false, supportedKinds: ['image', 'video', 'music', 'tts'] });
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'image' }, snap);
	assert.strictEqual(info.configured, false, 'fal not configured');
	assert.strictEqual(info.supported, true, 'image is in fal supportedKinds');
	assert.strictEqual(info.reason, 'missing-key', 'V1: reason must be missing-key, not undefined/—');
	console.log('  ✓ V1: fal×image missing key → reason=missing-key');
}

function testV1FalVideoMissingKeyReasonIsMissingKey() {
	const snap = makeSnapshot({ configured: false, supportedKinds: ['image', 'video', 'music', 'tts'] });
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'video' }, snap);
	assert.strictEqual(info.reason, 'missing-key', 'V1: fal×video missing key → missing-key');
	console.log('  ✓ V1: fal×video missing key → reason=missing-key');
}

function testV1FalMusicMissingKeyReasonIsMissingKey() {
	const snap = makeSnapshot({ configured: false, supportedKinds: ['image', 'video', 'music', 'tts'] });
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'music' }, snap);
	assert.strictEqual(info.reason, 'missing-key', 'V1: fal×music missing key → missing-key');
	console.log('  ✓ V1: fal×music missing key → reason=missing-key');
}

function testV1FalConfiguredNoReason() {
	const snap = makeSnapshot({ configured: true, supportedKinds: ['image', 'video', 'music', 'tts'] });
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'image' }, snap);
	assert.strictEqual(info.configured, true);
	assert.strictEqual(info.supported, true);
	assert.strictEqual(info.reason, undefined, 'fal configured → no reason');
	console.log('  ✓ V1: fal×image with key → reason=undefined (ready)');
}

// ─── V2: fal×tts reflects real capability, not hardcoded unsupported ─────────

function testV2FalTtsMissingKeyNotUnsupported() {
	// Key absent: fal×tts should show Not ready / missing-key, NOT unsupported-kind.
	const snap = makeSnapshot({ configured: false, supportedKinds: ['tts', 'image', 'video', 'music'] });
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'tts' }, snap);
	assert.strictEqual(info.supported, true, 'V2: fal supports tts even without key');
	assert.strictEqual(info.configured, false);
	assert.strictEqual(info.reason, 'missing-key', 'V2: reason=missing-key, not unsupported-kind');
	console.log('  ✓ V2: fal×tts no key → supported=true, reason=missing-key (Not ready)');
}

function testV2FalTtsConfiguredIsReady() {
	// Key present: fal×tts should show Ready.
	const snap = makeSnapshot({ configured: true, supportedKinds: ['tts', 'image', 'video', 'music'] });
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'tts' }, snap);
	assert.strictEqual(info.configured, true);
	assert.strictEqual(info.supported, true);
	assert.strictEqual(info.reason, undefined);
	// ready = configured && supported
	const ready = info.configured && info.supported;
	assert.ok(ready, 'V2: fal×tts with key → ready');
	console.log('  ✓ V2: fal×tts with key → ready');
}

function testV2FalTtsFalSupportedKindsExcludesTtsNonReady() {
	// Edge case: if (somehow) a stripped fal adapter lacks tts in supportedKinds,
	// we should show not-supported, not a crash.
	const snap = makeSnapshot({ configured: true, supportedKinds: ['image', 'video', 'music'] });
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'tts' }, snap);
	assert.strictEqual(info.supported, false, 'fal does not list tts → unsupported');
	console.log('  ✓ V2 edge: fal supportedKinds without tts → supported=false (no crash)');
}

// ─── native rows unchanged ───────────────────────────────────────────────────

function testNativeRowPreservesReasonFromSnapshot() {
	const snap = makeSnapshot(
		{ configured: false, supportedKinds: [] },
		{ configured: false, supportedKinds: [], reason: 'missing-profile' },
	);
	const info = buildMatrixRowInfo({ route: 'native', kind: 'image' }, snap);
	assert.strictEqual(info.reason, 'missing-profile', 'native reason passthrough');
	console.log('  ✓ native×image: reason passes through from snapshot');
}

function testNativeUnsupportedKindReason() {
	// Native supports image but not video.
	const snap = makeSnapshot(
		{ configured: false, supportedKinds: [] },
		{ configured: true, supportedKinds: ['image'], reason: undefined },
	);
	const infoVideo = buildMatrixRowInfo({ route: 'native', kind: 'video' }, snap);
	assert.strictEqual(infoVideo.supported, false);
	console.log('  ✓ native×video: not in supportedKinds → supported=false');
}

// ─── run ─────────────────────────────────────────────────────────────────────

async function main() {
	testV1FalImageMissingKeyReasonIsMissingKey();
	testV1FalVideoMissingKeyReasonIsMissingKey();
	testV1FalMusicMissingKeyReasonIsMissingKey();
	testV1FalConfiguredNoReason();
	testV2FalTtsMissingKeyNotUnsupported();
	testV2FalTtsConfiguredIsReady();
	testV2FalTtsFalSupportedKindsExcludesTtsNonReady();
	testNativeRowPreservesReasonFromSnapshot();
	testNativeUnsupportedKindReason();
	console.log('media-status-matrix: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
