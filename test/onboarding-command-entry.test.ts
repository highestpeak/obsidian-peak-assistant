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

assert.match(modalSource, /width: '920px'/, 'Setup should use the compact assistant width');
assert.doesNotMatch(wizardSource, /step\.summary/, 'progress navigation must not render tiny repeated summaries');
assert.doesNotMatch(wizardSource, /<i data-complete=/, 'progress navigation must not depend on decorative connector lines');

console.log('onboarding-command-entry: all assertions passed');
