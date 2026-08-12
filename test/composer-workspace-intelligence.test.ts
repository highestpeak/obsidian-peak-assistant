import {
	ComposerWorkspaceIntelligenceRuntime,
	compactComposerWorkspaceStateEvents,
	type ComposerWorkspaceStateEvent,
	type ComposerWorkspaceStatePersistencePort,
} from '@/service/composer';
import type { ComposerCandidate, ComposerCapabilityRunEvent } from '@/core/composer';

let failures = 0;
let count = 0;
function check(name: string, condition: boolean, detail = ''): void {
	count += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ` — ${detail}` : ''}`);
}

class MemoryPersistence implements ComposerWorkspaceStatePersistencePort {
	events: ComposerWorkspaceStateEvent[] = [];
	async load(): Promise<readonly ComposerWorkspaceStateEvent[]> {
		return this.events;
	}
	async append(event: ComposerWorkspaceStateEvent): Promise<void> {
		this.events.push(event);
	}
}

class DeferredPersistence extends MemoryPersistence {
	private resolveLoad!: (events: readonly ComposerWorkspaceStateEvent[]) => void;
	private readonly loadPromise = new Promise<readonly ComposerWorkspaceStateEvent[]>((resolve) => {
		this.resolveLoad = resolve;
	});
	override load(): Promise<readonly ComposerWorkspaceStateEvent[]> {
		return this.loadPromise;
	}
	finishLoad(events: readonly ComposerWorkspaceStateEvent[]): void {
		this.resolveLoad(events);
	}
}

async function main(): Promise<void> {
	const persistence = new MemoryPersistence();
	const runtime = new ComposerWorkspaceIntelligenceRuntime(persistence);
	await runtime.hydrate();
	runtime.trackDocument('doc-a', 'A.md');
	check('opening a document does not silently start a work segment', runtime.projection().activeSegment === null);
	check('first document becomes the workspace scope', runtime.projection().scope?.kind === 'document');
	const firstTaskId = runtime.projection().activeTaskId;
	check('first document creates one explicit active task session', Boolean(firstTaskId));
	check('default task contains only the opening document', runtime.projection().tasks[0]?.documentIds[0] === 'doc-a');
	runtime.session.openSession('评测任务');
	check('opening a conversation selects Talk inside the active task', runtime.session.projection().surface === 'talk');
	const secondTask = runtime.createTaskSession('发布任务', ['doc-a']);
	check('new task becomes the only active task', runtime.projection().activeTaskId === secondTask.taskId);
	check('new task starts on Suggestions', runtime.session.projection().surface === 'suggestions');
	runtime.session.openSession('发布任务对话');
	runtime.activateTaskSession(firstTaskId!);
	check('task switch restores the first independent conversation', runtime.session.projection().sessionTitle === '评测任务');
	runtime.activateTaskSession(secondTask.taskId);
	check('switching back restores the second independent conversation', runtime.session.projection().sessionTitle === '发布任务对话');

	const candidate = {
		candidateId: 'candidate-1',
		target: { kind: 'block', blockId: 'block-1' },
		baseRevision: 'rev-a',
		status: 'streaming',
		variants: [{
			variantId: 'variant-1',
			provenance: 'initial',
			status: 'streaming',
			proposedChange: { operations: [], summary: 'Review copy' },
			createdAt: 1,
		}],
		activeVariantId: 'variant-1',
		proposedChange: { operations: [], summary: 'Review copy' },
		anchorBlockId: 'block-1',
	} as unknown as ComposerCandidate;
	const review = {
		candidate,
		runtime: {
			ownerId: 'capability' as const,
			rendererId: 'composer.renderer.text' as const,
			label: '润色改写',
			payload: {
				capabilityId: 'composer.prose.polish',
				snapshot: {
					baseRevision: 'rev-a',
					documentId: 'doc-a',
					filePath: 'A.md',
				},
			},
		},
	};
	const started: Extract<ComposerCapabilityRunEvent, { type: 'run-started' }> = {
		type: 'run-started',
		runId: 'run-1',
		capabilityId: 'composer.prose.polish',
		candidateId: candidate.candidateId,
		variantId: 'variant-1',
	};
	runtime.attachPresentationOrigin('run-1', {
		kind: 'automatic-suggestion',
		findingId: 'finding-1',
		blockId: 'block-1',
	});
	const frozen = runtime.startRun({
		event: started,
		candidate,
		documentId: 'doc-a',
		filePath: 'A.md',
		originHost: 'composer',
		originHostId: 'leaf-a',
		review,
	});
	check('first task starts a work segment', Boolean(runtime.projection().activeSegment));
	check('run freezes origin document', frozen.originDocumentId === 'doc-a');
	check('run freezes origin revision', frozen.originRevision === 'rev-a');
	check('run freezes origin leaf context', frozen.originHostId === 'leaf-a');
	check(
		'run freezes the contextual Intelligence origin',
		frozen.presentationOrigin?.kind === 'automatic-suggestion',
	);
	check('run freezes the review card payload', frozen.review?.runtime.label === '润色改写');
	runtime.attachOriginHost('run-1', 'markdown-leaf-a', 'markdown');
	check('shared Native host corrects the frozen origin surface', runtime.projection().runs[0].originHost === 'markdown');
	check('shared Native host records its concrete leaf id', runtime.projection().runs[0].originHostId === 'markdown-leaf-a');
	const frozenScope = JSON.stringify(frozen.scopeSnapshot);

	runtime.setWorkSegmentScope();
	runtime.trackDocument('doc-b', 'B.md');
	check(
		'opening a related document joins the active work segment',
		runtime.projection().activeSegment?.documentIds.includes('doc-b') === true,
	);
	runtime.pinDocuments(['doc-a', 'doc-b']);
	check('scope can move to a pinned set', runtime.projection().scope?.kind === 'pinned');
	check(
		'scope changes do not mutate an existing Frozen Run',
		JSON.stringify(runtime.projection().runs[0].scopeSnapshot) === frozenScope,
	);

	runtime.applyRunEvent({
		type: 'content-delta',
		runId: 'run-1',
		candidateId: candidate.candidateId,
		variantId: 'variant-1',
		delta: 'A',
		text: 'A',
	});
	check('first token moves the run to streaming', runtime.projection().runs[0].status === 'streaming');
	runtime.applyRunEvent({
		type: 'variant-ready',
		runId: 'run-1',
		candidateId: candidate.candidateId,
		variantId: 'variant-1',
		envelope: {
			resultKind: 'text-patch',
			rendererId: 'composer.renderer.text',
			payload: {},
		},
	}, {
		...review,
		candidate: {
			...candidate,
			status: 'ready',
			variants: candidate.variants.map((variant) => ({ ...variant, status: 'ready' })),
		},
	});
	check('terminal event stays attached to origin run', runtime.projection().runs[0].status === 'ready');
	check(
		'terminal event persists the latest review card state',
		runtime.projection().runs[0].review?.candidate.status === 'ready',
	);
	runtime.markDocumentRunsStale('doc-a');
	runtime.applyRunEvent({
		type: 'variant-ready',
		runId: 'run-1',
		candidateId: candidate.candidateId,
		variantId: 'variant-1',
		envelope: {
			resultKind: 'text-patch',
			rendererId: 'composer.renderer.text',
			payload: {},
		},
	});
	check(
		'late completion cannot revive a stale Frozen Run',
		runtime.projection().runs[0].status === 'stale',
	);

	await Promise.resolve();
	const replayPersistence = new MemoryPersistence();
	replayPersistence.events = [
		...persistence.events,
		{
			type: 'run-upserted',
			at: Date.now(),
			run: { ...frozen, runId: 'run-interrupted', status: 'streaming' },
		},
	];
	const replay = new ComposerWorkspaceIntelligenceRuntime(replayPersistence);
	await replay.hydrate();
	check(
		'JSONL replay retains the contextual Intelligence origin',
		replay.projection().runs.some((run) => run.presentationOrigin?.kind === 'automatic-suggestion'),
	);
	check(
		'reload marks non-resumable in-flight work explicitly interrupted',
		replay.projection().runs.find((run) => run.runId === 'run-interrupted')?.status === 'interrupted',
	);
	check(
		'reload turns the interrupted review card into an explicit failure',
		replay.projection().runs.find((run) => run.runId === 'run-interrupted')
			?.review?.candidate.status === 'failed',
	);
	check(
		'reload restores a terminal candidate review payload',
		replay.projection().runs.find((run) => run.runId === 'run-1')
			?.review?.runtime.label === '润色改写',
	);
	replay.updateCandidateReview('candidate-1', null);
	check(
		'accept or discard can remove a persisted review card',
		replay.reviewsForDocument('doc-a').length === 0,
	);

	const delayedPersistence = new DeferredPersistence();
	const delayed = new ComposerWorkspaceIntelligenceRuntime(delayedPersistence);
	const hydrating = delayed.hydrate();
	delayed.trackDocument('doc-live', 'Live.md');
	delayedPersistence.finishLoad([
		{
			type: 'document-tracked',
			at: Date.now() - 10,
			documentId: 'doc-stored',
			filePath: 'Stored.md',
		},
		{
			type: 'scope-changed',
			at: Date.now() - 9,
			scope: { kind: 'document', documentId: 'doc-stored' },
		},
	]);
	await hydrating;
	check(
		'hydration preserves a leaf bound while JSONL was loading',
		delayed.projection().documents['doc-live'] === 'Live.md',
	);
	check(
		'hydration also restores the earlier persisted document',
		delayed.projection().documents['doc-stored'] === 'Stored.md',
	);
	check(
		'live startup scope wins after canonical replay',
		delayed.projection().scope?.kind === 'document'
			&& delayed.projection().scope.documentId === 'doc-live',
	);

	const compacted = compactComposerWorkspaceStateEvents([
		{
			type: 'segment-started',
			at: 1,
			segment: { segmentId: 'segment-1', startedAt: 1, documentIds: [] },
		},
		{ type: 'document-tracked', at: 2, documentId: 'doc-a', filePath: 'Old.md', segmentId: 'segment-1' },
		{ type: 'document-renamed', at: 3, documentId: 'doc-a', filePath: 'New.md' },
		{ type: 'scope-changed', at: 4, scope: { kind: 'document', documentId: 'doc-a' } },
		{ type: 'run-upserted', at: 5, run: { ...frozen, status: 'streaming' } },
		{ type: 'run-upserted', at: 6, run: { ...frozen, status: 'ready' } },
		{ type: 'segment-ended', at: 7, segmentId: 'segment-1' },
	]);
	check('compaction removes superseded workspace events', compacted.length === 5, String(compacted.length));
	check(
		'compaction keeps the latest document path',
		compacted.some((event) =>
			event.type === 'document-tracked'
			&& event.documentId === 'doc-a'
			&& event.filePath === 'New.md'),
	);
	check(
		'compaction keeps only the latest run snapshot',
		compacted.filter((event) => event.type === 'run-upserted').length === 1
			&& compacted.some((event) => event.type === 'run-upserted' && event.run.status === 'ready'),
	);
	check(
		'compaction preserves the ended active segment',
		compacted.some((event) => event.type === 'segment-ended' && event.at === 7),
	);

	console.log(`composer-workspace-intelligence: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

void main();
