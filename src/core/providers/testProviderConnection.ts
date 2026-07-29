import type { Profile, ProfileKind } from '@/core/profiles/types';
import { createPresetProfile } from '@/core/profiles/presets';
import type { HttpClientPort } from '@/core/ports/HttpClientPort';

/**
 * Test connectivity for a provider profile.
 * Uses a lightweight API call (list models or minimal message) to verify
 * both reachability AND authentication (401/403 = bad key → false).
 *
 * T11R: HTTP transport is injected as {@link HttpClientPort} (the app
 * composes one backed by Obsidian's `requestUrl`) so this module no
 * longer imports `obsidian` directly.
 */
export async function testProviderConnection(http: HttpClientPort, profile: Profile): Promise<boolean>;
export async function testProviderConnection(http: HttpClientPort, kind: ProfileKind, apiKey: string): Promise<boolean>;
export async function testProviderConnection(
	http: HttpClientPort,
	kindOrProfile: ProfileKind | Profile,
	apiKey?: string,
): Promise<boolean> {
	try {
		const profile: Profile =
			typeof kindOrProfile === 'string'
				? createPresetProfile(kindOrProfile, { apiKey: apiKey ?? null })
				: kindOrProfile;

		const { kind, baseUrl } = profile;
		if (kind === 'simulator') {
			return profile.primaryModel === 'ai-search-simulator' && !!profile.simulatorConfig?.scenario;
		}
		const key = profile.apiKey ?? '';
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };

		if (kind === 'anthropic') {
			headers['x-api-key'] = key;
			headers['anthropic-version'] = '2023-06-01';
			const res = await http.request({
				url: `${baseUrl}/v1/messages`,
				method: 'POST',
				headers,
				body: JSON.stringify({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 1,
					messages: [{ role: 'user', content: 'hi' }],
				}),
				throwOnError: false,
			});
			return res.status >= 200 && res.status < 400;
		} else if (kind === 'ollama') {
			const res = await http.request({
				url: `${baseUrl}/api/tags`,
				method: 'GET',
				throwOnError: false,
			});
			return res.status < 500;
		} else {
			headers['Authorization'] = `Bearer ${key}`;
			const res = await http.request({
				url: `${baseUrl}/v1/models`,
				method: 'GET',
				headers,
				throwOnError: false,
			});
			return res.status >= 200 && res.status < 400;
		}
	} catch {
		return false;
	}
}
