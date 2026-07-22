// FalAsyncMediaAdapter — durable async wrapper around fal.ai's queue endpoints.
// Split from FalMediaAdapter (which owns the sync generate() path used by
// image + TTS) so the MediaJobRunner can drive the video/music lifecycle
// without a blocking pollUntilReady() loop. Every stage is a discrete method
// so the runner controls timing + restart semantics.
//
// The submit + poll body/response shapes MUST match FalMediaAdapter — both
// adapters share `falPayload.ts` so the wire protocol lives in exactly one
// place. Image kinds emit `result.outputs` for batch fan-out (matches sync).

import type { MediaGenerationRequest, MediaGenerationResult } from '@/core/ports/MediaGenerationPort';
import type { MediaKind, MediaOperation } from '@/core/types/media-generation';
import type {
	AsyncMediaAdapter,
	AsyncSubmitResult,
	AsyncPollStatus,
} from '@/core/ports/AsyncMediaAdapter';
import type { MediaGenerationConfig } from '@/service/media/mediaGenerationConfig';
import {
	buildFalPayload,
	extractFalMediaUrls,
	falExtensionAndMime,
	falSupportedOperations,
	FAL_FALLBACK_VIDEO_ENUM,
	FAL_QUEUE_BASE,
	type FalVideoEnumConfig,
} from './falPayload';

export interface FalAsyncMediaAdapterOptions {
	getApiKey: () => string | undefined;
	fetchImpl?: typeof fetch;
	/** V1 R1 — parity with `FalMediaAdapter.getConfig`. See there. */
	getConfig?: () => FalVideoEnumConfig;
}

/** All kinds fal.ai can execute today; runner filters by preflight anyway. */
const FAL_SUPPORTED_KINDS: readonly MediaKind[] = ['tts', 'image', 'video', 'music'];

export class FalAsyncMediaAdapter implements AsyncMediaAdapter {
	readonly providerId = 'fal';

	constructor(private readonly opts: FalAsyncMediaAdapterOptions) {}

	isConfigured(): boolean {
		const key = this.opts.getApiKey();
		return typeof key === 'string' && key.trim().length > 0;
	}

	supportedKinds(): readonly MediaKind[] {
		return FAL_SUPPORTED_KINDS;
	}

	supportedOperations(kind: MediaKind): readonly MediaOperation[] {
		return falSupportedOperations(kind);
	}

	async submit(req: MediaGenerationRequest): Promise<AsyncSubmitResult> {
		const key = this.requireKey();
		const modelId = this.requireModelId(req);
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const cfg = this.opts.getConfig?.() ?? FAL_FALLBACK_VIDEO_ENUM;
		const payload = buildFalPayload(req, cfg as MediaGenerationConfig);
		const resp = await fetchFn(`${FAL_QUEUE_BASE}/${modelId}`, {
			method: 'POST',
			headers: {
				'Authorization': `Key ${key.trim()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});
		if (!resp.ok) {
			throw new Error(`fal.ai submit failed: ${resp.status} ${await resp.text()}`);
		}
		const json = (await resp.json()) as { request_id?: string; response_url?: string };
		if (!json.request_id || !json.response_url) {
			throw new Error('fal.ai submit response missing request_id / response_url');
		}
		return {
			providerRequestId: json.request_id,
			providerResponseUrl: json.response_url,
		};
	}

	async poll(providerResponseUrl: string): Promise<AsyncPollStatus> {
		const key = this.requireKey();
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const resp = await fetchFn(providerResponseUrl, {
			headers: { 'Authorization': `Key ${key.trim()}` },
		});
		if (resp.status === 200) {
			const final = (await resp.json()) as Record<string, unknown>;
			return { kind: 'ready', final };
		}
		if (resp.status === 202) {
			return { kind: 'pending' };
		}
		return {
			kind: 'failed',
			reason: `fal.ai poll returned ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
		};
	}

	async download(
		req: MediaGenerationRequest,
		final: Record<string, unknown>,
	): Promise<MediaGenerationResult> {
		const modelId = this.requireModelId(req);
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const mediaUrls = extractFalMediaUrls(req.kind, final);
		if (mediaUrls.length === 0) {
			throw new Error(
				'fal.ai final response missing media URL: ' + JSON.stringify(final).slice(0, 200),
			);
		}
		const startedAt = Date.now();
		const outputs: MediaGenerationResult['outputs'] = [];
		for (const url of mediaUrls) {
			const mediaResp = await fetchFn(url);
			if (!mediaResp.ok) {
				throw new Error(`fal.ai media fetch failed: ${mediaResp.status}`);
			}
			const buffer = await mediaResp.arrayBuffer();
			const { extension, mimeType } = falExtensionAndMime(req.kind, url);
			outputs!.push({
				bytes: new Uint8Array(buffer),
				extension,
				mimeType,
			});
		}
		const primary = outputs![0];
		return {
			kind: req.kind,
			bytes: primary.bytes,
			extension: primary.extension,
			mimeType: primary.mimeType,
			outputs,
			modelId,
			latencyMs: Date.now() - startedAt,
		};
	}

	// fal.ai has no documented queue cancel today. Returning false tells the
	// runner "the local cancel semantics are enough; stop polling and mark
	// the job cancelled". Kept as a hook so future providers can implement.
	async cancel(): Promise<boolean> {
		return false;
	}

	private requireKey(): string {
		const key = this.opts.getApiKey();
		if (!key || key.trim().length === 0) {
			throw new Error('FalAsyncMediaAdapter: no API key configured');
		}
		return key;
	}

	private requireModelId(req: MediaGenerationRequest): string {
		const modelId = req.modelId;
		if (!modelId || modelId.trim().length === 0) {
			throw new Error('FalAsyncMediaAdapter: modelId is required (supplied by MediaGenerationService)');
		}
		return modelId;
	}
}
