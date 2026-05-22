/**
 * Output collector for copilot meta-agent and capability streams.
 *
 * The agent calls structured MCP tools (propose_insight / propose_change /
 * propose_source / attach_chat_followup / note_finding / submit_review) to
 * publish results. This collector captures those calls and exposes them
 * to the UI as typed proposals — replacing the older "infer artifacts
 * from result schema" path in CopilotArtifactAdapter.
 */

export type ChangeBlockProposal = {
	heading: string;
	before: string;
	after: string;
	rationale?: string;
};

export interface InsightProposal {
	id: string;
	title: string;
	body: string;
	severity: 'info' | 'low' | 'medium' | 'high';
	provenance: string[];
	followUpQuestions: string[];
	createdAt: number;
	roundIndex: number;
}

export interface ChangeProposal {
	id: string;
	title: string;
	blocks: ChangeBlockProposal[];
	provenance: string[];
	createdAt: number;
	roundIndex: number;
}

export interface SourceProposal {
	id: string;
	path: string;
	excerpt: string;
	relevance: string;
	weight: number;
	createdAt: number;
	roundIndex: number;
}

export interface ChatFollowupProposal {
	id: string;
	question: string;
	rationale: string;
	createdAt: number;
	roundIndex: number;
}

export interface NoteFinding {
	id: string;
	text: string;
	createdAt: number;
	roundIndex: number;
}

export interface ReviewSubmission {
	summary: string;
	modeUsed: 'fast' | 'complete';
	continue: boolean;
	continueRationale?: string;
	submittedAt: number;
	roundIndex: number;
}

// ─── Vault-scope proposals (Phase 1, vault Auto Review only) ───────────

export type VaultClusterStatus = 'growing' | 'stable' | 'dying' | 'central' | 'fragmenting';

export interface VaultClusterObservation {
	id: string;
	clusterId: string;             // community_metadata.community_id
	clusterLabel: string;
	memberCount: number;
	status: VaultClusterStatus;
	headline: string;              // 1 sentence
	body: string;                  // markdown
	representativeNotes: string[]; // vault paths
	createdAt: number;
	roundIndex: number;
}

export type VaultGapKind = 'structural-hole' | 'dangling-reference' | 'stale-hub' | 'abstraction-mismatch';

export interface VaultGapProposal {
	id: string;
	kind: VaultGapKind;
	title: string;
	body: string;                  // markdown explanation
	confidence: 'low' | 'medium' | 'high';
	references: string[];          // vault paths or [[concept]] tokens
	createdAt: number;
	roundIndex: number;
}

export type VaultActionPriority = 'low' | 'medium' | 'high';
export type VaultActionKind =
	| 'create-note'
	| 'merge-notes'
	| 'split-note'
	| 'archive-cluster'
	| 'add-tag'
	| 'restructure'
	| 'refresh-note';

export interface VaultActionProposal {
	id: string;
	kind: VaultActionKind;
	priority: VaultActionPriority;
	title: string;
	rationale: string;
	involvedNotes: string[];       // vault paths the action touches
	estimatedImpact?: string;      // human readable, e.g. "Connect 7 dangling references"
	createdAt: number;
	roundIndex: number;
}

export interface CopilotProposals {
	insights: InsightProposal[];
	changes: ChangeProposal[];
	sources: SourceProposal[];
	chatFollowups: ChatFollowupProposal[];
	findings: NoteFinding[];
	submissions: ReviewSubmission[];
	clusterObservations: VaultClusterObservation[];
	gaps: VaultGapProposal[];
	actions: VaultActionProposal[];
}

export function createEmptyProposals(): CopilotProposals {
	return {
		insights: [],
		changes: [],
		sources: [],
		chatFollowups: [],
		findings: [],
		submissions: [],
		clusterObservations: [],
		gaps: [],
		actions: [],
	};
}

type Listener = (kind: keyof CopilotProposals, payload: unknown) => void;

/**
 * Stateful collector. One per review session.
 * `roundIndex` is set externally and stamped on every proposal so the UI can
 * group artifacts by round (Phase 2 multi-round flow).
 */
export class CopilotOutputCollector {
	private proposals: CopilotProposals = createEmptyProposals();
	private listeners = new Set<Listener>();
	private idSeq = 0;
	public roundIndex = 0;

	getSnapshot(): CopilotProposals {
		return {
			insights: [...this.proposals.insights],
			changes: [...this.proposals.changes],
			sources: [...this.proposals.sources],
			chatFollowups: [...this.proposals.chatFollowups],
			findings: [...this.proposals.findings],
			submissions: [...this.proposals.submissions],
			clusterObservations: [...this.proposals.clusterObservations],
			gaps: [...this.proposals.gaps],
			actions: [...this.proposals.actions],
		};
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(kind: keyof CopilotProposals, payload: unknown): void {
		for (const listener of this.listeners) {
			try {
				listener(kind, payload);
			} catch (err) {
				console.error('[CopilotOutputCollector] listener error', err);
			}
		}
	}

	private nextId(prefix: string): string {
		this.idSeq += 1;
		return `${prefix}-${this.roundIndex}-${this.idSeq}`;
	}

	addInsight(input: Omit<InsightProposal, 'id' | 'createdAt' | 'roundIndex'>): InsightProposal {
		const insight: InsightProposal = {
			...input,
			id: this.nextId('insight'),
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.insights.push(insight);
		this.notify('insights', insight);
		return insight;
	}

	addChange(input: Omit<ChangeProposal, 'id' | 'createdAt' | 'roundIndex'>): ChangeProposal {
		const change: ChangeProposal = {
			...input,
			id: this.nextId('change'),
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.changes.push(change);
		this.notify('changes', change);
		return change;
	}

	addSource(input: Omit<SourceProposal, 'id' | 'createdAt' | 'roundIndex'>): SourceProposal {
		const source: SourceProposal = {
			...input,
			id: this.nextId('source'),
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.sources.push(source);
		this.notify('sources', source);
		return source;
	}

	addChatFollowup(
		input: Omit<ChatFollowupProposal, 'id' | 'createdAt' | 'roundIndex'>,
	): ChatFollowupProposal {
		const followup: ChatFollowupProposal = {
			...input,
			id: this.nextId('chat'),
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.chatFollowups.push(followup);
		this.notify('chatFollowups', followup);
		return followup;
	}

	addFinding(text: string): NoteFinding {
		const finding: NoteFinding = {
			id: this.nextId('finding'),
			text,
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.findings.push(finding);
		this.notify('findings', finding);
		return finding;
	}

	recordSubmission(input: Omit<ReviewSubmission, 'submittedAt' | 'roundIndex'>): ReviewSubmission {
		const submission: ReviewSubmission = {
			...input,
			submittedAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.submissions.push(submission);
		this.notify('submissions', submission);
		return submission;
	}

	addClusterObservation(
		input: Omit<VaultClusterObservation, 'id' | 'createdAt' | 'roundIndex'>,
	): VaultClusterObservation {
		const obs: VaultClusterObservation = {
			...input,
			id: this.nextId('cluster-obs'),
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.clusterObservations.push(obs);
		this.notify('clusterObservations', obs);
		return obs;
	}

	addGap(input: Omit<VaultGapProposal, 'id' | 'createdAt' | 'roundIndex'>): VaultGapProposal {
		const gap: VaultGapProposal = {
			...input,
			id: this.nextId('gap'),
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.gaps.push(gap);
		this.notify('gaps', gap);
		return gap;
	}

	addAction(input: Omit<VaultActionProposal, 'id' | 'createdAt' | 'roundIndex'>): VaultActionProposal {
		const action: VaultActionProposal = {
			...input,
			id: this.nextId('action'),
			createdAt: Date.now(),
			roundIndex: this.roundIndex,
		};
		this.proposals.actions.push(action);
		this.notify('actions', action);
		return action;
	}

	/** Total proposals produced so far across all rounds. */
	totalProposalCount(): number {
		return (
			this.proposals.insights.length +
			this.proposals.changes.length +
			this.proposals.sources.length +
			this.proposals.chatFollowups.length +
			this.proposals.clusterObservations.length +
			this.proposals.gaps.length +
			this.proposals.actions.length
		);
	}

	/** Submission corresponding to the current round, if any. */
	currentSubmission(): ReviewSubmission | undefined {
		return this.proposals.submissions.find(s => s.roundIndex === this.roundIndex);
	}
}
