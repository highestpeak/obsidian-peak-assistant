// T11Y-2b: pure-port unit test for BriefingItemBuilder.
//
// Stubs `AmbientBriefingReadPort` with deterministic rows and verifies:
//   - unresolved_connections imbalance rule (incoming>=2 && outgoing < incoming/2)
//   - changed_hubs straight projection
//   - decaying_engagement reason text branches (lastOpen=0 → "never opened")
//   - cutoff arithmetic (now - 14 days)
//   - per-category cap (max 5)
//   - delegated timestamp methods

import { strict as assert } from 'node:assert';
import type {
	AmbientBriefingReadPort,
	BriefingCandidateRow,
	BriefingDecayingRow,
	BriefingHubRow,
} from '@/core/ports/AmbientBriefingReadPort';
import {
	BriefingItemBuilder,
	BRIEFING_DECAY_DAYS,
	BRIEFING_MAX_ITEMS_PER_CATEGORY,
} from '@/service/ambient/briefing/BriefingItemBuilder';

const DAY_MS = 24 * 60 * 60 * 1000;

interface StubInputs {
	candidates: BriefingCandidateRow[];
	hubs: BriefingHubRow[];
	decaying: BriefingDecayingRow[];
	expectedCutoff?: number;
	expectedChangedLimit?: number;
	expectedDecayingLimit?: number;
	expectedHubLimit?: number;
	expectedSinceTs?: number;
	lastBriefing?: number;
	lastSession?: number | null;
}

interface StubRecord {
	listChangedCandidatesCalls: Array<{ sinceTs: number; limit: number }>;
	listChangedHubsCalls: Array<{ sinceTs: number; limit: number }>;
	listDecayingCandidatesCalls: Array<{ cutoffTs: number; limit: number }>;
	recordSessionCalls: number[];
}

function makeStub(input: StubInputs): {
	port: AmbientBriefingReadPort;
	record: StubRecord;
} {
	const record: StubRecord = {
		listChangedCandidatesCalls: [],
		listChangedHubsCalls: [],
		listDecayingCandidatesCalls: [],
		recordSessionCalls: [],
	};
	const port: AmbientBriefingReadPort = {
		isReady: () => true,
		getLastBriefingTimestamp: async () => input.lastBriefing ?? 0,
		getLastSessionTimestamp: async (fallback) =>
			input.lastSession === undefined ? fallback : input.lastSession ?? fallback,
		recordSessionTimestamps: async (now) => {
			record.recordSessionCalls.push(now);
		},
		listChangedCandidates: async (sinceTs, limit) => {
			record.listChangedCandidatesCalls.push({ sinceTs, limit });
			return input.candidates;
		},
		listChangedHubs: async (sinceTs, limit) => {
			record.listChangedHubsCalls.push({ sinceTs, limit });
			return input.hubs;
		},
		listDecayingCandidates: async (cutoffTs, limit) => {
			record.listDecayingCandidatesCalls.push({ cutoffTs, limit });
			return input.decaying;
		},
	};
	return { port, record };
}

async function run(): Promise<void> {
	const FIXED_NOW = 10_000_000_000; // arbitrary
	const lastSession = FIXED_NOW - 3 * DAY_MS;

	// ---------------------------------------------------------------------------
	// Test 1: unresolved-connection imbalance rule
	// ---------------------------------------------------------------------------
	{
		const candidates: BriefingCandidateRow[] = [
			// Should match: incoming 3, outgoing 1 (< 1.5)
			{ path: 'a.md', label: 'A', mtime: FIXED_NOW - 1000, docIncomingCnt: 3, docOutgoingCnt: 1, pagerank: 0.1 },
			// Should NOT match: incoming 1 (< 2)
			{ path: 'b.md', label: 'B', mtime: FIXED_NOW - 2000, docIncomingCnt: 1, docOutgoingCnt: 0, pagerank: 0.1 },
			// Should NOT match: outgoing 2 == 4*0.5 (not strict <)
			{ path: 'c.md', label: 'C', mtime: FIXED_NOW - 3000, docIncomingCnt: 4, docOutgoingCnt: 2, pagerank: 0.1 },
			// Should match: incoming 5, outgoing 0
			{ path: 'd.md', label: 'D', mtime: FIXED_NOW - 4000, docIncomingCnt: 5, docOutgoingCnt: 0, pagerank: 0.1 },
		];
		const { port, record } = makeStub({ candidates, hubs: [], decaying: [] });
		const builder = new BriefingItemBuilder(port, () => FIXED_NOW);
		const items = await builder.loadBriefingItems(lastSession);

		assert.equal(items.length, 2, 'two matched candidates');
		assert.equal(items[0].filePath, 'a.md');
		assert.equal(items[0].category, 'unresolved_connections');
		assert.equal(items[0].reason, '3 notes link here, but only 1 outgoing links');
		assert.equal(items[0].score, 2);
		assert.equal(items[0].metadata?.connectionCount, 3);
		assert.equal(items[1].filePath, 'd.md');
		assert.equal(items[1].score, 5);

		// Verify limit*3 over-fetch
		assert.equal(record.listChangedCandidatesCalls.length, 1);
		assert.equal(
			record.listChangedCandidatesCalls[0].limit,
			BRIEFING_MAX_ITEMS_PER_CATEGORY * 3,
		);
		assert.equal(record.listChangedCandidatesCalls[0].sinceTs, lastSession);
		console.log('PASS: unresolved-connection imbalance rule');
	}

	// ---------------------------------------------------------------------------
	// Test 2: changed_hubs straight projection + label strip
	// ---------------------------------------------------------------------------
	{
		const hubs: BriefingHubRow[] = [
			{ path: 'hubs/Topic.md', label: 'Topic.md', updatedAt: FIXED_NOW - 5000 },
			{ path: 'hubs/Other.md', label: 'Other', updatedAt: FIXED_NOW - 6000 },
		];
		const { port, record } = makeStub({ candidates: [], hubs, decaying: [] });
		const builder = new BriefingItemBuilder(port, () => FIXED_NOW);
		const items = await builder.loadBriefingItems(lastSession);

		assert.equal(items.length, 2);
		assert.equal(items[0].category, 'changed_hubs');
		assert.equal(items[0].title, 'Topic', 'strip .md from label');
		assert.equal(items[0].reason, 'Hub summary updated since your last session');
		assert.equal(items[0].score, 1);
		assert.equal(items[1].title, 'Other');
		assert.equal(record.listChangedHubsCalls[0].limit, BRIEFING_MAX_ITEMS_PER_CATEGORY);
		assert.equal(record.listChangedHubsCalls[0].sinceTs, lastSession);
		console.log('PASS: changed_hubs projection');
	}

	// ---------------------------------------------------------------------------
	// Test 3: decaying_engagement reason text + cutoff arithmetic
	// ---------------------------------------------------------------------------
	{
		const decaying: BriefingDecayingRow[] = [
			{ path: 'old.md', label: 'Old', pagerank: 0.8, lastOpenTs: FIXED_NOW - 30 * DAY_MS },
			{ path: 'never.md', label: 'Never', pagerank: 0.5, lastOpenTs: null },
			{ path: 'never2.md', label: 'Never2', pagerank: 0.3, lastOpenTs: 0 },
		];
		const { port, record } = makeStub({ candidates: [], hubs: [], decaying });
		const builder = new BriefingItemBuilder(port, () => FIXED_NOW);
		const items = await builder.loadBriefingItems(lastSession);

		assert.equal(items.length, 3);
		assert.equal(items[0].category, 'decaying_engagement');
		assert.equal(items[0].reason, 'High importance note, not opened in 30 days');
		assert.equal(items[0].metadata?.daysSinceOpened, 30);
		assert.equal(items[0].score, 0.8);

		assert.equal(items[1].reason, 'High importance note, never opened via Peak');
		assert.equal(items[1].metadata?.daysSinceOpened, undefined);
		assert.equal(items[2].reason, 'High importance note, never opened via Peak');

		// Cutoff = now - 14 days
		const expectedCutoff = FIXED_NOW - BRIEFING_DECAY_DAYS * DAY_MS;
		assert.equal(record.listDecayingCandidatesCalls[0].cutoffTs, expectedCutoff);
		assert.equal(record.listDecayingCandidatesCalls[0].limit, BRIEFING_MAX_ITEMS_PER_CATEGORY);
		console.log('PASS: decaying_engagement reason + cutoff');
	}

	// ---------------------------------------------------------------------------
	// Test 4: imbalance category capped at limit even with many matches
	// ---------------------------------------------------------------------------
	{
		const candidates: BriefingCandidateRow[] = Array.from({ length: 20 }).map((_, i) => ({
			path: `n${i}.md`,
			label: `N${i}`,
			mtime: FIXED_NOW - i * 1000,
			docIncomingCnt: 5,
			docOutgoingCnt: 0,
			pagerank: 0.1,
		}));
		const { port } = makeStub({ candidates, hubs: [], decaying: [] });
		const builder = new BriefingItemBuilder(port, () => FIXED_NOW);
		const items = await builder.loadBriefingItems(lastSession);
		assert.equal(items.length, BRIEFING_MAX_ITEMS_PER_CATEGORY, 'capped at 5');
		console.log('PASS: per-category cap');
	}

	// ---------------------------------------------------------------------------
	// Test 5: timestamp delegation
	// ---------------------------------------------------------------------------
	{
		const { port, record } = makeStub({
			candidates: [],
			hubs: [],
			decaying: [],
			lastBriefing: 999,
			lastSession: 888,
		});
		const builder = new BriefingItemBuilder(port, () => FIXED_NOW);
		assert.equal(builder.isReady(), true);
		assert.equal(await builder.getLastBriefingTimestamp(), 999);
		assert.equal(await builder.getLastSessionTimestamp(0), 888);
		await builder.recordSessionTimestamps(FIXED_NOW);
		assert.deepEqual(record.recordSessionCalls, [FIXED_NOW]);
		console.log('PASS: timestamp delegation');
	}

	console.log('briefing-item-builder.test: all passed');
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
