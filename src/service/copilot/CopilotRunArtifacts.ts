export type CopilotReviewTab = 'changes' | 'insights' | 'sources' | 'chat' | 'trace';

export interface ArtifactProvenance {
	capabilityId: string;
	label: string;
	sourcePath?: string;
	sourceTitle?: string;
	signal?: 'selection' | 'semantic' | 'graph' | 'backlink' | 'tag' | 'hub' | 'task' | 'agent';
	confidence?: number;
}

export interface ChangeBlockArtifact {
	id: string;
	heading?: string;
	before: string;
	after: string;
	provenance: ArtifactProvenance[];
	selected?: boolean;
}

export interface ChangeArtifact {
	id: string;
	type: 'change';
	title: string;
	provenance: ArtifactProvenance[];
	blocks: ChangeBlockArtifact[];
}

export interface InsightAction {
	id: string;
	label: string;
	kind: 'ask-follow-up' | 'open-source' | 'save-to-note' | 'create-proposal';
}

export interface InsightArtifact {
	id: string;
	type: 'insight';
	title: string;
	body: string;
	severity?: 'info' | 'low' | 'medium' | 'high';
	provenance: ArtifactProvenance[];
	actions?: InsightAction[];
}

export interface SourceArtifact {
	id: string;
	type: 'source';
	path: string;
	title: string;
	excerpt?: string;
	provenance: ArtifactProvenance[];
}

export interface TraceArtifact {
	id: string;
	type: 'trace';
	label: string;
	status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
	summary?: string;
	kind?:
		| 'observe'
		| 'call'
		| 'read'
		| 'insight'
		| 'revise'
		| 'prepare'
		| 'system'
		| 'error'
		| 'plan'
		| 'finding'
		| 'budget-warning'
		| 'round-header'
		| 'propose-insight'
		| 'propose-change'
		| 'propose-source'
		| 'propose-chat-followup'
		| 'submit-review';
	timestamp?: number;
	badge?: string;
	detail?: string;
	capabilityId?: string;
	toolName?: string;
	/** 0-based round index for multi-round Auto Review. */
	roundIndex?: number;
	/**
	 * If set, this item is the anchor for a collapsible group. Other items in
	 * the same round whose `groupOf` matches this id are folded under it.
	 */
	groupRoot?: boolean;
	/** Id of the group anchor this item belongs to (the matching `propose_*` trace item). */
	groupOf?: string;
}

export interface CopilotRunArtifacts {
	changes: ChangeArtifact[];
	insights: InsightArtifact[];
	sources: SourceArtifact[];
	trace: TraceArtifact[];
	allProvenance: ArtifactProvenance[];
}

export type CapabilityArtifact = ChangeArtifact | InsightArtifact | SourceArtifact | TraceArtifact;

export function createEmptyCopilotRunArtifacts(): CopilotRunArtifacts {
	return {
		changes: [],
		insights: [],
		sources: [],
		trace: [],
		allProvenance: [],
	};
}

export function mergeCapabilityArtifact(
	current: CopilotRunArtifacts,
	artifact: CapabilityArtifact,
): CopilotRunArtifacts {
	const artifactProvenance = 'provenance' in artifact ? artifact.provenance : [];
	const allProvenance = [...current.allProvenance, ...artifactProvenance];

	if (artifact.type === 'change') {
		return { ...current, changes: [...current.changes, artifact], allProvenance };
	}

	if (artifact.type === 'insight') {
		return { ...current, insights: [...current.insights, artifact], allProvenance };
	}

	if (artifact.type === 'source') {
		return { ...current, sources: [...current.sources, artifact], allProvenance };
	}

	return { ...current, trace: [...current.trace, artifact], allProvenance };
}

export function getDefaultReviewTab(artifacts: CopilotRunArtifacts): CopilotReviewTab {
	if (artifacts.changes.length > 0) return 'changes';
	if (artifacts.insights.length > 0) return 'insights';
	if (artifacts.sources.length > 0) return 'sources';
	if (artifacts.trace.length > 0) return 'trace';
	return 'insights';
}
