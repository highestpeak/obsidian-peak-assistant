// fal.ai adapter for MediaGenerationPort. Executes a single generate call
// given a fully-resolved model id + payload; preflight, routing, cost
// estimates, config lookup, and receipt writing all live in
// `MediaGenerationService`. See task C1 §R5.
//
// The API key comes from `settings.ai.falApiKey` (read via the injected
// getter so the adapter never touches AppContext). All timing / model
// defaults are supplied by the caller — this class deliberately holds no
// domain constants.
//
// Zero-gap plan §4 A3: shared wire-protocol logic (payload / URL extraction /
// extension) lives in `falPayload.ts` so this sync adapter and the async
// twin cannot drift. Every image generation returns EVERY image the model
// produced via `result.outputs` (batch fan-out).

import type {
	MediaGenerationPort,
	MediaGenerationRequest,
	MediaGenerationResult,
	MediaKind,
} from '@/core/ports/MediaGenerationPort';
import type { MediaOperation } from '@/core/types/media-generation';
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

/**
 * Timing knobs supplied per-call by the service layer so the adapter can
 * remain config-free. All values are milliseconds.
 */
export interface FalPollTimings {
	pollIntervalMs: number;
	pollBackoffMultiplier: number;
	pollMaxIntervalMs: number;
	pollDeadlineMs: number;
}

export interface FalMediaAdapterOptions {
	getApiKey: () => string | undefined;
	fetchImpl?: typeof fetch;
	/** Optional per-call timing supplier. When absent, adapter uses
	 * conservative defaults matching pre-C1 hardcodes (backward compat
	 * for existing tests that constructed the adapter directly). */
	getTimings?: () => FalPollTimings;
	/**
	 * V1 R1 — per-call config supplier used exclusively for the
	 * `resolveVideoDurationEnum` mapping (integer seconds → fal enum
	 * string). Kept minimal so tests can pass just the enum fields; the
	 * adapter falls back to a hard `["4s","6s","8s"]` default when absent.
	 */
	getConfig?: () => FalVideoEnumConfig;
}

/** All kinds fal.ai can execute today (the concrete endpoint availability
 * is verified per-call via preflight + config, not here). */
const FAL_SUPPORTED_KINDS: readonly MediaKind[] = ['tts', 'image', 'video', 'music'];

export class FalMediaAdapter implements MediaGenerationPort {
	readonly providerId = 'fal';

	constructor(private readonly opts: FalMediaAdapterOptions) {}

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

	/**
	 * Execute a generation. `req.modelId` MUST be set by the caller (the
	 * service resolves it from config presets). Timing knobs default to
	 * conservative values matching the pre-C1 hardcode, so tests that
	 * construct an adapter directly still pass without wiring config.
	 */
	async generate(req: MediaGenerationRequest): Promise<MediaGenerationResult> {
		const timings = this.opts.getTimings?.();
		const key = this.opts.getApiKey();
		if (!key || key.trim().length === 0) {
			throw new Error('FalMediaAdapter: no API key configured');
		}
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const modelId = req.modelId;
		if (!modelId || modelId.trim().length === 0) {
			throw new Error('FalMediaAdapter: modelId is required (supplied by MediaGenerationService)');
		}
		const startedAt = Date.now();

		const cfg = this.opts.getConfig?.() ?? FAL_FALLBACK_VIDEO_ENUM;
		const payload = buildFalPayload(req, cfg as MediaGenerationConfig);
		const submitUrl = `${FAL_QUEUE_BASE}/${modelId}`;
		const submitResp = await fetchFn(submitUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Key ${key.trim()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});
		if (!submitResp.ok) {
			throw new Error(`fal.ai submit failed: ${submitResp.status} ${await submitResp.text()}`);
		}
		const submitJson = (await submitResp.json()) as { request_id?: string; response_url?: string };
		const responseUrl = submitJson.response_url;
		if (!responseUrl) {
			throw new Error('fal.ai submit response missing response_url');
		}

		const effectiveTimings: FalPollTimings = timings ?? {
			pollIntervalMs: 1500,
			pollBackoffMultiplier: 1.3,
			pollMaxIntervalMs: 5000,
			pollDeadlineMs: 5 * 60 * 1000,
		};
		const finalJson = await this.pollUntilReady(responseUrl, key, fetchFn, effectiveTimings);
		const mediaUrls = extractFalMediaUrls(req.kind, finalJson);
		if (mediaUrls.length === 0) {
			throw new Error('fal.ai final response missing media URL: ' + JSON.stringify(finalJson).slice(0, 200));
		}

		// Batch fan-out: download every URL. For non-image kinds this is
		// still a single URL, so `outputs.length === 1` and the shape stays
		// backward compatible.
		const outputs: MediaGenerationResult['outputs'] = [];
		for (const url of mediaUrls) {
			const mediaResp = await fetchFn(url);
			if (!mediaResp.ok) {
				throw new Error(`fal.ai media fetch failed: ${mediaResp.status}`);
			}
			const arrayBuffer = await mediaResp.arrayBuffer();
			const { extension, mimeType } = falExtensionAndMime(req.kind, url);
			outputs!.push({
				bytes: new Uint8Array(arrayBuffer),
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
			providerRequestId: submitJson.request_id,
			providerResponseUrl: responseUrl,
		};
	}

	private async pollUntilReady(
		responseUrl: string,
		key: string,
		fetchFn: typeof fetch,
		timings: FalPollTimings,
	): Promise<Record<string, unknown>> {
		const deadline = Date.now() + timings.pollDeadlineMs;
		let delayMs = timings.pollIntervalMs;
		while (Date.now() < deadline) {
			const resp = await fetchFn(responseUrl, {
				headers: { 'Authorization': `Key ${key.trim()}` },
			});
			if (resp.status === 200) {
				return (await resp.json()) as Record<string, unknown>;
			}
			if (resp.status !== 202) {
				throw new Error(`fal.ai poll failed: ${resp.status} ${await resp.text()}`);
			}
			await new Promise((r) => setTimeout(r, delayMs));
			delayMs = Math.min(delayMs * timings.pollBackoffMultiplier, timings.pollMaxIntervalMs);
		}
		throw new Error(`fal.ai polling timed out after ${timings.pollDeadlineMs}ms`);
	}
}
