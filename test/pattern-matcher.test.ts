import { evaluateConditions, matchPatterns } from '../src/service/context/PatternMatcher';
import type { StoredPattern } from '../src/service/context/PatternMatcher';
import type { VaultContext } from '../src/service/context/ContextProvider';
import type { MatchCondition } from '../src/core/schemas/agents/pattern-discovery-schemas';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<VaultContext> = {}): VaultContext {
	return {
		activeDocumentTitle: null,
		activeDocumentPath: null,
		currentFolder: null,
		documentTags: null,
		vaultName: 'TestVault',
		documentKeywords: null,
		firstHeading: null,
		frontmatterProperties: null,
		documentType: null,
		outgoingLinks: null,
		backlinks: null,
		linkContext: null,
		recentDocuments: null,
		recentFolders: null,
		documentAge: null,
		...overrides,
	};
}

function makePattern(overrides: Partial<StoredPattern> & { id: string }): StoredPattern {
	return {
		template: 'Hello {activeDocumentTitle}',
		variables: ['activeDocumentTitle'],
		conditions: { hasActiveDocument: true },
		source: 'test',
		confidence: 0.9,
		usage_count: 0,
		discovered_at: '2026-01-01',
		last_used_at: null,
		deprecated: 0,
		...overrides,
	};
}

// ─── evaluateConditions ───────────────────────────────────────────────────────

console.log('=== evaluateConditions ===');

// always
{
	const result = evaluateConditions({ always: true }, makeCtx());
	console.assert(result === true, 'always: true should pass');
	console.log('PASS: always: true');
}

{
	const result = evaluateConditions({ always: true, hasActiveDocument: true }, makeCtx());
	console.assert(result === true, 'always: true ignores other conditions');
	console.log('PASS: always: true short-circuits');
}

// hasActiveDocument
{
	const result = evaluateConditions({ hasActiveDocument: true }, makeCtx({ activeDocumentTitle: 'Note' }));
	console.assert(result === true, 'hasActiveDocument: true with active doc');
	console.log('PASS: hasActiveDocument: true with doc');
}

{
	const result = evaluateConditions({ hasActiveDocument: true }, makeCtx());
	console.assert(result === false, 'hasActiveDocument: true without active doc');
	console.log('PASS: hasActiveDocument: true without doc');
}

{
	const result = evaluateConditions({ hasActiveDocument: false }, makeCtx());
	console.assert(result === true, 'hasActiveDocument: false matches no doc');
	console.log('PASS: hasActiveDocument: false matches no doc');
}

{
	const result = evaluateConditions({ hasActiveDocument: false }, makeCtx({ activeDocumentTitle: 'Note' }));
	console.assert(result === false, 'hasActiveDocument: false fails when doc present');
	console.log('PASS: hasActiveDocument: false fails with doc');
}

// tagMatch — empty array = has any tags
{
	const result = evaluateConditions({ tagMatch: [] }, makeCtx({ documentTags: 'tech, research' }));
	console.assert(result === true, 'tagMatch [] with tags');
	console.log('PASS: tagMatch [] (has any) with tags');
}

{
	const result = evaluateConditions({ tagMatch: [] }, makeCtx());
	console.assert(result === false, 'tagMatch [] without tags');
	console.log('PASS: tagMatch [] (has any) without tags');
}

// tagMatch — specific tags
{
	const result = evaluateConditions(
		{ tagMatch: ['tech'] },
		makeCtx({ documentTags: 'tech, research' }),
	);
	console.assert(result === true, 'tagMatch specific match');
	console.log('PASS: tagMatch specific match');
}

{
	const result = evaluateConditions(
		{ tagMatch: ['TECH'] },
		makeCtx({ documentTags: 'tech, research' }),
	);
	console.assert(result === true, 'tagMatch case-insensitive');
	console.log('PASS: tagMatch case-insensitive');
}

{
	const result = evaluateConditions(
		{ tagMatch: ['nope'] },
		makeCtx({ documentTags: 'tech, research' }),
	);
	console.assert(result === false, 'tagMatch no match');
	console.log('PASS: tagMatch no match');
}

{
	const result = evaluateConditions(
		{ tagMatch: ['nope', 'research'] },
		makeCtx({ documentTags: 'tech, research' }),
	);
	console.assert(result === true, 'tagMatch OR logic — one of two matches');
	console.log('PASS: tagMatch OR logic');
}

// hasOutgoingLinks
{
	const result = evaluateConditions(
		{ hasOutgoingLinks: true },
		makeCtx({ outgoingLinks: 'NoteA, NoteB' }),
	);
	console.assert(result === true, 'hasOutgoingLinks: true with links');
	console.log('PASS: hasOutgoingLinks: true with links');
}

{
	const result = evaluateConditions({ hasOutgoingLinks: true }, makeCtx());
	console.assert(result === false, 'hasOutgoingLinks: true without links');
	console.log('PASS: hasOutgoingLinks: true without links');
}

{
	const result = evaluateConditions({ hasOutgoingLinks: false }, makeCtx());
	console.assert(result === true, 'hasOutgoingLinks: false matches no links');
	console.log('PASS: hasOutgoingLinks: false matches no links');
}

// hasBacklinks
{
	const result = evaluateConditions(
		{ hasBacklinks: true },
		makeCtx({ backlinks: 'NoteC' }),
	);
	console.assert(result === true, 'hasBacklinks: true with backlinks');
	console.log('PASS: hasBacklinks: true with backlinks');
}

{
	const result = evaluateConditions({ hasBacklinks: true }, makeCtx());
	console.assert(result === false, 'hasBacklinks: true without backlinks');
	console.log('PASS: hasBacklinks: true without backlinks');
}

// folderMatch — exact
{
	const result = evaluateConditions(
		{ folderMatch: 'notes/tech' },
		makeCtx({ currentFolder: 'notes/tech' }),
	);
	console.assert(result === true, 'folderMatch exact');
	console.log('PASS: folderMatch exact');
}

{
	const result = evaluateConditions(
		{ folderMatch: 'notes/tech' },
		makeCtx({ currentFolder: 'notes/other' }),
	);
	console.assert(result === false, 'folderMatch exact mismatch');
	console.log('PASS: folderMatch exact mismatch');
}

// folderMatch — /* one level
{
	const result = evaluateConditions(
		{ folderMatch: 'notes/*' },
		makeCtx({ currentFolder: 'notes/tech' }),
	);
	console.assert(result === true, 'folderMatch /* one level');
	console.log('PASS: folderMatch /* one level');
}

{
	const result = evaluateConditions(
		{ folderMatch: 'notes/*' },
		makeCtx({ currentFolder: 'notes/tech/sub' }),
	);
	console.assert(result === false, 'folderMatch /* rejects nested');
	console.log('PASS: folderMatch /* rejects nested');
}

// folderMatch — /** recursive
{
	const result = evaluateConditions(
		{ folderMatch: 'notes/**' },
		makeCtx({ currentFolder: 'notes/tech/sub' }),
	);
	console.assert(result === true, 'folderMatch /** recursive');
	console.log('PASS: folderMatch /** recursive');
}

{
	const result = evaluateConditions(
		{ folderMatch: 'notes/**' },
		makeCtx({ currentFolder: 'notes' }),
	);
	console.assert(result === true, 'folderMatch /** matches base folder itself');
	console.log('PASS: folderMatch /** matches base');
}

{
	const result = evaluateConditions(
		{ folderMatch: 'notes/**' },
		makeCtx({ currentFolder: 'other/notes' }),
	);
	console.assert(result === false, 'folderMatch /** does not match unrelated folder');
	console.log('PASS: folderMatch /** no false positive');
}

{
	const result = evaluateConditions(
		{ folderMatch: 'notes/tech' },
		makeCtx({ currentFolder: null }),
	);
	console.assert(result === false, 'folderMatch with null folder');
	console.log('PASS: folderMatch null folder');
}

// propertyMatch
{
	const result = evaluateConditions(
		{ propertyMatch: { key: 'status', value: 'draft' } },
		makeCtx({ frontmatterProperties: 'status: draft, priority: high' }),
	);
	console.assert(result === true, 'propertyMatch key+value');
	console.log('PASS: propertyMatch key+value');
}

{
	const result = evaluateConditions(
		{ propertyMatch: { key: 'status' } },
		makeCtx({ frontmatterProperties: 'status: done, priority: high' }),
	);
	console.assert(result === true, 'propertyMatch key only');
	console.log('PASS: propertyMatch key only');
}

{
	const result = evaluateConditions(
		{ propertyMatch: { key: 'missing' } },
		makeCtx({ frontmatterProperties: 'status: draft' }),
	);
	console.assert(result === false, 'propertyMatch key not found');
	console.log('PASS: propertyMatch key not found');
}

{
	const result = evaluateConditions(
		{ propertyMatch: { key: 'status' } },
		makeCtx({ frontmatterProperties: null }),
	);
	console.assert(result === false, 'propertyMatch null frontmatter');
	console.log('PASS: propertyMatch null frontmatter');
}

// keywordMatch
{
	const result = evaluateConditions(
		{ keywordMatch: ['research'] },
		makeCtx({ documentKeywords: 'AI, research, data' }),
	);
	console.assert(result === true, 'keywordMatch match');
	console.log('PASS: keywordMatch match');
}

{
	const result = evaluateConditions(
		{ keywordMatch: ['RESEARCH'] },
		makeCtx({ documentKeywords: 'AI, research, data' }),
	);
	console.assert(result === true, 'keywordMatch case-insensitive');
	console.log('PASS: keywordMatch case-insensitive');
}

{
	const result = evaluateConditions(
		{ keywordMatch: ['nope'] },
		makeCtx({ documentKeywords: 'AI, research' }),
	);
	console.assert(result === false, 'keywordMatch no match');
	console.log('PASS: keywordMatch no match');
}

{
	const result = evaluateConditions(
		{ keywordMatch: ['nope'] },
		makeCtx({ documentKeywords: null }),
	);
	console.assert(result === false, 'keywordMatch null keywords');
	console.log('PASS: keywordMatch null keywords');
}

// multiple conditions (AND logic)
{
	const result = evaluateConditions(
		{ hasActiveDocument: true, tagMatch: ['tech'] },
		makeCtx({ activeDocumentTitle: 'Note', documentTags: 'tech' }),
	);
	console.assert(result === true, 'AND: both pass');
	console.log('PASS: AND logic both pass');
}

{
	const result = evaluateConditions(
		{ hasActiveDocument: true, tagMatch: ['tech'] },
		makeCtx({ activeDocumentTitle: 'Note', documentTags: 'other' }),
	);
	console.assert(result === false, 'AND: one fails');
	console.log('PASS: AND logic one fails');
}

// ─── matchPatterns ────────────────────────────────────────────────────────────

console.log('\n=== matchPatterns ===');

const ctx = makeCtx({
	activeDocumentTitle: 'My Note',
	activeDocumentPath: 'notes/My Note.md',
	currentFolder: 'notes',
	documentTags: 'tech, ai',
	outgoingLinks: 'LinkA, LinkB',
});

// Fills variables
{
	const pattern = makePattern({
		id: 'p1',
		template: 'What does {activeDocumentTitle} say about AI?',
		variables: ['activeDocumentTitle'],
		conditions: { hasActiveDocument: true },
		usage_count: 5,
	});
	const results = matchPatterns([pattern], ctx);
	console.assert(results.length === 1, 'matchPatterns: one result');
	console.assert(
		results[0].filledTemplate === 'What does My Note say about AI?',
		'matchPatterns: fills variable',
	);
	console.log('PASS: matchPatterns fills variable');
}

// Filters patterns whose conditions don't match
{
	const pattern = makePattern({
		id: 'p2',
		template: 'Hello {activeDocumentTitle}',
		variables: ['activeDocumentTitle'],
		conditions: { tagMatch: ['nope'] },
		usage_count: 10,
	});
	const results = matchPatterns([pattern], ctx);
	console.assert(results.length === 0, 'matchPatterns: filters by conditions');
	console.log('PASS: matchPatterns filters by conditions');
}

// Filters patterns with unresolvable variables
{
	const ctxNoDoc = makeCtx();
	const pattern = makePattern({
		id: 'p3',
		template: 'Summarize {activeDocumentTitle}',
		variables: ['activeDocumentTitle'],
		conditions: {}, // no conditions — passes
		usage_count: 3,
	});
	const results = matchPatterns([pattern], ctxNoDoc);
	console.assert(results.length === 0, 'matchPatterns: filters unresolvable variable');
	console.log('PASS: matchPatterns filters unresolvable variable');
}

// Skips deprecated patterns
{
	const pattern = makePattern({
		id: 'p4',
		template: 'Hello {activeDocumentTitle}',
		variables: ['activeDocumentTitle'],
		conditions: { hasActiveDocument: true },
		usage_count: 100,
		deprecated: 1,
	});
	const results = matchPatterns([pattern], ctx);
	console.assert(results.length === 0, 'matchPatterns: skips deprecated');
	console.log('PASS: matchPatterns skips deprecated');
}

// Sorts by usageCount DESC
{
	const p1 = makePattern({ id: 'low', usage_count: 2, template: 'Low {activeDocumentTitle}' });
	const p2 = makePattern({ id: 'high', usage_count: 50, template: 'High {activeDocumentTitle}' });
	const p3 = makePattern({ id: 'mid', usage_count: 20, template: 'Mid {activeDocumentTitle}' });
	const results = matchPatterns([p1, p2, p3], ctx);
	console.assert(results.length === 3, 'matchPatterns: all three match');
	console.assert(results[0].patternId === 'high', 'matchPatterns: sorted first is high');
	console.assert(results[1].patternId === 'mid', 'matchPatterns: sorted second is mid');
	console.assert(results[2].patternId === 'low', 'matchPatterns: sorted third is low');
	console.log('PASS: matchPatterns sorts by usageCount DESC');
}

// Respects limit
{
	const patterns = Array.from({ length: 10 }, (_, i) =>
		makePattern({ id: `p${i}`, usage_count: i }),
	);
	const results = matchPatterns(patterns, ctx, 3);
	console.assert(results.length === 3, 'matchPatterns: respects limit');
	console.log('PASS: matchPatterns respects limit');
}

// Default limit is 6
{
	const patterns = Array.from({ length: 10 }, (_, i) =>
		makePattern({ id: `q${i}`, usage_count: i }),
	);
	const results = matchPatterns(patterns, ctx);
	console.assert(results.length === 6, 'matchPatterns: default limit 6');
	console.log('PASS: matchPatterns default limit 6');
}

// always condition passes without active doc
{
	const ctxEmpty = makeCtx();
	const pattern = makePattern({
		id: 'always1',
		template: 'Search in {vaultName}',
		variables: ['vaultName'],
		conditions: { always: true },
		usage_count: 1,
	});
	const results = matchPatterns([pattern], ctxEmpty);
	console.assert(results.length === 1, 'matchPatterns: always passes');
	console.assert(
		results[0].filledTemplate === 'Search in TestVault',
		'matchPatterns: always fills vaultName',
	);
	console.log('PASS: matchPatterns always condition');
}

// contextType inference
{
	const { inferContextType } = require('../src/service/context/PatternMatcher');
	console.assert(inferContextType(['activeDocumentTitle']) === 'activeDoc', 'inferContextType: activeDoc');
	console.assert(inferContextType(['outgoingLinks']) === 'outlinks', 'inferContextType: outlinks');
	console.assert(inferContextType(['backlinks']) === 'backlinks', 'inferContextType: backlinks');
	console.assert(inferContextType(['documentTags']) === 'tags', 'inferContextType: tags');
	console.assert(inferContextType(['currentFolder']) === 'folder', 'inferContextType: folder');
	console.assert(inferContextType(['recentDocuments']) === 'recent', 'inferContextType: recent');
	console.assert(inferContextType(['vaultName']) === 'general', 'inferContextType: general');
	console.log('PASS: inferContextType variants');
}

console.log('\nAll tests passed.');
