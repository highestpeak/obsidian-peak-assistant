import type { Profile, ProfileKind } from '@/core/profiles/types';

const STATIC_CATALOGS: Partial<Record<ProfileKind, string>> = {
	anthropic: 'claude',
	openai: 'openai',
	google: 'gemini',
	perplexity: 'perplexity',
	simulator: 'simulator',
};

/**
 * Model-registry bucket for one configured profile. LM Studio instances are
 * intentionally profile-qualified: two local servers may expose different
 * loaded models and must never leak choices into each other.
 */
export function profileModelCatalogId(profile: Pick<Profile, 'id' | 'kind'>): string | null {
	if (profile.kind === 'ollama' || profile.kind === 'lmstudio' || profile.kind === 'openrouter') {
		return `${profile.kind}:${profile.id}`;
	}
	return STATIC_CATALOGS[profile.kind] ?? null;
}

export function isKeylessLocalProfile(kind: ProfileKind): boolean {
	return kind === 'ollama' || kind === 'lmstudio';
}
