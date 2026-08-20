import assert from 'node:assert/strict';
import { canContinue, initialState, PRIMARY_STEPS, reduce } from '@/ui/view/onboarding/OnboardingStateMachine';

assert.deepEqual(PRIMARY_STEPS, ['connect-ai', 'core-models', 'prepare-vault', 'system-check', 'try-peak']);

let state = initialState();
assert.equal(state.step, 'connect-ai');
assert.equal(canContinue(state), false);

state = reduce(state, { type: 'select-profile', profileId: 'openai-1' });
assert.equal(canContinue(state), false, 'selecting a connection is not the same as verifying it');
state = reduce(state, { type: 'connection-check', profileId: 'openai-1', status: 'ready' });
state = reduce(state, { type: 'select-profile', profileId: 'broken-1' });
state = reduce(state, { type: 'connection-check', profileId: 'broken-1', status: 'error' });
assert.equal(canContinue(state), true, 'one failed row must not erase another ready connection');
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'core-models');
assert.equal(canContinue(state), false);

for (const role of ['conversation', 'knowledge', 'agent'] as const) {
	state = reduce(state, { type: 'select-model', role, assignment: { mode: 'automatic' } });
	state = reduce(state, { type: 'model-check', role, status: 'ready' });
}
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'prepare-vault');
assert.equal(canContinue(state), false, 'Better SQLite is a hard gate');

state = reduce(state, { type: 'sqlite-result', ready: true, message: 'ready' });
state = reduce(state, { type: 'index-status', status: 'running', message: 'Attached to the active run.' });
assert.equal(canContinue(state), false, 'an active run remains on the vault screen instead of advancing with an unfinished index');
state = reduce(state, { type: 'index-status', status: 'ready', message: 'Existing index reused.' });
assert.equal(state.fastIndexMessage, 'Existing index reused.');
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'system-check');
for (const check of ['connection', 'conversation', 'knowledge', 'agent', 'hermes', 'sqlite', 'fullText', 'storage', 'safety'] as const) {
	state = reduce(state, { type: 'system-check', check, status: check === 'fullText' ? 'building' : 'ready' });
}
state = reduce(state, { type: 'next' });
assert.equal(state.step, 'try-peak');
state = reduce(state, { type: 'next' });
assert.equal(state.done, true);

console.log('onboarding-state-machine: all assertions passed');
