import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';
import {
	CODE_BLOCK_THEME_IDS,
	DEFAULT_CODE_BLOCK_THEME,
	normalizeCodeBlockTheme,
} from '@/core/config/settingsTypes';

function testThemeNormalization(): void {
	assert.strictEqual(normalizeCodeBlockTheme(undefined), DEFAULT_CODE_BLOCK_THEME);
	assert.strictEqual(normalizeCodeBlockTheme('unknown-theme'), DEFAULT_CODE_BLOCK_THEME);
	for (const id of CODE_BLOCK_THEME_IDS) {
		assert.strictEqual(normalizeCodeBlockTheme(id), id);
		assert.strictEqual(normalizePluginSettings({ codeBlockTheme: id }).codeBlockTheme, id);
	}
}

function testThemeSettingIsUserFacingAndLive(): void {
	const root = process.cwd();
	const config = JSON.parse(fs.readFileSync(path.join(root, 'templates/config/settings.json'), 'utf8'));
	const streamdown = fs.readFileSync(
		path.join(root, 'src/ui/component/mine/StreamdownIsolated.tsx'),
		'utf8',
	);

	assert.strictEqual(config.advanced.appearance.codeTheme.options.githubDark, 'GitHub Dark (recommended)');
	assert(streamdown.includes('ViewEventType.SETTINGS_UPDATED'));
	assert(streamdown.includes('event.settings.codeBlockTheme'));
	assert(!streamdown.includes('useServiceContext().plugin'));
}

testThemeNormalization();
testThemeSettingIsUserFacingAndLive();
console.log('code-block-theme-settings: all guards passed');
