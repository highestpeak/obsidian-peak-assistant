import type {
	ComposerCapabilityId,
	ComposerCapabilityRunEvent,
	ComposerCandidate,
	ComposerCandidateRuntimeSnapshot,
	ComposerTarget,
	IntelligencePresentationOrigin,
} from '@/core/composer';
import {
	CopilotSessionMachine,
	type CopilotSessionPort,
	type CopilotSessionStateSnapshot,
	type FrozenRunContext,
	type IntelligenceSessionProjection,
	type RunReceipt,
} from './runSession';

export type ComposerIntelligenceScope =
	| { kind: 'document'; documentId: string }
	| { kind: 'work-segment'; segmentId: string }
	| { kind: 'pinned'; pinId: string; documentIds: readonly string[] };

export interface ComposerWorkSegment {
	segmentId: string;
	startedAt: number;
	endedAt?: number;
	documentIds: readonly string[];
}

export type WorkspaceRunStatus =
	| 'starting'
	| 'streaming'
	| 'ready'
	| 'failed'
	| 'cancelled'
	| 'stale'
	| 'interrupted';

export type ComposerGenerationDisposition =
	| 'pending'
	| 'accepted'
	| 'not-adopted';

export interface FrozenComposerReviewSnapshot {
	candidate: ComposerCandidate;
	runtime: ComposerCandidateRuntimeSnapshot;
}

export interface FrozenComposerRunEnvelope {
	runId: string;
	candidateId: string;
	variantId: string;
	originDocumentId: string;
	originPathAtStart: string;
	originRevision: string;
	originHost: 'composer' | 'markdown';
	originHostId?: string;
	presentationOrigin?: IntelligencePresentationOrigin;
	workSegmentId: string;
	scopeSnapshot: ComposerIntelligenceScope;
	capabilityId: ComposerCapabilityId;
	target: ComposerTarget;
	startedAt: number;
	completedAt?: number;
	status: WorkspaceRunStatus;
	disposition: ComposerGenerationDisposition;
	acceptedTransactionId?: string;
	error?: string;
	review?: FrozenComposerReviewSnapshot;
}

export interface ComposerGenerationGroup {
	candidateId: string;
	label: string;
	latest: FrozenComposerRunEnvelope;
	runs: readonly FrozenComposerRunEnvelope[];
}

export interface ComposerWorkspaceIntelligenceProjection {
	activeSegment: ComposerWorkSegment | null;
	scope: ComposerIntelligenceScope | null;
	runs: readonly FrozenComposerRunEnvelope[];
	documents: Readonly<Record<string, string>>;
	/** Explicit user-created task sessions; exactly one may be active. */
	tasks: readonly ComposerTaskSession[];
	activeTaskId: string | null;
}

export interface ComposerTaskSession {
	taskId: string;
	title: string;
	documentIds: readonly string[];
	createdAt: number;
	updatedAt: number;
	session: CopilotSessionStateSnapshot;
}

export type ComposerWorkspaceStateEvent =
	| { type: 'segment-started'; at: number; segment: ComposerWorkSegment }
	| { type: 'segment-ended'; at: number; segmentId: string }
	| { type: 'document-tracked'; at: number; documentId: string; filePath: string; segmentId?: string }
	| { type: 'document-renamed'; at: number; documentId: string; filePath: string }
	| { type: 'scope-changed'; at: number; scope: ComposerIntelligenceScope }
	| { type: 'run-upserted'; at: number; run: FrozenComposerRunEnvelope }
	| { type: 'task-upserted'; at: number; task: ComposerTaskSession }
	| { type: 'task-removed'; at: number; taskId: string }
	| { type: 'active-task-changed'; at: number; taskId: string | null };

export interface ComposerWorkspaceStatePersistencePort {
	load(): Promise<readonly ComposerWorkspaceStateEvent[]>;
	append(event: ComposerWorkspaceStateEvent): Promise<void>;
}

/**
 * Fold append-only workspace events into an equivalent replay snapshot.
 *
 * Workspace state is a current-state ledger, not an audit log: only the latest
 * path/scope/run envelope and the last work segment are required for recovery.
 * Document transaction history remains in its own canonical per-document
 * stream and is never compacted here.
 */
export function compactComposerWorkspaceStateEvents(
	events: readonly ComposerWorkspaceStateEvent[],
): ComposerWorkspaceStateEvent[] {
	let activeSegment: ComposerWorkSegment | null = null;
	let scopeEvent: Extract<ComposerWorkspaceStateEvent, { type: 'scope-changed' }> | null = null;
	const documents = new Map<string, { filePath: string; at: number }>();
	const runs = new Map<string, Extract<ComposerWorkspaceStateEvent, { type: 'run-upserted' }>>();
	const tasks = new Map<string, Extract<ComposerWorkspaceStateEvent, { type: 'task-upserted' }>>();
	let activeTaskEvent: Extract<ComposerWorkspaceStateEvent, { type: 'active-task-changed' }> | null = null;

	for (const event of events) {
		if (event.type === 'segment-started') {
			activeSegment = {
				...event.segment,
				documentIds: [...event.segment.documentIds],
			};
			continue;
		}
		if (event.type === 'segment-ended') {
			if (activeSegment && activeSegment.segmentId === event.segmentId) {
				activeSegment = { ...activeSegment, endedAt: event.at };
			}
			continue;
		}
		if (event.type === 'document-tracked') {
			documents.set(event.documentId, { filePath: event.filePath, at: event.at });
			if (activeSegment && activeSegment.segmentId === event.segmentId) {
				activeSegment = {
					...activeSegment,
					documentIds: [...new Set([...activeSegment.documentIds, event.documentId])],
				};
			}
			continue;
		}
		if (event.type === 'document-renamed') {
			documents.set(event.documentId, { filePath: event.filePath, at: event.at });
			continue;
		}
		if (event.type === 'scope-changed') {
			scopeEvent = {
				...event,
				scope: cloneScope(event.scope)!,
			};
			continue;
		}
		if (event.type === 'run-upserted') {
			runs.set(event.run.runId, {
				...event,
				run: cloneRun(event.run),
			});
			continue;
		}
		if (event.type === 'task-upserted') {
			tasks.set(event.task.taskId, { ...event, task: cloneTask(event.task) });
			continue;
		}
		if (event.type === 'task-removed') {
			tasks.delete(event.taskId);
			continue;
		}
		activeTaskEvent = { ...event };
	}

	const compacted: ComposerWorkspaceStateEvent[] = [];
	if (activeSegment) {
		compacted.push({
			type: 'segment-started',
			at: activeSegment.startedAt,
			segment: {
				...activeSegment,
				documentIds: [...activeSegment.documentIds],
				endedAt: undefined,
			},
		});
	}
	for (const [documentId, document] of [...documents.entries()].sort(([left], [right]) => left.localeCompare(right))) {
		compacted.push({
			type: 'document-tracked',
			at: document.at,
			documentId,
			filePath: document.filePath,
		});
	}
	if (scopeEvent) compacted.push(scopeEvent);
	for (const event of [...runs.values()].sort((left, right) => left.at - right.at)) {
		compacted.push(event);
	}
	for (const event of [...tasks.values()].sort((left, right) => left.task.createdAt - right.task.createdAt)) {
		compacted.push(event);
	}
	if (activeTaskEvent) compacted.push(activeTaskEvent);
	if (activeSegment?.endedAt) {
		compacted.push({
			type: 'segment-ended',
			at: activeSegment.endedAt,
			segmentId: activeSegment.segmentId,
		});
	}
	return compacted;
}

export interface StartWorkspaceRunInput {
	event: Extract<ComposerCapabilityRunEvent, { type: 'run-started' }>;
	candidate: ComposerCandidate;
	documentId: string;
	filePath: string;
	originHost: 'composer' | 'markdown';
	originHostId?: string;
	review?: FrozenComposerReviewSnapshot;
}

let idSequence = 0;
function nextId(prefix: string): string {
	idSequence += 1;
	return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

/**
 * Stable session object injected into every Composer document runtime. Its
 * identity never changes, while its delegate follows the single active task.
 * That keeps React subscriptions and the transaction/history bridge intact
 * when the user switches task tabs.
 */
class TaskScopedCopilotSession implements CopilotSessionPort {
	private active = new CopilotSessionMachine();
	private offActive: (() => void) | null = null;
	private readonly subscribers = new Set<(projection: IntelligenceSessionProjection) => void>();

	constructor(private readonly onMutate: () => void) {
		this.bind(this.active);
	}

	bind(machine: CopilotSessionMachine): void {
		if (this.active === machine && this.offActive) return;
		this.offActive?.();
		this.active = machine;
		this.offActive = machine.subscribe((projection) => {
			for (const subscriber of this.subscribers) subscriber(projection);
		});
	}

	subscribe(cb: (projection: IntelligenceSessionProjection) => void): () => void {
		this.subscribers.add(cb);
		cb(this.active.projection());
		return () => this.subscribers.delete(cb);
	}

	projection(): IntelligenceSessionProjection {
		return this.active.projection();
	}

	exportState(): CopilotSessionStateSnapshot {
		return this.active.exportState();
	}

	restore(state: CopilotSessionStateSnapshot): void {
		this.active.restore(state);
		this.onMutate();
	}

	selectSurface(...args: Parameters<CopilotSessionMachine['selectSurface']>): void {
		this.active.selectSurface(...args);
		this.onMutate();
	}

	openSession(...args: Parameters<CopilotSessionMachine['openSession']>): void {
		this.active.openSession(...args);
		this.onMutate();
	}

	backToBrief(): void {
		this.active.backToBrief();
		this.onMutate();
	}

	send(...args: Parameters<CopilotSessionMachine['send']>): FrozenRunContext {
		const result = this.active.send(...args);
		this.onMutate();
		return result;
	}

	frozenContext(runId: string): FrozenRunContext | undefined {
		return this.active.frozenContext(runId);
	}

	markStreaming(runId: string): void {
		this.active.markStreaming(runId);
		this.onMutate();
	}

	markProposed(runId: string, receipt: Partial<RunReceipt>): void {
		this.active.markProposed(runId, receipt);
		this.onMutate();
	}

	markNoChange(runId: string, receipt?: Partial<RunReceipt>): void {
		this.active.markNoChange(runId, receipt);
		this.onMutate();
	}

	markError(runId: string, message: string): void {
		this.active.markError(runId, message);
		this.onMutate();
	}

	markCancelled(runId: string): void {
		this.active.markCancelled(runId);
		this.onMutate();
	}

	closeReview(): void {
		this.active.closeReview();
		this.onMutate();
	}

	linkAcceptedTransaction(runId: string, transactionId: string): void {
		this.active.linkAcceptedTransaction(runId, transactionId);
		this.onMutate();
	}

	linkExternalRun(externalRunId: string, sessionRunId: string): void {
		this.active.linkExternalRun(externalRunId, sessionRunId);
		this.onMutate();
	}
}

/**
 * Workspace-lifetime Current Work State, scope and Frozen Run Registry.
 *
 * This is a normal app-composed object, not a module singleton. It is
 * framework-neutral so the app layer can share it with Composer and Native
 * Markdown hosts and replay it from JSONL.
 */
export class ComposerWorkspaceIntelligenceRuntime {
	private activeSegment: ComposerWorkSegment | null = null;
	private scope: ComposerIntelligenceScope | null = null;
	private readonly runs = new Map<string, FrozenComposerRunEnvelope>();
	private readonly pendingPresentationOrigins = new Map<string, IntelligencePresentationOrigin>();
	private readonly documents = new Map<string, string>();
	private readonly tasks = new Map<string, ComposerTaskSession>();
	private readonly taskMachines = new Map<string, CopilotSessionMachine>();
	private activeTaskId: string | null = null;
	/** Stable task-scoped Copilot port shared by every document host. */
	readonly session: CopilotSessionPort;
	private readonly subscribers = new Set<(projection: ComposerWorkspaceIntelligenceProjection) => void>();
	private hydratePromise: Promise<void> | null = null;
	private hydrated: boolean;
	private replaying = false;
	private preHydrationEvents: ComposerWorkspaceStateEvent[] = [];

	constructor(private readonly persistence?: ComposerWorkspaceStatePersistencePort) {
		this.hydrated = !persistence;
		this.session = new TaskScopedCopilotSession(() => this.persistActiveTaskSession());
	}

	subscribe(cb: (projection: ComposerWorkspaceIntelligenceProjection) => void): () => void {
		this.subscribers.add(cb);
		cb(this.projection());
		return () => this.subscribers.delete(cb);
	}

	projection(): ComposerWorkspaceIntelligenceProjection {
		return {
			activeSegment: this.activeSegment
				? { ...this.activeSegment, documentIds: [...this.activeSegment.documentIds] }
				: null,
			scope: cloneScope(this.scope),
				runs: [...this.runs.values()].map(cloneRun),
			documents: Object.fromEntries(this.documents),
			tasks: [...this.tasks.values()]
				.sort((left, right) => left.createdAt - right.createdAt)
				.map(cloneTask),
			activeTaskId: this.activeTaskId,
		};
	}

	hydrate(): Promise<void> {
		if (!this.persistence) {
			this.hydrated = true;
			return Promise.resolve();
		}
		if (this.hydratePromise) return this.hydratePromise;
		this.hydratePromise = this.persistence.load().then((events) => {
			// Workspace restore may bind document leaves before the adapter read
			// finishes. Rebuild from the canonical log, then replay those live
			// startup events so neither side silently wins the race.
			const liveEvents = [...this.preHydrationEvents];
			this.replaying = true;
			this.activeSegment = null;
			this.scope = null;
			this.runs.clear();
			this.documents.clear();
			this.tasks.clear();
			this.taskMachines.clear();
			this.activeTaskId = null;
			for (const event of events) this.applyEvent(event, false);
			for (const event of liveEvents) this.applyEvent(event, false);
			for (const [runId, run] of this.runs) {
				if (run.status !== 'starting' && run.status !== 'streaming') continue;
				this.runs.set(runId, {
					...run,
					status: 'interrupted',
					...(run.review ? { review: interruptReview(run.review) } : {}),
				});
			}
			this.replaying = false;
			this.hydrated = true;
			this.preHydrationEvents = [];
			this.bindActiveTaskSession();
			this.notify();
		});
		return this.hydratePromise;
	}

	trackDocument(documentId: string, filePath: string): void {
		const knownPath = this.documents.get(documentId);
		if (knownPath !== filePath) {
			this.applyAndPersist({
				type: knownPath ? 'document-renamed' : 'document-tracked',
				at: Date.now(),
				documentId,
				filePath,
				...(knownPath || !this.activeSegment ? {} : { segmentId: this.activeSegment.segmentId }),
			} as ComposerWorkspaceStateEvent);
		}
		if (
			knownPath === filePath
			&& this.activeSegment
			&& !this.activeSegment.endedAt
			&& !this.activeSegment.documentIds.includes(documentId)
		) {
			this.applyAndPersist({
				type: 'document-tracked',
				at: Date.now(),
				documentId,
				filePath,
				segmentId: this.activeSegment.segmentId,
			});
		}
		if (!this.scope) this.setDocumentScope(documentId);
		if (this.activeTaskId) return;
		if (!this.hydrated) {
			void this.hydrate().then(() => {
				if (!this.activeTaskId) {
					this.createTaskSession(taskTitleFromPath(filePath), [documentId]);
				}
			});
			return;
		}
		this.createTaskSession(taskTitleFromPath(filePath), [documentId]);
	}

	createTaskSession(title = '新任务', documentIds: readonly string[] = []): ComposerTaskSession {
		const at = Date.now();
		const task: ComposerTaskSession = {
			taskId: nextId('cmp-task'),
			title: title.trim() || '新任务',
			documentIds: [...new Set(documentIds.filter(Boolean))],
			createdAt: at,
			updatedAt: at,
			session: new CopilotSessionMachine().exportState(),
		};
		this.applyAndPersist({ type: 'task-upserted', at, task });
		this.applyAndPersist({ type: 'active-task-changed', at, taskId: task.taskId });
		return cloneTask(task);
	}

	activateTaskSession(taskId: string): void {
		if (!this.tasks.has(taskId) || this.activeTaskId === taskId) return;
		this.applyAndPersist({ type: 'active-task-changed', at: Date.now(), taskId });
	}

	closeTaskSession(taskId: string): void {
		if (!this.tasks.has(taskId)) return;
		const wasActive = this.activeTaskId === taskId;
		this.applyAndPersist({ type: 'task-removed', at: Date.now(), taskId });
		if (!wasActive) return;
		const fallback = [...this.tasks.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0];
		this.applyAndPersist({
			type: 'active-task-changed',
			at: Date.now(),
			taskId: fallback?.taskId ?? null,
		});
	}

	renameTaskSession(taskId: string, title: string): void {
		const task = this.tasks.get(taskId);
		const nextTitle = title.trim();
		if (!task || !nextTitle || task.title === nextTitle) return;
		this.upsertTask({ ...task, title: nextTitle, updatedAt: Date.now() });
	}

	addDocumentToActiveTask(documentId: string): void {
		const task = this.activeTaskId ? this.tasks.get(this.activeTaskId) : undefined;
		if (!task || task.documentIds.includes(documentId)) return;
		this.upsertTask({
			...task,
			documentIds: [...task.documentIds, documentId],
			updatedAt: Date.now(),
		});
	}

	removeDocumentFromActiveTask(documentId: string): void {
		const task = this.activeTaskId ? this.tasks.get(this.activeTaskId) : undefined;
		if (!task || !task.documentIds.includes(documentId)) return;
		this.upsertTask({
			...task,
			documentIds: task.documentIds.filter((id) => id !== documentId),
			updatedAt: Date.now(),
		});
	}

	renameDocument(documentId: string, filePath: string): void {
		if (this.documents.get(documentId) === filePath) return;
		this.applyAndPersist({ type: 'document-renamed', at: Date.now(), documentId, filePath });
	}

	startNewSegment(): ComposerWorkSegment {
		if (this.activeSegment && !this.activeSegment.endedAt) {
			this.applyAndPersist({
				type: 'segment-ended',
				at: Date.now(),
				segmentId: this.activeSegment.segmentId,
			});
		}
		const segment: ComposerWorkSegment = {
			segmentId: nextId('cmp-segment'),
			startedAt: Date.now(),
			documentIds: [],
		};
		this.applyAndPersist({ type: 'segment-started', at: segment.startedAt, segment });
		return segment;
	}

	endCurrentSegment(): void {
		if (!this.activeSegment || this.activeSegment.endedAt) return;
		this.applyAndPersist({
			type: 'segment-ended',
			at: Date.now(),
			segmentId: this.activeSegment.segmentId,
		});
	}

	setDocumentScope(documentId: string): void {
		this.setScope({ kind: 'document', documentId });
	}

	setWorkSegmentScope(): void {
		const segment = this.ensureWorkSegment();
		this.setScope({ kind: 'work-segment', segmentId: segment.segmentId });
	}

	pinDocuments(documentIds: readonly string[]): void {
		const unique = [...new Set(documentIds)].filter(Boolean);
		if (unique.length === 0) return;
		this.setScope({ kind: 'pinned', pinId: nextId('cmp-pin'), documentIds: unique });
	}

	startRun(input: StartWorkspaceRunInput): FrozenComposerRunEnvelope {
		const segment = this.ensureWorkSegment();
		this.ensureDocumentInSegment(segment.segmentId, input.documentId, input.filePath);
		this.addDocumentToActiveTask(input.documentId);
		const scopeSnapshot =
			cloneScope(this.scope)
			?? { kind: 'document' as const, documentId: input.documentId };
		const run: FrozenComposerRunEnvelope = {
			runId: input.event.runId,
			candidateId: input.event.candidateId,
			variantId: input.event.variantId,
			originDocumentId: input.documentId,
			originPathAtStart: input.filePath,
			originRevision: input.candidate.baseRevision,
			originHost: input.originHost,
			...(input.originHostId ? { originHostId: input.originHostId } : {}),
			workSegmentId: segment.segmentId,
			scopeSnapshot,
			capabilityId: input.event.capabilityId,
			target: input.candidate.target,
			startedAt: Date.now(),
			status: 'starting',
			disposition: 'pending',
			...(this.pendingPresentationOrigins.has(input.event.runId)
				? {
						presentationOrigin: {
							...this.pendingPresentationOrigins.get(input.event.runId)!,
						},
					}
				: {}),
			...(input.review ? { review: cloneReview(input.review) } : {}),
		};
		this.pendingPresentationOrigins.delete(input.event.runId);
		this.applyAndPersist({ type: 'run-upserted', at: run.startedAt, run });
		return run;
	}

	/**
	 * Attach the contextual UI handoff after capability invocation returns its
	 * real run id. Synchronous executors have already emitted `run-started`;
	 * asynchronous ones consume the pending value when `startRun` arrives.
	 */
	attachPresentationOrigin(runId: string, origin: IntelligencePresentationOrigin): void {
		const run = this.runs.get(runId);
		if (!run) {
			this.pendingPresentationOrigins.set(runId, { ...origin });
			return;
		}
		this.upsertRun({ ...run, presentationOrigin: { ...origin } });
	}

	attachOriginHost(
		runId: string,
		originHostId: string,
		originHost?: FrozenComposerRunEnvelope['originHost'],
	): void {
		const run = this.runs.get(runId);
		if (!run) return;
		if (run.originHostId === originHostId && (!originHost || run.originHost === originHost)) return;
		this.upsertRun({
			...run,
			originHostId,
			...(originHost ? { originHost } : {}),
		});
	}

	applyRunEvent(
		event: ComposerCapabilityRunEvent,
		review?: FrozenComposerReviewSnapshot,
	): void {
		const run = this.runs.get(event.runId);
		if (!run) return;
		if (event.type === 'run-started') return;
		const next = withReview(run, review);
		if (event.type === 'content-delta') {
			if (run.status === 'stale') {
				if (review) this.upsertRun(next);
				return;
			}
			if (run.status !== 'streaming' || review) {
				this.upsertRun({ ...next, status: 'streaming' });
			}
			return;
		}
		if (event.type === 'variant-ready') {
			if (run.status === 'stale') {
				if (review) this.upsertRun(next);
				return;
			}
			this.upsertRun({
				...next,
				status: 'ready',
				completedAt: Date.now(),
				error: undefined,
			});
			return;
		}
		if (event.type === 'run-cancelled') {
			this.upsertRun({
				...next,
				status: 'cancelled',
				completedAt: Date.now(),
				error: undefined,
			});
			return;
		}
		this.upsertRun({
			...next,
			status: 'failed',
			completedAt: Date.now(),
			error: event.error,
		});
	}

	updateCandidateReview(
		candidateId: string,
		review: FrozenComposerReviewSnapshot | null,
	): void {
		const matching = [...this.runs.values()]
			.filter((item) => item.candidateId === candidateId)
			.sort((left, right) => right.startedAt - left.startedAt);
		const run = matching[0];
		if (!run) return;
		if (!review) {
			for (const item of matching) {
				if (!item.review) continue;
				const withoutReview = { ...item };
				delete withoutReview.review;
				this.upsertRun(withoutReview);
			}
			return;
		}
		this.upsertRun({ ...run, review: cloneReview(review) });
	}

	/**
	 * “未采用” only changes the generation disposition. It must never remove the
	 * persisted review/output: closing a card is a canvas action, not data loss.
	 */
	markCandidateNotAdopted(candidateId: string): void {
		for (const run of this.runs.values()) {
			if (run.candidateId !== candidateId) continue;
			if (run.disposition === 'accepted') continue;
			this.upsertRun({
				...run,
				disposition: 'not-adopted',
				completedAt: run.completedAt ?? Date.now(),
			});
		}
	}

	/**
	 * Link the adopted generation to its committed document transaction. Other
	 * variants in the same candidate remain visible as not-adopted alternatives.
	 */
	markRunAccepted(runId: string, transactionId?: string): void {
		const accepted = this.runs.get(runId);
		if (!accepted) return;
		for (const run of this.runs.values()) {
			if (run.candidateId !== accepted.candidateId) continue;
			const isAcceptedRun = run.runId === runId;
			this.upsertRun({
				...run,
				disposition: isAcceptedRun ? 'accepted' : 'not-adopted',
				completedAt: run.completedAt ?? Date.now(),
				...(isAcceptedRun && transactionId
					? { acceptedTransactionId: transactionId }
					: {}),
			});
		}
	}

	/** Native-file accepts have no Markdown transaction; adopt the latest run. */
	markCandidateAccepted(candidateId: string): void {
		const run = [...this.runs.values()]
			.filter((item) => item.candidateId === candidateId)
			.sort((left, right) => right.startedAt - left.startedAt)[0];
		if (!run) return;
		this.markRunAccepted(run.runId);
	}

	reviewsForDocument(documentId: string): FrozenComposerReviewSnapshot[] {
		const latestByCandidate = new Map<string, FrozenComposerRunEnvelope>();
		const runs = [...this.runs.values()].sort((left, right) => right.startedAt - left.startedAt);
		for (const run of runs) {
			if (
				run.originDocumentId !== documentId ||
				!run.review ||
				(run.disposition ?? 'pending') !== 'pending'
			) continue;
			if (!latestByCandidate.has(run.candidateId)) {
				latestByCandidate.set(run.candidateId, run);
			}
		}
		return [...latestByCandidate.values()]
			.map((run) => run.review)
			.filter((review): review is FrozenComposerReviewSnapshot => Boolean(review))
			.map(cloneReview);
	}

	markDocumentRunsStale(documentId: string): void {
		for (const run of this.runs.values()) {
			if (run.originDocumentId !== documentId) continue;
			if (run.status !== 'starting' && run.status !== 'streaming' && run.status !== 'ready') continue;
			this.upsertRun({ ...run, status: 'stale' });
		}
	}

	private setScope(scope: ComposerIntelligenceScope): void {
		this.applyAndPersist({ type: 'scope-changed', at: Date.now(), scope });
	}

	private ensureWorkSegment(): ComposerWorkSegment {
		if (this.activeSegment && !this.activeSegment.endedAt) return this.activeSegment;
		return this.startNewSegment();
	}

	private ensureDocumentInSegment(segmentId: string, documentId: string, filePath: string): void {
		if (this.documents.get(documentId) !== filePath) {
			this.applyAndPersist({
				type: 'document-tracked',
				at: Date.now(),
				documentId,
				filePath,
				segmentId,
			});
			return;
		}
		if (this.activeSegment?.segmentId !== segmentId) return;
		if (this.activeSegment.documentIds.includes(documentId)) return;
		this.activeSegment = {
			...this.activeSegment,
			documentIds: [...this.activeSegment.documentIds, documentId],
		};
		this.notify();
	}

	private upsertRun(run: FrozenComposerRunEnvelope): void {
		this.applyAndPersist({ type: 'run-upserted', at: Date.now(), run });
	}

	private upsertTask(task: ComposerTaskSession): void {
		this.applyAndPersist({ type: 'task-upserted', at: Date.now(), task });
	}

	private persistActiveTaskSession(): void {
		if (this.replaying || !this.activeTaskId) return;
		const task = this.tasks.get(this.activeTaskId);
		if (!task) return;
		this.upsertTask({
			...task,
			updatedAt: Date.now(),
			session: this.session.exportState(),
		});
	}

	private machineForTask(task: ComposerTaskSession): CopilotSessionMachine {
		const existing = this.taskMachines.get(task.taskId);
		if (existing) return existing;
		const machine = new CopilotSessionMachine();
		machine.restore(task.session);
		this.taskMachines.set(task.taskId, machine);
		return machine;
	}

	private bindActiveTaskSession(): void {
		if (!(this.session instanceof TaskScopedCopilotSession)) return;
		const task = this.activeTaskId ? this.tasks.get(this.activeTaskId) : undefined;
		if (!task) return;
		this.session.bind(this.machineForTask(task));
	}

	private applyAndPersist(event: ComposerWorkspaceStateEvent): void {
		if (!this.hydrated) this.preHydrationEvents.push(event);
		this.applyEvent(event, true);
	}

	private applyEvent(event: ComposerWorkspaceStateEvent, persist: boolean): void {
		if (event.type === 'segment-started') {
			this.activeSegment = {
				...event.segment,
				documentIds: [...event.segment.documentIds],
			};
		} else if (event.type === 'segment-ended') {
			if (this.activeSegment?.segmentId === event.segmentId) {
				this.activeSegment = { ...this.activeSegment, endedAt: event.at };
			}
		} else if (event.type === 'document-tracked') {
			this.documents.set(event.documentId, event.filePath);
			if (this.activeSegment && event.segmentId && this.activeSegment.segmentId === event.segmentId) {
				this.activeSegment = {
					...this.activeSegment,
					documentIds: [...new Set([...this.activeSegment.documentIds, event.documentId])],
				};
			}
		} else if (event.type === 'document-renamed') {
			this.documents.set(event.documentId, event.filePath);
		} else if (event.type === 'scope-changed') {
			this.scope = cloneScope(event.scope);
		} else if (event.type === 'run-upserted') {
			this.runs.set(event.run.runId, cloneRun(event.run));
		} else if (event.type === 'task-upserted') {
			this.tasks.set(event.task.taskId, cloneTask(event.task));
			const machine = this.taskMachines.get(event.task.taskId);
			if (machine && event.task.taskId !== this.activeTaskId) {
				machine.restore(event.task.session);
			}
		} else if (event.type === 'task-removed') {
			this.tasks.delete(event.taskId);
			this.taskMachines.delete(event.taskId);
			if (this.activeTaskId === event.taskId) this.activeTaskId = null;
		} else {
			this.activeTaskId = event.taskId && this.tasks.has(event.taskId)
				? event.taskId
				: null;
			this.bindActiveTaskSession();
		}
		this.notify();
		if (persist && this.persistence) void this.persistence.append(event);
	}

	private notify(): void {
		if (this.replaying) return;
		const projection = this.projection();
		for (const cb of this.subscribers) cb(projection);
	}
}

function cloneScope(scope: ComposerIntelligenceScope | null): ComposerIntelligenceScope | null {
	if (!scope) return null;
	if (scope.kind !== 'pinned') return { ...scope };
	return { ...scope, documentIds: [...scope.documentIds] };
}

function cloneRun(run: FrozenComposerRunEnvelope): FrozenComposerRunEnvelope {
	return {
		...run,
		variantId: run.variantId ?? run.review?.candidate.activeVariantId ?? run.runId,
		disposition: run.disposition ?? 'pending',
		scopeSnapshot: cloneScope(run.scopeSnapshot)!,
		target: { ...run.target },
		...(run.presentationOrigin
			? { presentationOrigin: { ...run.presentationOrigin } }
			: {}),
		...(run.review ? { review: cloneReview(run.review) } : {}),
	};
}

function cloneTask(task: ComposerTaskSession): ComposerTaskSession {
	return {
		...task,
		documentIds: [...task.documentIds],
		session: JSON.parse(JSON.stringify(task.session)) as CopilotSessionStateSnapshot,
	};
}

function taskTitleFromPath(filePath: string): string {
	const name = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
	return name.replace(/\.md$/i, '') || '新任务';
}

/** Group immutable generation attempts by review candidate, newest first. */
export function groupComposerGenerationRuns(
	runs: readonly FrozenComposerRunEnvelope[],
	documentId?: string,
): readonly ComposerGenerationGroup[] {
	const byCandidate = new Map<string, FrozenComposerRunEnvelope[]>();
	for (const input of runs) {
		if (documentId && input.originDocumentId !== documentId) continue;
		const run = cloneRun(input);
		const group = byCandidate.get(run.candidateId) ?? [];
		group.push(run);
		byCandidate.set(run.candidateId, group);
	}
	return [...byCandidate.entries()]
		.map(([candidateId, grouped]) => {
			const ordered = grouped.sort((left, right) => left.startedAt - right.startedAt);
			const latest = ordered[ordered.length - 1];
			return {
				candidateId,
				label:
					latest.review?.runtime.label
					?? latest.capabilityId,
				latest,
				runs: ordered,
			};
		})
		.sort((left, right) => right.latest.startedAt - left.latest.startedAt);
}

function withReview(
	run: FrozenComposerRunEnvelope,
	review?: FrozenComposerReviewSnapshot,
): FrozenComposerRunEnvelope {
	if (!review) return cloneRun(run);
	return { ...cloneRun(run), review: cloneReview(review) };
}

function cloneReview(review: FrozenComposerReviewSnapshot): FrozenComposerReviewSnapshot {
	return JSON.parse(JSON.stringify(review)) as FrozenComposerReviewSnapshot;
}

function interruptReview(review: FrozenComposerReviewSnapshot): FrozenComposerReviewSnapshot {
	const next = cloneReview(review);
	next.candidate.status = 'failed';
	next.candidate.variants = next.candidate.variants.map((variant) =>
		variant.variantId === next.candidate.activeVariantId
			? { ...variant, status: 'failed', error: undefined }
			: variant,
	);
	const active = next.candidate.variants.find(
		(variant) => variant.variantId === next.candidate.activeVariantId,
	);
	if (active) next.candidate.proposedChange = active.proposedChange;
	return next;
}
