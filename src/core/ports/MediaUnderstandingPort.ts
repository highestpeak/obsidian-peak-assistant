/**
 * MediaUnderstandingPort — turns raw audio bytes into a text transcript so an
 * LLM that does not natively accept audio/video can still "understand" the
 * attachment. Zero-gap Track C1 (docs/superpowers/plans/2026-07-20-…).
 *
 * The port is intentionally small: bytes + mime in, `{ transcript, provider,
 * modelId }` out. Video is handled ONE layer up (`MediaAudioExtractorPort`)
 * because extracting audio from video is Renderer/WebAudio work that has
 * nothing to do with STT provider choice.
 *
 * Adapters MUST throw:
 *   - `AdapterConfigurationError` for 401/403 or missing API key — the caller
 *     surfaces "configure" in the UI.
 *   - `AdapterTransientError` for 5xx / network aborts — the caller may retry.
 *
 * No provider-specific fields (model id, endpoint path) live in the port —
 * everything is data-driven via `templates/config/media-generation.json`.
 */

export interface MediaTranscriptionResult {
	/** Plain-text transcript. May contain newlines. */
	transcript: string;
	/** Adapter id (e.g. `'openai'`). Persisted for provenance. */
	provider: string;
	/** Model id actually invoked (e.g. `'whisper-1'`, `'gpt-4o-transcribe'`). */
	modelId: string;
	/** Optional detected language (BCP-47) when provider surfaces it. */
	language?: string;
	/** Adapter-reported latency in milliseconds. */
	latencyMs?: number;
}

export interface MediaTranscriptionRequest {
	bytes: Uint8Array;
	/**
	 * MIME type of `bytes` (e.g. `'audio/mpeg'`, `'audio/wav'`). Adapters use
	 * this to derive the multipart part filename extension.
	 */
	mimeType: string;
	/** Optional filename hint — improves multipart part naming for providers
	 * that switch behavior based on extension (e.g. Whisper). */
	filenameHint?: string;
	/**
	 * Optional language hint (BCP-47). Passed through when the provider
	 * accepts it — providers that ignore it must not fail.
	 */
	languageHint?: string;
}

export interface MediaUnderstandingPort {
	/**
	 * True when the adapter has enough config to make a real call today.
	 * Used by the Composer gate to decide whether to warn the user before
	 * sending a message that includes audio/video.
	 */
	isConfigured(): boolean;
	transcribeAudio(request: MediaTranscriptionRequest): Promise<MediaTranscriptionResult>;
}

/**
 * Extracts a single-channel PCM audio buffer from a video file's audio track
 * WITHOUT shelling out. Zero-gap §C1: uses WebAudio `OfflineAudioContext` in
 * the Obsidian renderer; the returned bytes are ready to feed a transcription
 * adapter as `audio/wav`.
 *
 * Non-decodable containers (some raw MKV / HEVC-only tracks) throw honestly —
 * the caller degrades to "attachment saved but not understood".
 */
export interface MediaAudioExtractorPort {
	/** True when the runtime this adapter targets can execute (Renderer only). */
	isAvailable(): boolean;
	/**
	 * @throws `UnsupportedMediaError` when the container/codec cannot decode.
	 * @throws `AdapterTransientError` for renderer failures that may retry.
	 */
	extractAudioAsWav(input: {
		bytes: Uint8Array;
		mimeType: string;
	}): Promise<{ wavBytes: Uint8Array; sampleRate: number; channels: number }>;
}

/**
 * Signals a media container/codec the extractor cannot decode. The caller
 * surfaces this as "unsupported" in the Composer send-time gate — no fake
 * transcript is invented.
 */
export class UnsupportedMediaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsupportedMediaError';
	}
}
