import assert from 'node:assert/strict';
import {
	AIGraphArtifactRepository,
	AIGraphArtifactRuntime,
	type AIGraphArtifactStoragePort,
	type AIGraphHistoryRow,
	type AIGraphNode,
	type AIGraphProjectionEntry,
	type AIGraphProjectionPort,
	type AIGraphRelation,
	type AIGraphRunEvent,
	type AIGraphRunEventPort,
	type AIGraphOriginContextRef,
	type AIGraphOriginSurface,
} from '../src/service/ai-graph';
import { createAIInstructionSubmission } from '../src/core/instruction-composer';

class MemoryStorage implements AIGraphArtifactStoragePort {
	readonly files = new Map<string, string>();

	async listArtifactIds(): Promise<string[]> {
		return [...new Set([...this.files.keys()]
			.filter((path) => path.endsWith('/manifest.json'))
			.map((path) => path.split('/')[0]))];
	}
	async listVersionIds(graphId: string): Promise<string[]> {
		return [...this.files.keys()]
			.filter((path) => path.startsWith(`${graphId}/versions/`))
			.map((path) => path.slice(path.lastIndexOf('/') + 1, -5));
	}
	async readManifest(graphId: string): Promise<string | null> {
		return this.files.get(`${graphId}/manifest.json`) ?? null;
	}
	async readVersion(graphId: string, versionId: string): Promise<string | null> {
		return this.files.get(`${graphId}/versions/${versionId}.json`) ?? null;
	}
	async readSources(graphId: string): Promise<string | null> {
		return this.files.get(`${graphId}/sources.json`) ?? null;
	}
	async writeNewVersion(graphId: string, versionId: string, content: string): Promise<void> {
		const path = `${graphId}/versions/${versionId}.json`;
		if (this.files.has(path)) throw new Error('immutable');
		this.files.set(path, content);
	}
	async writeManifestAtomic(graphId: string, content: string): Promise<void> {
		this.files.set(`${graphId}/manifest.json`, content);
	}
	async writeSourcesAtomic(graphId: string, content: string): Promise<void> {
		this.files.set(`${graphId}/sources.json`, content);
	}
}

class MemoryProjection implements AIGraphProjectionPort {
	entries: AIGraphProjectionEntry[] = [];
	usageTouches = 0;

	async list(): Promise<AIGraphHistoryRow[]> {
		return this.entries.map(({ view, versionNumber }) => ({
			graphId: view.manifest.graphId,
			title: view.manifest.title,
			graphType: view.manifest.graphType,
			status: view.manifest.status,
			versionId: view.version.versionId,
			versionNumber,
			updatedAt: view.manifest.updatedAt,
			stats: view.version.stats,
			createdFrom: view.manifest.createdFrom,
			changedSourceCount: view.sources.filter((source) => source.freshness === 'changed').length,
		}));
	}
	async replace(entry: AIGraphProjectionEntry): Promise<void> {
		this.entries = [
			...this.entries.filter((candidate) =>
				candidate.view.manifest.graphId !== entry.view.manifest.graphId),
			entry,
		];
	}
	async replaceAll(entries: readonly AIGraphProjectionEntry[]): Promise<void> {
		this.entries = [...entries];
	}
	async touchUsage(
		_graphId: string,
		_originSurface: AIGraphOriginSurface,
		_contextRefs: readonly AIGraphOriginContextRef[],
		_openedAt: number,
	): Promise<void> {
		this.usageTouches += 1;
	}
}

class MemoryRunEvents implements AIGraphRunEventPort {
	events: AIGraphRunEvent[] = [];
	async append(event: AIGraphRunEvent): Promise<void> {
		this.events.push(event);
	}
}

const node = (nodeId: string, label: string): AIGraphNode => ({
	nodeId,
	kind: 'concept',
	label,
	aliases: [],
	properties: {},
	evidenceIds: [],
	provenance: { origin: 'ai-inferred', runId: 'run-1' },
	reviewStatus: 'suggested',
});

const relation = (relationId: string, sourceNodeId: string, targetNodeId: string): AIGraphRelation => ({
	relationId,
	sourceNodeId,
	targetNodeId,
	family: 'semantic',
	predicate: 'related-to',
	label: 'related to',
	directed: false,
	qualifiers: [],
	evidenceIds: [],
	confidence: 0.7,
	provenance: { origin: 'ai-inferred', runId: 'run-1' },
	reviewStatus: 'suggested',
});

async function run(): Promise<void> {
	const storage = new MemoryStorage();
	const projection = new MemoryProjection();
	const runEvents = new MemoryRunEvents();
	let id = 0;
	let now = 100;
	const runtime = new AIGraphArtifactRuntime(
		new AIGraphArtifactRepository(storage),
		() => String(++id),
		() => ++now,
		projection,
		runEvents,
	);
	const created = await runtime.create({
		title: 'Evidence map',
		graphType: 'evidence',
		createdFrom: {
			surface: 'file-atlas',
			contextRefs: [{ kind: 'atlas-file', ref: 'Notes/a.md', label: 'a.md' }],
		},
		sources: [{
			sourceId: 's1',
			kind: 'vault-file',
			title: 'a.md',
			locator: 'Notes/a.md',
			contentHash: 'h1',
			capturedAt: 1,
			freshness: 'current',
		}],
		nodes: [node('n1', 'One'), node('n2', 'Two')],
		relations: [relation('r1', 'n1', 'n2')],
		evidence: [],
		generation: { runId: 'run-create' },
	});
	assert.equal(created.version.stats.needsReviewCount, 3);
	assert.equal((await runtime.list())[0].createdFrom.surface, 'file-atlas');
	assert.equal(projection.entries.length, 1);
	assert.deepEqual(
		runEvents.events.map((event) => event.event),
		[
			'ai-graph.run.started',
			'ai-graph.sources.resolved',
			'ai-graph.extraction.completed',
			'ai-graph.entity-resolution.completed',
			'ai-graph.validation.completed',
			'ai-graph.version.created',
			'ai-graph.run.completed',
		],
	);
	assert.equal(
		JSON.stringify(runEvents.events).includes('"nodes"'),
		false,
		'run JSONL events must reference the artifact rather than duplicate the graph body',
	);

	await runtime.markSourceFreshness(created.manifest.graphId, 's1', 'changed', 'h2');
	const sourceChanged = await runtime.open(created.manifest.graphId);
	assert.equal(sourceChanged?.version.versionId, created.version.versionId);
	assert.equal(sourceChanged?.sources[0].freshness, 'changed');
	const sourceOnly = await runtime.replaceSources(created.manifest.graphId, [
		...(sourceChanged?.sources ?? []),
		{
			sourceId: 's2',
			kind: 'manual-text',
			title: 'Prepared source',
			locator: 'inline://prepared-source',
			contentHash: 'h3',
			capturedAt: 2,
			freshness: 'current',
		},
	]);
	assert.equal(sourceOnly.sources.length, 2);
	assert.equal(
		(await runtime.listVersions(created.manifest.graphId)).length,
		1,
		'adding a source must not create an AI Graph version',
	);

	const diff = await runtime.proposeUpdate({
		surface: 'ai-graph',
		capabilityId: 'ai-graph.update',
		submission: createAIInstructionSubmission('Add a third concept', [], [], 12),
		surfaceContext: {
			graphId: created.manifest.graphId,
			baseVersionId: created.version.versionId,
			sourceIds: ['s1'],
		},
	}, {
		nodes: {
			added: [node('n3', 'Three')],
			changed: [],
			removed: [],
		},
	});
	assert.equal((await runtime.open(created.manifest.graphId))?.version.nodes.length, 2);
	runtime.cancelUpdate(diff);
	assert.equal((await runtime.open(created.manifest.graphId))?.version.nodes.length, 2);
	const accepted = await runtime.acceptUpdate(diff);
	assert.equal(accepted.version.nodes.length, 3);
	assert.equal(accepted.version.parentVersionId, created.version.versionId);
	assert.equal(await storage.readVersion(created.manifest.graphId, created.version.versionId) !== null, true);
	assert.equal(projection.entries[0].versionNumber, 2);
	assert.deepEqual(
		(await runtime.listVersions(created.manifest.graphId)).map((version) => version.versionId),
		[accepted.version.versionId, created.version.versionId],
	);
	assert.equal(
		runEvents.events.filter((event) => event.event === 'ai-graph.version.created').length,
		2,
	);

	const restarted = new AIGraphArtifactRuntime(new AIGraphArtifactRepository(storage));
	assert.equal((await restarted.open(created.manifest.graphId))?.version.versionId, accepted.version.versionId);
	assert.equal((await restarted.list())[0].versionNumber, 2);

	projection.entries = [];
	assert.equal((await runtime.list())[0].versionNumber, 2);
	assert.equal(projection.entries.length, 1, 'an empty projection must rebuild from canonical artifacts');
}

void run();
