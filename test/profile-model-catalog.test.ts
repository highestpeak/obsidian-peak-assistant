import assert from 'node:assert/strict';
import { createPresetProfile } from '@/core/profiles/presets';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';

const first = createPresetProfile('lmstudio', { id: 'lm-one' });
const second = createPresetProfile('lmstudio', { id: 'lm-two' });

assert.equal(profileModelCatalogId(first), 'lmstudio:lm-one');
assert.equal(profileModelCatalogId(second), 'lmstudio:lm-two');
assert.notEqual(profileModelCatalogId(first), profileModelCatalogId(second));
assert.equal(profileModelCatalogId(createPresetProfile('ollama')), 'ollama');
console.log('PASS profile-model-catalog');
