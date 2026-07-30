import assert from 'node:assert/strict';
import {
	SharedAIInstructionController,
	createAIInstructionSubmission,
	normalizeAIInstructionAttachments,
	resolveAIInstructionKeyAction,
	type AIInstructionDraftStore,
	type AIInstructionSurfaceAdapter,
} from '../src/core/instruction-composer';
import { detectPromptTrigger } from '../src/ui/component/prompt-input/promptTrigger';

async function run(): Promise<void> {
	assert.equal(resolveAIInstructionKeyAction({ key: 'Enter', status: 'idle' }), 'submit');
	assert.equal(resolveAIInstructionKeyAction({ key: 'Enter', shiftKey: true, status: 'idle' }), 'newline');
	assert.equal(resolveAIInstructionKeyAction({ key: 'Enter', composing: true, status: 'idle' }), 'none');
	assert.equal(resolveAIInstructionKeyAction({ key: 'Escape', status: 'streaming' }), 'stop');
	assert.deepEqual(detectPromptTrigger('@ada', 4), {
		trigger: '@',
		query: 'ada',
		from: 0,
		to: 4,
	});
	assert.equal(detectPromptTrigger('mail@example.com', 16), null);
	assert.equal(detectPromptTrigger('use [[Ada', 9)?.trigger, '[[');
	assert.equal(detectPromptTrigger('/review', 7)?.trigger, '/');
	assert.equal(createAIInstructionSubmission('  hello  ', [], [], 7).instruction, 'hello');
	const attachments = await normalizeAIInstructionAttachments([
		{
			name: 'a.txt',
			type: 'text/plain',
			arrayBuffer: async () => new TextEncoder().encode('same').buffer,
		},
		{
			name: 'duplicate-name-does-not-matter.txt',
			type: 'text/plain',
			arrayBuffer: async () => new TextEncoder().encode('same').buffer,
		},
	]);
	assert.equal(attachments.length, 1, 'attachment content hashes must deduplicate across names');
	assert.equal(attachments[0].hash?.length, 64);

	const envelopes: unknown[] = [];
	const saved = new Map<string, string>();
	const history: string[] = [];
	const draftStore: AIInstructionDraftStore = {
		load: (key) => saved.get(key) ?? null,
		save: (key, value) => {
			saved.set(key, value);
		},
		clear: (key) => {
			saved.delete(key);
		},
		recent: (_key, limit) => history.slice(0, limit),
		record: (_key, instruction) => {
			history.unshift(instruction);
		},
	};
	let stops = 0;
	const adapter: AIInstructionSurfaceAdapter<{ graphId: string }, string> = {
		surface: 'ai-graph',
		capabilityId: 'ai-graph.update',
		placeholder: 'Update graph',
		context: () => ({ graphId: 'g1' }),
		submit: async (envelope) => {
			envelopes.push(envelope);
			return 'semantic-diff';
		},
		stop: () => {
			stops += 1;
		},
	};
	const controller = new SharedAIInstructionController(adapter, draftStore, 'graph:g1');
	controller.setDraft('add claim evidence');
	assert.equal(saved.get('graph:g1'), 'add claim evidence');
	controller.setComposing(true);
	assert.equal(await controller.submit(), null, 'IME composition must guard submission');
	controller.setComposing(false);
	assert.equal(await controller.submit(), 'semantic-diff');
	assert.equal(envelopes.length, 1);
	assert.equal(controller.snapshot().draft, '');
	assert.equal(history[0], 'add claim evidence');
	assert.equal(controller.restoreRecent(0), true);
	assert.equal(controller.snapshot().draft, 'add claim evidence');
	controller.syncStatus('streaming');
	await controller.stop();
	assert.equal(stops, 1);
	assert.equal(controller.snapshot().status, 'idle');
}

void run();
