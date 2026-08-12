import type { ModelCatalogSettings } from '@/core/config/settingsTypes';
import type { HttpClientPort } from '@/core/ports/HttpClientPort';

export interface OpenRouterCatalogDocument {
	schemaVersion: 1;
	provider: 'openrouter';
	models: Record<string, unknown>;
	catalogVersion?: string;
}

export interface OpenRouterCatalogRefreshResult {
	status: 'updated' | 'not-modified' | 'failed';
	settings: ModelCatalogSettings;
	catalog: OpenRouterCatalogDocument | null;
}

export function parseOpenRouterCatalog(text: string): OpenRouterCatalogDocument {
	const parsed = JSON.parse(text) as Record<string, unknown>;
	if (parsed.schemaVersion !== 1) throw new Error('Catalog schemaVersion must be 1.');
	if (parsed.provider !== 'openrouter') throw new Error('Catalog provider must be openrouter.');
	if (!parsed.models || typeof parsed.models !== 'object' || Array.isArray(parsed.models)) throw new Error('Catalog models must be an object keyed by model id.');
	for (const [id, model] of Object.entries(parsed.models as Record<string, unknown>)) {
		if (!id.trim() || !model || typeof model !== 'object' || Array.isArray(model)) throw new Error(`Invalid model entry: ${id || '(empty id)'}.`);
	}
	return {
		schemaVersion: 1,
		provider: 'openrouter',
		models: parsed.models as Record<string, unknown>,
		catalogVersion: typeof parsed.catalogVersion === 'string' ? parsed.catalogVersion : undefined,
	};
}

export async function refreshOpenRouterCatalog(http: HttpClientPort, current: ModelCatalogSettings): Promise<OpenRouterCatalogRefreshResult> {
	if (!current.openRouterCatalogUrl.trim()) {
		return { status: 'failed', settings: { ...current, lastCheckedAt: Date.now(), lastError: 'Add a catalog URL first.' }, catalog: current.cachedOpenRouterCatalog };
	}
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (current.etag) headers['If-None-Match'] = current.etag;
	if (current.lastModified) headers['If-Modified-Since'] = current.lastModified;
	try {
		const response = await http.request({ url: current.openRouterCatalogUrl.trim(), method: 'GET', headers, throwOnError: false });
		if (response.status === 304) {
			return { status: 'not-modified', settings: { ...current, lastCheckedAt: Date.now(), lastError: null }, catalog: current.cachedOpenRouterCatalog };
		}
		if (response.status < 200 || response.status >= 300) throw new Error(`Catalog request returned HTTP ${response.status}.`);
		const catalog = parseOpenRouterCatalog(response.text);
		return {
			status: 'updated',
			catalog,
			settings: {
				...current,
				lastCheckedAt: Date.now(),
				lastModified: readHeader(response.headers, 'last-modified'),
				etag: readHeader(response.headers, 'etag'),
				lastError: null,
				cachedOpenRouterCatalog: catalog,
			},
		};
	} catch (error) {
		return {
			status: 'failed',
			catalog: current.cachedOpenRouterCatalog,
			settings: { ...current, lastCheckedAt: Date.now(), lastError: error instanceof Error ? error.message : String(error) },
		};
	}
}

function readHeader(headers: Record<string, string>, name: string): string | null {
	const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
	return entry?.[1] ?? null;
}
