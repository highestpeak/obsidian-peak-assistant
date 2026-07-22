// mediaGenerationConfig: fallback + template override + fal endpoint id
// validation. Uses a fake TemplateManager provider to serve alternate
// media-generation.json contents.

import assert from 'assert';
import { TemplateManager } from '@/core/template/TemplateManager';
import {
	DEFAULT_MEDIA_GENERATION_CONFIG,
	loadMediaGenerationConfig,
	resolvePreset,
	isValidFalEndpointId,
} from '@/service/media/mediaGenerationConfig';

async function testFallbackWhenNoTemplateManager() {
	TemplateManager.setInstance(null);
	const cfg = await loadMediaGenerationConfig();
	assert.strictEqual(cfg.defaultRoute, DEFAULT_MEDIA_GENERATION_CONFIG.defaultRoute);
	assert.strictEqual(cfg.pollDeadlineMs, DEFAULT_MEDIA_GENERATION_CONFIG.pollDeadlineMs);
	assert.ok(cfg.presets.tts.default);
	assert.ok(cfg.presets.image.default);
	assert.ok(cfg.presets.video.default);
	assert.ok(cfg.presets.music.default);
	console.log('  ✓ fallback to compiled defaults when no TemplateManager');
}

async function testTemplateOverrideMergesShallow() {
	const provider = {
		async load(_p: string): Promise<string> {
			return JSON.stringify({
				defaultRoute: 'fal',
				pollDeadlineMs: 60000,
				presets: {
					image: {
						hd: {
							provider: 'fal',
							model: 'fal-ai/flux/dev',
							aspectRatio: '16:9',
							quantity: 1,
							estimatedCostUsd: 0.03,
							billingUnit: 'image',
							costConfidence: 'estimated',
						},
					},
				},
			});
		},
	};
	const tm = new TemplateManager(provider);
	TemplateManager.setInstance(tm);
	try {
		const cfg = await loadMediaGenerationConfig();
		assert.strictEqual(cfg.defaultRoute, 'fal', 'defaultRoute overridden');
		assert.strictEqual(cfg.pollDeadlineMs, 60000, 'pollDeadlineMs overridden');
		// Override merges at the kind level: `hd` present, `default` still present too.
		assert.ok(cfg.presets.image.hd, 'new preset added');
		assert.ok(cfg.presets.image.default, 'existing default preserved by shallow merge');
		// Video presets untouched.
		assert.deepStrictEqual(
			cfg.presets.video,
			DEFAULT_MEDIA_GENERATION_CONFIG.presets.video,
			'video preset unchanged',
		);
	} finally {
		TemplateManager.setInstance(null);
	}
	console.log('  ✓ template override merges over defaults per kind');
}

async function testResolvePresetFallsBackToDefault() {
	TemplateManager.setInstance(null);
	const cfg = await loadMediaGenerationConfig();
	const explicit = resolvePreset(cfg, 'image', 'cover-hd');
	assert.ok(explicit);
	const fallback = resolvePreset(cfg, 'image', 'nonexistent-preset');
	assert.ok(fallback, 'unknown preset must fall back to default');
	assert.strictEqual(fallback!.model, cfg.presets.image.default.model);
	const missingKind = resolvePreset(
		{ ...cfg, presets: { ...cfg.presets, tts: {} as any } },
		'tts',
		'default',
	);
	assert.strictEqual(missingKind, null, 'null when kind has no presets at all');
	console.log('  ✓ resolvePreset: explicit → default → null');
}

async function testValidFalEndpointId() {
	assert.ok(isValidFalEndpointId('fal-ai/fast-sdxl'));
	assert.ok(isValidFalEndpointId('fal-ai/kokoro/american-english'));
	assert.ok(!isValidFalEndpointId(''));
	assert.ok(!isValidFalEndpointId('  '));
	assert.ok(!isValidFalEndpointId('has spaces/here'));
	assert.ok(!isValidFalEndpointId('no-slash-here'));
	assert.ok(!isValidFalEndpointId(undefined));
	assert.ok(!isValidFalEndpointId(null));
	console.log('  ✓ fal endpoint id validation catches malformed values');
}

async function testMaxDurationSecondsFromConfigDrivesUiBound() {
	// D2 I1 fix — the Composer duration input's `max` used to be a hardcoded
	// `60`. Now it reads `maxDurationSeconds` from the resolved preset via
	// MediaGenerationService.resolveDurationLimits() (which reads config).
	// This test locks the config-side contract: (1) compiled default reflects
	// the JSON we ship (8 for video — veo3.1 duration enum tops out at "8s";
	// 30 for music — lyria2 output is fixed ~30s), and (2) a template
	// override propagates to the resolved preset so a user cap actually
	// reaches the UI.
	TemplateManager.setInstance(null);
	const compiledCfg = await loadMediaGenerationConfig();
	assert.strictEqual(
		compiledCfg.presets.video.default.maxDurationSeconds,
		8,
		'video default cap comes from media-generation.json (not hardcoded in the UI)',
	);
	assert.strictEqual(
		compiledCfg.presets.music.default.maxDurationSeconds,
		30,
		'music default cap comes from media-generation.json',
	);

	const provider = {
		async load(_p: string): Promise<string> {
			return JSON.stringify({
				presets: {
					video: {
						default: {
							provider: 'fal',
							model: 'fal-ai/veo3/text-to-video',
							durationSeconds: 8,
							maxDurationSeconds: 12,
							estimatedCostUsd: 0.75,
							billingUnit: 'video',
							costConfidence: 'estimated',
						},
					},
				},
			});
		},
	};
	const tm = new TemplateManager(provider);
	TemplateManager.setInstance(tm);
	try {
		const cfg = await loadMediaGenerationConfig();
		const preset = resolvePreset(cfg, 'video', 'default');
		assert.ok(preset);
		assert.strictEqual(
			preset!.maxDurationSeconds,
			12,
			'template override changes the cap the UI reads through resolveDurationLimits',
		);
	} finally {
		TemplateManager.setInstance(null);
	}
	console.log('  ✓ maxDurationSeconds is data-driven per kind + honours template overrides');
}

async function testCorruptedTemplateFallsBackToDefaults() {
	const brokenProvider = {
		async load(_p: string): Promise<string> {
			return '{ not valid json';
		},
	};
	const tm = new TemplateManager(brokenProvider);
	TemplateManager.setInstance(tm);
	try {
		const cfg = await loadMediaGenerationConfig();
		assert.strictEqual(cfg.defaultRoute, DEFAULT_MEDIA_GENERATION_CONFIG.defaultRoute);
	} finally {
		TemplateManager.setInstance(null);
	}
	console.log('  ✓ corrupted template falls back to defaults (never rejects)');
}

async function main() {
	await testFallbackWhenNoTemplateManager();
	await testTemplateOverrideMergesShallow();
	await testResolvePresetFallsBackToDefault();
	await testValidFalEndpointId();
	await testMaxDurationSecondsFromConfigDrivesUiBound();
	await testCorruptedTemplateFallsBackToDefaults();
	console.log('media-generation-config: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
