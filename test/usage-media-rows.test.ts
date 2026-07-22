// Media generation rows for the Usage Dashboard (gap 2). Exercises the
// pure `mapMediaLogRow` helper: metadata parsing, outcome split, estimated
// cost invariant, failure error surfacing.

import assert from 'assert';
import { mapMediaLogRow } from '@/ui/view/usage-dashboard/hooks/useMediaLogs';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';

function baseRow(overrides: Partial<UsageLogRow> = {}): UsageLogRow {
	return {
		id: 1,
		session_id: 'conv-1',
		feature: 'media_generation',
		action: 'image.success',
		provider: 'fal',
		model: 'fal-ai/nano-banana',
		input_tokens: 0,
		output_tokens: 0,
		cached_tokens: 0,
		reasoning_tokens: 0,
		cost_usd: 0.039,
		duration_ms: 12500,
		is_streaming: 0,
		created_at: 1000,
		metadata_json: JSON.stringify({
			costConfidence: 'estimated',
			billingUnit: 'image',
			route: 'fal',
			jobId: 'job-abc',
			presetId: 'default',
			quantity: 1,
			aspectRatio: '1:1',
		}),
		...overrides,
	} as UsageLogRow;
}

function testHappySuccessRow() {
	const row = mapMediaLogRow(baseRow());
	assert.strictEqual(row.kind, 'image');
	assert.strictEqual(row.outcome, 'success');
	assert.strictEqual(row.route, 'fal');
	assert.strictEqual(row.provider, 'fal');
	assert.strictEqual(row.model, 'fal-ai/nano-banana');
	assert.strictEqual(row.presetId, 'default');
	assert.strictEqual(row.jobId, 'job-abc');
	assert.strictEqual(row.billingUnit, 'image');
	assert.strictEqual(row.estimatedCostUsd, 0.039);
	assert.strictEqual(row.costConfidence, 'estimated');
	assert.strictEqual(row.durationSeconds, 12.5);
	assert.strictEqual(row.quantity, 1);
	console.log('PASS: usage-media-rows success mapping');
}

function testFailureRowSurfacesErrorMessage() {
	const row = mapMediaLogRow(baseRow({
		id: 2,
		action: 'video.failure',
		provider: 'fal',
		model: 'fal-ai/veo3.1',
		cost_usd: 0,
		duration_ms: 4200,
		metadata_json: JSON.stringify({
			costConfidence: 'estimated',
			billingUnit: 'video',
			route: 'fal',
			jobId: 'job-vid-1',
			errorMessage: 'HTTP 502: upstream unavailable',
		}),
	}));
	assert.strictEqual(row.kind, 'video');
	assert.strictEqual(row.outcome, 'failure');
	assert.strictEqual(row.errorMessage, 'HTTP 502: upstream unavailable');
	assert.strictEqual(row.costConfidence, 'estimated');
	console.log('PASS: usage-media-rows failure surfaces error');
}

function testMissingMetadataStillRenders() {
	// The service should always attach metadata, but a corrupt row must not
	// break the dashboard. Confidence must default to `estimated` (invariant).
	const row = mapMediaLogRow(baseRow({
		id: 3,
		metadata_json: null,
		action: 'music.unknown',
	}));
	assert.strictEqual(row.kind, 'music');
	assert.strictEqual(row.outcome, 'unknown');
	assert.strictEqual(row.route, 'unknown');
	assert.strictEqual(row.costConfidence, 'estimated');
	assert.strictEqual(row.jobId, undefined);
	console.log('PASS: usage-media-rows survives missing metadata');
}

function testEstimatedInvariantHoldsWhenPresetOmits() {
	// When the preset marks a real bill (`provider-reported`), we honour it.
	const row = mapMediaLogRow(baseRow({
		id: 4,
		metadata_json: JSON.stringify({
			costConfidence: 'provider-reported',
			billingUnit: 'image',
			route: 'native',
			jobId: 'job-native',
		}),
	}));
	assert.strictEqual(row.costConfidence, 'provider-reported');
	console.log('PASS: usage-media-rows honours provider-reported confidence');
}

testHappySuccessRow();
testFailureRowSurfacesErrorMessage();
testMissingMetadataStillRenders();
testEstimatedInvariantHoldsWhenPresetOmits();
