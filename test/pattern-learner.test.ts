// T11Y-7e: pure-port unit test for PatternLearningService.
//
// Verifies the policy lifted out of SqliteAmbientPersistenceAdapter:
//   - default cache duration, lookback days, minimum occurrences are
//     forwarded to the read port verbatim.
//   - strength formula `count * avgScore` is applied per pair.
//   - cache is reused when fresh and re-fetched after expiry.
//   - invalidateCache forces a re-fetch on the next call.
//   - findRecurringPairs throwing is swallowed (stale cache or
//     empty array returned).

import { strict as assert } from 'node:assert';
import {
	PATTERN_LOOKBACK_DAYS,
	PATTERN_MIN_OCCURRENCES,
	PATTERN_REFRESH_INTERVAL_MS,
	PatternLearningService,
} from '@/service/ambient/PatternLearningService';
import type {
	AmbientPushPatternReadPort,
	RecurringPushPair,
} from '@/core/ports/AmbientPushPatternReadPort';

interface PortStats {
	calls: Array<{ withinDays: number; minCount: number }>;
}

function makePort(
	pairs: RecurringPushPair[] | (() => RecurringPushPair[] | Promise<RecurringPushPair[]>),
	stats: PortStats,
): AmbientPushPatternReadPort {
	return {
		async findRecurringPairs(withinDays, minCount) {
			stats.calls.push({ withinDays, minCount });
			if (typeof pairs === 'function') return pairs();
			return pairs;
		},
	};
}

async function run(): Promise<void> {
	// ---------------------------------------------------------------
	// Test 1: defaults forwarded + strength = count * avgScore.
	// ---------------------------------------------------------------
	{
		const pairs: RecurringPushPair[] = [
			{ sourceFilePath: 'a.md', pushedFilePath: 'x.md', count: 5, avgScore: 0.8 },
			{ sourceFilePath: 'b.md', pushedFilePath: 'y.md', count: 3, avgScore: 0.4 },
		];
		const stats: PortStats = { calls: [] };
		const svc = new PatternLearningService(makePort(pairs, stats), () => 1_000_000);
		const out = await svc.getLearnedPatterns();
		assert.equal(stats.calls.length, 1);
		assert.equal(stats.calls[0].withinDays, PATTERN_LOOKBACK_DAYS);
		assert.equal(stats.calls[0].minCount, PATTERN_MIN_OCCURRENCES);
		assert.equal(out.length, 2);
		assert.equal(out[0].sourceFilePath, 'a.md');
		assert.equal(out[0].pushedFilePath, 'x.md');
		assert.equal(out[0].strength, 5 * 0.8);
		assert.equal(out[1].strength, 3 * 0.4);
		console.log('PASS: defaults forwarded + strength formula');
	}

	// ---------------------------------------------------------------
	// Test 2: cache reused within refresh interval, refetched after.
	// ---------------------------------------------------------------
	{
		let now = 1_000_000;
		let resultPairs: RecurringPushPair[] = [
			{ sourceFilePath: 'a.md', pushedFilePath: 'x.md', count: 1, avgScore: 1 },
		];
		const stats: PortStats = { calls: [] };
		const svc = new PatternLearningService(makePort(() => resultPairs, stats), () => now);

		const first = await svc.getLearnedPatterns();
		assert.equal(first.length, 1);
		assert.equal(stats.calls.length, 1);

		// Within refresh interval — port not hit, cached value returned.
		now += PATTERN_REFRESH_INTERVAL_MS - 1;
		resultPairs = [
			{ sourceFilePath: 'a.md', pushedFilePath: 'x.md', count: 9, avgScore: 9 },
		];
		const cached = await svc.getLearnedPatterns();
		assert.equal(stats.calls.length, 1, 'cache hit, no second port call');
		assert.equal(cached[0].strength, 1, 'cached strength unchanged');

		// After interval — port hit again, fresh value returned.
		now += 2;
		const fresh = await svc.getLearnedPatterns();
		assert.equal(stats.calls.length, 2);
		assert.equal(fresh[0].strength, 81);
		console.log('PASS: cache TTL');
	}

	// ---------------------------------------------------------------
	// Test 3: invalidateCache forces a re-fetch on next call.
	// ---------------------------------------------------------------
	{
		let now = 1_000_000;
		let pairs: RecurringPushPair[] = [
			{ sourceFilePath: 'a.md', pushedFilePath: 'x.md', count: 2, avgScore: 2 },
		];
		const stats: PortStats = { calls: [] };
		const svc = new PatternLearningService(makePort(() => pairs, stats), () => now);
		await svc.getLearnedPatterns();
		assert.equal(stats.calls.length, 1);

		// Without invalidate, cache holds.
		const cachedAgain = await svc.getLearnedPatterns();
		assert.equal(stats.calls.length, 1);
		assert.equal(cachedAgain[0].strength, 4);

		// invalidate forces refresh on next call.
		svc.invalidateCache();
		pairs = [
			{ sourceFilePath: 'a.md', pushedFilePath: 'x.md', count: 3, avgScore: 3 },
		];
		const refreshed = await svc.getLearnedPatterns();
		assert.equal(stats.calls.length, 2);
		assert.equal(refreshed[0].strength, 9);
		console.log('PASS: invalidateCache forces refresh');
	}

	// ---------------------------------------------------------------
	// Test 4: throwing port — stale cache preserved, empty otherwise.
	// ---------------------------------------------------------------
	{
		let now = 1_000_000;
		let shouldThrow = false;
		const port: AmbientPushPatternReadPort = {
			async findRecurringPairs(withinDays, minCount) {
				if (shouldThrow) throw new Error('sqlite not ready');
				return [
					{ sourceFilePath: 'a.md', pushedFilePath: 'x.md', count: 2, avgScore: 2 },
				];
			},
		};
		const svc = new PatternLearningService(port, () => now);
		const ok = await svc.getLearnedPatterns();
		assert.equal(ok[0].strength, 4);

		shouldThrow = true;
		svc.invalidateCache();
		now += 1; // ensure cache TTL is no longer the gating reason
		const recovered = await svc.getLearnedPatterns();
		// Stale cache preserved on throw (matches pre-refactor behavior).
		assert.equal(recovered.length, 1);
		assert.equal(recovered[0].strength, 4);
		console.log('PASS: throw preserves stale cache');

		// Empty initial result on throw — same code path but with no
		// prior successful fetch.
		const fresh = new PatternLearningService(
			{
				async findRecurringPairs() {
					throw new Error('boom');
				},
			},
			() => now,
		);
		const out = await fresh.getLearnedPatterns();
		assert.deepEqual(out, [], 'no prior cache → empty array');
		console.log('PASS: throw on first call → empty array');
	}

	// ---------------------------------------------------------------
	// Test 5: constructor overrides for window/min/cache duration.
	// ---------------------------------------------------------------
	{
		const stats: PortStats = { calls: [] };
		const svc = new PatternLearningService(
			makePort([], stats),
			() => 0,
			999, // custom cache duration
			14, // custom lookback days
			5, // custom min occurrences
		);
		await svc.getLearnedPatterns();
		assert.equal(stats.calls[0].withinDays, 14);
		assert.equal(stats.calls[0].minCount, 5);
		console.log('PASS: constructor overrides');
	}

	console.log('pattern-learner.test: all passed');
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
