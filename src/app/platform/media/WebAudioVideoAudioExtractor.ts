/**
 * WebAudio-based video/audio decoder — zero-gap Track C1 fallback for models
 * that don't accept video input directly.
 *
 * The renderer decodes the container via `OfflineAudioContext.decodeAudioData`
 * (which happily accepts common video containers because it ignores video
 * tracks and only decodes the audio track). We then:
 *   1. downmix to mono,
 *   2. resample to 16 kHz using low-quality linear resample,
 *   3. encode 16-bit PCM WAV via `encodeMono16kWav`.
 *
 * The output is fed straight into `OpenAITranscriptionAdapter`.
 *
 * Codec/container support depends on the Chromium build shipped with Obsidian:
 * mp4/m4a/mp3/wav/ogg/webm/aac decode cleanly; some containers (raw mkv,
 * HEVC-only) raise `EncodingError`. We catch that and throw
 * `UnsupportedMediaError` so the caller can degrade honestly.
 */

import {
	UnsupportedMediaError,
	type MediaAudioExtractorPort,
} from '@/core/ports/MediaUnderstandingPort';
import { AdapterTransientError } from '@/app/platform/media/OpenAINativeImageAdapter';
import { encodeMono16kWav } from '@/app/platform/media/wavPcmEncoder';

// Chromium's OfflineAudioContext accepts a sampleRate in [8000, 96000]. 16k is
// the sweet spot for Whisper — cuts request bytes ~6× vs 44.1k and does not
// hurt transcription accuracy in listening tests.
const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNELS = 1;

export class WebAudioVideoAudioExtractor implements MediaAudioExtractorPort {
	// Injection point so unit tests can substitute `OfflineAudioContext`.
	constructor(
		private readonly getOfflineAudioContextCtor: () =>
			| (new (options: { numberOfChannels: number; length: number; sampleRate: number }) => {
					decodeAudioData(bytes: ArrayBuffer): Promise<{
						sampleRate: number;
						numberOfChannels: number;
						length: number;
						getChannelData(channel: number): Float32Array;
					}>;
			  })
			| null = () => defaultOfflineAudioContextCtor(),
	) {}

	isAvailable(): boolean {
		return this.getOfflineAudioContextCtor() !== null;
	}

	async extractAudioAsWav(input: { bytes: Uint8Array; mimeType: string }): Promise<{
		wavBytes: Uint8Array;
		sampleRate: number;
		channels: number;
	}> {
		const Ctor = this.getOfflineAudioContextCtor();
		if (!Ctor) {
			throw new AdapterTransientError(
				'WebAudioVideoAudioExtractor: OfflineAudioContext unavailable in this runtime',
			);
		}
		// Chromium requires at least one sample in the constructor; the actual
		// buffer length is set by decodeAudioData. Use a 1-sample throwaway.
		const ctx = new Ctor({ numberOfChannels: 1, length: 1, sampleRate: TARGET_SAMPLE_RATE });
		let decoded;
		try {
			// Copy into a fresh ArrayBuffer so we don't feed a shared Uint8Array
			// view (Chromium can and will transfer/detach the underlying buffer).
			const copy = new Uint8Array(input.bytes);
			decoded = await ctx.decodeAudioData(copy.buffer.slice(
				copy.byteOffset,
				copy.byteOffset + copy.byteLength,
			) as ArrayBuffer);
		} catch (err) {
			// Chromium raises `EncodingError` for containers/codecs it cannot
			// decode. Surface as UnsupportedMediaError so the composer gate
			// degrades honestly without offering a fake transcript.
			const name = (err as Error).name ?? '';
			const msg = (err as Error).message ?? String(err);
			if (name === 'EncodingError' || /decode/i.test(msg)) {
				throw new UnsupportedMediaError(
					`WebAudioVideoAudioExtractor: cannot decode ${input.mimeType || 'unknown'} container (${msg})`,
				);
			}
			throw new AdapterTransientError(
				`WebAudioVideoAudioExtractor: decode failed (${msg})`,
			);
		}

		// Downmix to mono.
		const monoAtSource = downmixToMono(decoded);
		// Resample to 16 kHz.
		const resampled = decoded.sampleRate === TARGET_SAMPLE_RATE
			? monoAtSource
			: linearResample(monoAtSource, decoded.sampleRate, TARGET_SAMPLE_RATE);
		const wav = encodeMono16kWav(resampled, TARGET_SAMPLE_RATE);
		return {
			wavBytes: wav.bytes,
			sampleRate: TARGET_SAMPLE_RATE,
			channels: TARGET_CHANNELS,
		};
	}
}

function downmixToMono(buffer: {
	numberOfChannels: number;
	length: number;
	getChannelData(channel: number): Float32Array;
}): Float32Array {
	if (buffer.numberOfChannels === 1) {
		// Return a copy so downstream can mutate without corrupting decoder buffer.
		return new Float32Array(buffer.getChannelData(0));
	}
	const out = new Float32Array(buffer.length);
	for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
		const src = buffer.getChannelData(ch);
		for (let i = 0; i < buffer.length; i += 1) {
			out[i] += src[i];
		}
	}
	const inv = 1 / buffer.numberOfChannels;
	for (let i = 0; i < out.length; i += 1) out[i] *= inv;
	return out;
}

function linearResample(
	pcm: Float32Array,
	sourceRate: number,
	targetRate: number,
): Float32Array {
	if (sourceRate === targetRate) return pcm;
	const ratio = sourceRate / targetRate;
	const targetLength = Math.floor(pcm.length / ratio);
	const out = new Float32Array(targetLength);
	for (let i = 0; i < targetLength; i += 1) {
		const srcIdx = i * ratio;
		const i0 = Math.floor(srcIdx);
		const i1 = Math.min(i0 + 1, pcm.length - 1);
		const frac = srcIdx - i0;
		out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
	}
	return out;
}

function defaultOfflineAudioContextCtor(): ReturnType<
	WebAudioVideoAudioExtractor['getOfflineAudioContextCtor']
> {
	const g: any = globalThis as any;
	const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
	if (typeof Ctor !== 'function') return null;
	return Ctor;
}
