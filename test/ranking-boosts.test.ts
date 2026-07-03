import assert from 'assert';
import { computeRankingBoostFinalScore } from '@/service/search/query/rankingBoosts';
import {
	INDEX_SEARCH_HUB_INCOMING_BOOST,
	INDEX_SEARCH_SECONDARY_INCOMING_BOOST,
	INDEX_SEARCH_HUB_DOC_TYPE_BOOST,
	PPR_GLOBAL_PR_DAMPENING,
} from '@/core/constant';
import type { DocRankingSignal } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';

const NOW = new Date('2026-07-01T00:00:00Z').getTime();
const DAY = 1000 * 60 * 60 * 24;

function baseSignal(overrides: Partial<DocRankingSignal> = {}): DocRankingSignal {
	return {
		lastOpenTs: 0,
		openCount: 0,
		docIncomingCnt: 0,
		...overrides,
	};
}

function approx(a: number, b: number, epsilon = 1e-9): void {
	assert.ok(Math.abs(a - b) < epsilon, `expected ${a} ≈ ${b}`);
}

function testMissingSignalReturnsBase() {
	const score = computeRankingBoostFinalScore({
		base: 0.5,
		signal: undefined,
		relatedToCurrentFile: false,
		clicked: false,
		pprActive: false,
		nowTs: NOW,
	});
	assert.strictEqual(score, 0.5, 'no signal → base unchanged');
	console.log('[ranking-boosts] missing signal: PASS');
}

function testWorkedExampleAllBoosts() {
	// Worked example: a bookmarked hub-tier doc opened yesterday, related to the
	// current file, clicked this session. openCount = 9 → log1p(9) * 0.10 = 0.2302585...
	// recency: 1 day since open → 0.2 - 0.005 = 0.195
	// graph: related → +0.2
	// hub tier=hub, PR ready → +INDEX_SEARCH_HUB_INCOMING_BOOST (0.08)
	// click → +0.15
	// hub_doc type → +INDEX_SEARCH_HUB_DOC_TYPE_BOOST (0.12)
	const signal: DocRankingSignal = baseSignal({
		openCount: 9,
		lastOpenTs: NOW - DAY,
		hubTier: 'hub',
		pagerankVersion: 1,
		mobiusNodeType: 'hub_doc',
	});

	const score = computeRankingBoostFinalScore({
		base: 0.5,
		signal,
		relatedToCurrentFile: true,
		clicked: true,
		pprActive: false,
		nowTs: NOW,
	});

	const expected =
		0.5
		+ Math.log1p(9) * 0.10
		+ (0.2 - 0.005)
		+ 0.2
		+ INDEX_SEARCH_HUB_INCOMING_BOOST
		+ 0.15
		+ INDEX_SEARCH_HUB_DOC_TYPE_BOOST;

	approx(score, expected);
	console.log('[ranking-boosts] worked example (all boosts on): PASS');
}

function testRecencyDecaysToZeroAfter40Days() {
	const signal = baseSignal({ lastOpenTs: NOW - 40 * DAY });
	const score = computeRankingBoostFinalScore({
		base: 0.5,
		signal,
		relatedToCurrentFile: false,
		clicked: false,
		pprActive: false,
		nowTs: NOW,
	});
	assert.strictEqual(score, 0.5, 'recency saturates at 0 past 40 days');
	console.log('[ranking-boosts] recency decay: PASS');
}

function testNeverOpenedGivesNoRecencyBoost() {
	// lastOpenTs = 0 (never opened) triggers the Infinity branch → recency=0.
	const signal = baseSignal({ lastOpenTs: 0, openCount: 0 });
	const score = computeRankingBoostFinalScore({
		base: 0.7,
		signal,
		relatedToCurrentFile: false,
		clicked: false,
		pprActive: false,
		nowTs: NOW,
	});
	assert.strictEqual(score, 0.7, 'never-opened doc gets no recency boost');
	console.log('[ranking-boosts] never-opened doc: PASS');
}

function testHubTierByIncomingCountFallbackWhenPagerankMissing() {
	// pagerankVersion undefined → fall back to docIncomingCnt threshold.
	const secondary = computeRankingBoostFinalScore({
		base: 0,
		signal: baseSignal({ docIncomingCnt: 3 }),
		relatedToCurrentFile: false,
		clicked: false,
		pprActive: false,
		nowTs: NOW,
	});
	approx(secondary, INDEX_SEARCH_SECONDARY_INCOMING_BOOST);

	const hub = computeRankingBoostFinalScore({
		base: 0,
		signal: baseSignal({ docIncomingCnt: 10 }),
		relatedToCurrentFile: false,
		clicked: false,
		pprActive: false,
		nowTs: NOW,
	});
	approx(hub, INDEX_SEARCH_HUB_INCOMING_BOOST);

	console.log('[ranking-boosts] incoming-count fallback tiers: PASS');
}

function testPprDampensAnchorBoost() {
	const signal = baseSignal({
		hubTier: 'hub',
		pagerankVersion: 1,
	});
	const withPPR = computeRankingBoostFinalScore({
		base: 0,
		signal,
		relatedToCurrentFile: false,
		clicked: false,
		pprActive: true,
		nowTs: NOW,
	});
	approx(withPPR, INDEX_SEARCH_HUB_INCOMING_BOOST * PPR_GLOBAL_PR_DAMPENING);
	console.log('[ranking-boosts] PPR dampens anchor: PASS');
}

function testHubTierNoneExplicitlyZeroesAnchorEvenWithHighIncoming() {
	// Bad-case: pagerank says 'none' even though incoming count is high.
	// Persisted PR overrides the incoming-count heuristic.
	const signal = baseSignal({
		docIncomingCnt: 100,
		hubTier: 'none',
		pagerankVersion: 1,
	});
	const score = computeRankingBoostFinalScore({
		base: 0,
		signal,
		relatedToCurrentFile: false,
		clicked: false,
		pprActive: false,
		nowTs: NOW,
	});
	assert.strictEqual(score, 0, "hubTier='none' beats high docIncomingCnt");
	console.log('[ranking-boosts] hubTier=none overrides high incoming: PASS');
}

testMissingSignalReturnsBase();
testWorkedExampleAllBoosts();
testRecencyDecaysToZeroAfter40Days();
testNeverOpenedGivesNoRecencyBoost();
testHubTierByIncomingCountFallbackWhenPagerankMissing();
testPprDampensAnchorBoost();
testHubTierNoneExplicitlyZeroesAnchorEvenWithHighIncoming();
