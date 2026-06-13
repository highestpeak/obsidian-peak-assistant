// T8: fake-port tests for `AmbientPushRuntime`.
//
// The runtime is constructed with `new AmbientPushRuntime(ports)` and
// every port is supplied by a hand-rolled fake. No Obsidian, no
// sqlite, no UI store. These tests are what `test/ambient-push.test.ts`
// previously could not assert because the runtime reached singletons
// at runtime: now we can validate trigger semantics, projection
// targets, LLM cooldown, briefing gating, and pattern-cache
// invalidation against the actual class.

import assert from 'assert';
import { AmbientPushRuntime } from '@/service/ambient/AmbientPushRuntime';
import type {
	AmbientBriefingPort,
	AmbientClockPort,
	AmbientEditorContextPort,
	AmbientExplanationPort,
	AmbientPersistencePort,
	AmbientPorts,
	AmbientSearchPort,
	AmbientSettingsPort,
	AmbientTriggerCallback,
	AmbientUiProjectionPort,
} from '@/service/ambient/ports/AmbientPorts';
import {
	DEFAULT_AMBIENT_PUSH_SETTINGS,
	type AmbientContext,
	type AmbientPushItem,
	type AmbientPushSettings,
	type BriefingItem,
	type TriggerType,
	type UserAction,
} from '@/service/ambient/types';
import type { LearnedPattern } from '@/service/ambient/PatternLearner';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeState {
	settingsCalls: number;
	triggerStartCalls: number;
	triggerManualCalls: number;
	disposeCalls: number;
	extractCalls: number;
	pushHistory: Map<string, number>;
	setItemsCalls: Array<{ items: AmbientPushItem[]; source: string }>;
	clearItemsCalls: number;
	recordPushCalls: Array<{ filePath: string; ts: number }>;
	llmExplanationsApplied: Array<{ filePath: string; explanation: string }>;
	briefingProjections: BriefingItem[][];
	logPushesCalls: number;
	recordActionCalls: Array<{ src: string; pushed: string; action: UserAction }>;
	patternCacheInvalidations: number;
	llmRequests: number;
	llmCooldownArg: number | null;
	briefingRecordedTs: number | null;
	now: number;
}

function newFakeState(): FakeState {
	return {
		settingsCalls: 0,
		triggerStartCalls: 0,
		triggerManualCalls: 0,
		disposeCalls: 0,
		extractCalls: 0,
		pushHistory: new Map(),
		setItemsCalls: [],
		clearItemsCalls: 0,
		recordPushCalls: [],
		llmExplanationsApplied: [],
		briefingProjections: [],
		logPushesCalls: 0,
		recordActionCalls: [],
		patternCacheInvalidations: 0,
		llmRequests: 0,
		llmCooldownArg: null,
		briefingRecordedTs: null,
		now: 1_700_000_000_000,
	};
}

interface PortBuildOpts {
	settings?: AmbientPushSettings;
	context?: AmbientContext | null;
	searchResult?: AmbientPushItem[];
	searchThrow?: boolean;
	llmAnswer?: string | null;
	patterns?: LearnedPattern[];
	briefingReady?: boolean;
	lastBriefingTs?: number;
	lastSessionTs?: number | null;
	briefingItems?: BriefingItem[];
}

function buildFakePorts(state: FakeState, opts: PortBuildOpts = {}): {
	ports: AmbientPorts;
	settings: AmbientSettingsPort;
	editorContext: AmbientEditorContextPort;
	search: AmbientSearchPort;
	projection: AmbientUiProjectionPort;
	persistence: AmbientPersistencePort;
	briefing: AmbientBriefingPort;
	explanation: AmbientExplanationPort;
	clock: AmbientClockPort;
	fireTrigger: (filePath: string, triggerType: TriggerType) => void;
} {
	const settingsSnapshot = opts.settings ?? DEFAULT_AMBIENT_PUSH_SETTINGS;

	let registeredTrigger: AmbientTriggerCallback | null = null;
	const fireTrigger = (filePath: string, triggerType: TriggerType): void => {
		registeredTrigger?.(filePath, triggerType);
	};

	const settings: AmbientSettingsPort = {
		getSettings() {
			state.settingsCalls += 1;
			return settingsSnapshot;
		},
		async markPanelAutoOpened() { /* noop */ },
	};

	const editorContext: AmbientEditorContextPort = {
		start(onTrigger) {
			state.triggerStartCalls += 1;
			registeredTrigger = onTrigger;
		},
		triggerManual() {
			state.triggerManualCalls += 1;
		},
		extractContext(_filePath?: string) {
			state.extractCalls += 1;
			return opts.context ?? null;
		},
		dispose() {
			state.disposeCalls += 1;
			registeredTrigger = null;
		},
	};

	const search: AmbientSearchPort = {
		async search(_context, _maxItems, _pushHistory, _settings) {
			if (opts.searchThrow) throw new Error('boom');
			return opts.searchResult ?? [];
		},
	};

	const projection: AmbientUiProjectionPort = {
		getPushHistory() {
			return state.pushHistory;
		},
		setItems(items, sourceFilePath) {
			state.setItemsCalls.push({ items: [...items], source: sourceFilePath });
		},
		clearItems() {
			state.clearItemsCalls += 1;
		},
		recordPush(filePath, ts) {
			state.recordPushCalls.push({ filePath, ts });
			state.pushHistory.set(filePath, ts);
		},
		updateLlmExplanation(filePath, explanation) {
			state.llmExplanationsApplied.push({ filePath, explanation });
		},
		showMorningBriefing(items) {
			state.briefingProjections.push([...items]);
		},
	};

	const persistence: AmbientPersistencePort = {
		async logPushes() {
			state.logPushesCalls += 1;
		},
		async recordAction(src, pushed, action) {
			state.recordActionCalls.push({ src, pushed, action });
		},
		async getLearnedPatterns() {
			return opts.patterns ?? [];
		},
		invalidatePatternCache() {
			state.patternCacheInvalidations += 1;
		},
	};

	const briefing: AmbientBriefingPort = {
		isReady() {
			return opts.briefingReady ?? true;
		},
		async getLastBriefingTimestamp() {
			return opts.lastBriefingTs ?? 0;
		},
		async getLastSessionTimestamp(fallback) {
			return opts.lastSessionTs ?? fallback;
		},
		async recordSessionTimestamps(now) {
			state.briefingRecordedTs = now;
		},
		async loadBriefingItems(_lastSessionTs) {
			return opts.briefingItems ?? [];
		},
	};

	const explanation: AmbientExplanationPort = {
		async generateLlmExplanation(_p, _t, _e, cooldownMs) {
			state.llmRequests += 1;
			state.llmCooldownArg = cooldownMs;
			return opts.llmAnswer ?? null;
		},
	};

	const clock: AmbientClockPort = {
		now() {
			return state.now;
		},
	};

	const ports: AmbientPorts = {
		settings,
		editorContext,
		search,
		projection,
		persistence,
		briefing,
		explanation,
		clock,
	};

	return {
		ports,
		settings,
		editorContext,
		search,
		projection,
		persistence,
		briefing,
		explanation,
		clock,
		fireTrigger,
	};
}

function makeContext(filePath = 'notes/source.md', paragraph?: string): AmbientContext {
	return {
		currentParagraph: paragraph ?? 'This is a sufficiently long paragraph for an ambient trigger.',
		cursorSection: 'Top',
		documentTitle: 'source',
		documentTags: [],
		documentHeadings: [],
		existingOutlinks: [],
		recentEditDelta: '',
		editSessionDuration: 0,
		filePath,
		lastModified: 0,
	};
}

function makeItem(filePath: string, score = 1): AmbientPushItem {
	return {
		filePath,
		title: filePath.replace(/^.*\//, '').replace(/\.md$/, ''),
		excerpt: 'excerpt',
		score,
		explanation: 'Related content',
		explanationType: 'template',
		signals: [],
		timestamp: 0,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function settle(): Promise<void> {
	// Two microtask flushes are enough to drain the fire-and-forget
	// chains the runtime spawns (logPushes + LLM explanation).
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

async function testStartRegistersEditorTrigger(): Promise<void> {
	const state = newFakeState();
	const { ports } = buildFakePorts(state);
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	assert.strictEqual(state.triggerStartCalls, 1);
	// Second start is idempotent so editor-change is only wired once.
	runtime.start();
	assert.strictEqual(state.triggerStartCalls, 1);
	console.log('PASS: startRegistersEditorTrigger');
}

async function testTriggerManualDelegatesToEditorPort(): Promise<void> {
	const state = newFakeState();
	const { ports } = buildFakePorts(state);
	const runtime = new AmbientPushRuntime(ports);
	runtime.triggerManual();
	assert.strictEqual(state.triggerManualCalls, 1);
	console.log('PASS: triggerManualDelegatesToEditorPort');
}

async function testDisposeReleasesEditorAndAllowsRestart(): Promise<void> {
	const state = newFakeState();
	const { ports } = buildFakePorts(state);
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	runtime.dispose();
	assert.strictEqual(state.disposeCalls, 1);
	runtime.start();
	assert.strictEqual(state.triggerStartCalls, 2);
	console.log('PASS: disposeReleasesEditorAndAllowsRestart');
}

async function testRecordActionForwardsToPersistencePort(): Promise<void> {
	const state = newFakeState();
	const { ports } = buildFakePorts(state);
	const runtime = new AmbientPushRuntime(ports);
	await runtime.recordAction('a.md', 'b.md', 'opened');
	assert.deepStrictEqual(state.recordActionCalls, [
		{ src: 'a.md', pushed: 'b.md', action: 'opened' },
	]);
	console.log('PASS: recordActionForwardsToPersistencePort');
}

async function testRecordActionSwallowsPersistenceError(): Promise<void> {
	const state = newFakeState();
	const { ports } = buildFakePorts(state);
	const failingPersistence: AmbientPersistencePort = {
		...ports.persistence,
		async recordAction() {
			throw new Error('sqlite not ready');
		},
	};
	const runtime = new AmbientPushRuntime({ ...ports, persistence: failingPersistence });
	// Must NOT throw — UI callers depend on this being safe.
	await runtime.recordAction('a.md', 'b.md', 'dismissed');
	console.log('PASS: recordActionSwallowsPersistenceError');
}

async function testTriggerWithItemsProjectsAndLogs(): Promise<void> {
	const state = newFakeState();
	const items = [makeItem('notes/related-1.md'), makeItem('notes/related-2.md')];
	const { ports, fireTrigger } = buildFakePorts(state, {
		context: makeContext('notes/source.md'),
		searchResult: items,
	});
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	fireTrigger('notes/source.md', 'writing_pause');
	await settle();
	assert.strictEqual(state.setItemsCalls.length, 1);
	assert.deepStrictEqual(state.setItemsCalls[0].source, 'notes/source.md');
	assert.strictEqual(state.setItemsCalls[0].items.length, 2);
	assert.strictEqual(state.recordPushCalls.length, 2);
	assert.strictEqual(state.logPushesCalls, 1);
	assert.strictEqual(state.patternCacheInvalidations, 1);
	assert.strictEqual(state.clearItemsCalls, 0);
	console.log('PASS: triggerWithItemsProjectsAndLogs');
}

async function testEmptySearchResultClearsProjection(): Promise<void> {
	const state = newFakeState();
	const { ports, fireTrigger } = buildFakePorts(state, {
		context: makeContext('notes/source.md'),
		searchResult: [],
	});
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	fireTrigger('notes/source.md', 'doc_switch');
	await settle();
	assert.strictEqual(state.clearItemsCalls, 1);
	assert.strictEqual(state.setItemsCalls.length, 0);
	assert.strictEqual(state.logPushesCalls, 0);
	console.log('PASS: emptySearchResultClearsProjection');
}

async function testSearchThrowDropsTriggerSilently(): Promise<void> {
	const state = newFakeState();
	const { ports, fireTrigger } = buildFakePorts(state, {
		context: makeContext('notes/source.md'),
		searchThrow: true,
	});
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	fireTrigger('notes/source.md', 'manual');
	await settle();
	assert.strictEqual(state.setItemsCalls.length, 0);
	assert.strictEqual(state.clearItemsCalls, 0);
	console.log('PASS: searchThrowDropsTriggerSilently');
}

async function testShortParagraphDoesNotTriggerSearch(): Promise<void> {
	const state = newFakeState();
	const { ports, fireTrigger } = buildFakePorts(state, {
		context: makeContext('notes/source.md', 'short'),
		searchResult: [makeItem('notes/x.md')],
	});
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	fireTrigger('notes/source.md', 'writing_pause');
	await settle();
	assert.strictEqual(state.setItemsCalls.length, 0);
	assert.strictEqual(state.logPushesCalls, 0);
	console.log('PASS: shortParagraphDoesNotTriggerSearch');
}

async function testNullContextSkipsSearchEntirely(): Promise<void> {
	const state = newFakeState();
	const { ports, fireTrigger } = buildFakePorts(state, {
		context: null,
	});
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	fireTrigger('notes/source.md', 'doc_switch');
	await settle();
	assert.strictEqual(state.setItemsCalls.length, 0);
	assert.strictEqual(state.clearItemsCalls, 0);
	console.log('PASS: nullContextSkipsSearchEntirely');
}

async function testLlmExplanationDispatchesWhenEnabled(): Promise<void> {
	const state = newFakeState();
	const settings: AmbientPushSettings = {
		...DEFAULT_AMBIENT_PUSH_SETTINGS,
		enableLlmExplanation: true,
		llmExplanationCooldownMs: 60_000,
	};
	const items = [makeItem('notes/top.md')];
	const { ports, fireTrigger } = buildFakePorts(state, {
		settings,
		context: makeContext('notes/source.md'),
		searchResult: items,
		llmAnswer: 'Because the two notes share a key idea.',
	});
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	fireTrigger('notes/source.md', 'manual');
	await settle();
	assert.strictEqual(state.llmRequests, 1);
	assert.strictEqual(state.llmCooldownArg, 60_000);
	assert.deepStrictEqual(state.llmExplanationsApplied, [
		{ filePath: 'notes/top.md', explanation: 'Because the two notes share a key idea.' },
	]);
	console.log('PASS: llmExplanationDispatchesWhenEnabled');
}

async function testLlmExplanationDisabledByDefault(): Promise<void> {
	const state = newFakeState();
	const { ports, fireTrigger } = buildFakePorts(state, {
		context: makeContext('notes/source.md'),
		searchResult: [makeItem('notes/top.md')],
		llmAnswer: 'should not be called',
	});
	const runtime = new AmbientPushRuntime(ports);
	runtime.start();
	fireTrigger('notes/source.md', 'manual');
	await settle();
	assert.strictEqual(state.llmRequests, 0);
	assert.strictEqual(state.llmExplanationsApplied.length, 0);
	console.log('PASS: llmExplanationDisabledByDefault');
}

async function testBriefingProjectsItemsSortedByScore(): Promise<void> {
	const state = newFakeState();
	const items: BriefingItem[] = [
		{ filePath: 'a.md', title: 'A', category: 'unresolved_connections', reason: '', score: 1 },
		{ filePath: 'b.md', title: 'B', category: 'changed_hubs', reason: '', score: 5 },
		{ filePath: 'c.md', title: 'C', category: 'decaying_engagement', reason: '', score: 3 },
	];
	const { ports } = buildFakePorts(state, {
		briefingReady: true,
		lastBriefingTs: 0,
		briefingItems: items,
	});
	const runtime = new AmbientPushRuntime(ports);
	const shown = await runtime.tryShowMorningBriefing();
	assert.strictEqual(shown, true);
	assert.strictEqual(state.briefingProjections.length, 1);
	const projected = state.briefingProjections[0];
	assert.deepStrictEqual(
		projected.map((i) => i.filePath),
		['b.md', 'c.md', 'a.md'],
	);
	assert.strictEqual(state.briefingRecordedTs, state.now);
	console.log('PASS: briefingProjectsItemsSortedByScore');
}

async function testBriefingSkippedWhenWithinFourHourGap(): Promise<void> {
	const state = newFakeState();
	const { ports } = buildFakePorts(state, {
		briefingReady: true,
		// 1 hour ago — under the 4h minimum gap.
		lastBriefingTs: state.now - 60 * 60 * 1000,
		briefingItems: [
			{ filePath: 'a.md', title: 'A', category: 'unresolved_connections', reason: '', score: 1 },
		],
	});
	const runtime = new AmbientPushRuntime(ports);
	const shown = await runtime.tryShowMorningBriefing();
	assert.strictEqual(shown, false);
	assert.strictEqual(state.briefingProjections.length, 0);
	assert.strictEqual(state.briefingRecordedTs, null);
	console.log('PASS: briefingSkippedWhenWithinFourHourGap');
}

async function testBriefingSkippedWhenDisabled(): Promise<void> {
	const state = newFakeState();
	const settings: AmbientPushSettings = {
		...DEFAULT_AMBIENT_PUSH_SETTINGS,
		enableMorningBriefing: false,
	};
	const { ports } = buildFakePorts(state, {
		settings,
		briefingReady: true,
		briefingItems: [
			{ filePath: 'a.md', title: 'A', category: 'unresolved_connections', reason: '', score: 1 },
		],
	});
	const runtime = new AmbientPushRuntime(ports);
	const shown = await runtime.tryShowMorningBriefing();
	assert.strictEqual(shown, false);
	assert.strictEqual(state.briefingProjections.length, 0);
	console.log('PASS: briefingSkippedWhenDisabled');
}

async function testBriefingSkippedWhenBriefingNotReady(): Promise<void> {
	const state = newFakeState();
	const { ports } = buildFakePorts(state, {
		briefingReady: false,
		briefingItems: [
			{ filePath: 'a.md', title: 'A', category: 'unresolved_connections', reason: '', score: 1 },
		],
	});
	const runtime = new AmbientPushRuntime(ports);
	const shown = await runtime.tryShowMorningBriefing();
	assert.strictEqual(shown, false);
	assert.strictEqual(state.briefingProjections.length, 0);
	console.log('PASS: briefingSkippedWhenBriefingNotReady');
}

async function main(): Promise<void> {
	await testStartRegistersEditorTrigger();
	await testTriggerManualDelegatesToEditorPort();
	await testDisposeReleasesEditorAndAllowsRestart();
	await testRecordActionForwardsToPersistencePort();
	await testRecordActionSwallowsPersistenceError();
	await testTriggerWithItemsProjectsAndLogs();
	await testEmptySearchResultClearsProjection();
	await testSearchThrowDropsTriggerSilently();
	await testShortParagraphDoesNotTriggerSearch();
	await testNullContextSkipsSearchEntirely();
	await testLlmExplanationDispatchesWhenEnabled();
	await testLlmExplanationDisabledByDefault();
	await testBriefingProjectsItemsSortedByScore();
	await testBriefingSkippedWhenWithinFourHourGap();
	await testBriefingSkippedWhenDisabled();
	await testBriefingSkippedWhenBriefingNotReady();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
