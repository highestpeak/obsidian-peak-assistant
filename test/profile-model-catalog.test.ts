import assert from 'node:assert/strict';
import { createPresetProfile } from '@/core/profiles/presets';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';
import { modelRegistry } from '@/core/providers/model-registry';
import { buildUnifiedModelChoices } from '@/core/providers/model-selection';
import { ModelType } from '@/core/providers/types';

const first = createPresetProfile('lmstudio', { id: 'lm-one' });
const second = createPresetProfile('lmstudio', { id: 'lm-two' });

assert.equal(profileModelCatalogId(first), 'lmstudio:lm-one');
assert.equal(profileModelCatalogId(second), 'lmstudio:lm-two');
assert.notEqual(profileModelCatalogId(first), profileModelCatalogId(second));
const ollama = createPresetProfile('ollama', { id: 'ollama-one' });
const openrouter = createPresetProfile('openrouter', { id: 'router-one' });
assert.equal(profileModelCatalogId(ollama), 'ollama:ollama-one');
assert.equal(profileModelCatalogId(openrouter), 'openrouter:router-one');
assert.ok(
	modelRegistry.getModelsForProvider('openai').some((model) => model.id === 'text-embedding-3-small' && model.modelType === ModelType.EMBEDDING),
	'OpenAI embedding choices must be typed as embeddings, never inferred from a chat model name',
);
assert.ok(
	modelRegistry.getModelsForProvider('google').some((model) => model.id === 'gemini-embedding-001' && model.modelType === ModelType.EMBEDDING),
	'Google embedding choices must have an explicit capability declaration',
);
assert.ok(
	modelRegistry.getModelsForProvider('perplexity').some((model) => model.id === 'pplx-embed-v1-0.6b' && model.modelType === ModelType.EMBEDDING),
	'Perplexity embedding choices must have an explicit capability declaration',
);

modelRegistry.mergeRuntimeModels('lmstudio:lm-one', ['first-local-model']);
modelRegistry.mergeRuntimeModels('lmstudio:lm-two', ['second-local-model']);
const choices = buildUnifiedModelChoices(modelRegistry, [first, second], {});
assert.deepEqual(choices.map((choice) => `${choice.profileId}:${choice.modelId}`).sort(), [
	'lm-one:first-local-model',
	'lm-two:second-local-model',
]);
console.log('PASS profile-model-catalog');
