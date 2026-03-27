import {
	computeKeywordTagBundles,
	extractTextRankFeatures,
	pageRankWeighted,
	stripForTextRank,
	tokenizeForTextRank,
} from '@/core/document/loader/helper/textRank';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

function runTests() {
	// strip code
	const md = 'Hello `inline` world\n```js\nfoo\n```\nMore text.';
	const stripped = stripForTextRank(md);
	assert(!stripped.includes('foo'), 'code block should be removed');
	assert(stripped.includes('More'), 'keeps body text');

	// tokenize
	const tok = tokenizeForTextRank('The API returns JSON for the API client.', 2);
	assert(tok.includes('api'), 'lowercase api');
	assert(tok.filter((t) => t === 'api').length >= 2, 'api repeats');

	// PageRank trivial graph: two nodes one edge
	const adj = new Map<string, Map<string, number>>();
	adj.set('a', new Map([['b', 1]]));
	adj.set('b', new Map([['a', 1]]));
	const pr = pageRankWeighted(['a', 'b'], adj, { damping: 0.85, iterations: 30 });
	assert(pr.size === 2, 'two scores');
	const sa = pr.get('a') ?? 0;
	const sb = pr.get('b') ?? 0;
	assert(Math.abs(sa - sb) < 1e-6, 'symmetric graph should have equal rank');

	// TextRank: repeated important term wins
	const doc = `
		Machine learning models need data. Data quality matters for machine learning.
		We train models on data. Machine learning depends on good data pipelines.
	`;
	const r = extractTextRankFeatures(doc, { maxTerms: 10, maxSentences: 3 });
	assert(r.topTerms.length > 0, 'has terms');
	const top = r.topTerms[0]?.term;
	assert(top === 'data' || top === 'learning' || top === 'machine', `expected data/learning/machine, got ${top}`);
	assert(r.topSentences.length >= 1, 'has sentences');

	// User vs TextRank split: textrank-only terms are separate from userKeywordTags
	const b = computeKeywordTagBundles(['todo', 'project'], [
		{ term: 'todo', score: 1 },
		{ term: 'machine', score: 0.9 },
	]);
	assert(b.userKeywordTags.join(',') === 'todo,project', 'user tags deduped');
	assert(!b.textrankKeywordTerms.includes('todo'), 'duplicate todo not in TR-only list');
	assert(b.mergedKeywordTags.includes('machine'), 'merged includes new TR term');

	console.log('textRank.test.ts: all passed');
}

runTests();
