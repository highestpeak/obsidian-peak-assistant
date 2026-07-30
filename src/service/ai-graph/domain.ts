export type AIGraphSourceKind =
	| 'vault-file'
	| 'vault-block'
	| 'web-page'
	| 'manual-text'
	| 'analysis-result'
	| 'ai-graph-version';

export type AIGraphOriginSurface =
	| 'ai-search'
	| 'ai-analysis'
	| 'file-atlas'
	| 'composer'
	| 'vault-search'
	| 'chat-studio'
	| 'import';

export type AIGraphNodeKind =
	| 'vault-document'
	| 'web-resource'
	| 'concept'
	| 'person'
	| 'organization'
	| 'place'
	| 'event'
	| 'work'
	| 'product'
	| 'claim'
	| 'process'
	| 'dataset'
	| 'custom';

export type AIGraphRelationFamily =
	| 'semantic'
	| 'taxonomic'
	| 'causal'
	| 'evidence'
	| 'temporal'
	| 'attribution'
	| 'structural'
	| 'custom';

export interface AIGraphOriginContextRef {
	kind:
		| 'search-query'
		| 'vault-file'
		| 'vault-selection'
		| 'atlas-file'
		| 'conversation'
		| 'project'
		| 'import';
	ref: string;
	label: string;
	locator?: string;
}

export interface AIGraphSource {
	sourceId: string;
	kind: AIGraphSourceKind;
	title: string;
	locator: string;
	contentHash: string | null;
	capturedAt: number;
	freshness: 'current' | 'changed' | 'unavailable' | 'unknown';
	/**
	 * Source registry entries are tombstoned instead of deleted so immutable
	 * versions and evidence can always resolve their historical source.
	 */
	active?: boolean;
	removedAt?: number;
	parentSourceId?: string;
	metadata?: Record<string, string | number | boolean | null>;
}

export interface AIGraphEvidenceRef {
	evidenceId: string;
	sourceId: string;
	selector:
		| { kind: 'vault-lines'; from: number; to: number; heading?: string }
		| { kind: 'vault-block'; blockId: string }
		| { kind: 'text-quote'; exact: string; prefix?: string; suffix?: string }
		| { kind: 'url-fragment'; value: string };
	quote?: string;
	sourceContentHash: string | null;
	capturedAt: number;
}

export interface AIGraphProvenance {
	origin: 'ai-extracted' | 'ai-inferred' | 'deterministic' | 'user' | 'imported';
	runId?: string;
	provider?: string;
	model?: string;
	extractorVersion?: string;
}

export interface AIGraphNode {
	nodeId: string;
	kind: AIGraphNodeKind;
	label: string;
	aliases: string[];
	description?: string;
	canonicalRef?: string;
	customType?: string;
	properties: Record<string, string | number | boolean | null>;
	evidenceIds: string[];
	provenance: AIGraphProvenance;
	reviewStatus: 'suggested' | 'accepted' | 'edited' | 'rejected';
}

export interface AIGraphQualifier {
	key: string;
	value: string | number | boolean;
}

export interface AIGraphRelation {
	relationId: string;
	sourceNodeId: string;
	targetNodeId: string;
	family: AIGraphRelationFamily;
	predicate: string;
	label: string;
	directed: boolean;
	qualifiers: AIGraphQualifier[];
	evidenceIds: string[];
	confidence: number | null;
	explanation?: string;
	provenance: AIGraphProvenance;
	reviewStatus: 'suggested' | 'accepted' | 'edited' | 'rejected';
}

export interface AIGraphArtifactManifest {
	schemaVersion: 1;
	graphId: string;
	title: string;
	description?: string;
	graphType: 'free' | 'concept' | 'entity' | 'evidence' | 'causal' | 'timeline';
	status: 'draft' | 'active' | 'archived';
	headVersionId: string;
	createdAt: number;
	updatedAt: number;
	createdFrom: {
		surface: AIGraphOriginSurface;
		contextRefs: AIGraphOriginContextRef[];
	};
	tags: string[];
	defaultLens?: string;
}

export interface AIGraphVersion {
	schemaVersion: 1;
	graphId: string;
	versionId: string;
	parentVersionId?: string;
	createdAt: number;
	createdBy: 'user' | 'assistant' | 'system';
	changeKind:
		| 'generated'
		| 'sources-added'
		| 'refreshed'
		| 'semantic-edit'
		| 'restored'
		| 'imported';
	prompt?: string;
	sourceIds: string[];
	nodes: AIGraphNode[];
	relations: AIGraphRelation[];
	evidence: AIGraphEvidenceRef[];
	generation: {
		runId?: string;
		provider?: string;
		model?: string;
		extractorVersion?: string;
	};
	/**
	 * Creation origin lives on the manifest forever. Every later version records
	 * where the update was requested without overwriting that creation origin.
	 */
	updateProvenance?: {
		surface: AIGraphOriginSurface;
		contextRefs: AIGraphOriginContextRef[];
		baseVersionId: string;
		runId?: string;
		restoredFromVersionId?: string;
	};
	stats: AIGraphVersionStats;
}

export interface AIGraphVersionStats {
	nodeCount: number;
	relationCount: number;
	sourceCount: number;
	needsReviewCount: number;
}

export interface AIGraphArtifactView {
	manifest: AIGraphArtifactManifest;
	version: AIGraphVersion;
	sources: AIGraphSource[];
}

export interface AIGraphHistoryRow {
	graphId: string;
	title: string;
	graphType: AIGraphArtifactManifest['graphType'];
	status: AIGraphArtifactManifest['status'];
	versionId: string;
	versionNumber: number;
	updatedAt: number;
	stats: AIGraphVersionStats;
	createdFrom: AIGraphArtifactManifest['createdFrom'];
	changedSourceCount: number;
}

export interface AIGraphProjectionEntry {
	view: AIGraphArtifactView;
	versionNumber: number;
	/** Full immutable lineage when rebuilding; incremental writes may send head only. */
	versions?: readonly AIGraphVersion[];
}

export interface AIGraphProjectionPort {
	list(): Promise<AIGraphHistoryRow[] | null>;
	replace(entry: AIGraphProjectionEntry): Promise<void>;
	replaceAll(entries: readonly AIGraphProjectionEntry[]): Promise<void>;
	touchUsage(
		graphId: string,
		originSurface: AIGraphOriginSurface,
		contextRefs: readonly AIGraphOriginContextRef[],
		openedAt: number,
	): Promise<void>;
}

export type AIGraphRunEventType =
	| 'ai-graph.run.started'
	| 'ai-graph.sources.resolved'
	| 'ai-graph.extraction.completed'
	| 'ai-graph.entity-resolution.completed'
	| 'ai-graph.validation.completed'
	| 'ai-graph.version.created'
	| 'ai-graph.run.completed'
	| 'ai-graph.run.failed'
	| 'ai-graph.run.cancelled';

export interface AIGraphRunEvent {
	schemaVersion: 1;
	runId: string;
	event: AIGraphRunEventType;
	occurredAt: number;
	artifactRef?: { graphId: string; versionId: string };
	details?: Record<string, string | number | boolean | null>;
}

export interface AIGraphRunEventPort {
	append(event: AIGraphRunEvent): Promise<void>;
}

export interface AIGraphSemanticDiff {
	diffId: string;
	graphId: string;
	baseVersionId: string;
	instruction: string;
	createdAt: number;
	nodes: {
		added: AIGraphNode[];
		changed: Array<{ before: AIGraphNode; after: AIGraphNode }>;
		removed: AIGraphNode[];
	};
	relations: {
		added: AIGraphRelation[];
		changed: Array<{ before: AIGraphRelation; after: AIGraphRelation }>;
		removed: AIGraphRelation[];
	};
	evidence: {
		added: AIGraphEvidenceRef[];
		removed: AIGraphEvidenceRef[];
	};
	sourceIds: string[];
	updateProvenance: {
		surface: AIGraphOriginSurface;
		contextRefs: AIGraphOriginContextRef[];
	};
}

export interface AIGraphVersionComparison {
	graphId: string;
	fromVersionId: string;
	toVersionId: string;
	nodes: {
		added: AIGraphNode[];
		changed: Array<{ before: AIGraphNode; after: AIGraphNode }>;
		removed: AIGraphNode[];
	};
	relations: {
		added: AIGraphRelation[];
		changed: Array<{ before: AIGraphRelation; after: AIGraphRelation }>;
		removed: AIGraphRelation[];
	};
	evidence: {
		added: AIGraphEvidenceRef[];
		removed: AIGraphEvidenceRef[];
	};
}

export function isActiveAIGraphSource(source: AIGraphSource): boolean {
	return source.active !== false;
}

export function computeAIGraphStats(input: {
	nodes: readonly AIGraphNode[];
	relations: readonly AIGraphRelation[];
	sourceIds: readonly string[];
}): AIGraphVersionStats {
	const needsReviewCount = input.nodes.filter((node) => node.reviewStatus === 'suggested').length
		+ input.relations.filter((relation) =>
			relation.reviewStatus === 'suggested'
			|| (relation.provenance.origin.startsWith('ai-') && relation.evidenceIds.length === 0)).length;
	return {
		nodeCount: input.nodes.length,
		relationCount: input.relations.length,
		sourceCount: new Set(input.sourceIds).size,
		needsReviewCount,
	};
}

export function validateAIGraphVersion(version: AIGraphVersion): void {
	if (!version.graphId || !version.versionId) throw new Error('AI Graph version identity is required.');
	const nodeIds = new Set(version.nodes.map((node) => node.nodeId));
	if (nodeIds.size !== version.nodes.length) throw new Error('AI Graph contains duplicate node ids.');
	const relationIds = new Set<string>();
	for (const relation of version.relations) {
		if (relationIds.has(relation.relationId)) throw new Error('AI Graph contains duplicate relation ids.');
		relationIds.add(relation.relationId);
		if (!nodeIds.has(relation.sourceNodeId) || !nodeIds.has(relation.targetNodeId)) {
			throw new Error(`AI Graph relation ${relation.relationId} references a missing node.`);
		}
		if (relation.confidence !== null && (relation.confidence < 0 || relation.confidence > 1)) {
			throw new Error(`AI Graph relation ${relation.relationId} has invalid confidence.`);
		}
	}
	const evidenceIds = new Set(version.evidence.map((item) => item.evidenceId));
	if (evidenceIds.size !== version.evidence.length) {
		throw new Error('AI Graph contains duplicate evidence ids.');
	}
	for (const node of version.nodes) {
		for (const evidenceId of node.evidenceIds) {
			if (!evidenceIds.has(evidenceId)) {
				throw new Error(`AI Graph node ${node.nodeId} references missing evidence.`);
			}
		}
	}
	for (const relation of version.relations) {
		for (const evidenceId of relation.evidenceIds) {
			if (!evidenceIds.has(evidenceId)) {
				throw new Error(`AI Graph relation ${relation.relationId} references missing evidence.`);
			}
		}
	}
}
