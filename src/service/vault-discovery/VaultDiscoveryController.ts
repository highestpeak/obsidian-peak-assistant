import type { DiscoveryFinding, DiscoveryInvestigation, DiscoveryStreamEvent, EvidenceLedger, VaultDiscoverySession } from '@/core/types/vault-discovery';
import type { VaultScanUsage } from '@/core/types/vault-intelligence';
import { evaluateDiscoveryCompletion } from './VaultDiscoveryCompletionGate';
import { FindingRegistry, type FindingProposal } from './FindingRegistry';

const EMPTY_USAGE: VaultScanUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

export interface DiscoveryAttemptOutput {
	attemptId: string;
	stream: readonly Omit<DiscoveryStreamEvent, 'id' | 'occurredAt'>[];
	inspectedEvidenceRefs: readonly string[];
	proposals: readonly FindingProposal[];
	terminalObjectiveIds: readonly string[];
	usage: VaultScanUsage;
	error?: string | null;
}

export interface VaultDiscoveryAttemptPort {
	run(input: { session: VaultDiscoverySession; investigation: DiscoveryInvestigation; signal: AbortSignal }): Promise<DiscoveryAttemptOutput>;
}

export interface VaultDiscoveryControllerOptions {
	now: () => number;
	id: () => string;
	onCheckpoint?: (session: VaultDiscoverySession) => Promise<void> | void;
}

export class VaultDiscoveryController {
	constructor(private readonly attemptPort: VaultDiscoveryAttemptPort, private readonly options: VaultDiscoveryControllerOptions) {}

	create(input: { sessionId: string; scanRunId: string; snapshotId: string; evidence: EvidenceLedger; objectiveIds: readonly string[]; seedInvestigations?: readonly Omit<DiscoveryInvestigation, 'updatedAt'>[] }): VaultDiscoverySession {
		const investigations = Object.fromEntries((input.seedInvestigations ?? input.objectiveIds.map((objective, index) => ({ id: `investigation:${objective}`, question: `Investigate ${objective}`, state: 'open' as const, priority: Math.max(0.5, 1 - index * 0.05), evidenceRefs: [], findingRefs: [], parentInvestigationId: null, revisitCount: 0 }))).map((item) => [item.id, { ...item, updatedAt: this.options.now() }]));
		return { schemaVersion: 1, id: input.sessionId, scanRunId: input.scanRunId, snapshotId: input.snapshotId, status: 'preparing', evidence: input.evidence, investigations, findings: {}, frontier: Object.keys(investigations), objectiveIds: [...input.objectiveIds], terminalObjectiveIds: [], candidateDenominator: null, terminalCandidateCount: 0, stableCycles: 0, completionReceiptId: null, blockers: [], usage: { ...EMPTY_USAGE }, stream: [], attemptIds: [], updatedAt: this.options.now() };
	}

	async run(initial: VaultDiscoverySession, signal: AbortSignal): Promise<VaultDiscoverySession> {
		let session: VaultDiscoverySession = { ...initial, status: 'running', updatedAt: this.options.now() };
		const registry = new FindingRegistry({ ...session.findings }, this.options.now);
		while (!signal.aborted) {
			const investigation = nextInvestigation(session);
			if (!investigation) {
				session = { ...session, stableCycles: session.stableCycles + 1 };
				const decision = evaluateDiscoveryCompletion(session);
				if (decision.allowed) {
					session = { ...session, status: decision.status!, completionReceiptId: this.options.id(), blockers: [], updatedAt: this.options.now() };
					await this.options.onCheckpoint?.(session);
					return session;
				}
				session = terminalizeRemaining(session, decision.blockers, this.options.now());
				continue;
			}
			session = updateInvestigation(session, { ...investigation, state: 'gathering', updatedAt: this.options.now() });
			await this.options.onCheckpoint?.(session);
			let output: DiscoveryAttemptOutput;
			try {
				output = await this.attemptPort.run({ session, investigation, signal });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				session = updateInvestigation(session, { ...investigation, state: 'blocked', updatedAt: this.options.now() });
				session = appendStream(session, { type: 'warning', text: message, route: null, evidenceRef: null }, this.options);
				await this.options.onCheckpoint?.(session);
				throw error;
			}
			const beforeCount = retainedCount(session.findings);
			for (const proposal of output.proposals) registry.propose(proposal);
			const findings = registry.snapshot();
			const afterCount = retainedCount(findings);
			const findingRefs = Object.values(findings).filter((finding) => finding.investigationRefs.includes(investigation.id)).map((finding) => finding.id);
			session = {
				...session,
				findings,
				investigations: { ...session.investigations, [investigation.id]: { ...investigation, state: output.error ? 'blocked' : 'resolved', evidenceRefs: unique([...investigation.evidenceRefs, ...output.inspectedEvidenceRefs]), findingRefs, updatedAt: this.options.now() } },
				frontier: session.frontier.filter((id) => id !== investigation.id),
				evidence: { ...session.evidence, inspectedRefs: unique([...session.evidence.inspectedRefs, ...output.inspectedEvidenceRefs]) },
				terminalObjectiveIds: unique([...session.terminalObjectiveIds, ...output.terminalObjectiveIds]),
				candidateDenominator: Math.max(session.candidateDenominator ?? 0, Object.values(findings).length),
				terminalCandidateCount: Object.values(findings).filter((finding) => finding.state !== 'candidate').length,
				stableCycles: afterCount === beforeCount ? session.stableCycles + 1 : 0,
				attemptIds: unique([...session.attemptIds, output.attemptId]),
				usage: addUsage(session.usage, output.usage),
				updatedAt: this.options.now(),
			};
			for (const event of output.stream) session = appendStream(session, event, this.options);
			await this.options.onCheckpoint?.(session);
		}
		return { ...session, status: 'paused', updatedAt: this.options.now() };
	}
}

function nextInvestigation(session: VaultDiscoverySession): DiscoveryInvestigation | null {
	return session.frontier.map((id) => session.investigations[id]).filter((item): item is DiscoveryInvestigation => Boolean(item && ['open', 'gathering', 'testing'].includes(item.state))).sort((left, right) => right.priority - left.priority)[0] ?? null;
}

function updateInvestigation(session: VaultDiscoverySession, investigation: DiscoveryInvestigation): VaultDiscoverySession {
	return { ...session, investigations: { ...session.investigations, [investigation.id]: investigation }, updatedAt: investigation.updatedAt };
}

function terminalizeRemaining(session: VaultDiscoverySession, blockers: readonly string[], now: number): VaultDiscoverySession {
	const eligible = new Set(session.evidence.eligibleRefs);
	const accounted = new Set([...session.evidence.inspectedRefs, ...session.evidence.excludedRefs.map((entry) => entry.ref), ...session.evidence.failedRefs.map((entry) => entry.ref)]);
	const excluded = [...session.evidence.excludedRefs, ...[...eligible].filter((ref) => !accounted.has(ref)).map((ref) => ({ ref, reason: 'Discovery completed with attention before this evidence unit could be inspected.' }))];
	const investigations = Object.fromEntries(Object.entries(session.investigations).map(([id, item]) => [id, ['open', 'gathering', 'testing'].includes(item.state) ? { ...item, state: 'blocked' as const, updatedAt: now } : item]));
	return { ...session, evidence: { ...session.evidence, excludedRefs: excluded }, investigations, frontier: [], terminalObjectiveIds: [...session.objectiveIds], stableCycles: 3, blockers, updatedAt: now };
}

function appendStream(session: VaultDiscoverySession, event: Omit<DiscoveryStreamEvent, 'id' | 'occurredAt'>, options: VaultDiscoveryControllerOptions): VaultDiscoverySession {
	return { ...session, stream: [...session.stream, { ...event, id: options.id(), occurredAt: options.now() }].slice(-300), updatedAt: options.now() };
}

function retainedCount(findings: Readonly<Record<string, DiscoveryFinding>>): number { return Object.values(findings).filter((finding) => ['retained', 'revised'].includes(finding.state)).length; }
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
function addUsage(left: VaultScanUsage, right: VaultScanUsage): VaultScanUsage { return { inputTokens: left.inputTokens + right.inputTokens, outputTokens: left.outputTokens + right.outputTokens, totalTokens: left.totalTokens + right.totalTokens, costUsd: left.costUsd + right.costUsd }; }
