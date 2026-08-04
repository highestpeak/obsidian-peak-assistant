import assert from 'assert';
import { AIControlCenterRuntime } from '@/app/ai-control-center/AIControlCenterRuntime';

async function testOnlyPromptBackedActionsAppearAsControls(): Promise<void> {
	const runtime = new AIControlCenterRuntime({
		app: { vault: {} } as any,
		manager: {
			assistant: { list: async () => [] },
			prompt: {
				getEditablePrompt: async () => ({ content: 'Base {{content}}', overridden: false }),
				savePromptOverride: async () => undefined,
				deleteOverride: async () => undefined,
			},
		} as any,
		copilotActions: {
			getAll: () => [
				{ id: 'prompt-backed', label: 'Prompt backed', description: 'Uses a real prompt', category: 'document', promptIds: ['doc-polish'] },
				{ id: 'deterministic', label: 'Deterministic', description: 'No prompt', category: 'vault' },
			],
		} as any,
		resolveCustomPromptFolder: () => 'Peak/Prompts/Custom',
	});

	const actions = await runtime.listActions();
	assert(actions.some((action) => action.id === 'prompt-backed'), 'prompt-backed runtime action should appear');
	assert(!actions.some((action) => action.id === 'deterministic'), 'deterministic runtime action must stay hidden');
	const action = actions.find((item) => item.id === 'prompt-backed');
	assert.deepStrictEqual(action?.promptSlots.map((slot) => slot.id), ['doc-polish-system', 'doc-polish']);
	const prompt = await runtime.readBuiltInPrompt('doc-polish' as any);
	assert.strictEqual(prompt.content, 'Base {{content}}');
	assert.strictEqual(prompt.overridden, false);
	console.log('PASS: onlyPromptBackedActionsAppearAsControls');
}

testOnlyPromptBackedActionsAppearAsControls().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
