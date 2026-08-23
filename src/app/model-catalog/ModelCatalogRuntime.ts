import type { HttpClientPort } from '@/core/ports/HttpClientPort';
import type { ModelCatalogPort, ModelCatalogRefreshState } from '@/core/ports/ModelCatalogPort';
import type { Profile } from '@/core/profiles/types';
import { fetchLMStudioModelMetadata } from '@/core/providers/lmstudio/fetchLMStudioModels';
import { ModelRegistry } from '@/core/providers/model-registry';
import { fetchOllamaModelMetadata } from '@/core/providers/ollama/fetchOllamaModels';
import { fetchOpenRouterModels } from '@/core/providers/openrouter/fetchOpenRouterModels';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';
import type { ModelMetaData } from '@/core/providers/types';

const DISCOVERABLE_KINDS = new Set<Profile['kind']>(['ollama', 'lmstudio', 'openrouter']);
const IDLE: ModelCatalogRefreshState = { status: 'idle', refreshedAt: null, error: null };

/** App-owned sole coordinator for provider model discovery and catalog snapshots. */
export class ModelCatalogRuntime implements ModelCatalogPort {
	private revision = 0;
	private readonly listeners = new Set<() => void>();
	private readonly states = new Map<string, ModelCatalogRefreshState>();
	private readonly pending = new Map<string, Promise<void>>();

	constructor(
		private readonly http: HttpClientPort,
		private readonly registry: ModelRegistry = ModelRegistry.getInstance(),
	) {}

	getModelsForProvider(providerId: string): ModelMetaData[] {
		return this.registry.getModelsForProvider(providerId);
	}

	getRevision(): number {
		return this.revision;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getProfileState(profileId: string): ModelCatalogRefreshState {
		return this.states.get(profileId) ?? IDLE;
	}

	async refreshProfiles(profiles: readonly Profile[]): Promise<void> {
		await Promise.all(profiles.filter((profile) => profile.enabled).map((profile) => this.refreshProfile(profile)));
	}

	async refreshProfile(profile: Profile): Promise<void> {
		if (!profile.enabled || !DISCOVERABLE_KINDS.has(profile.kind)) return;
		const existing = this.pending.get(profile.id);
		if (existing) return existing;
		const refresh = this.runRefresh(profile).finally(() => this.pending.delete(profile.id));
		this.pending.set(profile.id, refresh);
		return refresh;
	}

	private async runRefresh(profile: Profile): Promise<void> {
		const previous = this.getProfileState(profile.id);
		this.states.set(profile.id, { ...previous, status: 'refreshing', error: null });
		this.emit();
		try {
			const models = await this.discover(profile);
			if (models.length === 0 && profile.kind !== 'openrouter') {
				throw new Error(`${profile.name} returned no discoverable models.`);
			}
			const catalogId = profileModelCatalogId(profile);
			if (!catalogId) return;
			this.registry.replaceRuntimeModels(catalogId, models);
			this.states.set(profile.id, { status: 'ready', refreshedAt: Date.now(), error: null });
		} catch (error) {
			this.states.set(profile.id, {
				status: previous.refreshedAt ? 'stale' : 'idle',
				refreshedAt: previous.refreshedAt,
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			this.emit();
		}
	}

	private discover(profile: Profile): Promise<ModelMetaData[]> {
		if (profile.kind === 'openrouter') return fetchOpenRouterModels(this.http, profile);
		if (profile.kind === 'lmstudio') return fetchLMStudioModelMetadata(profile.baseUrl);
		return fetchOllamaModelMetadata(profile.baseUrl);
	}

	private emit(): void {
		this.revision += 1;
		for (const listener of this.listeners) listener();
	}
}
