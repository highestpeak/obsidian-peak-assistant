import assert from 'node:assert/strict';
import { collapseDuplicateLocalProfiles, isSameLocalProfileConnection, localProfileConnectionIdentity } from '@/core/profiles/profile-connection-identity';
import { createPresetProfile } from '@/core/profiles/presets';

const firstLmStudio = createPresetProfile('lmstudio', { id: 'lm-first', baseUrl: 'http://127.0.0.1:1234/v1/' });
const readyLmStudio = createPresetProfile('lmstudio', { id: 'lm-ready', baseUrl: 'HTTP://127.0.0.1:1234/v1' });
const otherLmStudio = createPresetProfile('lmstudio', { id: 'lm-other', baseUrl: 'http://127.0.0.1:1235/v1' });
const firstOpenAI = createPresetProfile('openai', { id: 'openai-first', baseUrl: 'https://api.openai.com/v1' });
const secondOpenAI = createPresetProfile('openai', { id: 'openai-second', baseUrl: 'https://api.openai.com/v1' });

assert.equal(localProfileConnectionIdentity(firstLmStudio), 'lmstudio:http://127.0.0.1:1234/v1');
assert.equal(isSameLocalProfileConnection(firstLmStudio, readyLmStudio), true);
assert.equal(isSameLocalProfileConnection(firstLmStudio, otherLmStudio), false);
assert.equal(isSameLocalProfileConnection(firstOpenAI, secondOpenAI), false);

const collapsed = collapseDuplicateLocalProfiles(
	[firstLmStudio, readyLmStudio, otherLmStudio, firstOpenAI, secondOpenAI],
	{ 'lm-first': 'checking', 'lm-ready': 'ready' },
);

assert.deepEqual(collapsed.map((profile) => profile.id), ['lm-ready', 'lm-other', 'openai-first', 'openai-second']);
console.log('PASS profile-connection-identity');
