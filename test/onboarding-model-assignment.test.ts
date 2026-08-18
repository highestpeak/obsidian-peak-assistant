import assert from 'node:assert/strict';
import { canContinue, initialState, reduce } from '@/ui/view/onboarding/OnboardingStateMachine';

let state = initialState({ initialStep: 'core-models' });
for (const role of ['conversation', 'knowledge', 'agent'] as const) {
	assert.equal(state.models[role].mode, 'automatic');
	state = reduce(state, { type: 'model-check', role, status: 'ready' });
}
assert.equal(canContinue(state), true, 'explicit Automatic is a valid assignment when it resolves to a compatible model');

state = reduce(state, { type: 'model-check', role: 'agent', status: 'needs-attention' });
assert.equal(canContinue(state), false, 'Hermes cannot continue without a tools-compatible candidate');

state = reduce(state, {
	type: 'select-model',
	role: 'agent',
	assignment: { mode: 'fixed', config: { profileId: 'openai', modelId: 'gpt-5' } },
});
state = reduce(state, { type: 'model-check', role: 'agent', status: 'ready' });
assert.equal(canContinue(state), true);

console.log('PASS onboarding-model-assignment');
