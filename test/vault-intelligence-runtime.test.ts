import assert from 'node:assert/strict';
import type { LintFinding, LintScanResult } from '@/core/types/lint';
import { VaultOperationRouteSelectionError, type VaultScanPlan } from '@/core/types/vault-intelligence';
import { preferLastCompletedOperationRoutes, VaultIntelligenceRuntime } from '@/app/vault-intelligence/VaultIntelligenceRuntime';
import { createVaultScanPlan } from '@/ui/view/vault-intelligence/VaultIntelligenceModel';
import { DEFAULT_VAULT_INTELLIGENCE_CONFIG } from '@/ui/view/vault-intelligence/VaultIntelligenceDefaults';

const file = {
	path: 'notes/source.md',
	extension: 'md',
	stat: { mtime: 100, ctime: 90, size: 10 },
};

const otherFile = {
	path: 'notes/other.md',
	extension: 'md',
	stat: { mtime: 110, ctime: 95, size: 12 },
};

const sourceContent = new Map<string, string>([
	[file.path, 'A real source note with [[Missing]].'],
	[otherFile.path, 'Another note with [[Also Missing]].'],
]);

const findings: LintFinding[] = [
	{
		id: 'broken-link',
		signalId: 'S-BROKEN-LINK',
		severity: 'warning',
		filePath: file.path,
		title: 'Missing target',
		description: 'The note links to [[Missing]].',
		fixActions: ['redirect-link'],
		metadata: { brokenTarget: 'Missing' },
		status: 'open',
	},
	{
		id: 'orphan',
		signalId: 'S-ORPHAN',
		severity: 'warning',
		filePath: file.path,
		title: 'Outside Communities',
		description: 'No verified graph connection.',
		fixActions: ['suggest-links'],
		metadata: {},
		status: 'open',
	},
	{
		id: 'broken-link-other',
		signalId: 'S-BROKEN-LINK',
		severity: 'warning',
		filePath: otherFile.path,
		title: 'Other missing target',
		description: 'The other note links to [[Also Missing]].',
		fixActions: ['redirect-link'],
		metadata: { brokenTarget: 'Also Missing' },
		status: 'open',
	},
];

const scanResult: LintScanResult = {
	id: 'scan',
	scanType: 'full',
	startedAt: 100,
	completedAt: 200,
	durationMs: 100,
	totalNotes: 2,
	healthScore: 8,
	dimensionScores: { structural: 8, content: 8, temporal: 8, semantic: 8, tags: 8 },
	findings,
	signalCounts: { 'S-BROKEN-LINK': 2, 'S-ORPHAN': 1 },
};

let now = 1_000;
let indexCalls = 0;
let routeCandidatesRefreshed = 0;
const reviewRoutes: Array<{ profileId: string; modelId: string; provider: string }> = [];
const app = {
	vault: {
		getFiles: () => [file, otherFile],
		getAbstractFileByPath: (path: string) => [file, otherFile].find((candidate) => candidate.path === path) ?? null,
		read: async (target: typeof file) => sourceContent.get(target.path) ?? '',
		modify: async (target: typeof file, next: string) => {
			sourceContent.set(target.path, next);
			target.stat.mtime += 1;
		},
	},
	workspace: {
		getLeaf: () => ({ openFile: async () => undefined }),
	},
};
const lintRuntime = {
	runFullScan: async () => scanResult,
	loadLatestScan: async () => scanResult,
};

function createRuntime(
	indexService: object | null = null,
	reviewRuntime: object | null = null,
	resolveIndexService: () => object | null = () => indexService,
	runCoreIndexOverride?: (
		scope: string,
		paths: string[],
		onProgress?: (progress: { processed: number; total: number; path: string | null; failed: number; succeeded?: boolean }) => void,
		shouldContinue?: () => boolean,
	) => Promise<void>,
) {
	return new VaultIntelligenceRuntime({
		app: app as never,
		resolveLintRuntime: () => lintRuntime as never,
		resolveReviewRuntime: () => reviewRuntime as never,
		resolveIndexService: () => resolveIndexService() as never,
		resolveGeneratedOutputs: () => null,
		getSearchSettings: () => ({}) as never,
		runCoreIndex: runCoreIndexOverride ?? (async (_scope, paths, onProgress) => {
			indexCalls += 1;
			paths.forEach((path, index) => onProgress?.({ processed: index + 1, total: paths.length, path, failed: 0, succeeded: true }));
		}),
		resolveProjectCount: async () => 0,
		refreshOperationRouteCandidates: async () => { routeCandidatesRefreshed += 1; },
		runScanPlanning: async ({ objectCount }) => ({
			text: `Frozen scope contains ${objectCount} objects.\nIndex before Vault-wide review.\nUser files remain unchanged.`,
			usage: { inputTokens: 12, outputTokens: 9, totalTokens: 21, costUsd: 0 },
		}),
		runTaskSuggestionRefresh: async ({ taskPayload }) => {
			const payload = JSON.parse(taskPayload) as { items: Array<{ id: string }> };
			return {
				text: JSON.stringify({ suggestions: payload.items.map((item) => ({ itemId: item.id, choiceId: 'keep', choiceValue: null, reason: 'Current evidence supports keeping this reference visible.' })) }),
				usage: { inputTokens: 18, outputTokens: 11, totalTokens: 29, costUsd: 0 },
			};
		},
		resolveOperationRoutes: () => ({
			'plan-scan': {
				profileId: 'openai', model: 'agent-test', provider: 'openai', available: true,
				candidates: [{ profileId: 'openai', model: 'agent-test', provider: 'openai', modelType: 'llm' }],
			},
			'embedding-refresh': {
				profileId: 'openai', model: 'embed-test', provider: 'openai', available: true,
				candidates: [{ profileId: 'openai', model: 'embed-test', provider: 'openai', modelType: 'embedding' }],
			},
			'file-summaries': {
				profileId: 'openai', model: 'agent-test', provider: 'openai', available: true,
				candidates: [
					{ profileId: 'openai', model: 'agent-test', provider: 'openai', modelType: 'llm' },
					{ profileId: 'lmstudio', model: 'gemma-3', provider: 'lmstudio', modelType: 'llm' },
				],
			},
			'ai-tags': {
				profileId: 'openai', model: 'agent-test', provider: 'openai', available: true,
				candidates: [{ profileId: 'openai', model: 'agent-test', provider: 'openai', modelType: 'llm' }],
			},
			...Object.fromEntries(['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis'].map((id) => [id, {
				profileId: 'lmstudio', model: 'gemma-review', provider: 'lmstudio', available: true,
				candidates: [{ profileId: 'lmstudio', model: 'gemma-review', provider: 'lmstudio', modelType: 'llm' }],
			}])),
		}),
		calculateCostUsd: async () => 0.12,
		now: () => now++,
		idFactory: () => `id-${now++}`,
	});
}

function planFor(
	choice: 'broken-links' | 'community-membership',
	selectedPaths: string[] = [file.path],
): VaultScanPlan {
	const plan = createVaultScanPlan(DEFAULT_VAULT_INTELLIGENCE_CONFIG, {
		mode: 'selected',
		selectedPaths,
	}, now);
	return {
		...plan,
		enabledCheckIds: choice === 'broken-links'
			? ['S-BROKEN-LINK', 'S-MISSING-BACKLINK']
			: ['S-ORPHAN', 'S-SOFT-ORPHAN'],
		aiOperations: plan.aiOperations.map((operation) => ({ ...operation, enabled: false })),
	};
}

async function main(): Promise<void> {
	const coverageRuntime = createRuntime({
		getIndexStatus: async () => ({ indexBuiltAt: 1, indexedDocs: 48_667, isReady: true }),
		countIndexedDocuments: async (paths: readonly string[]) => paths.includes(file.path) ? 1 : 0,
	});
	await coverageRuntime.refresh();
	assert.equal(coverageRuntime.getSnapshot().indexReadiness.searchReady, 1, 'readiness must count current unique indexed Vault objects, not the historical write counter');
	assert.equal(coverageRuntime.getSnapshot().indexReadiness.discovered, 2);

	let lateBoundIndexService: object | null = null;
	const lateBoundRuntime = createRuntime(null, null, () => lateBoundIndexService);
	await lateBoundRuntime.refresh();
	assert.equal(lateBoundRuntime.getSnapshot().indexReadiness.searchReady, null, 'an early workspace refresh must report unavailable until IndexService is bound');
	lateBoundIndexService = {
		getIndexStatus: async () => ({ indexBuiltAt: 1, indexedDocs: 2, isReady: true }),
		countIndexedDocuments: async () => 2,
	};
	await lateBoundRuntime.refresh();
	assert.equal(lateBoundRuntime.getSnapshot().indexReadiness.searchReady, 2, 'a refresh after IndexService binding must recover the real current readiness');

	const runtime = createRuntime();
	await runtime.refresh();
	assert.equal(routeCandidatesRefreshed, 1, 'refresh must discover locally exposed model candidates before resolving scan routes');
	await runtime.selectOperationRoute('file-summaries', { profileId: 'lmstudio', model: 'gemma-3', provider: 'lmstudio' });
	assert.equal(runtime.getSnapshot().operationRoutes['file-summaries']?.model, 'gemma-3', 'choosing a discovered local model must update the current Scan operation');
	assert.equal(runtime.getSnapshot().operationRoutes['ai-tags']?.model, 'agent-test', 'choosing one operation route must not rewrite its sibling route');
	await assert.rejects(
		() => runtime.selectOperationRoute('file-summaries', { profileId: 'missing', model: 'missing', provider: 'missing' }),
		(error: unknown) => error instanceof VaultOperationRouteSelectionError,
		'a rejected route must be an explainable selection outcome, never an internal ReferenceError',
	);
	const liveIndexPaths: string[] = [];
	const unsubscribe = runtime.subscribe(() => {
		const path = runtime.getSnapshot().run.stages.find((stage) => stage.id === 'index')?.currentPath;
		if (path) liveIndexPaths.push(path);
	});
	await runtime.startScan(planFor('broken-links'));
	unsubscribe();
	assert.deepEqual([...new Set(liveIndexPaths)], [file.path], 'the Run progress subscriber must receive real document-level Index progress');
	assert.ok(runtime.getSnapshot().events.some((event) => event.type === 'operation-changed'), 'operation status transitions must enter the durable event stream');
	const completed = runtime.getSnapshot();

	assert.equal(indexCalls, 1);
	assert.equal(completed.run.status, 'completed');
	assert.equal(completed.run.operations.find((operation) => operation.id === 'embedding-refresh')?.model, 'embed-test');
	assert.deepEqual(completed.run.completedStages, ['discover', 'index', 'ai', 'publish']);
	assert.equal(completed.lastCompletedRun?.maintenanceTaskIds.length, 1);
	assert.equal(completed.lastCompletedRun?.aiOperations?.find((operation) => operation.id === 'file-summaries')?.model, 'gemma-3', 'a completed scan must retain the resolved model route for the next scan');
	const nextRoutes = preferLastCompletedOperationRoutes({
		'file-summaries': {
			profileId: 'openai', model: 'agent-test', provider: 'openai', available: true,
			candidates: [
				{ profileId: 'openai', model: 'agent-test', provider: 'openai', selectable: true },
				{ profileId: 'lmstudio', model: 'gemma-3', provider: 'lmstudio', selectable: true },
			],
		},
	}, completed.lastCompletedRun);
	assert.equal(nextRoutes['file-summaries']?.model, 'gemma-3', 'the next scan must prefer a still-selectable model from the last completed scan');
	assert.deepEqual(completed.tasks.map((task) => task.kind), ['broken-links'], 'unchecked task kinds must not be generated by this run');
	assert.deepEqual(completed.tasks[0]?.atomicItems.map((item) => item.filePath), [file.path]);
	assert.equal(completed.changedCursorAt, null, 'a selected Scan must not advance the global changed-since cursor');
	assert.equal(completed.changedSinceScan, null, 'without a completed global baseline, changed-since must remain unknown');
	assert.equal(completed.lastCompletedRun?.receipts.some((receipt) => receipt.ownerBoundary === 'peak-owned'), true);
	assert.deepEqual([...sourceContent.entries()], [
		[file.path, 'A real source note with [[Missing]].'],
		[otherFile.path, 'Another note with [[Also Missing]].'],
	], 'Start through Completed must leave every user file byte-for-byte unchanged');

	const planningRuntime = createRuntime();
	const planningPlan = planFor('broken-links');
	planningPlan.aiOperations = planningPlan.aiOperations.map((operation) => ({ ...operation, enabled: operation.id === 'plan-scan' }));
	await planningRuntime.startScan(planningPlan);
	const planningOperation = planningRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'plan-scan');
	assert.equal(planningOperation?.status, 'completed', 'Plan this Scan must be a real provider operation, not a local synthetic completion');
	assert.equal(planningOperation?.actualRoute?.model, 'agent-test');
	assert.equal(planningOperation?.attempts?.[0]?.status, 'produced');
	assert.equal(planningOperation?.usage.totalTokens, 21);
	assert.ok(planningOperation?.liveEvidence?.some((entry) => entry.kind === 'text'));

	const task = completed.tasks[0]!;
	await runtime.refreshTaskSuggestions([task.id], 'Prefer preserving intentional unresolved references.');
	assert.equal(runtime.getSnapshot().tasks[0]?.suggestionReceipt?.status, 'completed');
	assert.equal(runtime.getSnapshot().tasks[0]?.suggestionReceipt?.usage.totalTokens, 29);
	assert.equal(runtime.getSnapshot().tasks[0]?.atomicItems[0]?.suggestedChoiceId, 'keep');
	assert.equal(runtime.getSnapshot().tasks[0]?.atomicItems[0]?.ownerChoice, null, 'suggestion refresh must not create an owner decision');
	await runtime.choose(task.id, null, 'keep');
	assert.equal(runtime.getSnapshot().tasks[0]?.state, 'ready-apply');
	await runtime.applyTask(task.id);
	assert.equal(runtime.getSnapshot().tasks[0]?.state, 'ready-apply');
	await runtime.verifyTask(task.id);
	assert.equal(
		runtime.getSnapshot().tasks[0]?.state,
		'recovery',
		'an owner decision cannot close a finding while the fresh verifier still reports it',
	);
	assert.match(runtime.getSnapshot().tasks[0]?.error ?? '', /fresh verifier still reports/i);
	await runtime.startScan(planFor('broken-links'));
	assert.notEqual(
		runtime.getSnapshot().tasks[0]?.state,
		'verified',
		'a later scan must not silently restore a verifier-open task to verified',
	);
	assert.equal(runtime.getSnapshot().lastCompletedRun?.maintenanceTaskIds.length, 1, 'verifier-open work remains owner follow-up');

	const proposalRuntime = createRuntime();
	await proposalRuntime.startScan(planFor('broken-links'));
	const proposalTask = proposalRuntime.getSnapshot().tasks[0]!;
	await proposalRuntime.choose(proposalTask.id, proposalTask.atomicItems[0]!.id, 'redirect');
	await proposalRuntime.applyTask(proposalTask.id);
	assert.equal(proposalRuntime.getSnapshot().tasks[0]?.state, 'needs-proposal', 'a source-file decision must not masquerade as a generated reviewable diff');
	const proposalEvents = proposalRuntime.getSnapshot().events;
	assert.equal(proposalEvents[proposalEvents.length - 1]?.type, 'review-decisions-saved');

	const materializedProposalRuntime = createRuntime();
	await materializedProposalRuntime.startScan(planFor('broken-links'));
	const materializedTask = materializedProposalRuntime.getSnapshot().tasks[0]!;
	await materializedProposalRuntime.choose(materializedTask.id, materializedTask.atomicItems[0]!.id, 'redirect', 'Resolved');
	await materializedProposalRuntime.applyTask(materializedTask.id);
	await materializedProposalRuntime.prepareProposal(materializedTask.id);
	const prepared = materializedProposalRuntime.getSnapshot().proposals[0]!;
	assert.equal(prepared.status, 'ready-review');
	assert.equal(prepared.changes[0]?.beforeText, '[[Missing]]');
	assert.equal(prepared.changes[0]?.afterText, '[[Resolved]]');
	await materializedProposalRuntime.setProposalChangeSelected(prepared.id, prepared.changes[0]!.id, false);
	await materializedProposalRuntime.applyProposal(prepared.id);
	assert.equal(sourceContent.get(file.path), 'A real source note with [[Missing]].', 'an unselected diff must never be applied implicitly');
	assert.match(materializedProposalRuntime.getSnapshot().error ?? '', /Select at least one source-file change/, 'Apply must fail closed when review selects no source changes');
	await materializedProposalRuntime.setProposalChangeSelected(prepared.id, prepared.changes[0]!.id, true);
	await materializedProposalRuntime.applyProposal(prepared.id);
	assert.equal(sourceContent.get(file.path), 'A real source note with [[Resolved]].');
	assert.equal(materializedProposalRuntime.getSnapshot().proposals[0]?.status, 'applied');
	assert.equal(materializedProposalRuntime.getSnapshot().tasks[0]?.state, 'applied');
	const proposalWorkflowStates: string[] = [];
	const unsubscribeProposalWorkflow = materializedProposalRuntime.subscribe(() => {
		proposalWorkflowStates.push(materializedProposalRuntime.getSnapshot().tasks[0]?.state ?? 'missing');
	});
	await materializedProposalRuntime.verifyTask(materializedTask.id);
	unsubscribeProposalWorkflow();
	assert.ok(proposalWorkflowStates.includes('reindexing'), 'an applied proposal must expose its real re-indexing state');
	assert.ok(proposalWorkflowStates.includes('verifying'), 'verification must be a distinct observable state after re-indexing');
	assert.equal(materializedProposalRuntime.getSnapshot().tasks[0]?.state, 'recovery', 'an applied diff remains open when the fresh detector still reports the finding');
	sourceContent.set(file.path, 'A real source note with [[Missing]].');
	file.stat.mtime = 100;

	const guardedProposalRuntime = createRuntime();
	await guardedProposalRuntime.startScan(planFor('broken-links'));
	const guardedTask = guardedProposalRuntime.getSnapshot().tasks[0]!;
	await guardedProposalRuntime.choose(guardedTask.id, guardedTask.atomicItems[0]!.id, 'redirect', 'Resolved');
	await guardedProposalRuntime.applyTask(guardedTask.id);
	await guardedProposalRuntime.prepareProposal(guardedTask.id);
	const guardedProposal = guardedProposalRuntime.getSnapshot().proposals[0]!;
	sourceContent.set(file.path, 'A concurrent edit leaves [[Missing]] in a different context.');
	await guardedProposalRuntime.applyProposal(guardedProposal.id);
	assert.equal(guardedProposalRuntime.getSnapshot().proposals[0]?.status, 'stale', 'Apply must reject a changed source even when the mtime was not updated');
	assert.equal(guardedProposalRuntime.getSnapshot().tasks[0]?.state, 'recovery');
	sourceContent.set(file.path, 'A real source note with [[Missing]].');
	file.stat.mtime = 100;

	const membershipRuntime = createRuntime();
	await membershipRuntime.startScan(planFor('community-membership'));
	const membershipTask = membershipRuntime.getSnapshot().tasks[0]!;
	await membershipRuntime.choose(membershipTask.id, membershipTask.atomicItems[0]!.id, 'another', 'Research');
	assert.equal(membershipRuntime.getSnapshot().tasks[0]?.atomicItems[0]?.ownerChoice?.choiceValue, 'Research');
	await membershipRuntime.applyTask(membershipTask.id);
	await membershipRuntime.verifyTask(membershipTask.id);
	assert.equal(
		membershipRuntime.getSnapshot().tasks[0]?.state,
		'recovery',
		'a Community override is not verification while the detector still reports the membership finding',
	);

	const staleRuntime = createRuntime();
	await staleRuntime.startScan(planFor('broken-links'));
	const staleTask = staleRuntime.getSnapshot().tasks[0]!;
	await staleRuntime.choose(staleTask.id, staleTask.atomicItems[0]!.id, 'redirect');
	file.stat.mtime = 200;
	await staleRuntime.applyTask(staleTask.id);
	assert.equal(staleRuntime.getSnapshot().tasks[0]?.state, 'recovery');
	assert.match(staleRuntime.getSnapshot().error ?? '', /changed after the owner choice/);
	file.stat.mtime = 100;

	const rescanStaleRuntime = createRuntime();
	await rescanStaleRuntime.startScan(planFor('broken-links'));
	const rescanStaleTask = rescanStaleRuntime.getSnapshot().tasks[0]!;
	await rescanStaleRuntime.choose(rescanStaleTask.id, rescanStaleTask.atomicItems[0]!.id, 'redirect');
	file.stat.mtime = 205;
	await rescanStaleRuntime.startScan(planFor('broken-links'));
	assert.equal(rescanStaleRuntime.getSnapshot().tasks[0]?.state, 'recovery', 'a later Scan must surface source revision drift before Apply');
	file.stat.mtime = 100;

	const defaultGuardRuntime = createRuntime();
	await defaultGuardRuntime.startScan(planFor('broken-links', [file.path, otherFile.path]));
	const defaultGuardTask = defaultGuardRuntime.getSnapshot().tasks[0]!;
	await defaultGuardRuntime.choose(defaultGuardTask.id, null, 'redirect');
	assert.deepEqual(
		defaultGuardRuntime.getSnapshot().tasks[0]?.atomicItems.map((item) => item.ownerChoice?.sourceRevision),
		[100, 110],
		'a Set all proposal must freeze a revision for every affected file',
	);
	otherFile.stat.mtime = 220;
	await defaultGuardRuntime.applyTask(defaultGuardTask.id);
	assert.equal(defaultGuardRuntime.getSnapshot().tasks[0]?.state, 'recovery');
	assert.match(defaultGuardRuntime.getSnapshot().error ?? '', /changed after the owner choice/);
	otherFile.stat.mtime = 110;

	const scopedRuntime = createRuntime();
	await scopedRuntime.startScan(planFor('broken-links', [file.path]));
	await scopedRuntime.startScan(planFor('broken-links', [otherFile.path]));
	assert.deepEqual(
		scopedRuntime.getSnapshot().tasks[0]?.atomicItems.map((item) => item.filePath).sort(),
		[file.path, otherFile.path].sort(),
		'a partial Scan must retain unresolved atomic items outside its frozen scope',
	);

	const entireRuntime = createRuntime();
	const entirePlan = planFor('broken-links');
	entirePlan.scope = { mode: 'entire', selectedPaths: [] };
	await entireRuntime.startScan(entirePlan);
	assert.notEqual(entireRuntime.getSnapshot().changedCursorAt, null);
	assert.equal(entireRuntime.getSnapshot().changedSinceScan, 0, 'an entire Vault Scan advances the changed-since cursor');
	await entireRuntime.analyzeActivityThemes(0, Number.MAX_SAFE_INTEGER);
	assert.ok(entireRuntime.getSnapshot().activityThemes.length > 0, 'explicit evidence analysis must create theme records only from timestamped activity');
	assert.ok(entireRuntime.getSnapshot().activityThemes.every((theme) => theme.citations.length > 0), 'every generated theme must preserve cited record evidence');
	assert.equal(entireRuntime.getSnapshot().events.at(-1)?.type, 'activity-themes-generated');

	const coupledRuntime = createRuntime();
	const inconsistentPlan = planFor('broken-links');
	inconsistentPlan.aiOperations = inconsistentPlan.aiOperations.map((operation) => ({
		...operation,
		enabled: operation.id === 'file-summaries',
	}));
	await coupledRuntime.startScan(inconsistentPlan);
	assert.equal(coupledRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'file-summaries')?.status, 'failed', 'an enabled operation with no Index runtime must fail honestly, not masquerade as skipped');
	assert.equal(coupledRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'ai-tags')?.status, 'skipped');

	const reviewCollector = {
		insights: [], changes: [], sources: [], chatFollowups: [], findings: [], submissions: [], clusterObservations: [],
		gaps: [{ id: 'gap-1', kind: 'structural-hole', title: 'Research connection is missing', body: 'Two cited regions have no maintained bridge.', confidence: 'high', references: [file.path, otherFile.path], createdAt: now, roundIndex: 0 }],
		actions: [{ id: 'action-1', kind: 'merge-notes', priority: 'medium', title: 'Merge duplicate research notes', rationale: 'The two notes repeat the same evidence.', involvedNotes: [file.path, otherFile.path], createdAt: now, roundIndex: 0 }],
	};
	const completedReviewSnapshot = {
		mode: 'fast', digest: null, status: 'completed', error: undefined, currentRoundIndex: 0,
		rounds: [{ roundIndex: 0, startedAt: now, endedAt: now + 1, turnCount: 1, maxTurns: 999, events: [
			{ type: 'text-delta', text: 'Comparing cited evidence.' },
			{ type: 'tool-call', toolName: 'mcp__vault__vault_read_note', input: { path: file.path } },
			{ type: 'complete', usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 }, finishReason: 'stop' },
		] }],
		collectorSnapshot: reviewCollector,
	};
	const routedReview = {
		async *run({ route }: { route: { profileId: string; modelId: string; provider: string } }) {
			reviewRoutes.push(route);
			yield completedReviewSnapshot;
			return completedReviewSnapshot;
		},
		getDigest: async () => null,
	};
	const reviewRuntime = createRuntime(null, routedReview);
	const partialReviewPlan = planFor('broken-links');
	partialReviewPlan.aiOperations = partialReviewPlan.aiOperations.map((operation) => ({
		...operation,
		enabled: ['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis'].includes(operation.id),
	}));
	await reviewRuntime.startScan(partialReviewPlan);
	for (const id of ['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis']) {
		assert.equal(
			reviewRuntime.getSnapshot().run.operations.find((operation) => operation.id === id)?.status,
			'completed',
			'Vault-wide Review must honor a frozen selected scope instead of silently skipping every provider call',
		);
	}
	assert.deepEqual(reviewRoutes.at(-1), { profileId: 'lmstudio', modelId: 'gemma-review', provider: 'lmstudio' });
	assert.equal(reviewRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'relationship-discovery')?.actualRoute?.provider, 'lmstudio');
	assert.ok(reviewRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'relationship-discovery')?.liveEvidence?.some((entry) => entry.kind === 'text'));
	assert.ok(reviewRuntime.getSnapshot().tasks.some((task) => task.kind === 'knowledge-connections' && task.atomicItems.some((item) => item.sourceType === 'vault-review-gap')));
	assert.ok(reviewRuntime.getSnapshot().tasks.some((task) => task.kind === 'related-notes' && task.atomicItems.some((item) => item.sourceType === 'vault-review-action')));

	const enrichmentPaths: string[][] = [];
	const llmRoutes: Array<{ profileId: string; modelId: string; provider: string }> = [];
	const indexService = {
		runPendingVectorIndexEnrichment: async (_settings: unknown, options: { paths?: readonly string[] }) => {
			enrichmentPaths.push([...(options.paths ?? [])]);
			return { processed: 1, skippedWrongTenant: 0, errors: [] };
		},
		runPendingLlmIndexEnrichment: async (_settings: unknown, options: { paths?: readonly string[]; includeSummary?: boolean; includeTags?: boolean; llmRoute: { profileId: string; modelId: string; provider: string } }) => {
			enrichmentPaths.push([...(options.paths ?? [])]);
			llmRoutes.push(options.llmRoute);
			return {
				processed: 1, skippedWrongTenant: 0, errors: [],
				attempts: [{
					path: options.paths?.[0] ?? '', status: 'produced', startedAt: now, completedAt: now + 1,
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, costUsd: 0, error: null,
					outputs: { summary: options.includeSummary ? 'produced' : 'not-requested', tags: 'produced' },
					generatedKnowledge: { summary: options.includeSummary ? 'Generated summary' : null, tags: ['generated-tag'] },
				}],
			};
		},
		runMobiusGlobalMaintenance: async () => undefined,
		getIndexStatus: async () => ({ indexBuiltAt: 1, indexedDocs: 2, isReady: true }),
		countIndexedDocuments: async (paths: readonly string[]) => new Set(paths).size,
	};
	const enrichedRuntime = createRuntime(indexService);
	await enrichedRuntime.refresh();
	await enrichedRuntime.selectOperationRoute('file-summaries', { profileId: 'lmstudio', model: 'gemma-3', provider: 'lmstudio' });
	const enrichedPlan = planFor('broken-links', [otherFile.path]);
	enrichedPlan.aiOperations = enrichedPlan.aiOperations.map((operation) => ({
		...operation,
		enabled: ['embedding-refresh', 'file-summaries', 'ai-tags'].includes(operation.id),
	}));
	await enrichedRuntime.startScan(enrichedPlan);
	assert.deepEqual(enrichmentPaths, [[otherFile.path], [otherFile.path], [otherFile.path]], 'every selected enrichment operation must stay inside the frozen scope');
	assert.deepEqual(llmRoutes[0], { profileId: 'lmstudio', modelId: 'gemma-3', provider: 'lmstudio' }, 'the selected local summary route must reach the real document provider call');
	assert.equal(enrichedRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'file-summaries')?.attempts?.[0]?.status, 'produced');
	assert.equal(enrichedRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'file-summaries')?.attempts?.[0]?.generatedKnowledge?.summary, 'Generated summary');
	assert.deepEqual(enrichedRuntime.getSnapshot().run.operations.find((operation) => operation.id === 'ai-tags')?.attempts?.[0]?.generatedKnowledge?.tags, ['generated-tag']);

	const pipelineEvents: string[] = [];
	let firstDocumentEnrichmentStarted!: () => void;
	const firstDocumentEnrichment = new Promise<void>((resolve) => { firstDocumentEnrichmentStarted = resolve; });
	let releaseFirstVector!: () => void;
	const firstVectorGate = new Promise<void>((resolve) => { releaseFirstVector = resolve; });
	const pipelinedIndexService = {
		...indexService,
		runPendingVectorIndexEnrichment: async (_settings: unknown, options: { paths?: readonly string[] }) => {
			const path = options.paths?.[0] ?? '';
			pipelineEvents.push(`vector:${path}`);
			if (path === file.path) await firstVectorGate;
			return { processed: 1, skippedWrongTenant: 0, errors: [] };
		},
		runPendingLlmIndexEnrichment: async (_settings: unknown, options: { paths?: readonly string[] }) => {
			const path = options.paths?.[0] ?? '';
			pipelineEvents.push(`llm:${path}`);
			if (path === file.path) firstDocumentEnrichmentStarted();
			return {
				processed: 1, skippedWrongTenant: 0, errors: [],
				attempts: [{ path, status: 'produced', startedAt: now, completedAt: now + 1, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 }, costUsd: 0, error: null }],
			};
		},
	};
	const pipelinedRuntime = createRuntime(pipelinedIndexService, null, () => pipelinedIndexService, async (_scope, paths, onProgress) => {
		pipelineEvents.push(`core:${paths[0]}`);
		onProgress?.({ processed: 1, total: paths.length, path: paths[0]!, failed: 0, succeeded: true });
		await firstDocumentEnrichment;
		pipelineEvents.push(`core:${paths[1]}`);
		onProgress?.({ processed: 2, total: paths.length, path: paths[1]!, failed: 0, succeeded: true });
	});
	const pipelinedPlan = planFor('broken-links', [file.path, otherFile.path]);
	pipelinedPlan.aiOperations = pipelinedPlan.aiOperations.map((operation) => ({
		...operation,
		enabled: ['embedding-refresh', 'file-summaries'].includes(operation.id),
	}));
	const pipelinedScan = pipelinedRuntime.startScan(pipelinedPlan);
	await firstDocumentEnrichment;
	assert.ok(
		pipelineEvents.includes(`vector:${file.path}`) && pipelineEvents.includes(`llm:${file.path}`),
		'Embedding and AI enrichment must start as independent lanes for the same Core Search-ready document',
	);
	assert.equal(pipelinedRuntime.getSnapshot().run.currentStage, 'index', 'Build Index must remain current until every selected enrichment lane reaches a terminal receipt');
	assert.equal(pipelinedRuntime.getSnapshot().run.stages.find((stage) => stage.id === 'ai')?.status, 'waiting', 'Vault-wide discovery must not start while an Index lane is still active');
	releaseFirstVector();
	await pipelinedScan;
	assert.ok(
		pipelineEvents.indexOf(`llm:${file.path}`) < pipelineEvents.indexOf(`core:${otherFile.path}`),
		'per-document AI enrichment must start as soon as the first Core Search document is ready',
	);
	assert.deepEqual(pipelinedRuntime.getSnapshot().run.coreIndexedPaths, [file.path, otherFile.path], 'successful Core Search documents form the durable resume cursor');

	const resumedCoreCalls: string[][] = [];
	let pausableRuntime!: VaultIntelligenceRuntime;
	pausableRuntime = createRuntime(null, null, () => null, async (_scope, paths, onProgress, shouldContinue) => {
		resumedCoreCalls.push([...paths]);
		for (let index = 0; index < paths.length; index += 1) {
			if (index > 0 && shouldContinue?.() === false) break;
			onProgress?.({ processed: index + 1, total: paths.length, path: paths[index]!, failed: 0, succeeded: true });
			if (resumedCoreCalls.length === 1 && index === 0) pausableRuntime.requestPause();
		}
	});
	await pausableRuntime.startScan(planFor('broken-links', [file.path, otherFile.path]));
	assert.equal(pausableRuntime.getSnapshot().run.status, 'paused', 'Pause must settle only after the current document checkpoint is retained');
	assert.deepEqual(pausableRuntime.getSnapshot().run.coreIndexedPaths, [file.path]);
	await pausableRuntime.resumeScan();
	assert.deepEqual(resumedCoreCalls, [[file.path, otherFile.path], [otherFile.path]], 'Resume must call Core Search only for paths not present in the durable cursor');
	assert.equal(pausableRuntime.getSnapshot().run.status, 'completed');

	let stoppableRuntime!: VaultIntelligenceRuntime;
	const stoppedCorePaths: string[] = [];
	stoppableRuntime = createRuntime(null, null, () => null, async (_scope, paths, onProgress, shouldContinue) => {
		for (let index = 0; index < paths.length; index += 1) {
			if (index > 0 && shouldContinue?.() === false) break;
			stoppedCorePaths.push(paths[index]!);
			onProgress?.({ processed: index + 1, total: paths.length, path: paths[index]!, failed: 0, succeeded: true });
			if (index === 0) stoppableRuntime.requestStop();
		}
	});
	await stoppableRuntime.startScan(planFor('broken-links', [file.path, otherFile.path]));
	assert.equal(stoppableRuntime.getSnapshot().run.status, 'stopped-partial');
	assert.deepEqual(stoppedCorePaths, [file.path], 'Stop must prevent another document from starting after the retained boundary');
	const stoppedEventCount = stoppableRuntime.getSnapshot().events.length;
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(stoppableRuntime.getSnapshot().events.length, stoppedEventCount, 'no operation or stage events may arrive after Stop reaches its terminal checkpoint');
	await stoppableRuntime.startNewScan();
	assert.equal(stoppableRuntime.getSnapshot().run.status, 'idle', 'a stopped-partial checkpoint can be discarded to prepare a new Scan');
	assert.equal(stoppableRuntime.getSnapshot().run.id, null, 'starting over must not retain the previous unfinished run identity');

	let publishEntered!: () => void;
	const publishStarted = new Promise<void>((resolve) => { publishEntered = resolve; });
	const blockedPublishRuntime = createRuntime({
		runMobiusGlobalMaintenance: async (_tenants: unknown, options?: { signal?: AbortSignal }) => {
			publishEntered();
			await new Promise<void>((_resolve, reject) => {
				options?.signal?.addEventListener('abort', () => reject(new Error('maintenance aborted')), { once: true });
			});
		},
		getIndexStatus: async () => ({ indexBuiltAt: 1, indexedDocs: 2, isReady: true }),
		countIndexedDocuments: async () => 2,
	});
	const blockedPublishScan = blockedPublishRuntime.startScan(planFor('broken-links'));
	await publishStarted;
	blockedPublishRuntime.requestStop();
	await blockedPublishScan;
	assert.equal(blockedPublishRuntime.getSnapshot().run.status, 'stopped-partial', 'Stop during a blocked Publish must leave stopping and retain a partial checkpoint without normal Completed tasks');
	await blockedPublishRuntime.startNewScan();
	assert.equal(blockedPublishRuntime.getSnapshot().run.status, 'idle', 'a stopped Publish must expose a clean new-Scan state');

	let enterReview!: () => void;
	const reviewEntered = new Promise<void>((resolve) => { enterReview = resolve; });
	const cancellableReview = {
		async *run({ signal }: { signal: AbortSignal }) {
			enterReview();
			await new Promise<void>((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(new Error('review aborted')), { once: true });
			});
		},
		saveReport: async () => undefined,
		getDigest: async () => null,
	};
	const skippedReviewRuntime = createRuntime(null, cancellableReview);
	const cancellablePlan = planFor('broken-links');
	cancellablePlan.scope = { mode: 'entire', selectedPaths: [] };
	cancellablePlan.aiOperations = cancellablePlan.aiOperations.map((operation) => ({
		...operation,
		enabled: ['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis'].includes(operation.id),
	}));
	const cancellableScan = skippedReviewRuntime.startScan(cancellablePlan);
	await reviewEntered;
	skippedReviewRuntime.skipOperation('relationship-discovery');
	await cancellableScan;
	assert.equal(skippedReviewRuntime.getSnapshot().run.status, 'completed', 'skipping an active shared Review must not fail the Scan');
	assert.equal(skippedReviewRuntime.getSnapshot().run.stages.find((stage) => stage.id === 'ai')?.status, 'completed');

	console.log('vault-intelligence-runtime: passed');
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
