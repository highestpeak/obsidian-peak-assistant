import {
	computeAIGraphStats,
	validateAIGraphVersion,
	type AIGraphArtifactManifest,
	type AIGraphArtifactView,
	type AIGraphHistoryRow,
	type AIGraphProjectionEntry,
	type AIGraphSource,
	type AIGraphVersion,
} from './domain';

export interface AIGraphArtifactStoragePort {
	listArtifactIds(): Promise<string[]>;
	listVersionIds(graphId: string): Promise<string[]>;
	readManifest(graphId: string): Promise<string | null>;
	readVersion(graphId: string, versionId: string): Promise<string | null>;
	readSources(graphId: string): Promise<string | null>;
	writeNewVersion(graphId: string, versionId: string, content: string): Promise<void>;
	writeManifestAtomic(graphId: string, content: string): Promise<void>;
	writeSourcesAtomic(graphId: string, content: string): Promise<void>;
}

function parseRecord<T>(text: string | null, label: string): T | null {
	if (text === null) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(`Invalid AI Graph ${label} JSON.`);
	}
}

function validateSourcesForVersion(
	version: AIGraphVersion,
	sources: readonly AIGraphSource[],
): void {
	const sourceIds = new Set(sources.map((source) => source.sourceId));
	if (sourceIds.size !== sources.length) throw new Error('AI Graph contains duplicate source ids.');
	for (const sourceId of version.sourceIds) {
		if (!sourceIds.has(sourceId)) {
			throw new Error(`AI Graph version references missing source ${sourceId}.`);
		}
	}
	for (const evidence of version.evidence) {
		if (!sourceIds.has(evidence.sourceId)) {
			throw new Error(`AI Graph evidence ${evidence.evidenceId} references missing source.`);
		}
	}
}

export class AIGraphArtifactRepository {
	constructor(private readonly storage: AIGraphArtifactStoragePort) {}

	async create(
		manifest: AIGraphArtifactManifest,
		version: AIGraphVersion,
		sources: readonly AIGraphSource[],
	): Promise<AIGraphArtifactView> {
		if (manifest.graphId !== version.graphId || manifest.headVersionId !== version.versionId) {
			throw new Error('AI Graph manifest and version identity do not match.');
		}
		if (await this.storage.readManifest(manifest.graphId)) {
			throw new Error(`AI Graph ${manifest.graphId} already exists.`);
		}
		validateAIGraphVersion(version);
		validateSourcesForVersion(version, sources);
		await this.storage.writeNewVersion(
			version.graphId,
			version.versionId,
			JSON.stringify(version, null, 2),
		);
		await this.storage.writeSourcesAtomic(version.graphId, JSON.stringify(sources, null, 2));
		await this.storage.writeManifestAtomic(version.graphId, JSON.stringify(manifest, null, 2));
		return { manifest, version, sources: [...sources] };
	}

	async open(graphId: string, versionId?: string): Promise<AIGraphArtifactView | null> {
		const manifest = parseRecord<AIGraphArtifactManifest>(
			await this.storage.readManifest(graphId),
			'manifest',
		);
		if (!manifest) return null;
		const resolvedVersionId = versionId ?? manifest.headVersionId;
		const version = parseRecord<AIGraphVersion>(
			await this.storage.readVersion(graphId, resolvedVersionId),
			'version',
		);
		if (!version) throw new Error(`AI Graph version ${resolvedVersionId} is missing.`);
		validateAIGraphVersion(version);
		const sources = parseRecord<AIGraphSource[]>(
			await this.storage.readSources(graphId),
			'sources',
		) ?? [];
		validateSourcesForVersion(version, sources);
		return { manifest, version, sources };
	}

	async appendVersion(
		graphId: string,
		expectedHeadVersionId: string,
		version: AIGraphVersion,
	): Promise<AIGraphArtifactView> {
		const current = await this.open(graphId);
		if (!current) throw new Error(`AI Graph ${graphId} does not exist.`);
		if (current.manifest.headVersionId !== expectedHeadVersionId) {
			throw new Error('AI Graph head changed while the update was under review.');
		}
		if (version.parentVersionId !== expectedHeadVersionId || version.graphId !== graphId) {
			throw new Error('AI Graph update must extend the reviewed head version.');
		}
		validateAIGraphVersion(version);
		validateSourcesForVersion(version, current.sources);
		await this.storage.writeNewVersion(graphId, version.versionId, JSON.stringify(version, null, 2));
		const manifest: AIGraphArtifactManifest = {
			...current.manifest,
			headVersionId: version.versionId,
			updatedAt: version.createdAt,
		};
		await this.storage.writeManifestAtomic(graphId, JSON.stringify(manifest, null, 2));
		return { manifest, version, sources: current.sources };
	}

	async replaceSources(graphId: string, sources: readonly AIGraphSource[]): Promise<void> {
		if (!(await this.storage.readManifest(graphId))) throw new Error(`AI Graph ${graphId} does not exist.`);
		await this.storage.writeSourcesAtomic(graphId, JSON.stringify(sources, null, 2));
	}

	async list(): Promise<AIGraphHistoryRow[]> {
		const entries = await this.projectionEntries();
		return entries
			.map(({ view, versionNumber }) => this.historyRow(view, versionNumber))
			.sort((left, right) => right.updatedAt - left.updatedAt);
	}

	async artifactIds(): Promise<string[]> {
		return this.storage.listArtifactIds();
	}

	async versionCount(graphId: string): Promise<number> {
		return (await this.storage.listVersionIds(graphId)).length;
	}

	async listVersions(graphId: string): Promise<AIGraphVersion[]> {
		const versions: AIGraphVersion[] = [];
		for (const versionId of await this.storage.listVersionIds(graphId)) {
			const view = await this.open(graphId, versionId);
			if (view) versions.push(view.version);
		}
		return versions.sort((left, right) => right.createdAt - left.createdAt);
	}

	async projectionEntries(): Promise<AIGraphProjectionEntry[]> {
		const entries: AIGraphProjectionEntry[] = [];
		for (const graphId of await this.storage.listArtifactIds()) {
			const view = await this.open(graphId);
			if (!view) continue;
			const versionIds = await this.storage.listVersionIds(graphId);
			const versions = await this.listVersions(graphId);
			entries.push({
				view,
				versionNumber: versionIds.length,
				versions,
			});
		}
		return entries;
	}

	private historyRow(
		view: AIGraphArtifactView,
		versionNumber: number,
	): AIGraphHistoryRow {
		return {
			graphId: view.manifest.graphId,
			title: view.manifest.title,
			graphType: view.manifest.graphType,
			status: view.manifest.status,
			versionId: view.version.versionId,
			versionNumber,
			updatedAt: view.manifest.updatedAt,
			stats: computeAIGraphStats(view.version),
			createdFrom: view.manifest.createdFrom,
			changedSourceCount: view.sources.filter((source) =>
				source.active !== false
				&& (source.freshness === 'changed' || source.freshness === 'unavailable')).length,
		};
	}

	/** Rebuildable read model: the projection is derived solely from canonical files. */
	async rebuildProjection(): Promise<AIGraphHistoryRow[]> {
		const rows: AIGraphHistoryRow[] = [];
		for (const entry of await this.projectionEntries()) {
			rows.push(this.historyRow(entry.view, entry.versionNumber));
		}
		return rows.sort((left, right) => right.updatedAt - left.updatedAt);
	}
}
