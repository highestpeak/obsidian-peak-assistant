import assert from 'node:assert/strict';
import { canContinue, initialState, PRIMARY_STEPS, reduce } from '@/ui/view/onboarding/OnboardingStateMachine';

assert.deepEqual(PRIMARY_STEPS, ['connect-ai', 'core-models', 'prepare-vault', 'system-check', 'try-peak']);

let state = initialState();
assert.equal(state.step, 'connect-ai');
assert.equal(canContinue(state), false);

state = reduce(state, { type: 'select-profile', profileId: 'openai-1' });
assert.equal(canContinue(state), false, 'selecting a connection is not the same as verifying it');
state = reduce(state, { type: 'connection-check', profileId: 'openai-1', status: 'ready' });
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'core-models');
assert.equal(canContinue(state), false);

for (const role of ['conversation', 'knowledge', 'agent'] as const) {
	state = reduce(state, { type: 'select-model', role, config: { profileId: 'openai-1', modelId: 'gpt-5' } });
}
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'prepare-vault');
assert.equal(canContinue(state), false, 'Better SQLite is a hard gate');

state = reduce(state, { type: 'sqlite-result', ready: true, message: 'ready' });
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'system-check');
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'try-peak');
state = reduce(state, { type: 'next' });
assert.equal(state.done, true);

console.log('onboarding-state-machine: all assertions passed');
