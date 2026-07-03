import assert from 'assert';
import {
	applyFolderDefaults,
	ensureBudgetDefaults,
} from '@/ui/view/modals/harness-onboarding/applyRecommendation';
import { DEFAULT_BUDGET_SETTINGS } from '@/core/config/settingsTypes';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';

function baseSettings(overrides: Partial<MyPluginSettings> = {}): MyPluginSettings {
	// Start from a normalized settings object then apply overrides on top.
	const settings = normalizePluginSettings({});
	return { ...settings, ...overrides };
}

function testEnsureBudgetDefaultsBackfillsMissingObject() {
	const budget = ensureBudgetDefaults(undefined);
	assert.strictEqual(budget.monthlyUsd, DEFAULT_BUDGET_SETTINGS.monthlyUsd, 'monthlyUsd defaulted');
	assert.strictEqual(budget.resetDayOfMonth, DEFAULT_BUDGET_SETTINGS.resetDayOfMonth, 'resetDay defaulted');
	assert.strictEqual(budget.alertRules.length, DEFAULT_BUDGET_SETTINGS.alertRules.length, 'alertRules populated');
	console.log('[onboarding-apply] budget defaults from undefined: PASS');
}

function testEnsureBudgetDefaultsPreservesUserOverrides() {
	const budget = ensureBudgetDefaults({
		monthlyUsd: 42,
		resetDayOfMonth: 15,
		alertRules: [{ kind: 'budget_threshold', enabled: true, threshold: 0.9 }],
	});
	assert.strictEqual(budget.monthlyUsd, 42, 'user monthlyUsd preserved');
	assert.strictEqual(budget.resetDayOfMonth, 15, 'user resetDay preserved');
	assert.strictEqual(budget.alertRules.length, 1, 'user alert rules preserved');
	assert.strictEqual(budget.alertRules[0].threshold, 0.9);
	console.log('[onboarding-apply] budget preserves user overrides: PASS');
}

function testEnsureBudgetDefaultsRejectsBogusValues() {
	// Bad case: NaN monthlyUsd, out-of-range resetDay, empty alertRules → defaults.
	const budget = ensureBudgetDefaults({
		monthlyUsd: Number.NaN,
		resetDayOfMonth: 45,
		alertRules: [],
	});
	assert.strictEqual(budget.monthlyUsd, DEFAULT_BUDGET_SETTINGS.monthlyUsd, 'NaN → default');
	assert.strictEqual(budget.resetDayOfMonth, DEFAULT_BUDGET_SETTINGS.resetDayOfMonth, 'out-of-range → default');
	assert.ok(budget.alertRules.length > 0, 'empty rules → repopulated');
	console.log('[onboarding-apply] budget rejects bogus values: PASS');
}

function testApplyFolderDefaultsBackfillsFromRootFolder() {
	const settings = baseSettings();
	// Simulate a fresh apply after user cleared derived folders.
	settings.skillsFolder = '';
	settings.inboxFolder = '';
	settings.customPromptsFolder = '';
	settings.dataStorageFolder = '';
	applyFolderDefaults(settings);

	assert.strictEqual(settings.skillsFolder, 'ChatFolder/Skills', 'skills derived');
	assert.strictEqual(settings.inboxFolder, 'ChatFolder/Inbox', 'inbox derived');
	assert.strictEqual(settings.customPromptsFolder, 'ChatFolder/Prompts/Custom', 'custom prompts derived');
	assert.strictEqual(settings.dataStorageFolder, 'ChatFolder/DataStore', 'DataStore derived');
	console.log('[onboarding-apply] folder defaults backfill: PASS');
}

function testApplyFolderDefaultsNormalizesLegacyValues() {
	const settings = baseSettings();
	settings.skillsFolder = '_skills';
	settings.inboxFolder = '_inbox';
	settings.customPromptsFolder = '_prompts';
	settings.dataStorageFolder = 'A-control/PeakAssistant/DataStore';
	applyFolderDefaults(settings);

	assert.strictEqual(settings.skillsFolder, 'ChatFolder/Skills', 'legacy _skills normalized');
	assert.strictEqual(settings.inboxFolder, 'ChatFolder/Inbox', 'legacy _inbox normalized');
	assert.strictEqual(settings.customPromptsFolder, 'ChatFolder/Prompts/Custom', 'legacy _prompts normalized');
	assert.strictEqual(settings.dataStorageFolder, 'ChatFolder/DataStore', 'legacy DataStore normalized');
	console.log('[onboarding-apply] folder legacy normalization: PASS');
}

function testApplyFolderDefaultsPreservesExplicitOverrides() {
	const settings = baseSettings();
	settings.skillsFolder = 'External/Skills';
	settings.inboxFolder = 'External/Inbox';
	settings.customPromptsFolder = 'External/Prompts';
	settings.dataStorageFolder = 'External/Data';
	applyFolderDefaults(settings);

	assert.strictEqual(settings.skillsFolder, 'External/Skills', 'skills override kept');
	assert.strictEqual(settings.inboxFolder, 'External/Inbox', 'inbox override kept');
	assert.strictEqual(settings.customPromptsFolder, 'External/Prompts', 'custom prompts override kept');
	assert.strictEqual(settings.dataStorageFolder, 'External/Data', 'data store override kept');
	console.log('[onboarding-apply] folder explicit overrides preserved: PASS');
}

function testApplyFolderDefaultsSetsRootFolderWhenBlank() {
	const settings = baseSettings();
	settings.ai.rootFolder = '';
	applyFolderDefaults(settings);
	assert.strictEqual(settings.ai.rootFolder, 'ChatFolder', 'empty root defaults');
	console.log('[onboarding-apply] blank root defaulted: PASS');
}

testEnsureBudgetDefaultsBackfillsMissingObject();
testEnsureBudgetDefaultsPreservesUserOverrides();
testEnsureBudgetDefaultsRejectsBogusValues();
testApplyFolderDefaultsBackfillsFromRootFolder();
testApplyFolderDefaultsNormalizesLegacyValues();
testApplyFolderDefaultsPreservesExplicitOverrides();
testApplyFolderDefaultsSetsRootFolderWhenBlank();
