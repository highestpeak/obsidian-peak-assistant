/**
 * AI Query Rewrite (Suggest) — unit tests for the parts that don't depend on
 * a live Obsidian App, ProfileRegistry, or LLM. The recorder + LLM call live
 * behind Zustand + streaming provider mocks that aren't worth setting up
 * here, so we cover:
 *
 *   1. Zod schema — accepts good LLM output, rejects malformed
 *   2. `parseLLMJson` — strips ```json fences, handles bare JSON, throws on
 *      truly broken input
 *   3. `buildRuleBasedCandidates` — the fallback path used when the LLM
 *      fails 2 attempts. Guards the "always give the user something to click"
 *      contract.
 */

import assert from 'assert';
import {
	QueryRewriteResponseSchema,
	type BehaviorContextPayload,
} from '@/core/schemas/queryRewrite';
import {
	buildRuleBasedCandidates,
	parseLLMJson,
} from '@/ui/view/quick-search/rewrite/AIQueryRewriteService';

function makePayload(over: Partial<BehaviorContextPayload> = {}): BehaviorContextPayload {
	return {
		currentQuery: 'attention',
		activeFilePath: null,
		currentResultView: 'list',
		recentQueries: [],
		recentOpenedFiles: [],
		pinnedResultDocIds: null,
		sessionEvents: [],
		knownTopFolders: [],
		firstScreenResults: [],
		...over,
	};
}

// ── 1. Zod schema ───────────────────────────────────────────────────────────

const goodResponse = {
	candidates: [
		{ title: 'A', query: 'x', reason: 'because y' },
		{ title: 'B', query: '"foo" folder:x', reason: 'you hovered x' },
	],
};

const good = QueryRewriteResponseSchema.safeParse(goodResponse);
assert.strictEqual(good.success, true, 'good response should parse');

const missingReason = QueryRewriteResponseSchema.safeParse({
	candidates: [{ title: 'A', query: 'x' }],
});
assert.strictEqual(missingReason.success, false, 'missing reason should fail schema');

const emptyCandidates = QueryRewriteResponseSchema.safeParse({ candidates: [] });
assert.strictEqual(emptyCandidates.success, false, 'zero candidates should fail schema');

const tooMany = QueryRewriteResponseSchema.safeParse({
	candidates: Array.from({ length: 6 }, () => ({ title: 'A', query: 'x', reason: 'y' })),
});
assert.strictEqual(tooMany.success, false, '6 candidates should fail schema (max is 5)');

// ── 2. parseLLMJson ─────────────────────────────────────────────────────────

const fenced = '```json\n{"candidates":[{"title":"A","query":"x","reason":"y"}]}\n```';
const parsedFenced = parseLLMJson(fenced) as { candidates: unknown[] };
assert.deepStrictEqual(parsedFenced.candidates.length, 1, 'fenced JSON should strip ``` and parse');

const bareFence = '```\n{"a":1}\n```';
const parsedBare = parseLLMJson(bareFence) as { a: number };
assert.strictEqual(parsedBare.a, 1, 'unlabeled fence should also strip');

const noFence = '{"b":2}';
const parsedNoFence = parseLLMJson(noFence) as { b: number };
assert.strictEqual(parsedNoFence.b, 2, 'raw JSON should parse');

const withPrefix = '  \n\n{"c":3}\n';
const parsedPrefix = parseLLMJson(withPrefix) as { c: number };
assert.strictEqual(parsedPrefix.c, 3, 'leading whitespace should be tolerated');

assert.throws(() => parseLLMJson('not json at all'), 'malformed input should throw');

// ── 3. buildRuleBasedCandidates ─────────────────────────────────────────────

// (a) Empty context → empty output (do not fabricate).
const emptyFallback = buildRuleBasedCandidates(null, makePayload({ currentQuery: '' }));
assert.strictEqual(emptyFallback.length, 0, 'empty context yields no rule-based candidates');

// (b) With active file → produces active-folder candidate.
const withActive = buildRuleBasedCandidates(null, makePayload({
	activeFilePath: 'kb1-life-notes/D-26/note.md',
}));
assert.ok(withActive.length >= 1, 'active file alone still yields at least one candidate');
assert.ok(
	withActive.some((c) => c.query.includes('folder:kb1-life-notes/D-26')),
	'active-folder candidate should include the folder prefix',
);

// (c) With browsed folders (from session events) → dedicated candidate.
const withBrowse = buildRuleBasedCandidates(null, makePayload({
	currentQuery: 'attention',
	sessionEvents: [
		{ t: 1, kind: 'expandedFolder', path: '200 Areas/research' },
		{ t: 2, kind: 'focusedFile', path: '200 Areas/research/note.md' },
	],
}));
assert.ok(
	withBrowse.some((c) => c.query.includes('folder:200 Areas/research')),
	'browsed folder should surface as folder: candidate',
);

// (d) With recent queries → AND-combined variant surfaces.
const withRecent = buildRuleBasedCandidates(null, makePayload({
	currentQuery: 'attention',
	recentQueries: ['hubdiscover'],
}));
assert.ok(
	withRecent.some((c) => c.query.includes('hubdiscover')),
	'recent query should combine into a candidate',
);

// (e) Duplicate-query dedup: same underlying query should not appear twice.
const dedup = buildRuleBasedCandidates(null, makePayload({
	currentQuery: 'attention',
	activeFilePath: 'a/b.md',
	sessionEvents: [{ t: 1, kind: 'expandedFolder', path: 'a' }],
}));
const queries = dedup.map((c) => c.query);
assert.strictEqual(
	new Set(queries).size,
	queries.length,
	'rule-based candidates should not include duplicate queries',
);

// (f) Cap at 3 candidates max.
assert.ok(dedup.length <= 3, 'never emit more than 3 rule-based candidates');

console.log('ai-query-rewrite.test.ts: all assertions passed');
