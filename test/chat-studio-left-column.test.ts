/**
 * Track B — Chat Studio left column pure-logic guards.
 *
 * Covers the extractable rules used by the shell + left column:
 *   - Time-bucket grouping (Today / Yesterday / This week / Earlier).
 *   - Pinned vs Recent split (dedupe by id, Pinned wins, pinnedAt desc).
 *   - View-all picker filter (title + canonical type, AND semantics, reset).
 *   - Layout width clamp / persistence codec round-trip.
 *   - Responsive collapse decision at wide vs narrow container widths.
 */

import assert from 'assert';
import {
	RECENT_BUCKET_ORDER,
	timeBucket,
	splitPinnedAndRecent,
	DEFAULT_VIEW_ALL_FILTER,
	applyViewAllFilter,
	conversationKind,
	clampWidth,
	LEFT_LIMITS,
	RIGHT_LIMITS,
	encodeLayoutPreference,
	decodeLayoutPreference,
	decideResponsiveCollapse,
	STUDIO_NARROW_BREAKPOINT_PX,
	DEFAULT_LAYOUT_PREFERENCE,
} from '@/ui/view/chat-studio-view/chatStudioLeftLogic';

// ---------------------------------------------------------------------------
// timeBucket
// ---------------------------------------------------------------------------

function testTimeBucket(): void {
	const now = new Date('2026-07-15T10:00:00Z').getTime();
	assert.strictEqual(timeBucket(0, now), 'Earlier', 'missing ts → Earlier');
	// Same day (any moment after midnight of that day)
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	assert.strictEqual(timeBucket(startOfToday.getTime() + 60_000, now), 'Today');
	assert.strictEqual(timeBucket(now, now), 'Today');
	// Yesterday: ts is <1 day before start-of-today
	const yTs = startOfToday.getTime() - 60_000;
	assert.strictEqual(timeBucket(yTs, now), 'Yesterday');
	// This week: 3 days ago
	const wTs = startOfToday.getTime() - 3 * 86_400_000;
	assert.strictEqual(timeBucket(wTs, now), 'This week');
	// Earlier: 10 days ago
	const eTs = startOfToday.getTime() - 10 * 86_400_000;
	assert.strictEqual(timeBucket(eTs, now), 'Earlier');
	assert.deepStrictEqual(
		RECENT_BUCKET_ORDER.slice(),
		['Today', 'Yesterday', 'This week', 'Earlier'],
		'bucket order stable'
	);
	console.log('PASS: timeBucket');
}

// ---------------------------------------------------------------------------
// splitPinnedAndRecent — L-PIN-01 dedupe + ordering
// ---------------------------------------------------------------------------

function testSplitPinnedAndRecent(): void {
	const items = [
		{ id: 'a', pinned: false, pinnedAt: undefined },
		{ id: 'b', pinned: true, pinnedAt: 200 },
		{ id: 'c', pinned: false, pinnedAt: undefined },
		{ id: 'd', pinned: true, pinnedAt: 100 },
		{ id: 'e', pinned: true, pinnedAt: 300 },
	];
	const { pinned, recent } = splitPinnedAndRecent(items);
	assert.deepStrictEqual(pinned.map((p) => p.id), ['e', 'b', 'd'], 'pinned sorted by pinnedAt desc');
	assert.deepStrictEqual(recent.map((r) => r.id), ['a', 'c'], 'recent excludes all pinned ids');
	// Nothing pinned
	const noPin = splitPinnedAndRecent([{ id: 'x' }, { id: 'y' }]);
	assert.strictEqual(noPin.pinned.length, 0);
	assert.strictEqual(noPin.recent.length, 2);
	// Missing pinnedAt sorts consistently (both 0)
	const tie = splitPinnedAndRecent([
		{ id: 'p1', pinned: true },
		{ id: 'p2', pinned: true },
	]);
	assert.strictEqual(tie.pinned.length, 2);
	console.log('PASS: splitPinnedAndRecent');
}

// ---------------------------------------------------------------------------
// applyViewAllFilter — L-RECENT-03 AND semantics + reset
// ---------------------------------------------------------------------------

function testApplyViewAllFilter(): void {
	const rows = [
		{ id: '1', title: 'Alpha plan', conversationType: { kind: 'plan' as const } },
		{ id: '2', title: 'Beta chat', conversationType: { kind: 'chat' as const } },
		{ id: '3', title: 'Alpha canvas', conversationType: { kind: 'canvas' as const } },
		{ id: '4', title: 'Untyped chat' }, // no conversationType → defaults to 'chat'
	];
	// All + no query → all rows.
	const all = applyViewAllFilter(rows, DEFAULT_VIEW_ALL_FILTER);
	assert.strictEqual(all.length, 4);
	// Query only (case-insensitive)
	const alpha = applyViewAllFilter(rows, { query: 'alpha', typeKind: 'all' });
	assert.deepStrictEqual(alpha.map((r) => r.id), ['1', '3']);
	// Type only
	const plans = applyViewAllFilter(rows, { query: '', typeKind: 'plan' });
	assert.deepStrictEqual(plans.map((r) => r.id), ['1']);
	// AND semantics — query + type must both match
	const alphaChats = applyViewAllFilter(rows, { query: 'alpha', typeKind: 'chat' });
	assert.strictEqual(alphaChats.length, 0);
	// Untyped meta defaults to 'chat'
	const chats = applyViewAllFilter(rows, { query: '', typeKind: 'chat' });
	assert.deepStrictEqual(chats.map((r) => r.id), ['2', '4']);
	// conversationKind fallback
	assert.strictEqual(conversationKind({ }), 'chat');
	assert.strictEqual(conversationKind({ conversationType: { kind: 'agent' } }), 'agent');
	console.log('PASS: applyViewAllFilter');
}

// ---------------------------------------------------------------------------
// clampWidth + persistence codec round-trip
// ---------------------------------------------------------------------------

function testClampAndCodec(): void {
	assert.strictEqual(clampWidth(0, LEFT_LIMITS), LEFT_LIMITS.min);
	assert.strictEqual(clampWidth(9999, LEFT_LIMITS), LEFT_LIMITS.max);
	assert.strictEqual(clampWidth(NaN, LEFT_LIMITS), LEFT_LIMITS.default);
	assert.strictEqual(clampWidth(240.6, RIGHT_LIMITS), 241);

	const encoded = encodeLayoutPreference({
		leftWidth: 1000,
		rightWidth: 100,
		leftCollapsed: true,
		rightCollapsed: false,
	});
	const decoded = decodeLayoutPreference(encoded);
	assert.strictEqual(decoded.leftWidth, LEFT_LIMITS.max, 'encoder clamps to max');
	assert.strictEqual(decoded.rightWidth, RIGHT_LIMITS.min, 'encoder clamps to min');
	assert.strictEqual(decoded.leftCollapsed, true);
	assert.strictEqual(decoded.rightCollapsed, false);
	// Malformed / missing input → defaults
	assert.deepStrictEqual(decodeLayoutPreference(null), DEFAULT_LAYOUT_PREFERENCE);
	assert.deepStrictEqual(decodeLayoutPreference(''), DEFAULT_LAYOUT_PREFERENCE);
	assert.deepStrictEqual(decodeLayoutPreference('not-json'), DEFAULT_LAYOUT_PREFERENCE);
	console.log('PASS: clampAndCodec');
}

// ---------------------------------------------------------------------------
// decideResponsiveCollapse — SHELL-02 breakpoint behaviour
// ---------------------------------------------------------------------------

function testResponsiveCollapse(): void {
	const pref = { ...DEFAULT_LAYOUT_PREFERENCE };
	// Wide container: user preference passes through unchanged, no drawer.
	const wide = decideResponsiveCollapse(1728, pref);
	assert.strictEqual(wide.rightCollapsed, pref.rightCollapsed);
	assert.strictEqual(wide.leftForcedDrawer, false);
	// Right stays user-controlled even at breakpoint boundary.
	const atBreak = decideResponsiveCollapse(STUDIO_NARROW_BREAKPOINT_PX, pref);
	assert.strictEqual(atBreak.leftForcedDrawer, false);
	assert.strictEqual(atBreak.rightCollapsed, pref.rightCollapsed);
	// Below breakpoint: right auto-collapses; left stays visible until it can't fit.
	const narrow = decideResponsiveCollapse(STUDIO_NARROW_BREAKPOINT_PX - 1, pref);
	assert.strictEqual(narrow.rightCollapsed, true, 'right auto-collapses first');
	// Very narrow: left becomes a drawer (min-middle 440 + LEFT.min 200 = 640).
	const veryNarrow = decideResponsiveCollapse(500, pref);
	assert.strictEqual(veryNarrow.leftForcedDrawer, true, 'left becomes drawer when nothing else fits');
	console.log('PASS: responsiveCollapse');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function run(): void {
	testTimeBucket();
	testSplitPinnedAndRecent();
	testApplyViewAllFilter();
	testClampAndCodec();
	testResponsiveCollapse();
	console.log('chat-studio-left-column: all guards passed');
}

run();
