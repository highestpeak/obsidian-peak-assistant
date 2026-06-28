import { requestUrl, type RequestUrlParam } from 'obsidian';
import type { HttpClientPort, HttpRequest, HttpResponse } from '@/core/ports/HttpClientPort';

/**
 * T11R: Obsidian-backed adapter for {@link HttpClientPort}. Routes through
 * `requestUrl` so service/core callers can do cross-origin requests
 * (LLM-provider auth pings, native-module downloads) without importing
 * `obsidian` themselves.
 */
export const obsidianHttpClient: HttpClientPort = {
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
