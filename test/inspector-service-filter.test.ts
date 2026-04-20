import { filterLinksByQuery } from '../src/service/search/inspectorService';
import type { ConnectedLink } from '../src/service/search/inspectorService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLink(overrides: Partial<ConnectedLink> & { path: string; label: string }): ConnectedLink {
	return {
		direction: 'out',
		contextSnippet: null,
		convergenceCount: 0,
		relevanceScore: null,
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log('=== filterLinksByQuery ===');

// Empty query → all links returned, relevanceScore stays null
{
	const links: ConnectedLink[] = [
		makeLink({ path: 'a.md', label: 'Alpha' }),
		makeLink({ path: 'b.md', label: 'Beta' }),
	];
	const result = filterLinksByQuery(links, '');
	console.assert(result.length === 2, 'empty query: should return all links');
	console.assert(
		result.every((l) => l.relevanceScore === null),
		'empty query: relevanceScore should be null for all',
	);
	console.log('PASS: empty query returns all links with null scores');
}

// Whitespace-only query → same as empty
{
	const links: ConnectedLink[] = [makeLink({ path: 'a.md', label: 'Alpha' })];
	const result = filterLinksByQuery(links, '   ');
	console.assert(result[0]?.relevanceScore === null, 'whitespace query: score stays null');
	console.log('PASS: whitespace query treated as empty');
}

// Query matching title → high score
{
	const links: ConnectedLink[] = [
		makeLink({ path: 'a.md', label: 'Machine Learning Basics', contextSnippet: null }),
		makeLink({ path: 'b.md', label: 'Cooking Recipes', contextSnippet: null }),
	];
	const result = filterLinksByQuery(links, 'machine learning');
	console.assert(result.length === 2, 'title match: all links returned');
	const mlLink = result.find((l) => l.path === 'a.md');
	const cookLink = result.find((l) => l.path === 'b.md');
	console.assert(mlLink != null, 'title match: ML link present');
	console.assert(cookLink != null, 'title match: cooking link present');
	console.assert(
		(mlLink?.relevanceScore ?? 0) > (cookLink?.relevanceScore ?? 0),
		'title match: ML link should score higher than cooking link',
	);
	// First result should be the ML link (sorted descending)
	console.assert(result[0]?.path === 'a.md', 'title match: ML link should be first');
	console.log('PASS: title-matching link scores higher and appears first');
}

// Query matching context snippet → contributes to score
{
	const links: ConnectedLink[] = [
		makeLink({ path: 'a.md', label: 'Unrelated Title', contextSnippet: 'neural networks and deep learning' }),
		makeLink({ path: 'b.md', label: 'Also Unrelated', contextSnippet: null }),
	];
	const result = filterLinksByQuery(links, 'neural');
	const contextLink = result.find((l) => l.path === 'a.md');
	const noContextLink = result.find((l) => l.path === 'b.md');
	console.assert(
		(contextLink?.relevanceScore ?? 0) > (noContextLink?.relevanceScore ?? 0),
		'context match: context-containing link should score higher',
	);
	console.log('PASS: context snippet contributes to score');
}

// Query not matching any link → all scores are 0
{
	const links: ConnectedLink[] = [
		makeLink({ path: 'a.md', label: 'Alpha', contextSnippet: 'some text' }),
		makeLink({ path: 'b.md', label: 'Beta', contextSnippet: null }),
	];
	const result = filterLinksByQuery(links, 'zzznomatchzzz');
	console.assert(
		result.every((l) => l.relevanceScore === 0),
		'no match: all scores should be 0',
	);
	console.log('PASS: non-matching query gives score 0');
}

// Scores are normalized to [0, 1]
{
	const links: ConnectedLink[] = [
		makeLink({ path: 'a.md', label: 'foo bar baz', contextSnippet: 'foo bar baz' }),
	];
	const result = filterLinksByQuery(links, 'foo bar baz');
	const score = result[0]?.relevanceScore ?? -1;
	console.assert(score >= 0 && score <= 1, `score should be in [0,1], got ${score}`);
	console.log(`PASS: score normalized to [0,1] (got ${score.toFixed(3)})`);
}

// Sorted descending by score
{
	const links: ConnectedLink[] = [
		makeLink({ path: 'low.md', label: 'nothing relevant' }),
		makeLink({ path: 'high.md', label: 'typescript types', contextSnippet: 'typescript code' }),
		makeLink({ path: 'mid.md', label: 'typescript guide' }),
	];
	const result = filterLinksByQuery(links, 'typescript');
	const scores = result.map((l) => l.relevanceScore ?? 0);
	for (let i = 1; i < scores.length; i++) {
		console.assert(
			scores[i - 1]! >= scores[i]!,
			`sorted: score[${i - 1}]=${scores[i - 1]} should be >= score[${i}]=${scores[i]}`,
		);
	}
	console.log('PASS: results sorted by score descending');
}

console.log('=== All filterLinksByQuery tests passed ===');
