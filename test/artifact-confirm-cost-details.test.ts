/**
 * Task E2 R2#7 (D2 deferred): pure data-prep test for the awaiting-confirmation
 * cost card. Instead of standing up a React renderer just to inspect the
 * output, we test the extracted `buildConfirmCostRows()` (see
 * `src/ui/view/chat-view/components/messages/ArtifactReceiptCard.tsx`) —
 * the rendering path is a trivial dt/dd fan-out over these rows.
 *
 * Locks two branches D2 handoff called out but never tested:
 *   1. media extras present WITH estimate (`amountUsd` numeric) → renders
 *      `$X.XX / <billingUnit> (<confidence>)` verbatim, no fabrication.
 *   2. media extras present WITHOUT estimate → renders the honest
 *      `confirmCostEstimateUnavailable` string instead of `undefined`.
 *
 * Plus a third assertion: image `quantity` renders only when
 * `mediaKind === 'image'`; a video receipt with an incidental quantity
 * value on extras must NOT show a Quantity row.
 */

import assert from 'assert';
import {
	buildConfirmCostRows,
	type ArtifactReceiptStrings,
} from '@/ui/view/chat-view/components/messages/ArtifactReceiptCard';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';

// Minimal labels shape — every field this function touches, config-driven.
const LABELS: ArtifactReceiptStrings = {
	actionPreview: '',
	actionOpen: '',
	actionSave: '',
	actionDownload: '',
	actionCopy: '',
	actionEdit: '',
	actionApply: '',
	actionRetry: '',
	actionReview: '',
	actionConfirm: '',
	actionCancel: '',
	actionConfigure: '',
	imagePreviewLabel: '',
	closePreviewLabel: '',
	previousPreviewLabel: '',
	nextPreviewLabel: '',
	badgeGenerating: '',
	badgeSaving: '',
	badgeReady: '',
	badgeSaved: '',
	badgeFailed: '',
	badgeCancelled: '',
	badgeStale: '',
	badgeNeedsPermission: '',
	badgeAwaitingConfirmation: '',
	badgeNeedsConfiguration: '',
	untitledFallback: '',
	confirmCostHeading: 'Review before confirming',
	confirmCostRouteLabel: 'Route',
	confirmCostProviderLabel: 'Provider',
	confirmCostModelLabel: 'Model',
	confirmCostDurationLabel: 'Duration',
	confirmCostQuantityLabel: 'Quantity',
	confirmCostEstimateLabel: 'Estimated cost',
	confirmCostEstimateUnavailable: 'Estimate unavailable — provider did not return a cost.',
	confirmCostConfidenceEstimated: 'estimated',
	confirmCostConfidenceReported: 'provider-reported',
	confirmCostDurationUnit: 's',
};

function makeBaseReceipt(): ChatArtifactReceipt {
	return {
		artifactId: 'a-1',
		runId: 'r-1',
		messageId: 'm-1',
		conversationId: 'c-1',
		projectId: null,
		direction: 'generated',
		kind: 'video',
		state: 'awaiting-confirmation',
		title: 'clip',
		createdAt: 1_700_000_000_000,
		availableActions: ['confirm', 'cancel'],
	} as unknown as ChatArtifactReceipt;
}

function attachMedia(base: ChatArtifactReceipt, media: Record<string, unknown>): ChatArtifactReceipt {
	// The card reads via `(receipt as unknown as {media?}).media` — the field
	// lives on the persisted MediaReceiptExtras blob (see media-generation.ts).
	return { ...(base as unknown as Record<string, unknown>), media } as unknown as ChatArtifactReceipt;
}

function testHappyPathWithEstimate(): void {
	const receipt = attachMedia(makeBaseReceipt(), {
		executionRoute: 'fal',
		provider: 'fal',
		modelId: 'fal-ai/veo3/text-to-video',
		mediaKind: 'video',
		durationSeconds: 8,
		cost: { amountUsd: 0.75, billingUnit: 'video', confidence: 'estimated' },
	});
	const rows = buildConfirmCostRows(receipt, LABELS);
	assert.ok(rows, 'rows non-null when media extras present');
	const map = new Map(rows!.map((r) => [r.label, r.value]));
	assert.strictEqual(map.get('Route'), 'fal');
	assert.strictEqual(map.get('Provider'), 'fal');
	assert.strictEqual(map.get('Model'), 'fal-ai/veo3/text-to-video');
	assert.strictEqual(map.get('Duration'), '8s', 'duration + unit from labels');
	assert.ok(!map.has('Quantity'), 'video receipt must NOT show Quantity row');
	assert.strictEqual(
		map.get('Estimated cost'),
		'$0.75 / video (estimated)',
		'cost + billingUnit + confidence formatted, no fabrication',
	);
	console.log('  ✓ receipt WITH estimate renders formatted cost verbatim (no fabrication)');
}

function testMissingEstimateFallsBackToHonestString(): void {
	const receipt = attachMedia(makeBaseReceipt(), {
		executionRoute: 'fal',
		provider: 'fal',
		modelId: 'fal-ai/lyria2',
		mediaKind: 'music',
		durationSeconds: 20,
		// intentionally NO cost — preflight had nothing to estimate
	});
	const rows = buildConfirmCostRows(receipt, LABELS);
	assert.ok(rows, 'rows non-null even without estimate');
	const map = new Map(rows!.map((r) => [r.label, r.value]));
	assert.strictEqual(
		map.get('Estimated cost'),
		'Estimate unavailable — provider did not return a cost.',
		'honest fallback string, NOT a fabricated $0.00',
	);
	console.log('  ✓ receipt WITHOUT estimate falls back to honest "unavailable" copy');
}

function testImageKindShowsQuantity(): void {
	const receipt = attachMedia(
		{ ...makeBaseReceipt(), kind: 'image' } as ChatArtifactReceipt,
		{
			executionRoute: 'native',
			provider: 'openai',
			modelId: 'gpt-image-1',
			mediaKind: 'image',
			quantity: 1,
			cost: { amountUsd: 0.04, billingUnit: 'image', confidence: 'estimated' },
		},
	);
	const rows = buildConfirmCostRows(receipt, LABELS);
	assert.ok(rows);
	const map = new Map(rows!.map((r) => [r.label, r.value]));
	assert.strictEqual(map.get('Quantity'), '1', 'image receipt shows Quantity');
	assert.ok(!map.has('Duration'), 'image receipt has no duration row');
	console.log('  ✓ image receipt shows Quantity but not Duration');
}

function testNullMediaReturnsNull(): void {
	const receipt = makeBaseReceipt();
	const rows = buildConfirmCostRows(receipt, LABELS);
	assert.strictEqual(rows, null, 'null when media extras absent — card is hidden');
	console.log('  ✓ receipt without media extras returns null (card hidden)');
}

function testSubDollarCostUsesFourDigits(): void {
	const receipt = attachMedia(makeBaseReceipt(), {
		executionRoute: 'fal',
		provider: 'fal',
		modelId: 'fal-ai/kokoro',
		mediaKind: 'tts',
		cost: { amountUsd: 0.002, billingUnit: 'run', confidence: 'estimated' },
	});
	const rows = buildConfirmCostRows(receipt, LABELS);
	const est = rows!.find((r) => r.label === 'Estimated cost')!;
	assert.ok(est.value.startsWith('$0.0020'), `sub-cent uses 4 digits: ${est.value}`);
	console.log('  ✓ sub-cent amounts render with 4 fractional digits');
}

async function main() {
	testHappyPathWithEstimate();
	testMissingEstimateFallsBackToHonestString();
	testImageKindShowsQuantity();
	testNullMediaReturnsNull();
	testSubDollarCostUsesFourDigits();
	console.log('artifact-confirm-cost-details: 5/5 slices passed');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
