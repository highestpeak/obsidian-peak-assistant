/**
 * WAV PCM encoder (zero-gap Track C1).
 *
 * Encodes an AudioBuffer-shaped PCM stream into a canonical 16-bit PCM WAV.
 * Uses pure TypeScript — no ffmpeg, no shell, no native bindings — so it runs
 * safely in the Obsidian renderer AND in Node-based unit tests.
 *
 * Downstream: OpenAI transcription (`whisper-1`, `gpt-4o-transcribe`) accepts
 * `audio/wav`; encoding to 16kHz mono keeps the multipart body small enough
 * that the request completes on residential upload links.
 *
 * Data source is Float32 samples in `[-1, 1]` (WebAudio's native format). We
 * hard-clip on encode so out-of-range excursions do not overflow the 16-bit
 * signed range — a real, deterministic loss the caller can see in tests.
 */

export interface WavPcmEncodeInput {
	/** One Float32Array per channel. All channels MUST have the same length. */
	channels: Float32Array[];
	sampleRate: number;
}

export interface WavPcmEncodeResult {
	bytes: Uint8Array;
	sampleRate: number;
	channels: number;
	sampleCount: number;
}

const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

export function encodeWavPcm(input: WavPcmEncodeInput): WavPcmEncodeResult {
	const { channels, sampleRate } = input;
	if (!Array.isArray(channels) || channels.length === 0) {
		throw new Error('encodeWavPcm: channels array is empty');
	}
	const sampleCount = channels[0].length;
	for (const c of channels) {
		if (c.length !== sampleCount) {
			throw new Error('encodeWavPcm: channel length mismatch');
		}
	}
	const numChannels = channels.length;
	const byteRate = sampleRate * numChannels * BYTES_PER_SAMPLE;
	const blockAlign = numChannels * BYTES_PER_SAMPLE;
	const dataSize = sampleCount * blockAlign;
	const totalSize = WAV_HEADER_BYTES + dataSize;

	const buffer = new ArrayBuffer(totalSize);
	const view = new DataView(buffer);

	// RIFF header
	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, totalSize - 8, true);
	writeAscii(view, 8, 'WAVE');

	// fmt sub-chunk
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // PCM sub-chunk size
	view.setUint16(20, 1, true); // audio format = PCM
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, BITS_PER_SAMPLE, true);

	// data sub-chunk
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	// Interleave + clip + convert
	let offset = WAV_HEADER_BYTES;
	for (let i = 0; i < sampleCount; i += 1) {
		for (let ch = 0; ch < numChannels; ch += 1) {
			const raw = channels[ch][i];
			// Hard clip to [-1, 1] — WebAudio can transiently exceed this after
			// resampling; without clamping the Math.round would wrap around.
			const clipped = raw > 1 ? 1 : raw < -1 ? -1 : raw;
			const s = Math.round(clipped * 0x7fff);
			view.setInt16(offset, s, true);
			offset += 2;
		}
	}

	return {
		bytes: new Uint8Array(buffer),
		sampleRate,
		channels: numChannels,
		sampleCount,
	};
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let i = 0; i < text.length; i += 1) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
}

/**
 * Convenience: encode a single-channel Float32 buffer at 16kHz (the shape the
 * WebAudio extractor produces after downmix+resample). Kept next to the
 * encoder so tests do not have to build up the ChannelPCM structure by hand.
 */
export function encodeMono16kWav(pcm: Float32Array, sampleRate = 16000): WavPcmEncodeResult {
	return encodeWavPcm({ channels: [pcm], sampleRate });
}
