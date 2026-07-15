import { assignDisplayScorePercent } from '../src/service/search/query/scoreNormalize';
import type { SearchResultItem } from '../src/core/search/searchTypes';

function assert(condition: boolean, msg: string): void {
	if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

function makeItem(finalScore: number | undefined, path = `n${finalScore ?? 'x'}.md`): SearchResultItem {
	return {
		id: path,
		type: 'markdown' as SearchResultItem['type'],
		title: path,
		path,
		lastModified: 0,
		finalScore,
	};
}

// Case 1: spec example — [1.48, 1.44, 0.5] → [100, 97, 34]
{
	const items = [makeItem(1.48), makeItem(1.44), makeItem(0.5)];
	assignDisplayScorePercent(items);
	assert(items[0].displayScorePercent === 100, `top → 100, got ${items[0].displayScorePercent}`);
	assert(items[1].displayScorePercent === 97, `middle → 97, got ${items[1].displayScorePercent}`);
	assert(items[2].displayScorePercent === 34, `low → 34, got ${items[2].displayScorePercent}`);
}

// Case 2: single element → 100%
{
	const items = [makeItem(0.7)];
	assignDisplayScorePercent(items);
	assert(items[0].displayScorePercent === 100, 'single → 100');
}

// Case 3: empty set — no output values to check, but must not throw
{
	const items: SearchResultItem[] = [];
	assignDisplayScorePercent(items);
	assert(items.length === 0, 'empty stays empty');
}

// Case 4: all-zero → all null (UI hides pill)
{
	const items = [makeItem(0), makeItem(0), makeItem(0)];
	assignDisplayScorePercent(items);
	for (const it of items) {
		assert(it.displayScorePercent === null, `zero-score → null, got ${it.displayScorePercent}`);
	}
}

// Case 5: order preservation — normalization must not reorder items or change relative ranking
{
	const items = [makeItem(2.0, 'a'), makeItem(1.0, 'b'), makeItem(0.5, 'c'), makeItem(0.25, 'd')];
	assignDisplayScorePercent(items);
	assert(items[0].path === 'a' && items[3].path === 'd', 'order preserved');
	const pcts = items.map((i) => i.displayScorePercent ?? -1);
	for (let i = 1; i < pcts.length; i++) {
		assert(pcts[i] <= pcts[i - 1], `monotonic: idx ${i} (${pcts[i]}) > prev (${pcts[i - 1]})`);
	}
	assert(pcts[0] === 100, 'first item is 100');
}

// Case 6: finalScore fallback to score
{
	const item: SearchResultItem = {
		id: 'x', type: 'markdown' as SearchResultItem['type'], title: 'x', path: 'x', lastModified: 0,
		score: 0.8,
	};
	assignDisplayScorePercent([item]);
	assert(item.displayScorePercent === 100, 'falls back to score when finalScore missing');
}

// Case 7: mixed with score-less entries — score-less items get null, others normalize against max
{
	const scored = makeItem(1.0, 's');
	const scoreless: SearchResultItem = {
		id: 'z', type: 'markdown' as SearchResultItem['type'], title: 'z', path: 'z', lastModified: 0,
	};
	const items = [scored, scoreless];
	assignDisplayScorePercent(items);
	assert(scored.displayScorePercent === 100, 'scored → 100');
	assert(scoreless.displayScorePercent === null, `scoreless → null, got ${scoreless.displayScorePercent}`);
}

console.log('OK quick-search-score-normalize');
