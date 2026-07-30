import assert from 'node:assert/strict';
import {
	SharedAIInstructionController,
	createAIInstructionSubmission,
	resolveAIInstructionKeyAction,
	type AIInstructionSurfaceAdapter,
} from '../src/core/instruction-composer';

async function run(): Promise<void> {
	assert.equal(resolveAIInstructionKeyAction({ key: 'Enter', status: 'idle' }), 'submit');
	assert.equal(resolveAIInstructionKeyAction({ key: 'Enter', shiftKey: true, status: 'idle' }), 'newline');
	assert.equal(resolveAIInstructionKeyAction({ key: 'Enter', composing: true, status: 'idle' }), 'none');
	assert.equal(resolveAIInstructionKeyAction({ key: 'Escape', status: 'streaming' }), 'stop');
	assert.equal(createAIInstructionSubmission('  hello  ', [], [], 7).instruction, 'hello');

	const envelopes: unknown[] = [];
	const adapter: AIInstructionSurfaceAdapter<{ graphId: string }, string> = {
		surface: 'ai-graph',
		capabilityId: 'ai-graph.update',
		placeholder: 'Update graph',
		context: () => ({ graphId: 'g1' }),
		submit: async (envelope) => {
			envelopes.push(envelope);
			return 'semantic-diff';
		},
	};
	const controller = new SharedAIInstructionController(adapter);
	controller.setDraft('add claim evidence');
	assert.equal(await controller.submit(), 'semantic-diff');
	assert.equal(envelopes.length, 1);
	assert.equal(controller.snapshot().draft, '');
}

void run();
