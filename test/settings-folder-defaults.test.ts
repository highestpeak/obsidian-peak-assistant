import assert from 'assert';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';
import { DEFAULT_SETTINGS } from '@/core/config/settingsTypes';
import {
	getAIAnalysisFolder,
	getAICustomPromptsFolder,
	getAIDataStoreFolder,
	getAIInboxFolder,
	getAISkillsFolder,
} from '@/core/config/folderPaths';

function testDefaultFoldersLiveUnderChatRoot() {
	const result = normalizePluginSettings({});
	const root = result.ai.rootFolder;

	assert.strictEqual(root, 'ChatFolder', 'default root folder');
	assert.strictEqual(result.dataStorageFolder, getAIDataStoreFolder(root), 'default DataStore folder');
	assert.strictEqual(result.skillsFolder, getAISkillsFolder(root), 'default Skills folder');
	assert.strictEqual(result.inboxFolder, getAIInboxFolder(root), 'default Inbox folder');
	assert.strictEqual(result.customPromptsFolder, getAICustomPromptsFolder(root), 'default custom prompts folder');
	assert.strictEqual(result.search.aiAnalysisAutoSaveFolder, getAIAnalysisFolder(root), 'default AI Analysis folder');
	assert.ok(result.search.ignorePatterns.includes('ChatFolder/DataStore/'), 'default DataStore ignored by Search');

	assert.strictEqual(DEFAULT_SETTINGS.dataStorageFolder, 'ChatFolder/DataStore', 'DEFAULT_SETTINGS DataStore');
	assert.strictEqual(DEFAULT_SETTINGS.skillsFolder, 'ChatFolder/Skills', 'DEFAULT_SETTINGS Skills');
	assert.strictEqual(DEFAULT_SETTINGS.inboxFolder, 'ChatFolder/Inbox', 'DEFAULT_SETTINGS Inbox');
	assert.strictEqual(DEFAULT_SETTINGS.customPromptsFolder, 'ChatFolder/Prompts/Custom', 'DEFAULT_SETTINGS custom prompts');

	console.log('[settings-folder-defaults] default folders: PASS');
}

function testCustomRootDerivesUnsetFolders() {
	const result = normalizePluginSettings({
		ai: {
			rootFolder: 'PeakAI',
		},
	});

	assert.strictEqual(result.dataStorageFolder, 'PeakAI/DataStore', 'DataStore derives from custom root');
	assert.strictEqual(result.skillsFolder, 'PeakAI/Skills', 'Skills derives from custom root');
	assert.strictEqual(result.inboxFolder, 'PeakAI/Inbox', 'Inbox derives from custom root');
	assert.strictEqual(result.customPromptsFolder, 'PeakAI/Prompts/Custom', 'Custom prompts derives from custom root');
	assert.strictEqual(result.search.aiAnalysisAutoSaveFolder, 'PeakAI/AI-Analysis', 'AI Analysis derives from custom root');
	assert.ok(result.search.ignorePatterns.includes('PeakAI/DataStore/'), 'custom-root DataStore ignored by Search');

	console.log('[settings-folder-defaults] custom root derivation: PASS');
}

function testExplicitFolderOverridesArePreserved() {
	const result = normalizePluginSettings({
		ai: {
			rootFolder: 'PeakAI',
		},
		dataStorageFolder: 'External/Data',
		skillsFolder: 'External/Skills',
		inboxFolder: 'External/Inbox',
		customPromptsFolder: 'External/Prompts',
		search: {
			aiAnalysisAutoSaveFolder: 'External/Analysis',
			ignorePatterns: ['Notes/private/'],
		},
	});

	assert.strictEqual(result.dataStorageFolder, 'External/Data', 'explicit DataStore preserved');
	assert.strictEqual(result.skillsFolder, 'External/Skills', 'explicit Skills preserved');
	assert.strictEqual(result.inboxFolder, 'External/Inbox', 'explicit Inbox preserved');
	assert.strictEqual(result.customPromptsFolder, 'External/Prompts', 'explicit custom prompts preserved');
	assert.strictEqual(result.search.aiAnalysisAutoSaveFolder, 'External/Analysis', 'explicit AI Analysis preserved');
	assert.ok(result.search.ignorePatterns.includes('Notes/private/'), 'explicit ignore pattern preserved');
	assert.ok(result.search.ignorePatterns.includes('External/Data/'), 'explicit DataStore ignored by Search');

	console.log('[settings-folder-defaults] explicit overrides: PASS');
}

function testLegacyPersistedFoldersNormalizeToNewDefaults() {
	const result = normalizePluginSettings({
		skillsFolder: '_skills',
		inboxFolder: '_inbox',
		customPromptsFolder: '_prompts',
		dataStorageFolder: 'A-control/PeakAssistant/DataStore',
	});

	const root = result.ai.rootFolder;
	assert.strictEqual(result.skillsFolder, getAISkillsFolder(root), 'legacy _skills normalized');
	assert.strictEqual(result.inboxFolder, getAIInboxFolder(root), 'legacy _inbox normalized');
	assert.strictEqual(result.customPromptsFolder, getAICustomPromptsFolder(root), 'legacy _prompts normalized');
	assert.strictEqual(result.dataStorageFolder, getAIDataStoreFolder(root), 'legacy A-control/PeakAssistant/DataStore normalized');
	assert.ok(
		result.search.ignorePatterns.includes(`${getAIDataStoreFolder(root)}/`),
		'normalized DataStore auto-included in ignorePatterns',
	);

	console.log('[settings-folder-defaults] legacy default normalization: PASS');
}

function testDefaultIgnorePatternsDoNotContainLegacyAControl() {
	const result = normalizePluginSettings({});
	assert.ok(
		!result.search.ignorePatterns.some((p) => p.startsWith('A-control')),
		'A-control/ no longer auto-included in default ignorePatterns',
	);

	console.log('[settings-folder-defaults] default ignore patterns: PASS');
}

function testExplicitLegacyStyledButNonLegacyOverridePreserved() {
	// e.g. user set skillsFolder to an unrelated folder that starts with underscore.
	const result = normalizePluginSettings({
		skillsFolder: '_my-custom-skills',
		inboxFolder: 'Notes/inbox',
	});
	assert.strictEqual(result.skillsFolder, '_my-custom-skills', 'non-legacy underscore folder preserved');
	assert.strictEqual(result.inboxFolder, 'Notes/inbox', 'explicit inbox override preserved');
	console.log('[settings-folder-defaults] non-legacy user overrides preserved: PASS');
}

testDefaultFoldersLiveUnderChatRoot();
testCustomRootDerivesUnsetFolders();
testExplicitFolderOverridesArePreserved();
testLegacyPersistedFoldersNormalizeToNewDefaults();
testDefaultIgnorePatternsDoNotContainLegacyAControl();
testExplicitLegacyStyledButNonLegacyOverridePreserved();
