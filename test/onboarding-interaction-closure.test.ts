import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wizard = readFileSync('src/ui/view/onboarding/HarnessOnboardingWizard.tsx', 'utf8');

assert.match(
	wizard,
	/if \(currentStep === 'prepare-vault'\) \{[\s\S]*?dispatch\(\{ type: 'jump', step: nextStep \}\);[\s\S]*?void settingsActions\.knowledgeIndex\.prepareFastIndex\(\)\.then/,
	'Prepare vault must enter System check before waiting for the index start/attach promise',
);

assert.match(
	wizard,
	/if \(currentStep === 'system-check'\) \{[\s\S]*?dispatch\(\{ type: 'jump', step: nextStep \}\);[\s\S]*?void markConfigurationComplete\(settingsActions\)\.catch/,
	'System check must enter Try Peak before waiting for settings persistence',
);

assert.match(wizard, /state\.systemCheckMessages\.storage \|\| 'Peak can safely create and read its own data root'/);
assert.match(wizard, /Choose a writable Peak data root to continue/);
assert.match(wizard, /Open storage settings/);
assert.match(wizard, /Review connection/);
assert.match(wizard, /Review models/);
assert.match(wizard, /Repair database/);
assert.match(wizard, /className="pk-onboarding-footer-message" data-state=\{footerGuidance \? 'blocked'/);
assert.doesNotMatch(wizard, /delay\(220\)/, 'production checks must not add staged demo delays');

console.log('PASS onboarding-interaction-closure');
