// Media generation port — abstracts the concrete backend (fal.ai today,
// possibly ElevenLabs / OpenAI / local models later). Consumers speak in
// media kind + textual prompt/script + optional style hints and receive
// raw bytes + suggested extension.
//
// See docs/superpowers/plans/2026-07-03-full-backlog-execution-plan.md §D4
// and docs/research/2026-07-01-multimodal-generation-studio/README.md.

export type MediaKind = 'tts' | 'image' | 'video';

export interface MediaGenerationRequest {
	kind: MediaKind;
	/** Textual input: script for TTS, prompt for image / video. */
	prompt: string;
	/** Optional voice/style/model hint the adapter may honor. */
	styleHint?: string;
	/** Optional negative prompt (images/video). */
	negativePrompt?: string;
	/** Optional target aspect ratio (images/video), e.g. "1:1", "16:9". */
	aspectRatio?: string;
}

export interface MediaGenerationResult {
	kind: MediaKind;
	/** Raw bytes of the generated media. */
	bytes: Uint8Array;
	/** File extension WITHOUT the leading dot, e.g. "mp3", "png", "mp4". */
	extension: string;
	/** MIME type, e.g. "audio/mpeg", "image/png". */
	mimeType: string;
	/** Backend-reported model identifier, for tracing. */
	modelId?: string;
	/** Backend-reported latency in ms. */
	latencyMs?: number;
}

export interface MediaGenerationPort {
	generate(req: MediaGenerationRequest): Promise<MediaGenerationResult>;
	/** Returns `false` when the adapter is not configured (missing API key etc.). */
	isConfigured(): boolean;
}
