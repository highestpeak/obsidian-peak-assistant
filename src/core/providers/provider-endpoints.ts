import type { Profile } from '@/core/profiles/types';

function trimTrailingSlashes(value: string): string {
	return value.trim().replace(/\/+$/, '');
}

function appendVersionedPath(baseUrl: string, path: string): string {
	const base = trimTrailingSlashes(baseUrl);
	if (/\/(?:api\/)?v\d+(?:beta)?$/i.test(base)) return `${base}/${path}`;
	return `${base}/v1/${path}`;
}

export interface ProviderProbeEndpoints {
	authentication?: string;
	catalog: string;
	generation: string;
}

/**
 * Resolve probe endpoints from the same base-url semantics used by the real
 * provider adapters. Presets may already include `/v1` or `/api/v1`; callers
 * must never append another version segment blindly.
 */
export function resolveProviderProbeEndpoints(profile: Profile): ProviderProbeEndpoints {
	const base = trimTrailingSlashes(profile.baseUrl);
	if (profile.kind === 'simulator') {
		return { catalog: `${base}/health`, generation: `${base}/health` };
	}
	if (profile.kind === 'ollama') {
		return { catalog: `${base}/api/tags`, generation: `${base}/api/generate` };
	}
	if (profile.kind === 'google') {
		const key = encodeURIComponent(profile.apiKey ?? '');
		return {
			catalog: `${appendVersionedPath(base, 'models')}?key=${key}`,
			generation: `${appendVersionedPath(base, `models/${encodeURIComponent(profile.primaryModel)}:generateContent`)}?key=${key}`,
		};
	}
	if (profile.kind === 'openrouter') {
		return {
			authentication: appendVersionedPath(base, 'key'),
			catalog: appendVersionedPath(base, 'models/user'),
			generation: appendVersionedPath(base, 'chat/completions'),
		};
	}
	if (profile.kind === 'anthropic') {
		return {
			catalog: appendVersionedPath(base, 'models'),
			generation: appendVersionedPath(base, 'messages'),
		};
	}
	return {
		catalog: appendVersionedPath(base, 'models'),
		generation: appendVersionedPath(base, 'chat/completions'),
	};
}
