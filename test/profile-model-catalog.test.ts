import assert from 'node:assert/strict';
import { createPresetProfile } from '@/core/profiles/presets';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';
import { modelRegistry } from '@/core/providers/model-registry';
import { buildUnifiedModelChoices } from '@/core/providers/model-selection';

const first = createPresetProfile('lmstudio', { id: 'lm-one' });
const second = createPresetProfile('lmstudio', { id: 'lm-two' });

assert.equal(profileModelCatalogId(first), 'lmstudio:lm-one');
assert.equal(profileModelCatalogId(second), 'lmstudio:lm-two');
assert.notEqual(profileModelCatalogId(first), profileModelCatalogId(second));
assert.equal(profileModelCatalogId(createPresetProfile('ollama')), 'ollama');

modelRegistry.mergeRuntimeModels('lmstudio:lm-one', ['first-local-model']);
modelRegistry.mergeRuntimeModels('lmstudio:lm-two', ['second-local-model']);
const choices = buildUnifiedModelChoices(modelRegistry, [first, second], {});
assert.deepEqual(choices.map((choice) => `${choice.profileId}:${choice.modelId}`).sort(), [
	'lm-one:first-local-model',
	'lm-two:second-local-model',
]);
console.log('PASS profile-model-catalog');
