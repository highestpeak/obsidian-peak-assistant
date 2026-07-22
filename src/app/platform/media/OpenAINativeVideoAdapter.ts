// OpenAINativeVideoAdapter — Sora async video generation via the OpenAI
// Videos API (zero-gap plan §5 B1).
//
// Endpoint contract (verified against the official API reference, 2026-07):
//   - submit:   POST {base}/v1/videos       — model ('sora-2' | 'sora-2-pro'),
//               prompt, seconds ('4'|'8'|'12'), size ('720x1280' | '1280x720'
//               | '1024x1792' | '1792x1024'); an optional reference image goes
//               in the multipart part `input_reference`.
//   - poll:     GET  {base}/v1/videos/{id}  — status: queued | in_progress |
//               completed | failed (+ progress, error).
//   - download: GET  {base}/v1/videos/{id}/content — MP4 bytes.
//   - cancel:   the API exposes DELETE for finished assets only, not a
//               mid-render cancel — `cancel()` returns false so the runner's
//               local-stop semantic applies (same contract as fal).
//
// All endpoint paths / allowed seconds / size maps live in
// `templates/config/media-generation.json → native.openai.*` — never here.
// providerResponseUrl is persisted as `{base}/v1/videos/{id}` so restart
// recovery re-polls with a fresh profile key (key itself is never persisted).

import type {
	MediaGenerationRequest,
	MediaGenerationResult,
} from '@/core/ports/MediaGenerationPort';
import type {
	AsyncMediaAdapter,
	AsyncPollStatus,
	AsyncSubmitResult,
} from '@/core/ports/AsyncMediaAdapter';
import type { MediaKind } from '@/core/types/media-generation';
import type { OpenAINativeMediaConfig } from '@/service/media/mediaGenerationConfig';
import {
	AdapterConfigurationError,
	AdapterTransientError,
} from './OpenAINativeImageAdapter';

export interface OpenAINativeVideoAdapterCallOptions {
	config: OpenAINativeMediaConfig;
	apiKey: string | undefined;
	baseUrl: string | undefined;
}

export interface OpenAINativeVideoAdapterOptions {
	resolveCallOptions: () => OpenAINativeVideoAdapterCallOptions | Promise<OpenAINativeVideoAdapterCallOptions>;
	hasProfileWithKey: () => boolean;
	fetchImpl?: typeof fetch;
}

const NATIVE_VIDEO_KINDS: readonly MediaKind[] = ['video'];

interface SoraVideoObject {
	id?: string;
	status?: string;
	progress?: number;
	error?: { message?: string } | string | null;
}

export class OpenAINativeVideoAdapter implements AsyncMediaAdapter {
	readonly providerId = 'openai';

	constructor(private readonly opts: OpenAINativeVideoAdapterOptions) {}

	isConfigured(): boolean {
		return this.opts.hasProfileWithKey();
	}

	supportedKinds(): readonly MediaKind[] {
		return NATIVE_VIDEO_KINDS;
	}

	async submit(req: MediaGenerationRequest): Promise<AsyncSubmitResult> {
		if (req.kind !== 'video') {
			throw new Error(`OpenAINativeVideoAdapter: unsupported kind ${req.kind}`);
		}
		const { call, apiKey, base } = await this.requireCall();
		const modelId = req.modelId?.trim();
		if (!modelId) {
			throw new Error('OpenAINativeVideoAdapter: modelId is required (supplied by MediaGenerationService)');
		}
		if (!call.config.videoModels.includes(modelId)) {
			throw new AdapterConfigurationError(
				`OpenAINativeVideoAdapter: model "${modelId}" is not in native.openai.videoModels (${call.config.videoModels.join(', ')})`,
			);
		}
		const seconds = nearestAllowedSeconds(call.config.videoAllowedSeconds, req.durationSeconds);
		const size = req.aspectRatio
			? call.config.videoSizeByAspect[req.aspectRatio] ?? call.config.videoDefaultSize
			: call.config.videoDefaultSize;
		const url = `${base}${call.config.videosPath}`;
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const reference = req.references?.[0];
		let resp: Response;
		if (reference) {
			// Reference image → multipart (`input_reference`), per the API docs.
			const form = new FormData();
			form.append('model', modelId);
			form.append('prompt', req.prompt);
			form.append('seconds', seconds);
			form.append('size', size);
			const copy = new Uint8Array(reference.bytes);
			form.append(
				'input_reference',
				new Blob([copy.buffer as ArrayBuffer], { type: reference.mimeType }),
				reference.filename,
			);
			resp = await this.safeFetch(fetchFn, url, {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${apiKey}` },
				body: form,
			});
		} else {
			resp = await this.safeFetch(fetchFn, url, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ model: modelId, prompt: req.prompt, seconds, size }),
			});
		}
		if (!resp.ok) {
			throw await this.classifyError(resp, 'submit');
		}
		const json = (await resp.json()) as SoraVideoObject;
		if (!json.id) {
			throw new Error(`OpenAINativeVideoAdapter: submit response missing video id: ${JSON.stringify(json).slice(0, 200)}`);
		}
		return {
			providerRequestId: json.id,
			// Poll cursor: full URL so restart recovery needs no re-derivation.
			providerResponseUrl: `${base}${call.config.videosPath}/${json.id}`,
		};
	}

	async poll(providerResponseUrl: string): Promise<AsyncPollStatus> {
		const { apiKey } = await this.requireCall();
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const resp = await this.safeFetch(fetchFn, providerResponseUrl, {
			headers: { 'Authorization': `Bearer ${apiKey}` },
		});
		if (!resp.ok) {
			return {
				kind: 'failed',
				reason: `Sora poll returned ${resp.status}: ${(await safeText(resp)).slice(0, 200)}`,
			};
		}
		const json = (await resp.json()) as SoraVideoObject;
		const status = json.status ?? '';
		if (status === 'completed') {
			return { kind: 'ready', final: json as Record<string, unknown> };
		}
		if (status === 'failed') {
			const message = typeof json.error === 'string'
				? json.error
				: json.error?.message ?? 'Sora reported failed without a message';
			return { kind: 'failed', reason: message };
		}
		// queued / in_progress (and any unknown interim state) → keep polling.
		return { kind: 'pending' };
	}

	async download(
		req: MediaGenerationRequest,
		final: Record<string, unknown>,
	): Promise<MediaGenerationResult> {
		const { call, apiKey, base } = await this.requireCall();
		const id = (final as SoraVideoObject).id;
		if (!id) {
			throw new Error('OpenAINativeVideoAdapter: final payload missing video id');
		}
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const startedAt = Date.now();
		const resp = await this.safeFetch(fetchFn, `${base}${call.config.videosPath}/${id}/content`, {
			headers: { 'Authorization': `Bearer ${apiKey}` },
		});
		if (!resp.ok) {
			throw new AdapterTransientError(
				`OpenAINativeVideoAdapter: content download failed ${resp.status}: ${(await safeText(resp)).slice(0, 200)}`,
			);
		}
		const buffer = await resp.arrayBuffer();
		return {
			kind: 'video',
			bytes: new Uint8Array(buffer),
			extension: 'mp4',
			mimeType: 'video/mp4',
			modelId: req.modelId,
			latencyMs: Date.now() - startedAt,
			providerRequestId: id,
		};
	}

	// The Videos API has no mid-render cancel endpoint (DELETE only removes
	// finished assets). Local stop is authoritative — same as fal.
	async cancel(): Promise<boolean> {
		return false;
	}

	private async requireCall(): Promise<{
		call: OpenAINativeVideoAdapterCallOptions;
		apiKey: string;
		base: string;
	}> {
		const call = await this.opts.resolveCallOptions();
		const apiKey = call.apiKey?.trim();
		if (!apiKey) {
			throw new AdapterConfigurationError('OpenAINativeVideoAdapter: no API key on active OpenAI profile');
		}
		const raw = call.baseUrl?.trim() ?? '';
		const base = (raw.length > 0 ? raw : call.config.defaultBaseUrl).replace(/\/$/, '');
		return { call, apiKey, base };
	}

	private async safeFetch(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<Response> {
		try {
			return await fetchFn(url, init);
		} catch (err) {
			throw new AdapterTransientError(
				`OpenAINativeVideoAdapter: request failed (${(err as Error).message})`,
			);
		}
	}

	private async classifyError(resp: Response, stage: string): Promise<Error> {
		const text = await safeText(resp);
		if (resp.status === 401 || resp.status === 403) {
			return new AdapterConfigurationError(
				`OpenAINativeVideoAdapter: authentication failed at ${stage} (${resp.status}): ${text.slice(0, 200)}`,
			);
		}
		if (resp.status >= 500) {
			return new AdapterTransientError(
				`OpenAINativeVideoAdapter: provider error at ${stage} ${resp.status}: ${text.slice(0, 200)}`,
			);
		}
		return new Error(`OpenAINativeVideoAdapter: ${stage} failed ${resp.status}: ${text.slice(0, 200)}`);
	}
}

/** Nearest allowed `seconds` enum value; tie prefers the LOWER (cost-safe). */
function nearestAllowedSeconds(allowed: string[], requested: number | undefined): string {
	if (allowed.length === 0) return '4';
	const parsed = allowed
		.map((raw) => ({ raw, secs: Number.parseInt(raw, 10) }))
		.filter((p) => Number.isFinite(p.secs) && p.secs > 0)
		.sort((a, b) => a.secs - b.secs);
	if (parsed.length === 0) return allowed[0];
	if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
		return parsed[0].raw;
	}
	let best = parsed[0];
	let bestDist = Math.abs(requested - best.secs);
	for (const p of parsed) {
		const d = Math.abs(requested - p.secs);
		if (d < bestDist) {
			best = p;
			bestDist = d;
		}
	}
	return best.raw;
}

async function safeText(resp: Response): Promise<string> {
	try {
		return await resp.text();
	} catch {
		return '';
	}
}
