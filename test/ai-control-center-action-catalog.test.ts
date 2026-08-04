import assert from 'assert';
import { REGISTERED_AI_CONTROL_ACTIONS } from '@/app/ai-control-center/AIControlActionCatalog';
import { getTemplateMetadata } from '@/core/template/TemplateRegistry';

function testRegisteredActionsAreEditablePromptCalls(): void {
	const ids = new Set<string>();
	const areas = new Set<string>();
	for (const action of REGISTERED_AI_CONTROL_ACTIONS) {
		assert(!ids.has(action.id), `duplicate action id: ${action.id}`);
		ids.add(action.id);
		areas.add(action.area);
		assert(action.promptIds.length > 0 && action.promptIds.length <= 2, `${action.id} must expose one or two prompt slots`);
		for (const promptId of action.promptIds) {
			assert.strictEqual(getTemplateMetadata(promptId).category, 'prompts', `${action.id} must only expose a registered prompt`);
		}
	}
	assert.deepStrictEqual(
		[...areas].sort(),
		['ai-search-graph', 'chat-generation', 'composer-copilot', 'search-knowledge', 'vault-intelligence'],
		'catalog should cover each user-facing product area',
	);
	assert(![...ids].some((id) => /embedding|parser|rerank|cache|telemetry/i.test(id)), 'internal maintenance must not enter Control Center');
	console.log('PASS: registeredActionsAreEditablePromptCalls');
}

testRegisteredActionsAreEditablePromptCalls();
