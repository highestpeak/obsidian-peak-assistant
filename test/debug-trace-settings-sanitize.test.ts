import assert from 'assert';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';
import { DEFAULT_DEBUG_TRACE_SETTINGS } from '@/core/config/settingsTypes';

console.log('debug-trace-settings-sanitize: default when missing');
{
	const s = normalizePluginSettings({} as unknown);
	assert.deepStrictEqual(s.debugTrace, DEFAULT_DEBUG_TRACE_SETTINGS);
}

console.log('debug-trace-settings-sanitize: default on invalid input');
{
	const s = normalizePluginSettings({ debugTrace: 'garbage' } as unknown);
	assert.deepStrictEqual(s.debugTrace, DEFAULT_DEBUG_TRACE_SETTINGS);
}

console.log('debug-trace-settings-sanitize: valid values pass through');
{
	const s = normalizePluginSettings({
		debugTrace: {
			mode: 'raw',
			retention: 100,
			copyFormat: 'both',
			includeRawContent: true,
		},
	} as unknown);
	assert.deepStrictEqual(s.debugTrace, {
		mode: 'raw',
		retention: 100,
		copyFormat: 'both',
		includeRawContent: true,
	});
}

console.log('debug-trace-settings-sanitize: invalid enum values fall back');
{
	const s = normalizePluginSettings({
		debugTrace: {
			mode: 'silly',
			retention: 999,
			copyFormat: 'xml',
			includeRawContent: 'yes',
		},
	} as unknown);
	assert.deepStrictEqual(s.debugTrace, DEFAULT_DEBUG_TRACE_SETTINGS);
}

console.log('debug-trace-settings-sanitize: session retention is accepted');
{
	const s = normalizePluginSettings({
		debugTrace: { retention: 'session' },
	} as unknown);
	assert.strictEqual(s.debugTrace?.retention, 'session');
	// Other fields fall to defaults
	assert.strictEqual(s.debugTrace?.mode, DEFAULT_DEBUG_TRACE_SETTINGS.mode);
	assert.strictEqual(s.debugTrace?.copyFormat, DEFAULT_DEBUG_TRACE_SETTINGS.copyFormat);
}

console.log('debug-trace-settings-sanitize: OK');
