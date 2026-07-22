// OpenAI native image adapter for MediaGenerationPort. Implements Task C2
// §R1: a real POST to `{baseUrl}/v1/images/generations` using the user's
// OpenAI Profile key/baseUrl (never chat completion pretending to be
// image generation). `supportedKinds()` returns `['image']` only — video,
// music, and TTS are unsupported here (no fake claims).
//
// All config lives in `templates/config/media-generation.json` →
// `native.openai.*`; this file holds no domain constants (no model id,
// no size, no timeout). See docs/conventions/configurability.md.
//
// Provider-factory §33-114 shows the profile edge we mirror:
//   - `apiKey` from Profile (opaque to adapter)
//   - `baseUrl` from Profile, defaulting when empty
// We deliberately do NOT copy chat-completion headers such as
// `anthropic-dangerous-direct-browser-access` — those are provider- and
// path-specific to Anthropic chat, not to OpenAI images. Only headers
// documented for `/v1/images/generations` are sent.

import type {
	MediaGenerationPort,
	MediaGenerationRequest,
	MediaGenerationResult,
	MediaKind,
} from '@/core/ports/MediaGenerationPort';
import type { MediaOperation } from '@/core/types/media-generation';
import type { OpenAINativeMediaConfig } from '@/service/media/mediaGenerationConfig';

/**
 * All values the adapter needs at call time. Supplied per-call by the
 * service so template edits are picked up without restart.
 */
export interface OpenAINativeImageAdapterCallOptions {
	config: OpenAINativeMediaConfig;
	/** Vault-relative Profile key + baseUrl edge. Both may be undefined
	 * when the caller couldn't find a valid profile. `generate()` throws
	 * in that case rather than making an anonymous request. */
	apiKey: string | undefined;
	baseUrl: string | undefined;
}

export interface OpenAINativeImageAdapterOptions {
	/** Resolves profile + config per call. Adapter never touches
	 * ProfileRegistry / TemplateManager directly. */
	resolveCallOptions: () => OpenAINativeImageAdapterCallOptions | Promise<OpenAINativeImageAdapterCallOptions>;
	/** Reports whether a profile with API key exists — used for
	 * `isConfigured()` without needing a full config read. */
	hasProfileWithKey: () => boolean;
	fetchImpl?: typeof fetch;
}

/** Kinds this adapter really implements today. */
const NATIVE_SUPPORTED_KINDS: readonly MediaKind[] = ['image'];
const NATIVE_IMAGE_OPERATIONS: readonly MediaOperation[] = ['generate', 'edit'];
const NATIVE_GENERATE_ONLY: readonly MediaOperation[] = ['generate'];

export class OpenAINativeImageAdapter implements MediaGenerationPort {
	readonly providerId = 'openai';

	constructor(private readonly opts: OpenAINativeImageAdapterOptions) {}

	isConfigured(): boolean {
		return this.opts.hasProfileWithKey();
	}

	supportedKinds(): readonly MediaKind[] {
		return NATIVE_SUPPORTED_KINDS;
	}

	supportedOperations(kind: MediaKind): readonly MediaOperation[] {
		return kind === 'image' ? NATIVE_IMAGE_OPERATIONS : NATIVE_GENERATE_ONLY;
	}

	async generate(req: MediaGenerationRequest): Promise<MediaGenerationResult> {
		if (req.kind !== 'image') {
			throw new Error(
				`OpenAINativeImageAdapter: unsupported kind ${req.kind}; supportedKinds() = ${JSON.stringify(
					NATIVE_SUPPORTED_KINDS,
				)}`,
			);
		}
		const call = await this.opts.resolveCallOptions();
		const apiKey = call.apiKey;
		if (!apiKey || apiKey.trim().length === 0) {
			throw new AdapterConfigurationError('OpenAINativeImageAdapter: no API key on active OpenAI profile');
		}
		const modelId = req.modelId?.trim();
		if (!modelId) {
			throw new Error('OpenAINativeImageAdapter: modelId is required (supplied by MediaGenerationService via preset)');
		}
		const startedAt = Date.now();
		const fetchFn = this.opts.fetchImpl ?? fetch;
		const resp = req.operation === 'edit'
			? await this.postEdit(req, call, apiKey, modelId, fetchFn)
			: await this.postGenerate(req, call, apiKey, modelId, fetchFn);

		if (!resp.ok) {
			const text = await safeReadText(resp);
			if (resp.status === 401 || resp.status === 403) {
				throw new AdapterConfigurationError(
					`OpenAINativeImageAdapter: authentication failed (${resp.status}): ${truncate(text, 200)}`,
				);
			}
			// 4xx (non-auth) → user error with provider message; 5xx → transient.
			if (resp.status >= 500) {
				throw new AdapterTransientError(
					`OpenAINativeImageAdapter: provider error ${resp.status}: ${truncate(text, 200)}`,
				);
			}
			throw new Error(`OpenAINativeImageAdapter: request failed ${resp.status}: ${truncate(text, 200)}`);
		}

		const json = (await resp.json()) as OpenAIImageResponse;
		const outputs = await extractAllBytes(json, fetchFn);
		if (outputs.length === 0) {
			throw new Error(
				`OpenAINativeImageAdapter: response contained no image data: ${truncate(JSON.stringify(json), 200)}`,
			);
		}

		return {
			kind: 'image',
			bytes: outputs[0],
			extension: 'png',
			mimeType: 'image/png',
			// Batch fan-out (zero-gap §4 A3): the service writes one vault
			// file + one receipt per entry.
			outputs: outputs.map((bytes) => ({ bytes, extension: 'png', mimeType: 'image/png' })),
			modelId,
			latencyMs: Date.now() - startedAt,
			providerRequestId: undefined,
			providerResponseUrl: undefined,
		};
	}

	/** Text-to-image: JSON POST to `imagesPath`. */
	private async postGenerate(
		req: MediaGenerationRequest,
		call: OpenAINativeImageAdapterCallOptions,
		apiKey: string,
		modelId: string,
		fetchFn: typeof fetch,
	): Promise<Response> {
		const baseUrl = normaliseBaseUrl(call.baseUrl, call.config.defaultBaseUrl);
		const url = `${baseUrl}${call.config.imagesPath}`;
		const size = resolveSize(req.aspectRatio, call.config);
		const n = req.quantity ?? call.config.defaultN;
		// Per-model responseFormat: some models (gpt-image-1) do not accept the
		// `response_format` param and will 400 if it is sent. The config carries
		// a per-model override map; `null` means "omit the field entirely".
		const responseFormat = resolveResponseFormat(modelId, call.config);
		const body: Record<string, unknown> = {
			model: modelId,
			prompt: req.prompt,
			n,
			size,
		};
		if (responseFormat !== null) {
			body['response_format'] = responseFormat;
		}
		return this.timedFetch(fetchFn, url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey.trim()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		}, call.config.requestTimeoutMs);
	}

	/**
	 * Image edit: multipart POST to `editsPath` (zero-gap §4 A3 / §5 B).
	 * gpt-image-1 family expects `image[]` parts (config
	 * `editImagePartName`); dall-e-2 expects a single `image` part
	 * (`editImagePartNameByModel`). Mask goes in the `mask` part (PNG whose
	 * transparent pixels mark the editable region — masking is prompt-guided
	 * for gpt-image models). Never sets Content-Type manually — fetch derives
	 * the multipart boundary from the FormData body.
	 */
	private async postEdit(
		req: MediaGenerationRequest,
		call: OpenAINativeImageAdapterCallOptions,
		apiKey: string,
		modelId: string,
		fetchFn: typeof fetch,
	): Promise<Response> {
		const references = req.references ?? [];
		if (references.length === 0) {
			throw new Error('OpenAINativeImageAdapter: edit requires at least one reference image');
		}
		if (references.length > call.config.editMaxImages) {
			throw new Error(
				`OpenAINativeImageAdapter: ${references.length} reference images exceed the provider cap of ${call.config.editMaxImages}`,
			);
		}
		if (req.mask && !call.config.editSupportsMask) {
			throw new Error('OpenAINativeImageAdapter: mask supplied but editSupportsMask=false in config');
		}
		const baseUrl = normaliseBaseUrl(call.baseUrl, call.config.defaultBaseUrl);
		const url = `${baseUrl}${call.config.editsPath}`;
		const partName = call.config.editImagePartNameByModel[modelId] ?? call.config.editImagePartName;
		const form = new FormData();
		form.append('model', modelId);
		form.append('prompt', req.prompt);
		form.append('n', String(req.quantity ?? call.config.defaultN));
		form.append('size', resolveSize(req.aspectRatio, call.config));
		const responseFormat = resolveResponseFormat(modelId, call.config);
		if (responseFormat !== null) form.append('response_format', responseFormat);
		for (const ref of references) {
			form.append(partName, referenceBlob(ref), ref.filename);
		}
		if (req.mask) {
			form.append('mask', referenceBlob(req.mask), req.mask.filename);
		}
		return this.timedFetch(fetchFn, url, {
			method: 'POST',
			headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
			body: form,
		}, call.config.requestTimeoutMs);
	}

	private async timedFetch(
		fetchFn: typeof fetch,
		url: string,
		init: RequestInit,
		timeoutMs: number,
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
		try {
			return await fetchFn(url, { ...init, signal: controller.signal });
		} catch (err) {
			// AbortError / network error → retriable failure.
			throw new AdapterTransientError(
				`OpenAINativeImageAdapter: request failed (${(err as Error).message})`,
			);
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

function referenceBlob(ref: { bytes: Uint8Array; mimeType: string }): Blob {
	const copy = new Uint8Array(ref.bytes);
	return new Blob([copy.buffer as ArrayBuffer], { type: ref.mimeType });
}

/** Signals a configuration problem (401/403 / missing key). Callers should
 * surface as `needs-configuration` in the UI. */
export class AdapterConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AdapterConfigurationError';
	}
}

/** Signals a transient failure (network / 5xx / abort). Callers may retry. */
export class AdapterTransientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AdapterTransientError';
	}
}

interface OpenAIImageResponse {
	data?: Array<{ b64_json?: string; url?: string }>;
}

/** Extract EVERY output in `data[]` (batch fan-out; order preserved). */
async function extractAllBytes(json: OpenAIImageResponse, fetchFn: typeof fetch): Promise<Uint8Array[]> {
	const entries = json.data ?? [];
	const outputs: Uint8Array[] = [];
	for (const entry of entries) {
		if (entry.b64_json) {
			outputs.push(base64ToBytes(entry.b64_json));
			continue;
		}
		if (entry.url) {
			const resp = await fetchFn(entry.url);
			if (!resp.ok) throw new Error(`OpenAINativeImageAdapter: image URL fetch failed ${resp.status}`);
			const buf = await resp.arrayBuffer();
			outputs.push(new Uint8Array(buf));
		}
	}
	return outputs;
}

function base64ToBytes(b64: string): Uint8Array {
	// atob is available in the Obsidian renderer + Node ≥ 16.
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
	return out;
}

function normaliseBaseUrl(profileBaseUrl: string | undefined, fallback: string): string {
	const raw = profileBaseUrl?.trim() ?? '';
	const chosen = raw.length > 0 ? raw : fallback;
	// Strip trailing slash so `${base}${imagesPath}` never doubles the slash.
	return chosen.replace(/\/$/, '');
}

function resolveSize(aspectRatio: string | undefined, config: OpenAINativeMediaConfig): string {
	if (!aspectRatio) return config.defaultSize;
	return config.sizeByAspect[aspectRatio] ?? config.defaultSize;
}

/**
 * Resolve the `response_format` value for a given model.
 * Returns `null` when the field must be omitted (e.g. gpt-image-1 rejects it).
 * Per-model entries in `responseFormatByModel` take precedence over
 * `defaultResponseFormat`; when the map has no entry for this model the
 * default is used.
 */
function resolveResponseFormat(
	modelId: string,
	config: OpenAINativeMediaConfig,
): 'b64_json' | 'url' | null {
	if (Object.prototype.hasOwnProperty.call(config.responseFormatByModel, modelId)) {
		return config.responseFormatByModel[modelId];
	}
	return config.defaultResponseFormat;
}

async function safeReadText(resp: Response): Promise<string> {
	try {
		return await resp.text();
	} catch {
		return '';
	}
}

function truncate(str: string, max: number): string {
	if (str.length <= max) return str;
	return `${str.slice(0, max)}…`;
}
