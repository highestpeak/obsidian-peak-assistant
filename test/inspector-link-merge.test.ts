import { mergeConnectedLinks } from '../src/ui/view/quick-search/components/inspector/mergeConnectedLinks';
import type { ConnectedLink } from '../src/service/search/inspectorService';

function assert(condition: boolean, msg: string): void {
	if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

function makeLink(path: string, direction: 'out' | 'in', extra: Partial<ConnectedLink> = {}): ConnectedLink {
	return {
		path,
		label: path.replace(/\.md$/, ''),
		direction,
		contextSnippet: null,
		convergenceCount: 0,
		relevanceScore: null,
		...extra,
	};
}

// Case 1: same target, out + in → merged to 'both', order preserved
{
	const merged = mergeConnectedLinks([
		makeLink('a.md', 'out'),
		makeLink('a.md', 'in'),
	]);
	assert(merged.length === 1, `expected 1 merged, got ${merged.length}`);
	assert(merged[0].direction === 'both', `expected both, got ${merged[0].direction}`);
	assert(merged[0].path === 'a.md', 'path preserved');
}

// Case 2: only out (no matching in) — pass through
{
	const merged = mergeConnectedLinks([makeLink('a.md', 'out')]);
	assert(merged.length === 1 && merged[0].direction === 'out', 'lone out unchanged');
}

// Case 3: only in — pass through
{
	const merged = mergeConnectedLinks([makeLink('a.md', 'in')]);
	assert(merged.length === 1 && merged[0].direction === 'in', 'lone in unchanged');
}

// Case 4: different targets do NOT merge
{
	const merged = mergeConnectedLinks([
		makeLink('a.md', 'out'),
		makeLink('b.md', 'in'),
	]);
	assert(merged.length === 2, `expected 2, got ${merged.length}`);
	assert(merged[0].direction === 'out' && merged[1].direction === 'in', 'directions preserved');
}

// Case 5: three-way with mixed order — a: both, b: out only, c: in only
{
	const merged = mergeConnectedLinks([
		makeLink('a.md', 'out'),
		makeLink('b.md', 'out'),
		makeLink('c.md', 'in'),
		makeLink('a.md', 'in'),
	]);
	assert(merged.length === 3, `expected 3, got ${merged.length}`);
	const a = merged.find((m) => m.path === 'a.md')!;
	assert(a.direction === 'both', 'a merged to both');
	const b = merged.find((m) => m.path === 'b.md')!;
	assert(b.direction === 'out', 'b stays out');
	const c = merged.find((m) => m.path === 'c.md')!;
	assert(c.direction === 'in', 'c stays in');
	// First-occurrence slot preserved: 'a' should come first (from 'a.md' out at idx 0)
	assert(merged[0].path === 'a.md', 'first-occurrence order preserved');
}

// Case 6: merge policy — context snippet, convergence, relevance
{
	const merged = mergeConnectedLinks([
		makeLink('a.md', 'out', { contextSnippet: 'from out', convergenceCount: 3, relevanceScore: 0.5 }),
		makeLink('a.md', 'in', { contextSnippet: 'from in', convergenceCount: 5, relevanceScore: 0.8 }),
	]);
	const m = merged[0];
	assert(m.direction === 'both', 'merged direction');
	assert(m.contextSnippet === 'from out', `existing context wins, got ${m.contextSnippet}`);
	assert(m.convergenceCount === 5, `max convergence, got ${m.convergenceCount}`);
	assert(m.relevanceScore === 0.8, `max relevance, got ${m.relevanceScore}`);
}

// Case 7: same-direction duplicate does NOT flip to 'both'
{
	const merged = mergeConnectedLinks([
		makeLink('a.md', 'out'),
		makeLink('a.md', 'out'),
	]);
	assert(merged.length === 1, 'dup dropped');
	assert(merged[0].direction === 'out', `stays out, got ${merged[0].direction}`);
}

console.log('OK inspector-link-merge');
