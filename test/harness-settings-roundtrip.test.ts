/**
 * Roundtrip test for HarnessSettings serialization/deserialization (M5).
 *
 * Verifies:
 * 1. DEFAULT_HARNESS_SETTINGS has the expected field values.
 * 2. normalizePluginSettings correctly deserializes a saved HarnessSettings object.
 * 3. Partial / missing harness section falls back to defaults.
 * 4. Out-of-range numeric values are clamped.
 * 5. Unknown permission mode strings fall back to default.
 */

import assert from 'assert';
import { DEFAULT_HARNESS_SETTINGS, DEFAULT_SETTINGS } from '@/core/config/settingsTypes';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';

// ─── 1. Default values ────────────────────────────────────────────────────────

function testDefaults() {
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.allowEscalation, true, 'allowEscalation default');
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.maxEscalationsPerLoop, 3, 'maxEscalationsPerLoop default');
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.autoEscalateScoreBelow, 0.4, 'autoEscalateScoreBelow default');
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.hooksEnabled, false, 'hooksEnabled default');
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.defaultPermissionMode, 'acceptEdits', 'defaultPermissionMode default');
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.localFastConfig, null, 'localFastConfig default null');
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.localDeepConfig, null, 'localDeepConfig default null');
    assert.strictEqual(DEFAULT_HARNESS_SETTINGS.onlineConfig, null, 'onlineConfig default null');

    // DEFAULT_SETTINGS must include harness section
    assert.ok(DEFAULT_SETTINGS.harnessSettings, 'DEFAULT_SETTINGS has harnessSettings');
    assert.strictEqual(DEFAULT_SETTINGS.harnessSettings!.defaultPermissionMode, 'acceptEdits', 'DEFAULT_SETTINGS harness mode');
    console.log('[harness-settings-roundtrip] defaults: PASS');
}

// ─── 2. Full roundtrip ────────────────────────────────────────────────────────

function testFullRoundtrip() {
    const saved = {
        harnessSettings: {
            localFastConfig: { profileId: 'ollama-1', modelId: 'qwen3:14b' },
            localDeepConfig: { profileId: 'ollama-1', modelId: 'qwen3:32b' },
            onlineConfig: { profileId: 'anthropic-1', modelId: 'claude-sonnet-4-7' },
            allowEscalation: false,
            maxEscalationsPerLoop: 2,
            autoEscalateScoreBelow: 0.3,
            hooksEnabled: true,
            defaultPermissionMode: 'bypassPermissions',
        },
    };

    const result = normalizePluginSettings(saved);
    const h = result.harnessSettings!;

    assert.deepStrictEqual(h.localFastConfig, { profileId: 'ollama-1', modelId: 'qwen3:14b' }, 'localFastConfig roundtrip');
    assert.deepStrictEqual(h.localDeepConfig, { profileId: 'ollama-1', modelId: 'qwen3:32b' }, 'localDeepConfig roundtrip');
    assert.deepStrictEqual(h.onlineConfig, { profileId: 'anthropic-1', modelId: 'claude-sonnet-4-7' }, 'onlineConfig roundtrip');
    assert.strictEqual(h.allowEscalation, false, 'allowEscalation roundtrip');
    assert.strictEqual(h.maxEscalationsPerLoop, 2, 'maxEscalationsPerLoop roundtrip');
    assert.strictEqual(h.autoEscalateScoreBelow, 0.3, 'autoEscalateScoreBelow roundtrip');
    assert.strictEqual(h.hooksEnabled, true, 'hooksEnabled roundtrip');
    assert.strictEqual(h.defaultPermissionMode, 'bypassPermissions', 'defaultPermissionMode roundtrip');
    console.log('[harness-settings-roundtrip] full roundtrip: PASS');
}

// ─── 3. Missing harness section falls back to defaults ────────────────────────

function testMissingSection() {
    const result = normalizePluginSettings({});
    const h = result.harnessSettings!;

    assert.ok(h, 'harnessSettings present even without saved data');
    assert.strictEqual(h.allowEscalation, true, 'fallback allowEscalation');
    assert.strictEqual(h.maxEscalationsPerLoop, 3, 'fallback maxEscalationsPerLoop');
    assert.strictEqual(h.defaultPermissionMode, 'acceptEdits', 'fallback defaultPermissionMode');
    assert.strictEqual(h.localFastConfig, null, 'fallback localFastConfig null');
    console.log('[harness-settings-roundtrip] missing section fallback: PASS');
}

// ─── 4. Out-of-range clamping ─────────────────────────────────────────────────

function testClamping() {
    const result = normalizePluginSettings({
        harnessSettings: {
            maxEscalationsPerLoop: 99,     // should clamp to 3
            autoEscalateScoreBelow: -0.5,  // should clamp to 0
        },
    });
    const h = result.harnessSettings!;
    assert.strictEqual(h.maxEscalationsPerLoop, 3, 'maxEscalationsPerLoop clamped to 3');
    assert.strictEqual(h.autoEscalateScoreBelow, 0, 'autoEscalateScoreBelow clamped to 0');

    const result2 = normalizePluginSettings({
        harnessSettings: {
            maxEscalationsPerLoop: 0,      // should clamp to 1
            autoEscalateScoreBelow: 1.5,   // should clamp to 1
        },
    });
    const h2 = result2.harnessSettings!;
    assert.strictEqual(h2.maxEscalationsPerLoop, 1, 'maxEscalationsPerLoop clamped to 1');
    assert.strictEqual(h2.autoEscalateScoreBelow, 1, 'autoEscalateScoreBelow clamped to 1');
    console.log('[harness-settings-roundtrip] clamping: PASS');
}

// ─── 5. Unknown permission mode falls back to default ────────────────────────

function testInvalidPermissionMode() {
    const result = normalizePluginSettings({
        harnessSettings: {
            defaultPermissionMode: 'invalid-mode',
        },
    });
    assert.strictEqual(result.harnessSettings!.defaultPermissionMode, 'acceptEdits', 'invalid mode → default');
    console.log('[harness-settings-roundtrip] invalid permission mode: PASS');
}

// ─── 6. All three valid permission modes accepted ─────────────────────────────

function testValidPermissionModes() {
    for (const mode of ['read', 'acceptEdits', 'bypassPermissions'] as const) {
        const result = normalizePluginSettings({ harnessSettings: { defaultPermissionMode: mode } });
        assert.strictEqual(result.harnessSettings!.defaultPermissionMode, mode, `mode ${mode} preserved`);
    }
    console.log('[harness-settings-roundtrip] valid permission modes: PASS');
}

// ─── run all ──────────────────────────────────────────────────────────────────

(async () => {
    testDefaults();
    testFullRoundtrip();
    testMissingSection();
    testClamping();
    testInvalidPermissionMode();
    testValidPermissionModes();
    console.log('[harness-settings-roundtrip] all tests passed');
})().catch((err) => {
    console.error('[harness-settings-roundtrip] FAIL:', err);
    process.exit(1);
});
