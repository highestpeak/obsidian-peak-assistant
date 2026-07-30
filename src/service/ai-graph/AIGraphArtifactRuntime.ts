import type { AIInstructionEnvelope } from '@/core/instruction-composer';
import {
	computeAIGraphStats,
	type AIGraphArtifactManifest,
	type AIGraphArtifactView,
	type AIGraphEvidenceRef,
	type AIGraphHistoryRow,
	type AIGraphNode,
	type AIGraphOriginContextRef,
	type AIGraphOriginSurface,
	type AIGraphRelation,
	type AIGraphSemanticDiff,
	type AIGraphSource,
	type AIGraphVersion,
	type AIGraphVersionComparison,
	type AIGraphProjectionPort,
	type AIGraphRunEvent,
	type AIGraphRunEventPort,
	isActiveAIGraphSource,
} from './domain';
import { AIGraphArtifactRepository } from './AIGraphArtifactRepository';

export interface CreateAIGraphRequest {
	title: string;
	description?: string;
	graphType: AIGraphArtifactManifest['graphType'];
	createdFrom: {
		surface: AIGraphOriginSurface;
		contextRefs: AIGraphOriginContextRef[];
	};
	prompt?: string;
	sources: AIGraphSource[];
	nodes: AIGraphNode[];
	relations: AIGraphRelation[];
	evidence: AIGraphEvidenceRef[];
	generation?: AIGraphVersion['generation'];
	createdAt?: number;
	changeKind?: AIGraphVersion['changeKind'];
}

export interface AIGraphUpdateContext {
	graphId: string;
	baseVersionId: string;
	selection?: { kind: 'node' | 'relation'; id: string };
	sourceIds: string[];
	lens?: string;
	reviewContext?: string[];
	updateFrom: {
		surface: AIGraphOriginSurface;
		contextRefs: AIGraphOriginContextRef[];
	};
}

export type AIGraphUpdateEnvelope = AIInstructionEnvelope<AIGraphUpdateContext>;

export interface ProposedAIGraphChangeSet {
	nodes?: AIGraphSemanticDiff['nodes'];
	relations?: AIGraphSemanticDiff['relations'];
	evidence?: AIGraphSemanticDiff['evidence'];
	sourceIds?: string[];
}

function semanticEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function buildAIGraphChangeSet(
	current: AIGraphArtifactView['version'],
	proposed: {
		nodes: AIGraphNode[];
		relations: AIGraphRelation[];
		evidence: AIGraphEvidenceRef[];
		sourceIds?: string[];
	},
): ProposedAIGraphChangeSet {
	const diffById = <T>(
		before: readonly T[],
		after: readonly T[],
		idOf: (item: T) => string,
	): {
		added: T[];
		changed: Array<{ before: T; after: T }>;
		removed: T[];
	} => {
		const beforeById = new Map(before.map((item) => [idOf(item), item]));
		const afterById = new Map(after.map((item) => [idOf(item), item]));
		return {
			added: after.filter((item) => !beforeById.has(idOf(item))),
			changed: after.flatMap((item) => {
				const previous = beforeById.get(idOf(item));
				if (!previous || semanticEqual(previous, item)) return [];
				return [{ before: previous, after: item }];
			}),
			removed: before.filter((item) => !afterById.has(idOf(item))),
		};
	};
	const evidence = diffById(current.evidence, proposed.evidence, (item) => item.evidenceId);
	return {
		nodes: diffById(current.nodes, proposed.nodes, (item) => item.nodeId),
		relations: diffById(current.relations, proposed.relations, (item) => item.relationId),
		evidence: {
			added: evidence.added,
			removed: evidence.removed,
		},
		sourceIds: proposed.sourceIds ?? current.sourceIds,
	};
}

function mergeChanged<T>(
	current: readonly T[],
	removed: readonly T[],
	changed: readonly { before: T; after: T }[],
	added: readonly T[],
	idOf: (item: T) => string,
): T[] {
	const removedIds = new Set(removed.map(idOf));
	const changedById = new Map(changed.map((item) => [idOf(item.before), item.after]));
	const next = current
		.filter((item) => !removedIds.has(idOf(item)))
		.map((item) => changedById.get(idOf(item)) ?? item);
	for (const item of added) {
		const id = idOf(item);
		const index = next.findIndex((existing) => idOf(existing) === id);
		if (index >= 0) next[index] = item;
		else next.push(item);
	}
	return next;
}

export class AIGraphArtifactRuntime {
	constructor(
		private readonly repository: AIGraphArtifactRepository,
		private readonly idFactory: () => string = () => crypto.randomUUID(),
		private readonly now: () => number = () => Date.now(),
		private readonly projection?: AIGraphProjectionPort,
		private readonly runEvents?: AIGraphRunEventPort,
	) {}

	async create(request: CreateAIGraphRequest): Promise<AIGraphArtifactView> {
		const createdAt = request.createdAt ?? this.now();
		const graphId = `aig-${this.idFactory()}`;
		const versionId = `aigv-${this.idFactory()}`;
		const sourceIds = [...new Set(request.sources.map((source) => source.sourceId))];
		const version: AIGraphVersion = {
			schemaVersion: 1,
			graphId,
			versionId,
			createdAt,
			createdBy: request.createdFrom.surface === 'import' ? 'system' : 'assistant',
			changeKind: request.changeKind ?? 'generated',
			...(request.prompt ? { prompt: request.prompt } : {}),
			sourceIds,
			nodes: request.nodes,
			relations: request.relations,
			evidence: request.evidence,
			generation: request.generation ?? {},
			stats: computeAIGraphStats({ nodes: request.nodes, relations: request.relations, sourceIds }),
		};
		const manifest: AIGraphArtifactManifest = {
			schemaVersion: 1,
			graphId,
			title: request.title,
			...(request.description ? { description: request.description } : {}),
			graphType: request.graphType,
			status: 'active',
			headVersionId: versionId,
			createdAt,
			updatedAt: createdAt,
			createdFrom: request.createdFrom,
			tags: [],
			defaultLens: 'constellation',
		};
		const runId = request.generation?.runId ?? `aigr-${this.idFactory()}`;
		try {
			await this.recordSuccessfulRunPrelude(runId, request, createdAt);
			const view = await this.repository.create(manifest, version, request.sources);
			await this.tryProject({
				view,
				versionNumber: await this.repository.versionCount(graphId),
			});
			await this.appendRunEvent({
				schemaVersion: 1,
				runId,
				event: 'ai-graph.version.created',
				occurredAt: this.now(),
				artifactRef: { graphId, versionId },
				details: {
					nodeCount: version.stats.nodeCount,
					relationCount: version.stats.relationCount,
					sourceCount: version.stats.sourceCount,
				},
			});
			await this.appendRunEvent({
				schemaVersion: 1,
				runId,
				event: 'ai-graph.run.completed',
				occurredAt: this.now(),
				artifactRef: { graphId, versionId },
			});
			return view;
		} catch (error) {
			await this.appendRunEvent({
				schemaVersion: 1,
				runId,
				event: 'ai-graph.run.failed',
				occurredAt: this.now(),
				details: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
			throw error;
		}
	}

	async open(graphId: string, versionId?: string): Promise<AIGraphArtifactView | null> {
		const view = await this.repository.open(graphId, versionId);
		if (view) {
			await this.tryTouchUsage(view);
		}
		return view;
	}

	/** Read-only projection probe that does not count as a user open. */
	peek(graphId: string, versionId?: string): Promise<AIGraphArtifactView | null> {
		return this.repository.open(graphId, versionId);
	}

	async list(): Promise<AIGraphHistoryRow[]> {
		const projected = await this.projection?.list() ?? null;
		const canonicalRows = await this.repository.list();
		const canonicalById = new Map(
			canonicalRows.map((row) => [row.graphId, row]),
		);
		const projectionMatchesCanonical = projected
			&& projected.length === canonicalRows.length
			&& projected.every((row) => {
				const canonical = canonicalById.get(row.graphId);
				return canonical?.versionId === row.versionId
					&& canonical.versionNumber === row.versionNumber
					&& canonical.updatedAt === row.updatedAt
					&& canonical.changedSourceCount === row.changedSourceCount;
			});
		if (projectionMatchesCanonical) return projected;
		const entries = await this.repository.projectionEntries();
		if (this.projection) {
			try {
				await this.projection.replaceAll(entries);
			} catch (error) {
				console.warn('[AI Graph] projection rebuild failed; using canonical artifacts.', error);
			}
		}
		return canonicalRows;
	}

	listVersions(graphId: string): Promise<AIGraphVersion[]> {
		return this.repository.listVersions(graphId);
	}

	async replaceSources(
		graphId: string,
		sources: readonly AIGraphSource[],
	): Promise<AIGraphArtifactView> {
		await this.repository.replaceSources(graphId, sources);
		const view = await this.repository.open(graphId);
		if (!view) throw new Error(`AI Graph ${graphId} does not exist.`);
		await this.tryProject({
			view,
			versionNumber: await this.repository.versionCount(graphId),
		});
		return view;
	}

	async addSources(
		graphId: string,
		sources: readonly AIGraphSource[],
	): Promise<AIGraphArtifactView> {
		const view = await this.repository.open(graphId);
		if (!view) throw new Error(`AI Graph ${graphId} does not exist.`);
		const byId = new Map(view.sources.map((source) => [source.sourceId, source]));
		for (const source of sources) {
			const previous = byId.get(source.sourceId);
			const { removedAt: _removedAt, ...previousWithoutTombstone } = previous ?? {};
			byId.set(source.sourceId, {
				...previousWithoutTombstone,
				...source,
				active: true,
			});
		}
		return this.replaceSources(graphId, [...byId.values()]);
	}

	/**
	 * Removing a source never deletes the registry record. Historical versions
	 * and evidence continue to resolve while future updates omit inactive inputs.
	 */
	async deactivateSource(graphId: string, sourceId: string): Promise<AIGraphArtifactView> {
		const view = await this.repository.open(graphId);
		if (!view) throw new Error(`AI Graph ${graphId} does not exist.`);
		if (!view.sources.some((source) => source.sourceId === sourceId)) return view;
		return this.replaceSources(
			graphId,
			view.sources.map((source) => source.sourceId === sourceId
				? {
						...source,
						active: false,
						removedAt: this.now(),
						freshness: 'unavailable' as const,
					}
				: source),
		);
	}

	async markSourceFreshness(
		graphId: string,
		sourceId: string,
		freshness: AIGraphSource['freshness'],
		contentHash?: string | null,
	): Promise<void> {
		const view = await this.repository.open(graphId);
		if (!view) throw new Error(`AI Graph ${graphId} does not exist.`);
		const sources = view.sources.map((source) => source.sourceId === sourceId
			? {
				...source,
				freshness,
				...(contentHash !== undefined ? { contentHash } : {}),
			}
			: source);
		await this.repository.replaceSources(graphId, sources);
		const refreshed = await this.repository.open(graphId);
		if (refreshed) {
			await this.tryProject({
				view: refreshed,
				versionNumber: await this.repository.versionCount(graphId),
			});
		}
	}

	async proposeUpdate(
		envelope: AIGraphUpdateEnvelope,
		changes: ProposedAIGraphChangeSet,
	): Promise<AIGraphSemanticDiff> {
		const view = await this.repository.open(
			envelope.surfaceContext.graphId,
			envelope.surfaceContext.baseVersionId,
		);
		if (!view) throw new Error(`AI Graph ${envelope.surfaceContext.graphId} does not exist.`);
		if (view.version.versionId !== envelope.surfaceContext.baseVersionId) {
			throw new Error('AI Graph update base version could not be resolved.');
		}
		return {
			diffId: `aigd-${this.idFactory()}`,
			graphId: view.manifest.graphId,
			baseVersionId: view.version.versionId,
			instruction: envelope.submission.instruction,
			createdAt: this.now(),
			nodes: changes.nodes ?? { added: [], changed: [], removed: [] },
			relations: changes.relations ?? { added: [], changed: [], removed: [] },
			evidence: changes.evidence ?? { added: [], removed: [] },
			sourceIds: changes.sourceIds ?? view.version.sourceIds,
			updateProvenance: {
				surface: envelope.surfaceContext.updateFrom.surface,
				contextRefs: [...envelope.surfaceContext.updateFrom.contextRefs],
			},
		};
	}

	async acceptUpdate(diff: AIGraphSemanticDiff): Promise<AIGraphArtifactView> {
		const view = await this.repository.open(diff.graphId, diff.baseVersionId);
		if (!view) throw new Error(`AI Graph ${diff.graphId} does not exist.`);
		const nodes = mergeChanged(
			view.version.nodes,
			diff.nodes.removed,
			diff.nodes.changed,
			diff.nodes.added,
			(node) => node.nodeId,
		);
		const relations = mergeChanged(
			view.version.relations,
			diff.relations.removed,
			diff.relations.changed,
			diff.relations.added,
			(relation) => relation.relationId,
		);
		const evidence = mergeChanged(
			view.version.evidence,
			diff.evidence.removed,
			[],
			diff.evidence.added,
			(item) => item.evidenceId,
		);
		const createdAt = this.now();
		const runId = diff.diffId;
		const version: AIGraphVersion = {
			schemaVersion: 1,
			graphId: diff.graphId,
			versionId: `aigv-${this.idFactory()}`,
			parentVersionId: diff.baseVersionId,
			createdAt,
			createdBy: 'user',
			changeKind: 'semantic-edit',
			prompt: diff.instruction,
			sourceIds: [...new Set(diff.sourceIds)],
			nodes,
			relations,
			evidence,
			generation: {},
			updateProvenance: {
				surface: diff.updateProvenance.surface,
				contextRefs: [...diff.updateProvenance.contextRefs],
				baseVersionId: diff.baseVersionId,
				runId,
			},
			stats: computeAIGraphStats({ nodes, relations, sourceIds: diff.sourceIds }),
		};
		await this.appendRunEvent({
			schemaVersion: 1,
			runId,
			event: 'ai-graph.run.started',
			occurredAt: createdAt,
			details: { kind: 'semantic-edit' },
		});
		try {
			const accepted = await this.repository.appendVersion(
				diff.graphId,
				diff.baseVersionId,
				version,
			);
			await this.tryProject({
				view: accepted,
				versionNumber: await this.repository.versionCount(diff.graphId),
			});
			await this.appendRunEvent({
				schemaVersion: 1,
				runId,
				event: 'ai-graph.version.created',
				occurredAt: this.now(),
				artifactRef: {
					graphId: accepted.manifest.graphId,
					versionId: accepted.version.versionId,
				},
				details: { changeKind: 'semantic-edit' },
			});
			await this.appendRunEvent({
				schemaVersion: 1,
				runId,
				event: 'ai-graph.run.completed',
				occurredAt: this.now(),
				artifactRef: {
					graphId: accepted.manifest.graphId,
					versionId: accepted.version.versionId,
				},
			});
			return accepted;
		} catch (error) {
			await this.appendRunEvent({
				schemaVersion: 1,
				runId,
				event: 'ai-graph.run.failed',
				occurredAt: this.now(),
				details: { error: error instanceof Error ? error.message : String(error) },
			});
			throw error;
		}
	}

	/** Preview/cancel is deliberately a no-op against the canonical repository. */
	cancelUpdate(_diff: AIGraphSemanticDiff): void {}

	async compareVersions(
		graphId: string,
		fromVersionId: string,
		toVersionId: string,
	): Promise<AIGraphVersionComparison> {
		const [from, to] = await Promise.all([
			this.repository.open(graphId, fromVersionId),
			this.repository.open(graphId, toVersionId),
		]);
		if (!from || !to) throw new Error(`AI Graph ${graphId} version comparison could not be resolved.`);
		const changes = buildAIGraphChangeSet(from.version, {
			nodes: to.version.nodes,
			relations: to.version.relations,
			evidence: to.version.evidence,
			sourceIds: to.version.sourceIds,
		});
		return {
			graphId,
			fromVersionId,
			toVersionId,
			nodes: changes.nodes!,
			relations: changes.relations!,
			evidence: changes.evidence!,
		};
	}

	/**
	 * Restore is append-only: it copies the selected immutable body into a new
	 * head version instead of moving the manifest pointer backwards.
	 */
	async restoreVersion(
		graphId: string,
		versionId: string,
		updateFrom: {
			surface: AIGraphOriginSurface;
			contextRefs: AIGraphOriginContextRef[];
		},
	): Promise<AIGraphArtifactView> {
		const [head, selected] = await Promise.all([
			this.repository.open(graphId),
			this.repository.open(graphId, versionId),
		]);
		if (!head || !selected) throw new Error(`AI Graph ${graphId} version restore could not be resolved.`);
		const createdAt = this.now();
		const next: AIGraphVersion = {
			...selected.version,
			versionId: `aigv-${this.idFactory()}`,
			parentVersionId: head.version.versionId,
			createdAt,
			createdBy: 'user',
			changeKind: 'restored',
			prompt: `Restore ${versionId}`,
			generation: {},
			updateProvenance: {
				surface: updateFrom.surface,
				contextRefs: [...updateFrom.contextRefs],
				baseVersionId: head.version.versionId,
				restoredFromVersionId: versionId,
			},
		};
		const restored = await this.repository.appendVersion(
			graphId,
			head.version.versionId,
			next,
		);
		await this.tryProject({
			view: restored,
			versionNumber: await this.repository.versionCount(graphId),
		});
		return restored;
	}

	async duplicateVersion(input: {
		graphId: string;
		versionId: string;
		title?: string;
		createdFrom: CreateAIGraphRequest['createdFrom'];
	}): Promise<AIGraphArtifactView> {
		const source = await this.repository.open(input.graphId, input.versionId);
		if (!source) throw new Error(`AI Graph ${input.graphId} version ${input.versionId} does not exist.`);
		return this.create({
			title: input.title?.trim() || `${source.manifest.title} copy`,
			description: source.manifest.description,
			graphType: source.manifest.graphType,
			createdFrom: input.createdFrom,
			prompt: `Duplicate ${input.graphId}/${input.versionId}`,
			// Copy the complete registry, including tombstones. Historical
			// evidence may reference an inactive source and must remain valid.
			sources: source.sources,
			nodes: source.version.nodes,
			relations: source.version.relations,
			evidence: source.version.evidence,
			changeKind: 'generated',
		});
	}

	async rebuildProjection(): Promise<AIGraphHistoryRow[]> {
		const entries = await this.repository.projectionEntries();
		await this.projection?.replaceAll(entries);
		return this.repository.rebuildProjection();
	}

	async exportMarkdown(graphId: string, versionId?: string): Promise<string> {
		const view = await this.repository.open(graphId, versionId);
		if (!view) throw new Error(`AI Graph ${graphId} does not exist.`);
		const lines = [
			`# ${view.manifest.title}`,
			'',
			`AI Graph: ${view.manifest.graphId}`,
			`Version: ${view.version.versionId}`,
			`Created in: ${view.manifest.createdFrom.surface}`,
			'',
			'## Nodes',
			'',
			...view.version.nodes
				.filter((node) => node.reviewStatus !== 'rejected')
				.map((node) => `- **${node.label}** (${node.kind})`),
			'',
			'## Relations',
			'',
			...view.version.relations
				.filter((relation) => relation.reviewStatus !== 'rejected')
				.map((relation) => {
					const source = view.version.nodes.find((node) => node.nodeId === relation.sourceNodeId);
					const target = view.version.nodes.find((node) => node.nodeId === relation.targetNodeId);
					const arrow = relation.directed ? '→' : '—';
					return `- ${source?.label ?? relation.sourceNodeId} ${arrow} ${relation.predicate} ${arrow} ${target?.label ?? relation.targetNodeId}`;
				}),
			'',
			'> Exported snapshot. Canonical AI Graph data remains versioned JSON.',
			'',
		];
		return lines.join('\n');
	}

	private async recordSuccessfulRunPrelude(
		runId: string,
		request: CreateAIGraphRequest,
		occurredAt: number,
	): Promise<void> {
		const events: AIGraphRunEvent[] = [
			{
				schemaVersion: 1,
				runId,
				event: 'ai-graph.run.started',
				occurredAt,
				details: { surface: request.createdFrom.surface },
			},
			{
				schemaVersion: 1,
				runId,
				event: 'ai-graph.sources.resolved',
				occurredAt: this.now(),
				details: { sourceCount: request.sources.length },
			},
			{
				schemaVersion: 1,
				runId,
				event: 'ai-graph.extraction.completed',
				occurredAt: this.now(),
				details: {
					nodeCount: request.nodes.length,
					relationCount: request.relations.length,
				},
			},
			{
				schemaVersion: 1,
				runId,
				event: 'ai-graph.entity-resolution.completed',
				occurredAt: this.now(),
				details: { nodeCount: request.nodes.length },
			},
			{
				schemaVersion: 1,
				runId,
				event: 'ai-graph.validation.completed',
				occurredAt: this.now(),
				details: { evidenceCount: request.evidence.length },
			},
		];
		for (const event of events) await this.appendRunEvent(event);
	}

	private async appendRunEvent(event: AIGraphRunEvent): Promise<void> {
		await this.runEvents?.append(event);
	}

	private async tryProject(entry: {
		view: AIGraphArtifactView;
		versionNumber: number;
	}): Promise<void> {
		if (!this.projection) return;
		try {
			await this.projection.replace(entry);
		} catch (error) {
			console.warn('[AI Graph] projection update failed; canonical artifact remains valid.', error);
		}
	}

	private async tryTouchUsage(view: AIGraphArtifactView): Promise<void> {
		if (!this.projection) return;
		try {
			await this.projection.touchUsage(
				view.manifest.graphId,
				view.manifest.createdFrom.surface,
				view.manifest.createdFrom.contextRefs,
				this.now(),
			);
		} catch (error) {
			console.warn('[AI Graph] usage projection update failed.', error);
		}
	}
}
