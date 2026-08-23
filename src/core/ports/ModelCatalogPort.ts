import type { Profile } from '@/core/profiles/types';
import type { ModelCatalogReader } from '@/core/providers/model-selection';

export type ModelCatalogRefreshState = {
	status: 'idle' | 'refreshing' | 'ready' | 'stale';
	refreshedAt: number | null;
	error: string | null;
};

/** Single read/refresh boundary shared by every model-selection surface. */
export interface ModelCatalogPort extends ModelCatalogReader {
	getRevision(): number;
	subscribe(listener: () => void): () => void;
	getProfileState(profileId: string): ModelCatalogRefreshState;
	refreshProfile(profile: Profile): Promise<void>;
	refreshProfiles(profiles: readonly Profile[]): Promise<void>;
}
