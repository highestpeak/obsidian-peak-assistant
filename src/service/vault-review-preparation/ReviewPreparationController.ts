import type { ReviewAtom, ReviewAtomDispositionRecord, ReviewPreparationJob, ReviewPreparationPackage, ReviewPreparationSession, ReviewPreparationStreamEvent, ReviewWorkArtifact } from '@/core/types/review-preparation';
import type { VaultMaintenanceTask, VaultScanUsage } from '@/core/types/vault-intelligence';
import { planReviewJobs } from './ReviewWorkPlanner';
import { validateReviewWorkArtifact } from './ReviewWorkValidator';

const EMPTY_USAGE: VaultScanUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

export interface ReviewPreparationAgentOutput {
	attemptId: string;
	artifact: Omit<ReviewWorkArtifact, 'artifactId' | 'workKey' | 'planRevision' | 'validationReceiptId'>;
	stream: readonly Omit<ReviewPreparationStreamEvent, 'id' | 'occurredAt' | 'jobId'>[];
	usage: VaultScanUsage;
}

export interface ReviewPreparationAgentPort {
	run(input: { session: ReviewPreparationSession; job: ReviewPreparationJob; atoms: readonly ReviewAtom[]; validationErrors: readonly { field: string; message: string }[]; signal: AbortSignal }): Promise<ReviewPreparationAgentOutput>;
}

export interface ReviewPreparationControllerOptions {
	now: () => number;
	id: () => string;
	maxRevisions?: number;
	onCheckpoint?: (session: ReviewPreparationSession) => Promise<void> | void;
}

export class ReviewPreparationController {
	constructor(private readonly agent: ReviewPreparationAgentPort, private readonly options: ReviewPreparationControllerOptions) {}

	create(input: { sessionId: string; scanRunId: string; inputSnapshotId: string; atoms: readonly ReviewAtom[] }): ReviewPreparationSession {
		return { schemaVersion: 1, id: input.sessionId, scanRunId: input.scanRunId, status: 'planning', inputSnapshotId: input.inputSnapshotId, atoms: [...input.atoms], dispositions: [], planRevision: 1, planFrozenAt: null, jobs: [], artifacts: [], tasks: [], phase: 'normalizing', stream: [], usage: { ...EMPTY_USAGE }, updatedAt: this.options.now() };
	}

	async run(initial: ReviewPreparationSession, signal: AbortSignal): Promise<{ session: ReviewPreparationSession; package: ReviewPreparationPackage | null }> {
		let session = this.freezePlan(initial);
		await this.options.onCheckpoint?.(session);
		for (const job of session.jobs) {
			if (signal.aborted) return { session: { ...session, status: 'paused', updatedAt: this.options.now() }, package: null };
			session = this.patchJob(session, job.jobId, { status: 'inspecting' });
			session = this.appendStream(session, job.jobId, 'tool-start', 'Inspecting frozen finding bundle and existing owner work.');
			const atoms = session.atoms.filter((atom) => job.atomRefs.includes(atom.id));
			let validationErrors: readonly { field: string; message: string }[] = [];
			let committed: ReviewWorkArtifact | null = null;
			for (let revision = 0; revision <= (this.options.maxRevisions ?? 2); revision += 1) {
				try {
					const output = await this.agent.run({ session, job: session.jobs.find((candidate) => candidate.jobId === job.jobId)!, atoms, validationErrors, signal });
					for (const event of output.stream) session = this.appendStream(session, job.jobId, event.type, event.text);
					const artifact: ReviewWorkArtifact = { ...output.artifact, artifactId: this.options.id(), workKey: job.workKey, planRevision: session.planRevision, validationReceiptId: this.options.id(), generatedBy: { ...output.artifact.generatedBy, attemptId: output.attemptId, usage: output.usage } };
					const validation = validateReviewWorkArtifact(artifact, atoms);
					if (!validation.accepted) {
						validationErrors = validation.errors;
						session = this.patchJob(session, job.jobId, { status: revision < (this.options.maxRevisions ?? 2) ? 'revising' : 'attention', attemptIds: unique([...(session.jobs.find((candidate) => candidate.jobId === job.jobId)?.attemptIds ?? []), output.attemptId]), error: validation.errors.map((error) => error.message).join(' ') });
						session = this.appendStream(session, job.jobId, 'validation-failed', validation.errors.map((error) => `${error.field}: ${error.message}`).join(' · '));
						continue;
					}
					committed = artifact;
					session = { ...session, artifacts: [...session.artifacts, artifact], usage: addUsage(session.usage, output.usage) };
					session = this.patchJob(session, job.jobId, { status: 'completed', artifactId: artifact.artifactId, attemptIds: unique([...(session.jobs.find((candidate) => candidate.jobId === job.jobId)?.attemptIds ?? []), output.attemptId]), error: null });
					session = this.appendStream(session, job.jobId, 'artifact-committed', `Validated review artifact committed for ${artifact.title}.`);
					break;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					session = this.patchJob(session, job.jobId, { status: 'attention', error: message });
					session = this.appendStream(session, job.jobId, 'job-completed', `Review preparation needs attention: ${message}`);
					break;
				}
			}
			const dispositions = atoms.map<ReviewAtomDispositionRecord>((atom) => ({ atomId: atom.id, disposition: committed ? 'assigned-to-task' : 'blocked', workKey: committed ? job.workKey : null, reason: committed ? 'Validated artifact committed.' : 'Agent or validator did not produce an accepted artifact.' }));
			session = { ...session, dispositions: mergeDispositions(session.dispositions, dispositions), tasks: committed ? [...session.tasks, taskFromArtifact(committed, atoms, this.options.now())] : session.tasks, updatedAt: this.options.now() };
		await this.options.onCheckpoint?.(session);
		}
		const attention = session.jobs.some((job) => job.status === 'attention') || session.dispositions.some((item) => item.disposition === 'blocked');
		session = { ...session, phase: 'freezing', status: attention ? 'completed-with-attention' : 'completed', updatedAt: this.options.now() };
		const pkg: ReviewPreparationPackage = { schemaVersion: 1, packageId: this.options.id(), scanRunId: session.scanRunId, inputSnapshotId: session.inputSnapshotId, dispositions: session.dispositions, tasks: session.tasks, reviewArtifacts: session.artifacts, blockedAtomIds: session.dispositions.filter((item) => item.disposition === 'blocked').map((item) => item.atomId), completedAt: this.options.now() };
		await this.options.onCheckpoint?.(session);
		return { session, package: pkg };
	}

	private freezePlan(initial: ReviewPreparationSession): ReviewPreparationSession {
		const deterministic = initial.atoms.filter((atom) => atom.deterministicOnly);
		const deterministicDispositions = deterministic.map<ReviewAtomDispositionRecord>((atom) => ({ atomId: atom.id, disposition: atom.writeBoundary === 'recovery' ? 'blocked' : 'automatic-receipt', workKey: null, reason: 'Catalog-owned deterministic terminal disposition.' }));
		const jobs = planReviewJobs(initial.atoms, this.options.id);
		let session: ReviewPreparationSession = { ...initial, status: 'running', phase: jobs.length > 0 ? 'grouping' : 'freezing', dispositions: deterministicDispositions, jobs, planFrozenAt: this.options.now(), updatedAt: this.options.now() };
		for (const job of jobs) session = this.appendStream(session, job.jobId, 'job-queued', `${job.atomRefs.length} frozen atom${job.atomRefs.length === 1 ? '' : 's'} queued for review preparation.`);
		return session;
	}

	private patchJob(session: ReviewPreparationSession, jobId: string, patch: Partial<ReviewPreparationJob>): ReviewPreparationSession {
		return { ...session, phase: patch.status === 'revising' ? 'revising' : patch.status === 'inspecting' ? 'inspecting' : patch.status === 'attention' ? 'validating' : session.phase, jobs: session.jobs.map((job) => job.jobId === jobId ? { ...job, ...patch } : job), updatedAt: this.options.now() };
	}

	private appendStream(session: ReviewPreparationSession, jobId: string | null, type: ReviewPreparationStreamEvent['type'], text: string): ReviewPreparationSession {
		return { ...session, stream: [...session.stream, { id: this.options.id(), jobId, type, text, occurredAt: this.options.now() }].slice(-300), updatedAt: this.options.now() };
	}
}

function taskFromArtifact(artifact: ReviewWorkArtifact, atoms: readonly ReviewAtom[], now: number): VaultMaintenanceTask {
	const kind = atoms[0]?.kindId as VaultMaintenanceTask['kind'];
	return { id: `task:${artifact.workKey}`, workKey: artifact.workKey, reviewArtifactId: artifact.artifactId, preparationState: 'prepared', kind, sourceRunId: artifact.scanRunId, category: artifact.writeBoundary === 'recovery' ? 'recovery' : artifact.choices.length > 0 ? 'decision' : 'review', state: artifact.choices.length > 0 ? 'needs-choice' : 'verified', title: artifact.title, typeLabel: kind, affectedLabel: `${artifact.affectedObjectRefs.length} affected`, contextLabel: artifact.evidenceSummary, impact: artifact.impact, atomicItems: atoms.map((atom) => ({ id: atom.id, identityKey: atom.id, sourceFindingId: atom.id, signalId: atom.kindId, filePath: atom.objectRefs[0] ?? null, title: artifact.title, evidence: artifact.evidenceSummary, projectionKey: atom.ownerSurfaceId, projectionLabel: atom.ownerQuestionId, suggestedChoiceId: artifact.recommendedChoiceId, ownerChoice: null, provenance: [...atom.evidenceRefs] })), defaultChoice: null, createdAt: now, updatedAt: now };
}

function mergeDispositions(current: readonly ReviewAtomDispositionRecord[], next: readonly ReviewAtomDispositionRecord[]): ReviewAtomDispositionRecord[] { const map = new Map(current.map((item) => [item.atomId, item])); for (const item of next) map.set(item.atomId, item); return [...map.values()]; }
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
function addUsage(left: VaultScanUsage, right: VaultScanUsage): VaultScanUsage { return { inputTokens: left.inputTokens + right.inputTokens, outputTokens: left.outputTokens + right.outputTokens, totalTokens: left.totalTokens + right.totalTokens, costUsd: left.costUsd + right.costUsd }; }
