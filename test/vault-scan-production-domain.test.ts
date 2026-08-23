import assert from 'node:assert/strict';
import { createVaultScanPlan } from '@/ui/view/vault-intelligence/VaultIntelligenceModel';
import { DEFAULT_VAULT_INTELLIGENCE_CONFIG } from '@/ui/view/vault-intelligence/VaultIntelligenceDefaults';
import { DiscoverController } from '@/service/vault-scan/discover/DiscoverController';
import { BuildIndexController } from '@/service/vault-scan/index/BuildIndexController';
import { createVaultScanRunState } from '@/service/vault-scan/ScanStateFactory';
import { reduceScanEvent, replayScanEvents } from '@/service/vault-scan/ScanEventReducer';
import { calculateOverallPercent } from '@/service/vault-scan/ScanProgressCalculator';
import { VaultDiscoveryController } from '@/service/vault-discovery/VaultDiscoveryController';
import { planReviewJobs } from '@/service/vault-review-preparation/ReviewWorkPlanner';
import { validateReviewWorkArtifact } from '@/service/vault-review-preparation/ReviewWorkValidator';
import { buildCompletedPackage } from '@/service/vault-scan/publish/CompletedPackageBuilder';
import { CompletedPublisher } from '@/service/vault-scan/publish/CompletedPublisher';
import type { ReviewAtom, ReviewPreparationPackage, ReviewWorkArtifact } from '@/core/types/review-preparation';
import type { VaultScanDomainEvent } from '@/core/types/vault-scan';

async function run(): Promise<void> {
const plan = createVaultScanPlan(DEFAULT_VAULT_INTELLIGENCE_CONFIG, { mode: 'entire', selectedPaths: [] }, 100);
plan.indexOutputs = (plan.indexOutputs ?? []).map((output) => ({ ...output, enabled: ['fulltext', 'embeddings', 'markdown-summary'].includes(output.id) }));
const files146 = Array.from({ length: 146 }, (_, index) => ({ path: `notes/${String(index).padStart(3, '0')}.md`, mtime: index + 1, size: 100 + index, sha256: `sha-${index}` }));
const frozen = new DiscoverController().build({ scanRunId: 'run-146', draft: plan, files: files146, routes: {}, selectedTaskIds: [], discoveryObjectives: ['relationships', 'communities'], now: 100 });
assert.deepEqual(frozen.enabledIndexLayers, ['full-text', 'embedding', 'ai-enrichment']);
assert.equal(frozen.progressPlan.indexUnitCount, 438, '146 documents multiplied by three independently terminal Index lanes is 438 work units');
assert.equal(frozen.workGraph.workUnitKeys.length, 438);
assert.deepEqual(frozen.scope.paths.slice(0, 2), ['notes/000.md', 'notes/001.md'], 'Discover freezes a deterministic sorted scope');

const selectedPlan = createVaultScanPlan(DEFAULT_VAULT_INTELLIGENCE_CONFIG, { mode: 'selected', selectedPaths: ['notes/002.md', 'notes/001.md'] }, 100);
selectedPlan.indexOutputs = plan.indexOutputs;
const selected = new DiscoverController().build({ scanRunId: 'run-selected', draft: selectedPlan, files: files146.slice(0, 4), routes: {}, selectedTaskIds: [], discoveryObjectives: [], now: 100 });
assert.deepEqual(selected.scope.paths, ['notes/001.md', 'notes/002.md']);
assert.notEqual(selected.scope.fingerprint, frozen.scope.fingerprint, 'scope and source revisions participate in the frozen fingerprint');

let sequence = 0;
const event = (eventType: string, payload: unknown): VaultScanDomainEvent => ({ schemaVersion: 1, eventId: `e-${++sequence}`, scanRunId: 'replay', sequence, eventType, idempotencyKey: `k-${sequence}`, stageId: null, sessionId: null, attemptId: null, artifactRefs: [], occurredAt: sequence, payload });
const initial = createVaultScanRunState('replay', 0);
const running = event('run.status-changed', { status: 'running' });
const stopped = event('run.status-changed', { status: 'stopped-partial' });
const replayed = replayScanEvents(initial, [stopped, running]);
assert.equal(replayed.status, 'stopped-partial');
assert.strictEqual(reduceScanEvent(replayed, stopped), replayed, 'duplicate events are idempotent');
assert.throws(() => reduceScanEvent(initial, { ...running, sequence: 2 }), /sequence gap/);

const progressState = { ...initial, frozenPlan: frozen, stages: { ...initial.stages, discover: { ...initial.stages.discover, status: 'completed' as const, terminalUnits: 4, totalUnits: 4 }, index: { ...initial.stages.index, status: 'running' as const, terminalUnits: 146, totalUnits: 438 } }, indexLanes: { ...initial.indexLanes, 'full-text': { ...initial.indexLanes['full-text'], total: 146, terminal: 146 }, embedding: { ...initial.indexLanes.embedding, total: 146, terminal: 0 }, 'ai-enrichment': { ...initial.indexLanes['ai-enrichment'], total: 146, terminal: 0 } } };
assert.equal(calculateOverallPercent(progressState, null, null), 28, 'Search can be fully ready while slower Index lanes continue and overall progress remains partial');

let clock = 1_000;
let ids = 0;
const receipts: Awaited<ReturnType<BuildIndexController['run']>> = [];
const calls = { fullText: 0, embedding: 0, aiEnrichment: 0 };
const indexController = new BuildIndexController({
	fullText: async () => { calls.fullText += 1; return { disposition: 'ready', actualRoute: null }; },
	embedding: async () => { calls.embedding += 1; return { disposition: 'ready', actualRoute: null }; },
	aiEnrichment: async () => { calls.aiEnrichment += 1; return { disposition: 'ready', actualRoute: null }; },
}, { now: () => clock++, id: () => `id-${++ids}`, onReceipt: (receipt) => { receipts.push(receipt); } });
const smallPlan = new DiscoverController().build({ scanRunId: 'run-small', draft: plan, files: files146.slice(0, 2), routes: {}, selectedTaskIds: [], discoveryObjectives: [], now: 100 });
await indexController.run(smallPlan, new AbortController().signal);
assert.deepEqual(calls, { fullText: 2, embedding: 2, aiEnrichment: 2 }, 'each search-ready document fans out into independent optional lanes');
indexController.restore(receipts);
await indexController.run(smallPlan, new AbortController().signal);
assert.deepEqual(calls, { fullText: 2, embedding: 2, aiEnrichment: 2 }, 'resume never calls a successfully receipted unit again');

const failedReceipts: typeof receipts = [];
const failedIndex = new BuildIndexController({
	fullText: async (path) => ({ disposition: path.endsWith('000.md') ? 'failed' : 'ready', actualRoute: null }),
	embedding: async () => ({ disposition: 'ready', actualRoute: null }),
	aiEnrichment: async () => ({ disposition: 'ready', actualRoute: null }),
}, { now: () => clock++, id: () => `id-${++ids}`, onReceipt: (receipt) => { failedReceipts.push(receipt); } });
await failedIndex.run(smallPlan, new AbortController().signal);
assert.deepEqual(failedReceipts.slice(0, 3).map((receipt) => receipt.disposition), ['failed', 'unavailable', 'unavailable'], 'a full-text failure terminalizes dependent lanes without pretending enrichment ran');

let discoveryAttempts = 0;
const discovery = new VaultDiscoveryController({ run: async ({ investigation }) => {
	discoveryAttempts += 1;
	return { attemptId: `attempt-${discoveryAttempts}`, inspectedEvidenceRefs: ['evidence:1'], proposals: [], terminalObjectiveIds: [investigation.question.replace('Investigate ', '')], usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0 }, stream: Array.from({ length: 20 }, (_, index) => ({ type: 'reasoning' as const, text: `reasoning ${index}`, route: 'test', evidenceRef: 'evidence:1' })) };
} }, { now: () => clock++, id: () => `id-${++ids}` });
const discoveryResult = await discovery.run(discovery.create({ sessionId: 'discovery', scanRunId: 'run-small', snapshotId: smallPlan.snapshotId, evidence: { manifestRef: 'manifest', eligibleRefs: ['evidence:1'], inspectedRefs: [], excludedRefs: [], failedRefs: [], derivedFactRefs: [] }, objectiveIds: ['relationship', 'community', 'hub', 'bridge'] }), new AbortController().signal);
assert.equal(Object.keys(discoveryResult.findings).length, 0, 'reasoning and stream volume never count as validated findings');
assert.equal(discoveryResult.status, 'completed');
assert.equal(discoveryAttempts, 4, 'relationship, community, hub, and bridge are independent objectives rather than a fixed kind sequence');

const atom: ReviewAtom = { id: 'atom-1', kindId: 'broken-links', objectRefs: ['notes/a.md'], evidenceRefs: ['evidence:a'], sourceRevisionRefs: ['sha:a'], ownerSurfaceId: 'work-queue', ownerQuestionId: 'repair-link', writeBoundary: 'proposal', verificationKind: 'fresh-detector', exitCondition: 'Broken link no longer exists.', deterministicOnly: false };
const jobs = planReviewJobs([atom], () => 'job-1');
assert.equal(jobs[0]?.status, 'queued', 'a planned review row is not Ready before Agent output validates');
const invalidArtifact = { schemaVersion: 1, artifactId: 'artifact', scanRunId: 'run', workKey: jobs[0]!.workKey, planRevision: 1, title: 'Repair link', ownerQuestion: 'Repair?', evidenceSummary: 'Missing citation', affectedObjectRefs: ['notes/a.md'], citations: [], choices: [], recommendedChoiceId: null, recommendationReason: null, impact: 'medium', caveats: [], writeBoundary: 'proposal', verificationKind: 'fresh-detector', exitCondition: 'Broken link no longer exists.', sourceRevisionRefs: ['sha:a'], generatedBy: { attemptId: 'attempt', route: null, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 } }, validationReceiptId: 'validation' } satisfies ReviewWorkArtifact;
assert.equal(validateReviewWorkArtifact(invalidArtifact, [atom]).accepted, false, 'Review work cannot advance without evidence citations');

const reviewPackage: ReviewPreparationPackage = { schemaVersion: 1, packageId: 'review', scanRunId: 'run', inputSnapshotId: 'snapshot', dispositions: [{ atomId: atom.id, disposition: 'assigned-to-task', workKey: jobs[0]!.workKey, reason: 'validated' }], tasks: [], reviewArtifacts: [], blockedAtomIds: [], completedAt: 200 };
const completedPackage = buildCompletedPackage({ packageId: 'completed', scanRunId: 'run', snapshotId: 'snapshot', indexReceiptRefs: [], discoveryArtifactRefs: [], review: reviewPackage, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 }, warnings: [], now: 300 });
const publishOrder: string[] = [];
const publisher = new CompletedPublisher({
	stageBody: async () => { publishOrder.push('body'); return { outputId: 'test', path: 'body.json', checksum: completedPackage.checksum, checksumAlgorithm: 'sha256', sizeBytes: 1, contentType: 'application/json' }; },
	appendPrepared: async () => { publishOrder.push('prepared'); },
	updateCurrentPointer: async () => { publishOrder.push('pointer'); },
	appendCompleted: async () => { publishOrder.push('completed'); },
	readBack: async () => { publishOrder.push('readback'); return completedPackage; },
});
await publisher.publish(completedPackage);
assert.deepEqual(publishOrder, ['body', 'prepared', 'pointer', 'completed', 'readback']);
const failedPublishOrder: string[] = [];
await assert.rejects(() => new CompletedPublisher({
	stageBody: async () => { failedPublishOrder.push('body'); return { outputId: 'test', path: 'body.json', checksum: completedPackage.checksum, checksumAlgorithm: 'sha256', sizeBytes: 1, contentType: 'application/json' }; },
	appendPrepared: async () => { failedPublishOrder.push('prepared'); throw new Error('injected'); },
	updateCurrentPointer: async () => { failedPublishOrder.push('pointer'); },
	appendCompleted: async () => { failedPublishOrder.push('completed'); },
	readBack: async () => completedPackage,
}).publish(completedPackage), /injected/);
assert.deepEqual(failedPublishOrder, ['body', 'prepared'], 'a failed prepared boundary cannot advance the current pointer or completed event');

console.log('vault-scan-production-domain tests passed');
}

void run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
