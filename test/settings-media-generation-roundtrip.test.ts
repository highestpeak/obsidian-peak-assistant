/**
 * Task E1 — round-trip test for the Media Generation settings surface.
 *
 * Locks:
 *   1. `normalizePluginSettings` PRESERVES `ai.falApiKey`,
 *      `ai.mediaAttachmentFolder`, and `ai.mediaDefaults` (they were
 *      silently dropped before E1 because the AI normalizer only
 *      whitelisted a subset of fields).
 *   2. Missing `ai.mediaDefaults` on old data.json → `undefined` (no
 *      crash; behaviour equivalent to E1-not-yet-configured).
 *   3. Invalid overlay values are dropped, not persisted verbatim.
 *   4. `applyMediaSettingsOverlay` sees the same overlay object that
 *      normalize returned (end-to-end: saved JSON → normalize → overlay
 *      → resolved MediaGenerationConfig).
 */

import assert from 'assert';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';
import {
	DEFAULT_MEDIA_GENERATION_CONFIG,
} from '@/service/media/mediaGenerationConfig';
import { applyMediaSettingsOverlay } from '@/service/media/mediaSettingsOverlay';

function testFalKeyAndFolderPreserved() {
	const saved = {
		ai: {
			falApiKey: 'k-live-abc',
			mediaAttachmentFolder: 'Assets/media',
		},
	};
	const norm = normalizePluginSettings(saved);
	assert.strictEqual(norm.ai.falApiKey, 'k-live-abc', 'falApiKey preserved');
	assert.strictEqual(norm.ai.mediaAttachmentFolder, 'Assets/media', 'mediaAttachmentFolder preserved');
	console.log('  ✓ round-trip preserves falApiKey + mediaAttachmentFolder (pre-E1 they were dropped)');
}

function testMissingMediaDefaultsUndefined() {
	const norm = normalizePluginSettings({});
	assert.strictEqual(norm.ai.mediaDefaults, undefined, 'no crash, undefined default');
	console.log('  ✓ missing mediaDefaults → undefined (old data.json compatibility)');
}

function testMediaDefaultsRoundtripAndAppliesInOverlay() {
	const saved = {
		ai: {
			mediaDefaults: {
				defaultRoute: 'fal',
				nativeProfileId: 'op1',
				defaultPresetIds: { image: 'native-dalle3' },
				presetOverrides: {
					video: { durationSeconds: 15, maxDurationSeconds: 25, model: 'fal-ai/custom/video' },
					image: { quantity: 3 },
				},
				lastValidatedAt: 1700000000000,
			},
		},
	};
	const norm = normalizePluginSettings(saved);
	assert.deepStrictEqual(norm.ai.mediaDefaults?.defaultRoute, 'fal');
	assert.strictEqual(norm.ai.mediaDefaults?.nativeProfileId, 'op1');
	assert.deepStrictEqual(norm.ai.mediaDefaults?.defaultPresetIds, { image: 'native-dalle3' });
	assert.deepStrictEqual(norm.ai.mediaDefaults?.presetOverrides?.video, {
		durationSeconds: 15,
		maxDurationSeconds: 25,
		model: 'fal-ai/custom/video',
	});
	assert.strictEqual(norm.ai.mediaDefaults?.presetOverrides?.image?.quantity, 3);
	assert.strictEqual(norm.ai.mediaDefaults?.lastValidatedAt, 1700000000000);

	const merged = applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, norm.ai.mediaDefaults);
	assert.strictEqual(merged.defaultRoute, 'fal', 'overlay reaches the config');
	assert.strictEqual(merged.presets.image.default.model, 'dall-e-3', 'default preset swap');
	assert.strictEqual(merged.presets.image.default.quantity, 3, 'quantity override merged');
	assert.strictEqual(merged.presets.video.default.durationSeconds, 15, 'duration override merged');
	console.log('  ✓ mediaDefaults survives round-trip and reaches applyMediaSettingsOverlay');
}

function testInvalidOverlayValuesDropped() {
	const saved = {
		ai: {
			mediaDefaults: {
				defaultRoute: 'bogus',            // unknown → drop
				nativeProfileId: '   ',           // whitespace → drop
				defaultPresetIds: { image: '', video: 'ok', banana: 'xxx' },
				presetOverrides: {
					video: { durationSeconds: -1, quantity: 0, model: '' },
					weird: { model: 'ignored' },
				},
				lastValidatedAt: 'not-a-number',
			},
		},
	};
	const norm = normalizePluginSettings(saved);
	// bogus route dropped → overlay has no defaultRoute
	assert.strictEqual(norm.ai.mediaDefaults?.defaultRoute, undefined, 'unknown route dropped');
	assert.strictEqual(norm.ai.mediaDefaults?.nativeProfileId, undefined, 'whitespace profile dropped');
	assert.deepStrictEqual(norm.ai.mediaDefaults?.defaultPresetIds, { video: 'ok' }, 'empty + unknown kind dropped');
	// invalid preset field values dropped; empty entry not persisted
	assert.strictEqual(norm.ai.mediaDefaults?.presetOverrides?.video?.durationSeconds, undefined);
	assert.strictEqual(norm.ai.mediaDefaults?.presetOverrides?.video?.quantity, undefined);
	assert.strictEqual(norm.ai.mediaDefaults?.presetOverrides?.video?.model, undefined);
	// video entry has no valid fields → dropped entirely
	assert.strictEqual(norm.ai.mediaDefaults?.presetOverrides?.video, undefined, 'empty entry dropped');
	assert.strictEqual((norm.ai.mediaDefaults?.presetOverrides as Record<string, unknown> | undefined)?.weird, undefined, 'unknown kind dropped');
	assert.strictEqual(norm.ai.mediaDefaults?.lastValidatedAt, undefined, 'non-number lastValidatedAt dropped');
	console.log('  ✓ hand-edited invalid overlay values are dropped, not persisted');
}

async function main() {
	testFalKeyAndFolderPreserved();
	testMissingMediaDefaultsUndefined();
	testMediaDefaultsRoundtripAndAppliesInOverlay();
	testInvalidOverlayValuesDropped();
	console.log('settings-media-generation-roundtrip: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
