import assert from 'assert';
import { readFileSync } from 'fs';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';
import type { CommandCenterBoardConfig } from '@/core/command-center';

const board = JSON.parse(readFileSync('templates/config/command-center-defaults.json', 'utf8')) as CommandCenterBoardConfig;
board.home.openOnStartup = true;
board.groups[0]!.label = 'My desk';
board.groups[0]!.actions[0]!.icon = { kind: 'emoji', value: '🏠' };

const normalized = normalizePluginSettings({ commandCenter: board });
assert.deepStrictEqual(normalized.commandCenter, board, 'plugin settings loader must retain the versioned user board for runtime normalization');
assert.strictEqual(normalizePluginSettings({}).commandCenter, undefined, 'first-run board must be initialized from TemplateManager, not duplicated in code defaults');

console.log('command-center-settings-roundtrip: passed');
