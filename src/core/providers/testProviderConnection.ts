import { requestUrl } from 'obsidian';
import type { Profile, ProfileKind } from '@/core/profiles/types';
import { createPresetProfile } from '@/core/profiles/presets';

/**
 * Test connectivity for a provider profile.
 * Uses a lightweight API call (list models or minimal message) to verify
 * both reachability AND authentication (401/403 = bad key → false).
 */
export async function testProviderConnection(profile: Profile): Promise<boolean>;
export async function testProviderConnection(kind: ProfileKind, apiKey: string): Promise<boolean>;
export async function testProviderConnection(
	kindOrProfile: ProfileKind | Profile,
	apiKey?: string,
): Promise<boolean> {
	try {
		const profile: Profile =
			typeof kindOrProfile === 'string'
				? createPresetProfile(kindOrProfile, { apiKey: apiKey ?? null })
				: kindOrProfile;

		const { kind, baseUrl } = profile;
		const key = profile.apiKey ?? '';
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };

		if (kind === 'anthropic') {
			headers['x-api-key'] = key;
			headers['anthropic-version'] = '2023-06-01';
			const res = await requestUrl({
				url: `${baseUrl}/v1/messages`,
				method: 'POST',
				headers,
				body: JSON.stringify({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 1,
					messages: [{ role: 'user', content: 'hi' }],
				}),
				throw: false,
			});
			return res.status >= 200 && res.status < 400;
		} else if (kind === 'ollama') {
			const res = await requestUrl({
				url: `${baseUrl}/api/tags`,
				method: 'GET',
				throw: false,
			});
			return res.status < 500;
		} else {
			headers['Authorization'] = `Bearer ${key}`;
			const res = await requestUrl({
				url: `${baseUrl}/v1/models`,
				method: 'GET',
				headers,
				throw: false,
			});
			return res.status >= 200 && res.status < 400;
		}
	} catch {
		return false;
	}
}
