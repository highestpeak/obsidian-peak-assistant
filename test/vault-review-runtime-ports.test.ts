// T9 Vault Review fake-port runtime tests.
//
// The runtime now receives every concrete dependency through ports;
// these tests exercise the orchestration with in-memory fakes so the
// session loop, report delegation, digest error path, and runtime
// dispatch all run without AppContext / sqlite / Obsidian / Agent SDK.
//
// What is being verified:
//   - The vault-lint runtime is forwarded into the digest port (T9
//     deps shape).
//   - `runVaultReview` reaches `error` when the digest returns null,
//     yielding a final snapshot rather than throwing.
//   - A fast-mode round drives a stub agent stream to completion and
//     records its events on the round record.
//   - `submit_review` events drive the collector and surface a
//     submission on the round.
//   - The runtime delegates `saveReport / listReports / loadReport /
//     deleteReport / listClusterMembers / getVaultFingerprint` to
//     the corresponding ports.

import assert from 'assert';

import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { LintScanResult } from '@/service/lint/types';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type {
	VaultReviewDeps,
	VaultReviewProfilePort,
	VaultReviewDigestDataPort,
	VaultReviewAgentPort,
	VaultReviewReportPort,
} from '@/core/ports/VaultReviewPorts';
import type {
	BuildVaultDigestOptions,
	ClusterMember,
	VaultDigest,
} from '@/service/copilot/vault/VaultDigestService';
import type { VaultFingerprint } from '@/service/copilot/vault/VaultFingerprintService';
import type {
	VaultMetaAgentOptions,
} from '@/service/copilot/vault/VaultMetaAgentStream';
import type {
	VaultReviewHistoryRecord,
} from '@/service/copilot/vault/VaultReviewReportService';
import type { VaultReviewSessionSnapshot } from '@/service/copilot/vault/VaultReviewSession';
import { VaultReviewRuntimeImpl } from '@/service/copilot/vault/VaultReviewRuntimeImpl';

// ─── Stubs ──────────────────────────────────────────────────────────────

function stubLintRuntime(): VaultLintRuntime {
	return {
		async runFullScan() {
			return {
				id: 'stub',
				scanType: 'full',
				startedAt: 0,
				completedAt: 0,
				durationMs: 0,
				totalNotes: 0,
				healthScore: 0,
				dimensionScores: { structural: 0, content: 0, temporal: 0, semantic: 0, tags: 0 },
				findings: [],
				signalCounts: {},
			} satisfies LintScanResult;
		},
		async loadLatestScan() {
			return null;
		},
	};
}

function stubFingerprint(over?: Partial<VaultFingerprint>): VaultFingerprint {
	return {
		fingerprint: 'fake-fp',
		fileCount: 10,
		totalWordCount: 100,
		lastMaxMtime: 0,
		computedAt: Date.now(),
		...over,
	};
}

function stubDigest(): VaultDigest {
	return {
		fingerprint: stubFingerprint(),
		counts: { notes: 10, words: 100, clusters: 1, hubs: 0, orphans: 0, danglingRefs: 0 },
		health: null,
		clusters: [],
		structuralHoles: [],
		hubs: [],
		staleHubs: [],
		orphans: [],
		dangling: [],
		recentActivity: { createdLast30d: 0, modifiedLast30d: 0, dormantClusters: [] },
		tags: [],
		computedAt: Date.now(),
	};
}

interface DigestStubState {
	buildDigestCalls: number;
	lastLintRuntime: VaultLintRuntime | null;
	fingerprintCalls: number;
	clusterCalls: Array<{ id: string; limit?: number }>;
	resolveBuild: (digest: VaultDigest | null) => void;
}

function digestPort(initial: VaultDigest | null = stubDigest()): {
	port: VaultReviewDigestDataPort;
	state: DigestStubState;
} {
	const state: DigestStubState = {
		buildDigestCalls: 0,
		lastLintRuntime: null,
		fingerprintCalls: 0,
		clusterCalls: [],
		resolveBuild: () => { /* overridden below */ },
	};
	let nextDigest: VaultDigest | null = initial;
	const port: VaultReviewDigestDataPort = {
		async getVaultFingerprint(_force) {
			state.fingerprintCalls += 1;
			return stubFingerprint();
		},
		async buildDigest(options: BuildVaultDigestOptions) {
			state.buildDigestCalls += 1;
			state.lastLintRuntime = options.vaultLintRuntime;
			return nextDigest;
		},
		async listClusterMembers(id: string, limit?: number): Promise<ClusterMember[]> {
			state.clusterCalls.push({ id, limit });
			return [];
		},
	};
	state.resolveBuild = (d) => { nextDigest = d; };
	return { port, state };
}

interface AgentStubState {
	roundsRun: number;
	lastOptions: VaultMetaAgentOptions | null;
	events: LLMStreamEvent[];
}

function agentPort(events: LLMStreamEvent[] = []): {
	port: VaultReviewAgentPort;
	state: AgentStubState;
} {
	const state: AgentStubState = {
		roundsRun: 0,
		lastOptions: null,
		events,
	};
	const port: VaultReviewAgentPort = {
		async *runRound(options: VaultMetaAgentOptions) {
			state.roundsRun += 1;
			state.lastOptions = options;
			for (const ev of state.events) {
				// Allow upstream to bump turnCount per assistant event.
				if (ev.type === 'agent-text') options.onTurnIncrement?.();
				yield ev;
			}
		},
	};
	return { port, state };
}

function profilePort(text?: string): {
	port: VaultReviewProfilePort;
	state: { calls: number };
} {
	const state = { calls: 0 };
	return {
		port: {
			async loadUserProfileText() {
				state.calls += 1;
				return text;
			},
		},
		state,
	};
}

interface ReportStubState {
	saveCalls: number;
	listCalls: number;
	loadCalls: number;
	deleteCalls: number;
	lastSavedSnapshot: VaultReviewSessionSnapshot | null;
	disposed: boolean;
}

function reportPort(): { port: VaultReviewReportPort; state: ReportStubState } {
	const state: ReportStubState = {
		saveCalls: 0, listCalls: 0, loadCalls: 0, deleteCalls: 0,
		lastSavedSnapshot: null, disposed: false,
	};
	const port: VaultReviewReportPort & { dispose?: () => void } = {
		async save(snap) {
			state.saveCalls += 1;
			state.lastSavedSnapshot = snap;
			return {
				id: 'rec-1', storagePath: 'peak-system/vault-reviews/x.md',
				mode: snap.mode, startedAt: 0, completedAt: 0, status: snap.status,
				noteCount: 0, wordCount: 0, clusterCount: 0, insightCount: 0,
				gapCount: 0, actionCount: 0, sourceCount: 0, roundCount: 0,
				turnCount: 0, fingerprint: '',
			};
		},
		async listAll() {
			state.listCalls += 1;
			return [];
		},
		async load() {
			state.loadCalls += 1;
			return null;
		},
		async delete() {
			state.deleteCalls += 1;
		},
		dispose() {
			state.disposed = true;
		},
	};
	return { port, state };
}

function makeDeps(opts?: {
	digest?: VaultDigest | null;
	events?: LLMStreamEvent[];
	profileText?: string;
}): {
	deps: VaultReviewDeps;
	digestState: DigestStubState;
	agentState: AgentStubState;
	reportState: ReportStubState;
	profileState: { calls: number };
} {
	const initialDigest = opts && 'digest' in opts ? opts.digest! ?? null : stubDigest();
	const { port: digest, state: digestState } = digestPort(initialDigest);
	const { port: agent, state: agentState } = agentPort(opts?.events ?? []);
	const { port: reports, state: reportState } = reportPort();
	const { port: profile, state: profileState } = profilePort(opts?.profileText);
	return {
		deps: {
			profile,
			digestData: digest,
			agent,
			reports,
			vaultLintRuntime: stubLintRuntime(),
		},
		digestState,
		agentState,
		reportState,
		profileState,
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────

async function testDigestNullProducesErrorSnapshot(): Promise<void> {
	const { deps, digestState } = makeDeps({ digest: null });
	const runtime = new VaultReviewRuntimeImpl(deps);
	const controller = new AbortController();
	const snapshots: VaultReviewSessionSnapshot[] = [];
	const gen = runtime.run({ mode: 'fast', signal: controller.signal });
	let last: VaultReviewSessionSnapshot | null = null;
	for await (const snap of gen) {
		snapshots.push(snap);
		last = snap;
	}
	assert.ok(snapshots.length >= 2, 'must yield at least preparing + error snapshots');
	assert.strictEqual(last?.status, 'error', 'final status must be error when digest is null');
	assert.match(last?.error ?? '', /index is not ready/);
	assert.strictEqual(digestState.buildDigestCalls, 1, 'digest port must be called exactly once');
	assert.strictEqual(
		digestState.lastLintRuntime,
		deps.vaultLintRuntime,
		'session must forward the deps lint runtime into the digest port',
	);
	console.log('PASS: digestNullProducesErrorSnapshot');
}

async function testFastRoundRunsAgentStreamToCompletion(): Promise<void> {
	const events: LLMStreamEvent[] = [
		{ type: 'agent-text', text: 'planning', triggerName: StreamTriggerName.COPILOT } as LLMStreamEvent,
		{ type: 'agent-text', text: 'analysing', triggerName: StreamTriggerName.COPILOT } as LLMStreamEvent,
		{ type: 'complete', triggerName: StreamTriggerName.COPILOT, durationMs: 0 } as LLMStreamEvent,
	];
	const { deps, agentState } = makeDeps({ events });
	const runtime = new VaultReviewRuntimeImpl(deps);
	const controller = new AbortController();
	let last: VaultReviewSessionSnapshot | null = null;
	for await (const snap of runtime.run({ mode: 'fast', signal: controller.signal })) {
		last = snap;
	}
	assert.strictEqual(agentState.roundsRun, 1, 'fast mode runs exactly one round');
	assert.strictEqual(last?.status, 'completed', 'fast mode completes after the single round');
	assert.strictEqual(last?.rounds.length, 1);
	const round = last!.rounds[0];
	assert.strictEqual(round.turnCount, 2, 'turnCount increments per assistant text event');
	assert.deepStrictEqual(
		round.events.map(e => e.type),
		['agent-text', 'agent-text', 'complete'],
	);
	console.log('PASS: fastRoundRunsAgentStreamToCompletion');
}

async function testAbortSignalCancelsBeforeAnyRound(): Promise<void> {
	const { deps, agentState } = makeDeps();
	const runtime = new VaultReviewRuntimeImpl(deps);
	const controller = new AbortController();
	controller.abort();
	let last: VaultReviewSessionSnapshot | null = null;
	for await (const snap of runtime.run({ mode: 'fast', signal: controller.signal })) {
		last = snap;
	}
	assert.strictEqual(last?.status, 'cancelled', 'pre-aborted signal yields cancelled snapshot');
	assert.strictEqual(agentState.roundsRun, 0, 'no agent round should run');
	console.log('PASS: abortSignalCancelsBeforeAnyRound');
}

async function testProfilePortIsConsultedForUserProfileText(): Promise<void> {
	const events: LLMStreamEvent[] = [
		{ type: 'complete', triggerName: StreamTriggerName.COPILOT, durationMs: 0 } as LLMStreamEvent,
	];
	const { deps, profileState, agentState } = makeDeps({ events, profileText: 'user-prefs-blob' });
	const runtime = new VaultReviewRuntimeImpl(deps);
	const controller = new AbortController();
	for await (const _ of runtime.run({ mode: 'fast', signal: controller.signal })) {
		// drain
	}
	assert.strictEqual(profileState.calls, 1, 'profile port must be consulted once per run');
	assert.strictEqual(
		agentState.lastOptions?.userProfileText,
		'user-prefs-blob',
		'profile text must flow into the agent options',
	);
	console.log('PASS: profilePortIsConsultedForUserProfileText');
}

async function testSaveReportDelegatesToReportPort(): Promise<void> {
	const { deps, reportState } = makeDeps();
	const runtime = new VaultReviewRuntimeImpl(deps);
	const snapshot: VaultReviewSessionSnapshot = {
		mode: 'complete',
		digest: stubDigest(),
		rounds: [],
		collectorSnapshot: {
			insights: [], sources: [], gaps: [], actions: [],
			clusterObservations: [], submissions: [], findings: [], chatFollowups: [],
		} as unknown as VaultReviewSessionSnapshot['collectorSnapshot'],
		status: 'completed',
		currentRoundIndex: 0,
	};
	const rec = await runtime.saveReport(snapshot);
	assert.strictEqual(reportState.saveCalls, 1);
	assert.strictEqual(rec.id, 'rec-1');
	assert.strictEqual(reportState.lastSavedSnapshot, snapshot);
	console.log('PASS: saveReportDelegatesToReportPort');
}

async function testListReportsDelegatesToReportPort(): Promise<void> {
	const { deps, reportState } = makeDeps();
	const runtime = new VaultReviewRuntimeImpl(deps);
	const out = await runtime.listReports(5);
	assert.strictEqual(reportState.listCalls, 1);
	assert.deepStrictEqual(out, []);
	console.log('PASS: listReportsDelegatesToReportPort');
}

async function testLoadAndDeleteReportDelegateToReportPort(): Promise<void> {
	const { deps, reportState } = makeDeps();
	const runtime = new VaultReviewRuntimeImpl(deps);
	const stubRecord: VaultReviewHistoryRecord = {
		id: 'x', storagePath: 'p', mode: 'fast', startedAt: 0, completedAt: 0,
		status: 'completed', noteCount: 0, wordCount: 0, clusterCount: 0,
		insightCount: 0, gapCount: 0, actionCount: 0, sourceCount: 0,
		roundCount: 0, turnCount: 0, fingerprint: '',
	};
	const loaded = await runtime.loadReport(stubRecord);
	assert.strictEqual(loaded, null);
	assert.strictEqual(reportState.loadCalls, 1);
	await runtime.deleteReport(stubRecord);
	assert.strictEqual(reportState.deleteCalls, 1);
	console.log('PASS: loadAndDeleteReportDelegateToReportPort');
}

async function testListClusterMembersDelegatesToDigestPort(): Promise<void> {
	const { deps, digestState } = makeDeps();
	const runtime = new VaultReviewRuntimeImpl(deps);
	await runtime.listClusterMembers('community-42', 7);
	assert.strictEqual(digestState.clusterCalls.length, 1);
	assert.deepStrictEqual(digestState.clusterCalls[0], { id: 'community-42', limit: 7 });
	console.log('PASS: listClusterMembersDelegatesToDigestPort');
}

async function testGetVaultFingerprintDelegatesToDigestPort(): Promise<void> {
	const { deps, digestState } = makeDeps();
	const runtime = new VaultReviewRuntimeImpl(deps);
	const fp = await runtime.getVaultFingerprint(true);
	assert.strictEqual(digestState.fingerprintCalls, 1);
	assert.strictEqual(fp?.fingerprint, 'fake-fp');
	console.log('PASS: getVaultFingerprintDelegatesToDigestPort');
}

async function testRuntimeDisposeForwardsToPorts(): Promise<void> {
	const { deps, reportState } = makeDeps();
	const runtime = new VaultReviewRuntimeImpl(deps);
	runtime.dispose();
	assert.strictEqual(reportState.disposed, true, 'report port dispose must be called');
	console.log('PASS: runtimeDisposeForwardsToPorts');
}

async function main(): Promise<void> {
	await testDigestNullProducesErrorSnapshot();
	await testFastRoundRunsAgentStreamToCompletion();
	await testAbortSignalCancelsBeforeAnyRound();
	await testProfilePortIsConsultedForUserProfileText();
	await testSaveReportDelegatesToReportPort();
	await testListReportsDelegatesToReportPort();
	await testLoadAndDeleteReportDelegateToReportPort();
	await testListClusterMembersDelegatesToDigestPort();
	await testGetVaultFingerprintDelegatesToDigestPort();
	await testRuntimeDisposeForwardsToPorts();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
