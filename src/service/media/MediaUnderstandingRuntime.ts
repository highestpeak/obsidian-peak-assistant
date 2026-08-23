/**
 * MediaUnderstandingRuntime — one-stop wrapper the ConversationService reads
 * to decide what happens when a user attaches audio/video.
 *
 * The composer gate (Composer send-time) and service (per-turn attachment
 * ingestion) both need the same three facts:
 *
 *   1. Can we transcribe this MIME right now?
 *      → depends on the ADAPTER being configured (`transcriptionAvailable`).
 *   2. Can the current model accept video directly?
 *      → depends on `ModelCapabilities.mediaInput.video` from `service-conversation`.
 *   3. Path 1 or path 2 both fail → warn / degrade honestly.
 *
 * Reasoning: keep provider-choice pluggable, keep the decision logic
 * app-owned (main.ts injects), keep service layer testable without
 * touching real WebAudio.
 *
 * Not a module singleton — the runtime is composed in
 * `composeMediaGenerationService` and injected via constructor into any
 * consumer that needs it (see `AIServiceManager.getMediaUnderstandingRuntime`).
 */

import type {
	MediaUnderstandingPort,
	MediaAudioExtractorPort,
	MediaTranscriptionResult,
} from '@/core/ports/MediaUnderstandingPort';
import { UnsupportedMediaError } from '@/core/ports/MediaUnderstandingPort';
import type { DebugTracePort } from '@/core/debug-trace';

export type UnderstandingSource =
	| 'native-video-input'
	| 'transcript-from-audio'
	| 'transcript-from-extracted-audio'
	| 'attachment-only'
	| 'none';

export interface UnderstandingDecision {
	source: UnderstandingSource;
	/** True when we can produce actual text the LLM will see. */
	willProduceUnderstanding: boolean;
	/** Human-safe reason surfaced by the composer gate. */
	reason?: string;
}

export interface UnderstandRequest {
	/** Attachment bytes. */
	bytes: Uint8Array;
	/** `audio` or `video`. Used to pick extractor vs direct transcription path. */
	mediaKind: 'audio' | 'video';
	/** Attachment MIME (e.g. `video/mp4`, `audio/mpeg`). */
	mimeType: string;
	/** Filename hint for downstream multipart naming and logging. */
	filenameHint?: string;
	/**
	 * True when the CURRENT model natively accepts video input. In that case
	 * the caller can send the bytes as a file/part and this runtime only
	 * decides which `source` label to record — no transcription is invoked.
	 */
	modelAcceptsVideoNatively?: boolean;
	languageHint?: string;
}

export interface UnderstandOutcome {
	source: UnderstandingSource;
	transcript?: string;
	provider?: string;
	modelId?: string;
	language?: string;
	error?: string;
}

export interface MediaUnderstandingRuntimeOptions {
	transcription: MediaUnderstandingPort | null;
	audioExtractor: MediaAudioExtractorPort | null;
	debugTrace?: DebugTracePort | null;
}

export class MediaUnderstandingRuntime {
	constructor(private readonly opts: MediaUnderstandingRuntimeOptions) {}

	/** True when a transcription adapter is configured (has API key etc.). */
	isTranscriptionConfigured(): boolean {
		return this.opts.transcription?.isConfigured() ?? false;
	}

	/** True when we can decode a video's audio track locally. */
	canExtractAudioFromVideo(): boolean {
		return this.opts.audioExtractor?.isAvailable() ?? false;
	}

	/**
	 * Decide — without doing any work — what will happen if this attachment
	 * is sent right now. Composer/useInputSubmit surface this to the user
	 * before enqueueing the message.
	 */
	planUnderstanding(input: {
		mediaKind: 'audio' | 'video';
		modelAcceptsVideoNatively?: boolean;
	}): UnderstandingDecision {
		if (input.mediaKind === 'video' && input.modelAcceptsVideoNatively) {
			return {
				source: 'native-video-input',
				willProduceUnderstanding: true,
			};
		}
		if (input.mediaKind === 'audio' && this.isTranscriptionConfigured()) {
			return {
				source: 'transcript-from-audio',
				willProduceUnderstanding: true,
			};
		}
		if (
			input.mediaKind === 'video'
			&& this.isTranscriptionConfigured()
			&& this.canExtractAudioFromVideo()
		) {
			return {
				source: 'transcript-from-extracted-audio',
				willProduceUnderstanding: true,
			};
		}
		return {
			source: 'attachment-only',
			willProduceUnderstanding: false,
			reason: this.buildDegradeReason(input.mediaKind),
		};
	}

	/**
	 * Execute the decision — returns transcript bytes (when applicable) and
	 * the actual-source label to persist on the resource summary. Never
	 * throws: unrecoverable failures return `{ source: 'attachment-only', error }`.
	 */
	async understand(input: UnderstandRequest): Promise<UnderstandOutcome> {
		const decision = this.planUnderstanding({
			mediaKind: input.mediaKind,
			modelAcceptsVideoNatively: input.modelAcceptsVideoNatively,
		});
		if (decision.source === 'native-video-input') {
			return { source: 'native-video-input' };
		}
		if (decision.source === 'attachment-only') {
			return { source: 'attachment-only', error: decision.reason };
		}
		const transcription = this.opts.transcription;
		if (!transcription) {
			return { source: 'attachment-only', error: 'transcription-unavailable' };
		}

		if (decision.source === 'transcript-from-audio') {
			try {
				const result = await this.transcribe({
					bytes: input.bytes,
					mimeType: input.mimeType,
					filenameHint: input.filenameHint,
					languageHint: input.languageHint,
				});
				return this.wrapTranscription('transcript-from-audio', result);
			} catch (err) {
				return {
					source: 'attachment-only',
					error: `transcription-failed: ${(err as Error).message}`,
				};
			}
		}

		// transcript-from-extracted-audio
		const extractor = this.opts.audioExtractor;
		if (!extractor) {
			return { source: 'attachment-only', error: 'extractor-unavailable' };
		}
		let wav;
		try {
			wav = await extractor.extractAudioAsWav({
				bytes: input.bytes,
				mimeType: input.mimeType,
			});
		} catch (err) {
			if (err instanceof UnsupportedMediaError) {
				return { source: 'attachment-only', error: `unsupported-container: ${err.message}` };
			}
			return { source: 'attachment-only', error: `extract-failed: ${(err as Error).message}` };
		}
		try {
			const result = await this.transcribe({
				bytes: wav.wavBytes,
				mimeType: 'audio/wav',
				filenameHint: input.filenameHint ? `${stripExt(input.filenameHint)}.wav` : 'video-audio.wav',
				languageHint: input.languageHint,
			});
			return this.wrapTranscription('transcript-from-extracted-audio', result);
		} catch (err) {
			return {
				source: 'attachment-only',
				error: `transcription-failed: ${(err as Error).message}`,
			};
		}
	}

	private async transcribe(input: Parameters<MediaUnderstandingPort['transcribeAudio']>[0]): Promise<MediaTranscriptionResult> {
		const call = this.opts.debugTrace?.startModelCall({
			surface: 'chat',
			capabilityId: 'media.transcription',
			operation: 'speech.transcribe',
			providerId: 'configured-transcription-provider',
			modelId: 'configured-transcription-model',
			request: {
				raw: JSON.stringify({
					mimeType: input.mimeType,
					filenameHint: input.filenameHint,
					languageHint: input.languageHint,
					bytes: input.bytes.byteLength,
				}),
				contentType: 'application/json',
			},
		});
		try {
			const result = await this.opts.transcription!.transcribeAudio(input);
			call?.succeed({
				response: {
					raw: JSON.stringify(result),
					contentType: 'application/json',
				},
				metrics: { transcriptChars: result.transcript.length },
			});
			return result;
		} catch (error) {
			call?.fail(error);
			throw error;
		}
	}

	private wrapTranscription(
		source: UnderstandingSource,
		result: MediaTranscriptionResult,
	): UnderstandOutcome {
		return {
			source,
			transcript: result.transcript,
			provider: result.provider,
			modelId: result.modelId,
			language: result.language,
		};
	}

	private buildDegradeReason(kind: 'audio' | 'video'): string {
		if (kind === 'audio') {
			return this.opts.transcription
				? 'transcription-not-configured'
				: 'no-transcription-adapter';
		}
		// video
		if (!this.opts.transcription) return 'no-transcription-adapter';
		if (!this.canExtractAudioFromVideo()) return 'no-audio-extractor';
		return 'transcription-not-configured';
	}
}

function stripExt(name: string): string {
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return name;
	return name.slice(0, dot);
}
