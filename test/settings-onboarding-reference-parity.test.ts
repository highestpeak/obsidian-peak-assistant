import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, reduce } from '@/ui/view/onboarding/OnboardingStateMachine';

const settings = readFileSync('src/ui/view/settings/tabs/AIModelsTab.tsx', 'utf8');
const knowledge = readFileSync('src/ui/view/settings/tabs/KnowledgeSearchTab.tsx', 'utf8');
const onboarding = readFileSync('src/ui/view/onboarding/HarnessOnboardingWizard.tsx', 'utf8');
const css = readFileSync('src/styles/peak-components.css', 'utf8');

assert.ok(settings.indexOf('<ConnectionOverview') < settings.indexOf('<CatalogManager'));
assert.ok(settings.indexOf('<CatalogManager') < settings.indexOf('<AutomaticPolicy'));
assert.ok(settings.indexOf('<AutomaticPolicy') < settings.indexOf('Choose models by feature'));
assert.match(settings, /PRIMARY_CONNECTIONS[\s\S]*?'openai'[\s\S]*?'anthropic'[\s\S]*?'openrouter'[\s\S]*?'ollama'[\s\S]*?'codex'[\s\S]*?'claude-code'/);
assert.match(settings, /action\.localOnly \? <span className="pk-feature-model__local">Local action · No AI model/);

assert.match(knowledge, /settingsActions\.knowledgeIndex\.getReadiness\(\)/);
assert.match(knowledge, /'Not indexed yet'/, 'missing data keeps an explicit readiness state');
assert.match(knowledge, /readiness\.indexedDocuments\.toLocaleString\(\)/);

assert.match(onboarding, /step\.summary/);
assert.match(onboarding, /pk-onboarding__step-meta/);
assert.match(onboarding, /totalDocuments === null \? 'Not available'/);
assert.match(onboarding, /disabled=\{!mediaRouteAvailable\}/, 'unavailable media stays visible instead of returning null');
assert.doesNotMatch(onboarding, /mediaRouteAvailable \? <LaunchCard[^\n]+Create media[^\n]+: null/);

let state = initialState();
state = reduce(state, {
	type: 'index-status',
	status: 'running',
	message: 'working',
	metrics: { indexedDocuments: 12, totalDocuments: null, failures: 2, percent: null },
});
assert.deepEqual(state.indexMetrics, { indexedDocuments: 12, totalDocuments: null, failures: 2, percent: null });

assert.match(css, /\.pk-settings-page \{ width: min\(100% - 64px, 820px\); padding: 32px 0 60px; \}/);
assert.match(css, /\.pk-onboarding-step-content \{ width: min\(100%, 820px\); gap: 5px; \}/);
assert.match(css, /button\.pk-reference-modal__close[\s\S]*?width: 32px !important;[\s\S]*?height: 32px !important;/);

console.log('settings-onboarding-reference-parity: all assertions passed');
