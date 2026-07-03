// fal.ai adapter for MediaGenerationPort. Implements TTS + image today, video
// stubbed. See docs/research/2026-07-01-multimodal-generation-studio/ for
// model choices. The user provides an API key via settings; without one the
// adapter reports `isConfigured() === false` and consumers show a "configure
// fal.ai first" notice instead of throwing.

import type {
	MediaGenerationPort,
	MediaGenerationRequest,
	MediaGenerationResult,
} from '@/core/ports/MediaGenerationPort';

const FAL_QUEUE_BASE = 'https://queue.fal.run';

// Default model ids. Users may override via `styleHint = "model:<id>"`.
const DEFAULT_TTS_MODEL = 'fal-ai/kokoro/american-english';
const DEFAULT_IMAGE_MODEL = 'fal-ai/fast-sdxl';
const DEFAULT_VIDEO_MODEL = 'fal-ai/veo3/text-to-video';

function parseStyleModelOverride(styleHint: string | undefined): string | null {
	if (!styleHint) return null;
	const match = styleHint.match(/model:([^ ,]+)/);
	return match ? match[1] : null;
}

export interface FalMediaAdapterOptions {
	getApiKey: () => string | undefined;
	fetchImpl?: typeof fetch;
}

export class FalMediaAdapter implements MediaGenerationPort {
	constructor(private readonly opts: FalMediaAdapterOptions) {}

	isConfigured(): boolean {
		const key = this.opts.getApiKey();
		return typeof key === 'string' && key.trim().length > 0;
	}

	async generate(req: MediaGenerationRequest): Promise<MediaGenerationResult> {
		const key = this.opts.getApiKey();
		if (!key || key.trim().length === 0) {
			throw new Error('FalMediaAdapter: no API key configured');
		}
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const modelOverride = parseStyleModelOverride(req.styleHint);
		const modelId = modelOverride ?? this.defaultModelFor(req.kind);
		const startedAt = Date.now();

		const payload = this.buildPayload(req);
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

		const finalJson = await this.pollUntilReady(responseUrl, key, fetchFn);
		const mediaUrl = this.extractMediaUrl(req.kind, finalJson);
		if (!mediaUrl) {
			throw new Error('fal.ai final response missing media URL: ' + JSON.stringify(finalJson).slice(0, 200));
		}

		const mediaResp = await fetchFn(mediaUrl);
		if (!mediaResp.ok) {
			throw new Error(`fal.ai media fetch failed: ${mediaResp.status}`);
		}
		const arrayBuffer = await mediaResp.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		const { extension, mimeType } = this.extensionAndMime(req.kind, mediaUrl);
		return {
			kind: req.kind,
			bytes,
			extension,
			mimeType,
			modelId,
			latencyMs: Date.now() - startedAt,
		};
	}

	private defaultModelFor(kind: MediaGenerationRequest['kind']): string {
		if (kind === 'tts') return DEFAULT_TTS_MODEL;
		if (kind === 'image') return DEFAULT_IMAGE_MODEL;
		return DEFAULT_VIDEO_MODEL;
	}

	private buildPayload(req: MediaGenerationRequest): Record<string, unknown> {
		if (req.kind === 'tts') {
			return { text: req.prompt, voice: req.styleHint?.replace(/model:[^ ,]+,?\s*/, '') || 'af_bella' };
		}
		if (req.kind === 'image') {
			return {
				prompt: req.prompt,
				negative_prompt: req.negativePrompt,
				image_size: req.aspectRatio ? mapAspect(req.aspectRatio) : 'square_hd',
			};
		}
		return {
			prompt: req.prompt,
			aspect_ratio: req.aspectRatio ?? '16:9',
		};
	}

	private async pollUntilReady(
		responseUrl: string,
		key: string,
		fetchFn: typeof fetch,
	): Promise<Record<string, unknown>> {
		const deadline = Date.now() + 5 * 60 * 1000;
		let delayMs = 1500;
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
			delayMs = Math.min(delayMs * 1.3, 5000);
		}
		throw new Error('fal.ai polling timed out after 5 minutes');
	}

	private extractMediaUrl(kind: MediaGenerationRequest['kind'], json: Record<string, unknown>): string | null {
		// fal.ai response shapes vary by model. Cover the common cases:
		// TTS: { audio: { url } }
		// Image: { images: [ { url } ] } or { image: { url } }
		// Video: { video: { url } }
		const audioAny = (json as any).audio;
		if (kind === 'tts' && audioAny?.url) return audioAny.url as string;
		const imagesAny = (json as any).images;
		if (kind === 'image' && Array.isArray(imagesAny) && imagesAny[0]?.url) return imagesAny[0].url as string;
		const imageAny = (json as any).image;
		if (kind === 'image' && imageAny?.url) return imageAny.url as string;
		const videoAny = (json as any).video;
		if (kind === 'video' && videoAny?.url) return videoAny.url as string;
		return null;
	}

	private extensionAndMime(kind: MediaGenerationRequest['kind'], url: string): { extension: string; mimeType: string } {
		const lower = url.toLowerCase();
		if (kind === 'tts') {
			if (lower.endsWith('.wav')) return { extension: 'wav', mimeType: 'audio/wav' };
			return { extension: 'mp3', mimeType: 'audio/mpeg' };
		}
		if (kind === 'image') {
			if (lower.endsWith('.webp')) return { extension: 'webp', mimeType: 'image/webp' };
			if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { extension: 'jpg', mimeType: 'image/jpeg' };
			return { extension: 'png', mimeType: 'image/png' };
		}
		return { extension: 'mp4', mimeType: 'video/mp4' };
	}
}

function mapAspect(ratio: string): string {
	if (ratio === '16:9') return 'landscape_16_9';
	if (ratio === '9:16') return 'portrait_9_16';
	if (ratio === '4:3') return 'landscape_4_3';
	if (ratio === '3:4') return 'portrait_4_3';
	return 'square_hd';
}
