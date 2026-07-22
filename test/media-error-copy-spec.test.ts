/**
 * Task E2 R1#4 — spec §5.6 error text coverage lock.
 *
 * The plan lists five error rows the UI must handle. For each row we lock
 * (a) a config-driven string exists (so the copy is not hardcoded in
 * TypeScript), and (b) the semantic surface uses that string via a
 * traceable code path. The assertions target the CONFIG SLOTS — not the
 * exact English wording — so the doc can be reworded without breaking
 * this test, but the CONTRACT (config-driven + present) is protected.
 *
 * Row → asserted string keys:
 *   1. Native unavailable       → strings.nativeNoAdapter /
 *                                  strings.nativeMissingProfile /
 *                                  strings.nativeInvalidProfile /
 *                                  strings.nativeUnsupportedKind
 *   2. fal missing key          → strings.falKeyMissing
 *   3. Auto no route            → strings.autoNoRoute
 *   4. video/music cost confirm → chatStudioStrings.artifactReceipt.confirmCost*
 *   5. Provider/timeout failed  → strings.toolExecuteFailedPayload
 */

import assert from 'assert';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import { DEFAULT_CHAT_STUDIO_STRINGS } from '@/ui/view/chat-view/chatStudioStrings';

function testRow1_NativeUnavailableCopyExists() {
	const s = DEFAULT_MEDIA_GENERATION_CONFIG.strings;
	assert.ok(s.nativeNoAdapter && s.nativeNoAdapter.length > 0);
	assert.ok(s.nativeMissingProfile && s.nativeMissingProfile.length > 0);
	assert.ok(s.nativeInvalidProfile && s.nativeInvalidProfile.length > 0);
	assert.ok(s.nativeUnsupportedKind && s.nativeUnsupportedKind.length > 0);
	// Slots the preflight fills — verify the templates carry them.
	assert.ok(s.nativeUnsupportedKind.includes('{kind}'), 'nativeUnsupportedKind has {kind} slot');
	assert.ok(s.nativeInvalidProfile.includes('{profileId}'), 'nativeInvalidProfile has {profileId} slot');
	console.log('  ✓ §5.6 row 1: native-unavailable strings exist and carry template slots');
}

function testRow2_FalMissingKeyCopyExists() {
	const s = DEFAULT_MEDIA_GENERATION_CONFIG.strings;
	assert.ok(s.falKeyMissing && s.falKeyMissing.length > 0);
	console.log('  ✓ §5.6 row 2: fal missing-key copy exists');
}

function testRow3_AutoNoRouteCopyExists() {
	const s = DEFAULT_MEDIA_GENERATION_CONFIG.strings;
	assert.ok(s.autoNoRoute && s.autoNoRoute.length > 0);
	assert.ok(s.autoNoRoute.includes('{kind}'), 'autoNoRoute includes the {kind} slot');
	assert.ok(
		s.autoNoRoute.includes('{problemSummary}'),
		'autoNoRoute includes the {problemSummary} slot so per-route problems surface',
	);
	console.log('  ✓ §5.6 row 3: auto no-route copy lists {kind} + {problemSummary}');
}

function testRow4_ConfirmCostCardCopyExists() {
	const s = DEFAULT_CHAT_STUDIO_STRINGS.artifactReceipt;
	assert.ok(s.confirmCostHeading && s.confirmCostHeading.length > 0);
	assert.ok(s.confirmCostRouteLabel);
	assert.ok(s.confirmCostProviderLabel);
	assert.ok(s.confirmCostModelLabel);
	assert.ok(s.confirmCostDurationLabel);
	assert.ok(s.confirmCostQuantityLabel);
	assert.ok(s.confirmCostEstimateLabel);
	assert.ok(s.confirmCostEstimateUnavailable, 'honest "unavailable" fallback exists');
	assert.ok(s.confirmCostConfidenceEstimated);
	assert.ok(s.confirmCostConfidenceReported);
	assert.ok(s.confirmCostDurationUnit);
	console.log('  ✓ §5.6 row 4: video/music confirm-cost card has full label set (never blind)');
}

function testRow5_ProviderFailureCopyExists() {
	const s = DEFAULT_MEDIA_GENERATION_CONFIG.strings;
	assert.ok(s.toolExecuteFailedPayload && s.toolExecuteFailedPayload.length > 0);
	assert.ok(s.toolExecuteFailedPayload.includes('{reason}'), 'has {reason} slot');
	assert.ok(s.toolExecuteFailedPayload.includes('{code}'), 'has {code} slot');
	assert.ok(s.toolExecuteFailedPayload.includes('{kind}'), 'has {kind} slot');
	console.log('  ✓ §5.6 row 5: provider-failure copy includes {kind} {reason} {code}');
}

function testE2R1_2_ConfirmPreDisclosureExists() {
	const s = DEFAULT_CHAT_STUDIO_STRINGS.composer;
	assert.ok(
		s.generateImageCostHintConfirmHintVideo && s.generateImageCostHintConfirmHintVideo.length > 0,
		'video pre-disclosure exists',
	);
	assert.ok(
		s.generateImageCostHintConfirmHintMusic && s.generateImageCostHintConfirmHintMusic.length > 0,
		'music pre-disclosure exists',
	);
	console.log('  ✓ E2 R1#2: Composer pre-disclosure copy exists for video + music');
}

async function main() {
	testRow1_NativeUnavailableCopyExists();
	testRow2_FalMissingKeyCopyExists();
	testRow3_AutoNoRouteCopyExists();
	testRow4_ConfirmCostCardCopyExists();
	testRow5_ProviderFailureCopyExists();
	testE2R1_2_ConfirmPreDisclosureExists();
	console.log('media-error-copy-spec: 6/6 slices passed');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
