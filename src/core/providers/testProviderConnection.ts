import type { Profile, ProfileKind } from '@/core/profiles/types';
import { createPresetProfile } from '@/core/profiles/presets';
import type { HttpClientPort } from '@/core/ports/HttpClientPort';
import { simulatorHealthUrl } from '@/core/providers/simulator';
import { resolveProviderProbeEndpoints } from '@/core/providers/provider-endpoints';

export type ConnectionCheckState = 'passed' | 'failed' | 'not-checked';

export interface ConnectionCheckEvidence {
	state: ConnectionCheckState;
	message: string;
}

export interface ConnectionEvidence {
	profileId: string;
	checkedAt: number;
	probeUrl: string;
	authentication: ConnectionCheckEvidence;
	catalog: ConnectionCheckEvidence;
	minimumGeneration: ConnectionCheckEvidence;
	tools: ConnectionCheckEvidence;
	catalogModelIds: string[];
	failureReason: 'none' | 'configuration' | 'network' | 'authentication' | 'catalog' | 'generation';
	ready: boolean;
}

function evidence(state: ConnectionCheckState, message: string): ConnectionCheckEvidence {
	return { state, message };
}

function failedConnection(profile: Profile, probeUrl: string, failureReason: ConnectionEvidence['failureReason'], message: string): ConnectionEvidence {
	return {
		profileId: profile.id,
		checkedAt: Date.now(),
		probeUrl,
		authentication: evidence(failureReason === 'authentication' ? 'failed' : 'not-checked', message),
		catalog: evidence(failureReason === 'catalog' ? 'failed' : 'not-checked', message),
		minimumGeneration: evidence(failureReason === 'generation' ? 'failed' : 'not-checked', message),
		tools: evidence('not-checked', 'Checked when a Hermes model is selected'),
		catalogModelIds: [],
		failureReason,
		ready: false,
	};
}

function parseJson(text: string): unknown {
	return JSON.parse(text || '{}');
}

function catalogModelIds(profile: Profile, payload: unknown): string[] {
	if (!payload || typeof payload !== 'object') return [];
	const record = payload as Record<string, unknown>;
	const entries = profile.kind === 'ollama' || profile.kind === 'google' ? record.models : record.data;
	if (!Array.isArray(entries)) return [];
	return entries.flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return [];
		const model = entry as Record<string, unknown>;
		const raw = profile.kind === 'ollama' ? model.name ?? model.model : model.id ?? model.name;
		if (typeof raw !== 'string' || !raw.trim()) return [];
		return [raw.trim().replace(/^models\//, '')];
	});
}

function headersFor(profile: Profile): Record<string, string> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...profile.customHeaders,
	};
	if (profile.kind === 'anthropic') {
		headers['x-api-key'] = profile.apiKey ?? '';
		headers['anthropic-version'] = '2023-06-01';
		return headers;
	}
	if (profile.apiKey) headers.Authorization = `Bearer ${profile.apiKey}`;
	return headers;
}

function generationBody(profile: Profile): string {
	if (profile.kind === 'anthropic') {
		return JSON.stringify({ model: profile.primaryModel, max_tokens: 1, messages: [{ role: 'user', content: 'Reply OK' }] });
	}
	if (profile.kind === 'google') {
		return JSON.stringify({ contents: [{ parts: [{ text: 'Reply OK' }] }], generationConfig: { maxOutputTokens: 1 } });
	}
	if (profile.kind === 'ollama') {
		return JSON.stringify({ model: profile.primaryModel, prompt: 'Reply OK', stream: false, options: { num_predict: 1 } });
	}
	return JSON.stringify({ model: profile.primaryModel, max_tokens: 1, messages: [{ role: 'user', content: 'Reply OK' }] });
}

function connectionProbeModel(profile: Profile, discoveredModelIds: readonly string[]): string {
	if (discoveredModelIds.includes(profile.primaryModel)) return profile.primaryModel;
	if (profile.kind === 'openrouter' && discoveredModelIds.includes('openrouter/auto')) return 'openrouter/auto';
	return discoveredModelIds[0] ?? '';
}

export async function inspectProviderConnection(http: HttpClientPort, profile: Profile): Promise<ConnectionEvidence> {
	const endpoints = resolveProviderProbeEndpoints(profile);
	if (!profile.baseUrl.trim()) return failedConnection(profile, '', 'configuration', 'Base URL is required');

	try {
		if (profile.kind === 'simulator') {
			const res = await http.request({ url: simulatorHealthUrl(profile.baseUrl), method: 'GET', throwOnError: false });
			const payload = res.status >= 200 && res.status < 300 ? parseJson(res.text) as { ok?: unknown; service?: unknown } : null;
			const ready = payload?.ok === true && payload.service === 'peak-ai-search-simulator';
			if (!ready) return failedConnection(profile, endpoints.catalog, 'catalog', `Simulator health check returned ${res.status}`);
			return {
				profileId: profile.id,
				checkedAt: Date.now(),
				probeUrl: endpoints.catalog,
				authentication: evidence('passed', 'Local simulator is reachable'),
				catalog: evidence('passed', 'Simulator route is available'),
				minimumGeneration: evidence('passed', 'Deterministic simulator route is ready'),
				tools: evidence('passed', 'Simulator exposes the supported test tools'),
				catalogModelIds: [profile.primaryModel],
				failureReason: 'none',
				ready: true,
			};
		}

		const headers = headersFor(profile);
		const catalog = await http.request({ url: endpoints.catalog, method: 'GET', headers, throwOnError: false });
		if (catalog.status === 401 || catalog.status === 403) {
			return failedConnection(profile, endpoints.catalog, 'authentication', 'Credentials were rejected');
		}
		if (catalog.status < 200 || catalog.status >= 300) {
			return failedConnection(profile, endpoints.catalog, 'catalog', `Model catalog returned ${catalog.status}`);
		}
		let catalogPayload: unknown;
		try {
			catalogPayload = parseJson(catalog.text);
		} catch {
			return failedConnection(profile, endpoints.catalog, 'catalog', 'Model catalog returned invalid JSON');
		}
		const discoveredModelIds = catalogModelIds(profile, catalogPayload);
		if (discoveredModelIds.length === 0) {
			return failedConnection(profile, endpoints.catalog, 'catalog', 'Model catalog did not contain a model list');
		}
		const generationModel = connectionProbeModel(profile, discoveredModelIds);
		const generationProfile = { ...profile, primaryModel: generationModel };
		const generationEndpoints = resolveProviderProbeEndpoints(generationProfile);

		const generation = await http.request({
			url: generationEndpoints.generation,
			method: 'POST',
			headers,
			body: generationBody(generationProfile),
			throwOnError: false,
		});
		if (generation.status === 401 || generation.status === 403) {
			return failedConnection(profile, generationEndpoints.generation, 'authentication', 'Credentials were rejected by the generation route');
		}
		if (generation.status < 200 || generation.status >= 300) {
			return failedConnection(profile, generationEndpoints.generation, 'generation', `Minimum generation returned ${generation.status}`);
		}

		return {
			profileId: profile.id,
			checkedAt: Date.now(),
			probeUrl: generationEndpoints.generation,
			authentication: evidence('passed', profile.apiKey ? 'Credentials accepted' : 'Local or gateway connection accepted'),
			catalog: evidence('passed', 'Model catalog loaded'),
			minimumGeneration: evidence('passed', 'Minimum generation completed'),
			tools: evidence('not-checked', 'Checked when a Hermes model is selected'),
			catalogModelIds: discoveredModelIds,
			failureReason: 'none',
			ready: true,
		};
	} catch (error) {
		return failedConnection(profile, endpoints.catalog, 'network', error instanceof Error ? error.message : String(error));
	}
}

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
	const profile = typeof kindOrProfile === 'string'
		? createPresetProfile(kindOrProfile, { apiKey: apiKey ?? null })
		: kindOrProfile;
	return (await inspectProviderConnection(http, profile)).ready;
}
