import { requestUrl, type RequestUrlParam } from 'obsidian';

/**
 * A Web-Fetch-compatible wrapper around Obsidian's `requestUrl`. Runs the
 * HTTP call on the Node side of Obsidian instead of the browser side, so it
 * bypasses browser CORS entirely — useful for providers whose public API
 * refuses `app://obsidian.md` preflight requests (chiefly Anthropic).
 *
 * Limitations:
 * - Response body is aggregated by `requestUrl` before we synthesise the
 *   `Response`. Streaming SSE responses arrive as a single chunk when the
 *   remote finishes; that's fine for `generateText`-style blocking use but
 *   would defeat progressive streaming in a strict sense.
 * - `AbortSignal` from `init` is honoured only by cancelling *before* the
 *   request is issued; `requestUrl` itself has no abort API. In-flight
 *   cancellation is best-effort.
 *
 * Registered at plugin boot via
 * `setProviderCorsBypassFetch(obsidianFetch)` (see `main.ts`).
 */
export const obsidianFetch: typeof fetch = async (input, init) => {
	const url = typeof input === 'string'
		? input
		: input instanceof URL ? input.toString() : (input as Request).url;

	if (init?.signal?.aborted) {
		throw new DOMException('The user aborted a request.', 'AbortError');
	}

	const headers = normaliseHeaders(init?.headers, input);
	const body = coerceBody(init?.body, input);
	const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

	const params: RequestUrlParam = {
		url,
		method,
		headers,
		body,
		throw: false,
	};

	const res = await requestUrl(params);

	const respHeaders = new Headers();
	for (const [k, v] of Object.entries(res.headers ?? {})) {
		if (typeof v === 'string') respHeaders.append(k, v);
	}

	return new Response(res.arrayBuffer, {
		status: res.status,
		statusText: statusTextFor(res.status),
		headers: respHeaders,
	});
};

function normaliseHeaders(
	headers: HeadersInit | undefined,
	input: RequestInfo | URL,
): Record<string, string> {
	const out: Record<string, string> = {};
	// Base headers from a Request object (if the SDK constructed one).
	if (input instanceof Request) {
		input.headers.forEach((value, key) => {
			out[key] = value;
		});
	}
	if (!headers) return out;
	if (headers instanceof Headers) {
		headers.forEach((value, key) => {
			out[key] = value;
		});
		return out;
	}
	if (Array.isArray(headers)) {
		for (const [k, v] of headers) out[k] = v;
		return out;
	}
	Object.assign(out, headers as Record<string, string>);
	return out;
}

function coerceBody(body: BodyInit | null | undefined, input: RequestInfo | URL): string | ArrayBuffer | undefined {
	if (body != null) {
		if (typeof body === 'string') return body;
		if (body instanceof ArrayBuffer) return body;
		if (ArrayBuffer.isView(body)) return body.buffer as ArrayBuffer;
		if (body instanceof URLSearchParams) return body.toString();
		// Blobs / FormData / streams — best-effort stringify, sufficient for
		// the JSON bodies the AI SDK sends.
		try {
			return JSON.stringify(body);
		} catch {
			return undefined;
		}
	}
	// If the caller passed a Request without a separate body, we can't
	// synchronously read a stream body here; return undefined.
	if (input instanceof Request && input.body) {
		return undefined;
	}
	return undefined;
}

function statusTextFor(status: number): string {
	if (status >= 200 && status < 300) return 'OK';
	if (status >= 300 && status < 400) return 'Redirect';
	if (status === 400) return 'Bad Request';
	if (status === 401) return 'Unauthorized';
	if (status === 403) return 'Forbidden';
	if (status === 404) return 'Not Found';
	if (status === 429) return 'Too Many Requests';
	if (status >= 500) return 'Server Error';
	return '';
}
