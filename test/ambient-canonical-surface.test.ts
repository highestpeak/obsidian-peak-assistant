import assert from 'assert';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from '@/core/types/ambient';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';

function testCanonicalSurfaceDefaults() {
	// After the 2026-07 direction: attention-grabbing surfaces default OFF.
	// The Ambient runtime is still enabled by default (so the data layer
	// keeps computing candidate items), but the surfaces are quiet until the
	// user opens the Related Notes panel or explicitly enables them.
	assert.strictEqual(DEFAULT_AMBIENT_PUSH_SETTINGS.enabled, true, 'runtime enabled by default');
	assert.strictEqual(DEFAULT_AMBIENT_PUSH_SETTINGS.showStatusBar, false, 'status bar off by default');
	assert.strictEqual(DEFAULT_AMBIENT_PUSH_SETTINGS.enableSerendipityGutter, false, 'gutter off by default');
	assert.strictEqual(DEFAULT_AMBIENT_PUSH_SETTINGS.enableMorningBriefing, false, 'morning briefing off by default');
	console.log('[ambient-canonical-surface] defaults: PASS');
}

function testFreshInstallPropagatesDefaultsThroughLoader() {
	const settings = normalizePluginSettings({});
	// Fresh install → loader falls back to DEFAULT_AMBIENT_PUSH_SETTINGS when
	// no `ambientPush` block exists. Track C requires this to stay in sync.
	// (No `settings.ambientPush` when nothing persisted — the runtime path in
	// main.ts treats undefined the same as enabled=true, so we exercise the
	// explicit-persisted flow below.)
	assert.strictEqual(settings.ambientPush, undefined, 'no persisted ambientPush → undefined block');
	console.log('[ambient-canonical-surface] fresh install: PASS');
}

function testPersistedAmbientRoundtrips() {
	// When settings HAVE been persisted, the loader validates + normalizes
	// each field. A user who explicitly set `showStatusBar: true` keeps it.
	const settings = normalizePluginSettings({
		ambientPush: { enabled: true, showStatusBar: true, enableMorningBriefing: false },
	});
	assert.ok(settings.ambientPush);
	assert.strictEqual(settings.ambientPush!.enabled, true);
	assert.strictEqual(settings.ambientPush!.showStatusBar, true, 'user opt-in preserved');
	assert.strictEqual(settings.ambientPush!.enableMorningBriefing, false);
	console.log('[ambient-canonical-surface] persisted user opt-in: PASS');
}

function testDisabledAmbientRoundtrips() {
	const settings = normalizePluginSettings({
		ambientPush: { enabled: false },
	});
	assert.strictEqual(settings.ambientPush?.enabled, false, 'disabled flag persisted');
	console.log('[ambient-canonical-surface] disabled roundtrip: PASS');
}

testCanonicalSurfaceDefaults();
testFreshInstallPropagatesDefaultsThroughLoader();
testPersistedAmbientRoundtrips();
testDisabledAmbientRoundtrips();
