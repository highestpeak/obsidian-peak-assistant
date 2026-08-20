import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync('main.ts', 'utf8');
const commandSource = readFileSync('src/app/commands/PeakCommandActions.ts', 'utf8');
const registerSource = readFileSync('src/app/commands/Register.ts', 'utf8');
const modalSource = readFileSync('src/app/ui-host/modals/HarnessOnboardingModal.tsx', 'utf8');
const wizardSource = readFileSync('src/ui/view/onboarding/HarnessOnboardingWizard.tsx', 'utf8');

assert.doesNotMatch(
	mainSource,
	/HarnessOnboardingModal/,
	'plugin startup must not import or open Setup; Setup is user-invoked only',
);

assert.match(
	commandSource,
	/export function openHarnessSetupWizard\(\): void \{[\s\S]*?HarnessOnboardingModal\.openSingleton/,
	'the explicit command action must remain the owner of the Setup modal',
);

assert.match(
	registerSource,
	/id: 'peak-harness-setup-wizard',[\s\S]*?callback: openHarnessSetupWizard/,
	'the Setup Wizard command must remain registered',
);

assert.match(modalSource, /width: '1080px'/, 'Setup should use the readable five-step assistant width');
assert.doesNotMatch(wizardSource, /step\.summary/, 'progress navigation must not render tiny repeated summaries');
assert.doesNotMatch(wizardSource, /<i data-complete=/, 'progress navigation must not depend on decorative connector lines');
assert.doesNotMatch(wizardSource, /Finish setup/, 'completion must remain tied to launching a real first task');
assert.match(
	wizardSource,
	/if \(currentStep === 'core-models'\) \{[\s\S]*?dispatch\(\{ type: 'jump', step: nextStep \}\);[\s\S]*?void saveCoreModels/,
	'core model persistence must not block entry into the Better SQLite preparation screen',
);
assert.match(wizardSource, /portalContainer=\{modelPickerPortal\}/, 'model choices inside Setup must stay inside the active modal');
assert.match(
	readFileSync('src/ui/view/settings/components/UnifiedModelPicker.tsx', 'utf8'),
	/container=\{portalContainer\}/,
	'UnifiedModelPicker must accept a modal-scoped portal container so its menu does not dismiss immediately',
);

console.log('onboarding-command-entry: all assertions passed');
