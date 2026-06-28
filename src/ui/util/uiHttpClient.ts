import { requestUrl, type RequestUrlParam } from 'obsidian';
import type { HttpClientPort, HttpRequest, HttpResponse } from '@/core/ports/HttpClientPort';

/**
 * T11R: UI-local HTTP client adapter for {@link HttpClientPort}. Identical
 * implementation to the app-side `obsidianHttpClient`, kept here so UI
 * settings components can construct one without crossing `ui -> app`
 * (which would re-introduce a boundary violation).
 */
export const uiHttpClient: HttpClientPort = {
	async request(req: HttpRequest): Promise<HttpResponse> {
		const params: RequestUrlParam = {
			url: req.url,
			method: req.method ?? 'GET',
			headers: req.headers,
			body: req.body,
			throw: req.throwOnError ?? false,
		};
		const res = await requestUrl(params);
		const headers: Record<string, string> = {};
		for (const [k, v] of Object.entries(res.headers ?? {})) {
			if (typeof v === 'string') headers[k] = v;
		}
		return {
			status: res.status,
			headers,
			text: res.text,
			arrayBuffer: res.arrayBuffer,
		};
	},
};
