import assert from 'node:assert/strict';
import { isFileAtlasHubDocument } from '@/ui/view/file-atlas/documentContextPolicy';

assert.equal(
	isFileAtlasHubDocument('ChatFolder/Hub-Summaries/Hub-000031ae70fe.md', 'ChatFolder'),
	true,
);
assert.equal(
	isFileAtlasHubDocument('ChatFolder/Hub-Summaries/Manual/Architecture.md', 'ChatFolder'),
	true,
);
assert.equal(
	isFileAtlasHubDocument('Notes/Hub-Summaries are useful.md', 'ChatFolder'),
	false,
);
assert.equal(isFileAtlasHubDocument('Notes/ordinary.md', 'ChatFolder'), false);
assert.equal(isFileAtlasHubDocument('ChatFolder/Hub-Summaries/hub.md', '  '), false);

console.log('PASS: File Atlas suppresses recursive relationship context for Hub documents');
