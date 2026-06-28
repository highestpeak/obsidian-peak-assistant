/**
 * T11R: Narrow HTTP client port for cross-origin requests from core/service.
 *
 * Obsidian's `requestUrl` bypasses browser CORS by routing through the
 * Electron main process; service/core can't `import { requestUrl }` from
 * 'obsidian' without tripping the boundary audit. The app layer composes a
 * `requestUrl`-backed adapter and injects it through this port.
 *
 * Mobile note: on Obsidian mobile (Capacitor), the adapter falls back to
 * `fetch` since `requestUrl` is desktop-only in some configurations.
 */
export interface HttpResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
	arrayBuffer: ArrayBuffer;
}

export interface HttpRequest {
	url: string;
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
	headers?: Record<string, string>;
	body?: string;
	/** When true, throw on non-2xx. Defaults to false. */
	throwOnError?: boolean;
}

export interface HttpClientPort {
	request(req: HttpRequest): Promise<HttpResponse>;
}
