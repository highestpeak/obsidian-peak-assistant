import assert from 'node:assert/strict';
import { sourcesToResultItems } from '@/ui/view/quick-search/components/sourceEvidenceAdapter';

const readAt = Date.now();
const items = sourcesToResultItems(
	[
		{
			path: 'Research/Alpha.md',
			title: 'Alpha',
			readAt,
			reasoning: 'Supports the implementation timeline.',
		},
		{
			path: 'Research/Beta.md',
			title: 'Beta',
			readAt: readAt - 1_000,
		},
	],
	new Map([['Research/Alpha.md', 1_700_000_000_000]]),
);

assert.equal(items[0].lastModified, 1_700_000_000_000);
assert.equal(items[1].lastModified, 0);
assert.equal(items[0].content, 'Supports the implementation timeline.');
assert.equal(items[0].score, undefined);
assert.equal(items[0].finalScore, undefined);
assert.equal(items[0].displayScorePercent, undefined);
assert.notEqual(items[0].lastModified, readAt, 'agent read time must not be presented as file freshness');

console.log('ai-search-source-evidence-adapter: passed');
