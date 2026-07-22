/**
 * OpenAI transcription adapter — real POST to `{base}/v1/audio/transcriptions`.
 *
 * Zero-gap Track C1: the Composer accepted audio uploads before this landed,
 * but no code path ever turned the bytes into text. This adapter closes that
 * gap by calling the profile-owned OpenAI endpoint (whisper-1 by default,
 * override via `templates/config/media-generation.json`).
 *
 * Configurability rule:
 *   - endpoint path lives in `native.openai.transcriptionsPath`
 *   - default model lives in `native.openai.transcriptionModel`
 *   - profile key + baseUrl come from the same OpenAI Profile used by the
 *     image / video adapters (via `resolveOpenAiProfile`)
 *
 * Error semantics match `OpenAINativeImageAdapter`:
 *   - 401/403 → `AdapterConfigurationError`
 *   - 5xx / abort → `AdapterTransientError`
 *   - other 4xx → generic Error with truncated body
 */

import type {
	MediaUnderstandingPort,
	MediaTranscriptionRequest,
	MediaTranscriptionResult,
} from '@/core/ports/MediaUnderstandingPort';
import {
	AdapterConfigurationError,
	AdapterTransientError,
} from '@/app/platform/media/OpenAINativeImageAdapter';
import type { OpenAINativeMediaConfig } from '@/service/media/mediaGenerationConfig';

export interface OpenAITranscriptionCallOptions {
	config: OpenAINativeMediaConfig;
	apiKey: string | undefined;
	baseUrl: string | undefined;
}

export interface OpenAITranscriptionAdapterOptions {
	resolveCallOptions: () => OpenAITranscriptionCallOptions | Promise<OpenAITranscriptionCallOptions>;
	hasProfileWithKey: () => boolean;
	fetchImpl?: typeof fetch;
}

export class OpenAITranscriptionAdapter implements MediaUnderstandingPort {
	readonly providerId = 'openai';

	constructor(private readonly opts: OpenAITranscriptionAdapterOptions) {}

	isConfigured(): boolean {
		return this.opts.hasProfileWithKey();
	}

	async transcribeAudio(request: MediaTranscriptionRequest): Promise<MediaTranscriptionResult> {
		const call = await this.opts.resolveCallOptions();
		const apiKey = call.apiKey;
		if (!apiKey || apiKey.trim().length === 0) {
			throw new AdapterConfigurationError(
				'OpenAITranscriptionAdapter: no API key on active OpenAI profile',
			);
		}
		const modelId = call.config.transcriptionModel?.trim();
		if (!modelId) {
			throw new Error(
				'OpenAITranscriptionAdapter: transcriptionModel is empty in native.openai config',
			);
		}
		const transcriptionsPath = call.config.transcriptionsPath?.trim();
		if (!transcriptionsPath) {
			throw new Error(
				'OpenAITranscriptionAdapter: transcriptionsPath is empty in native.openai config',
			);
		}

		const baseUrl = normaliseBaseUrl(call.baseUrl, call.config.defaultBaseUrl);
		const url = `${baseUrl}${transcriptionsPath}`;

		const filename = request.filenameHint?.trim() || pickFilename(request.mimeType);
		const form = new FormData();
		form.append('model', modelId);
		form.append(
			'file',
			new Blob([new Uint8Array(request.bytes).buffer as ArrayBuffer], { type: request.mimeType }),
			filename,
		);
		if (request.languageHint) {
			form.append('language', request.languageHint);
		}
		// Whisper returns plain-text when requested; keep JSON for adapters that
		// upgrade later (gpt-4o-transcribe returns richer JSON on the same path).
		form.append('response_format', 'json');

		const fetchFn = this.opts.fetchImpl ?? fetch;
		const controller = new AbortController();
		const timeoutMs = call.config.requestTimeoutMs;
		const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
		const startedAt = Date.now();

		let resp: Response;
		try {
			resp = await fetchFn(url, {
				method: 'POST',
				headers: { Authorization: `Bearer ${apiKey.trim()}` },
				body: form,
				signal: controller.signal,
			});
		} catch (err) {
			throw new AdapterTransientError(
				`OpenAITranscriptionAdapter: request failed (${(err as Error).message})`,
			);
		} finally {
			clearTimeout(timeoutHandle);
		}

		if (!resp.ok) {
			const text = await safeReadText(resp);
			if (resp.status === 401 || resp.status === 403) {
				throw new AdapterConfigurationError(
					`OpenAITranscriptionAdapter: authentication failed (${resp.status}): ${truncate(text, 200)}`,
				);
			}
			if (resp.status >= 500) {
				throw new AdapterTransientError(
					`OpenAITranscriptionAdapter: provider error ${resp.status}: ${truncate(text, 200)}`,
				);
			}
			throw new Error(
				`OpenAITranscriptionAdapter: request failed ${resp.status}: ${truncate(text, 200)}`,
			);
		}

		const contentType = resp.headers.get('Content-Type') ?? '';
		let transcript = '';
		let language: string | undefined;
		if (contentType.includes('application/json')) {
			const json = (await resp.json()) as { text?: string; language?: string };
			transcript = typeof json.text === 'string' ? json.text : '';
			language = typeof json.language === 'string' ? json.language : undefined;
		} else {
			transcript = await resp.text();
		}
		if (transcript.length === 0) {
			throw new Error('OpenAITranscriptionAdapter: response contained no transcript text');
		}

		return {
			transcript,
			provider: this.providerId,
			modelId,
			language,
			latencyMs: Date.now() - startedAt,
		};
	}
}

function pickFilename(mimeType: string): string {
	const lower = (mimeType ?? '').toLowerCase();
	if (lower.includes('wav')) return 'audio.wav';
	if (lower.includes('mpeg')) return 'audio.mp3';
	if (lower.includes('mp4')) return 'audio.m4a';
	if (lower.includes('ogg')) return 'audio.ogg';
	if (lower.includes('webm')) return 'audio.webm';
	if (lower.includes('flac')) return 'audio.flac';
	return 'audio.bin';
}

function normaliseBaseUrl(profileBaseUrl: string | undefined, fallback: string): string {
	const raw = profileBaseUrl?.trim() ?? '';
	const chosen = raw.length > 0 ? raw : fallback;
	return chosen.replace(/\/$/, '');
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
