// Zero-gap Track C1 (2026-07-21) — Media understanding pipeline.
//
// Tests:
//   T1. WAV encoder writes a canonical 16-bit PCM header (RIFF/fmt/data
//        offsets + sizes) for a synthesized sine wave.
//   T2. WAV encoder clips out-of-range samples to [-1, 1] deterministically.
//   T3. OpenAITranscriptionAdapter posts multipart form with the configured
//        `transcriptionModel` and `transcriptionsPath`, and returns
//        `{ transcript, provider, modelId }`.
//   T4. OpenAITranscriptionAdapter maps 401 → AdapterConfigurationError.
//   T5. MediaUnderstandingRuntime plan: native video capability → source
//        'native-video-input'.
//   T6. MediaUnderstandingRuntime plan: audio + configured transcription
//        → source 'transcript-from-audio', decision willProduceUnderstanding=true.
//   T7. MediaUnderstandingRuntime plan: video WITHOUT native support AND no
//        extractor → 'attachment-only' with a machine reason.
//   T8. MediaUnderstandingRuntime.understand: video without extractor →
//        outcome 'attachment-only' (no fake transcript).

import assert from 'assert';
import { encodeWavPcm, encodeMono16kWav } from '@/app/platform/media/wavPcmEncoder';
import { OpenAITranscriptionAdapter } from '@/app/platform/media/OpenAITranscriptionAdapter';
import { AdapterConfigurationError } from '@/app/platform/media/OpenAINativeImageAdapter';
import { MediaUnderstandingRuntime } from '@/service/media/MediaUnderstandingRuntime';

function readAscii(bytes: Uint8Array, offset: number, len: number): string {
	let s = '';
	for (let i = 0; i < len; i += 1) s += String.fromCharCode(bytes[offset + i]);
	return s;
}

function readU32LE(bytes: Uint8Array, offset: number): number {
	return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function readU16LE(bytes: Uint8Array, offset: number): number {
	return bytes[offset] | (bytes[offset + 1] << 8);
}

function readI16LE(bytes: Uint8Array, offset: number): number {
	const v = readU16LE(bytes, offset);
	return v >= 0x8000 ? v - 0x10000 : v;
}

function testWavHeaderShape() {
	const sampleRate = 16000;
	const pcm = new Float32Array(1600); // 100 ms of silence
	pcm[0] = 0.5; // one non-zero sample so the file isn't purely zeros
	const result = encodeMono16kWav(pcm, sampleRate);
	const b = result.bytes;
	assert.strictEqual(readAscii(b, 0, 4), 'RIFF', 'RIFF marker');
	assert.strictEqual(readAscii(b, 8, 4), 'WAVE', 'WAVE marker');
	assert.strictEqual(readAscii(b, 12, 4), 'fmt ', 'fmt marker');
	assert.strictEqual(readU32LE(b, 16), 16, 'PCM sub-chunk size = 16');
	assert.strictEqual(readU16LE(b, 20), 1, 'audio format = PCM');
	assert.strictEqual(readU16LE(b, 22), 1, 'channels = 1');
	assert.strictEqual(readU32LE(b, 24), sampleRate, 'sample rate matches');
	assert.strictEqual(readU16LE(b, 32), 2, 'block align = channels * bytesPerSample');
	assert.strictEqual(readU16LE(b, 34), 16, 'bits per sample = 16');
	assert.strictEqual(readAscii(b, 36, 4), 'data', 'data marker');
	assert.strictEqual(readU32LE(b, 40), pcm.length * 2, 'data size matches samples * 2');
	assert.strictEqual(b.length, 44 + pcm.length * 2, 'total length matches header + data');
	console.log('PASS: T1 WAV header canonical');
}

function testWavClipping() {
	const pcm = new Float32Array([2.0, -2.0, 0.5, -0.5]);
	const result = encodeWavPcm({ channels: [pcm], sampleRate: 8000 });
	const b = result.bytes;
	assert.strictEqual(readI16LE(b, 44), 32767, '2.0 clips to +32767');
	assert.strictEqual(readI16LE(b, 46), -32767, '-2.0 clips to -32767 (clip to -1 then round)');
	// 0.5 * 32767 = 16383.5 → round to 16384
	assert.strictEqual(readI16LE(b, 48), 16384, '0.5 encodes to 16384');
	assert.strictEqual(readI16LE(b, 50), -16383, '-0.5 encodes to -16383 (Math.round rounds half away from -Infinity)');
	console.log('PASS: T2 WAV clipping deterministic');
}

async function testTranscriptionAdapterHappyPath() {
	let captured: { url: string; init: RequestInit | undefined } | null = null;
	const fakeFetch: typeof fetch = async (url, init) => {
		captured = { url: String(url), init };
		return new Response(JSON.stringify({ text: 'hello world', language: 'en' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		}) as unknown as Response;
	};
	const adapter = new OpenAITranscriptionAdapter({
		hasProfileWithKey: () => true,
		resolveCallOptions: () => ({
			config: {
				defaultBaseUrl: 'https://api.openai.com',
				imagesPath: '/v1/images/generations',
				editsPath: '/v1/images/edits',
				editImagePartName: 'image[]',
				editImagePartNameByModel: {},
				editSupportsMask: true,
				editMaxImages: 4,
				videosPath: '/v1/videos',
				videoAllowedSeconds: ['5', '10'],
				videoSizeByAspect: {},
				videoDefaultSize: '1024x1024',
				videoModels: [],
				defaultPresetId: 'default',
				sizeByAspect: {},
				defaultSize: '1024x1024',
				defaultN: 1,
				defaultResponseFormat: 'b64_json',
				responseFormatByModel: {},
				maxQuantityByModel: {},
				defaultMaxQuantity: 4,
				requestTimeoutMs: 5000,
				transcriptionsPath: '/v1/audio/transcriptions',
				transcriptionModel: 'whisper-1',
			},
			apiKey: 'sk-test',
			baseUrl: 'https://custom.openai/v1',
		}),
		fetchImpl: fakeFetch,
	});
	const result = await adapter.transcribeAudio({
		bytes: new Uint8Array([0, 1, 2, 3]),
		mimeType: 'audio/wav',
		filenameHint: 'clip.wav',
	});
	assert.strictEqual(result.transcript, 'hello world');
	assert.strictEqual(result.provider, 'openai');
	assert.strictEqual(result.modelId, 'whisper-1');
	assert.strictEqual(result.language, 'en');
	assert.strictEqual(
		(captured as any).url,
		'https://custom.openai/v1/v1/audio/transcriptions',
		'URL uses profile baseUrl + configured path',
	);
	const auth = ((captured as any).init.headers as any).Authorization;
	assert.strictEqual(auth, 'Bearer sk-test', 'Authorization Bearer header set');
	const body = (captured as any).init.body;
	assert.ok(body instanceof FormData, 'body is FormData multipart');
	assert.strictEqual(body.get('model'), 'whisper-1', 'model field = configured transcriptionModel');
	console.log('PASS: T3 transcription happy-path multipart contract');
}

async function testTranscriptionAdapterAuthError() {
	const fakeFetch: typeof fetch = async () =>
		new Response('nope', { status: 401 }) as unknown as Response;
	const adapter = new OpenAITranscriptionAdapter({
		hasProfileWithKey: () => true,
		resolveCallOptions: () => ({
			config: {
				defaultBaseUrl: 'https://api.openai.com',
				imagesPath: '/v1/images/generations',
				editsPath: '/v1/images/edits',
				editImagePartName: 'image[]',
				editImagePartNameByModel: {},
				editSupportsMask: true,
				editMaxImages: 4,
				videosPath: '/v1/videos',
				videoAllowedSeconds: [],
				videoSizeByAspect: {},
				videoDefaultSize: '1024x1024',
				videoModels: [],
				defaultPresetId: 'default',
				sizeByAspect: {},
				defaultSize: '1024x1024',
				defaultN: 1,
				defaultResponseFormat: 'b64_json',
				responseFormatByModel: {},
				maxQuantityByModel: {},
				defaultMaxQuantity: 4,
				requestTimeoutMs: 5000,
				transcriptionsPath: '/v1/audio/transcriptions',
				transcriptionModel: 'whisper-1',
			},
			apiKey: 'sk-bad',
			baseUrl: undefined,
		}),
		fetchImpl: fakeFetch,
	});
	let thrown: unknown = null;
	try {
		await adapter.transcribeAudio({ bytes: new Uint8Array(4), mimeType: 'audio/wav' });
	} catch (e) {
		thrown = e;
	}
	assert.ok(thrown instanceof AdapterConfigurationError, '401 → AdapterConfigurationError');
	console.log('PASS: T4 transcription 401 mapped to AdapterConfigurationError');
}

function testPlanNativeVideoInput() {
	const runtime = new MediaUnderstandingRuntime({
		transcription: null,
		audioExtractor: null,
	});
	const plan = runtime.planUnderstanding({ mediaKind: 'video', modelAcceptsVideoNatively: true });
	assert.strictEqual(plan.source, 'native-video-input');
	assert.strictEqual(plan.willProduceUnderstanding, true);
	console.log('PASS: T5 plan → native-video-input when model accepts video');
}

function testPlanAudioWithTranscription() {
	const runtime = new MediaUnderstandingRuntime({
		transcription: { isConfigured: () => true, transcribeAudio: async () => ({ transcript: '', provider: 'x', modelId: 'y' }) },
		audioExtractor: null,
	});
	const plan = runtime.planUnderstanding({ mediaKind: 'audio' });
	assert.strictEqual(plan.source, 'transcript-from-audio');
	assert.strictEqual(plan.willProduceUnderstanding, true);
	console.log('PASS: T6 plan → transcript-from-audio when transcription configured');
}

function testPlanVideoAttachmentOnly() {
	const runtime = new MediaUnderstandingRuntime({
		transcription: null,
		audioExtractor: null,
	});
	const plan = runtime.planUnderstanding({ mediaKind: 'video' });
	assert.strictEqual(plan.source, 'attachment-only');
	assert.strictEqual(plan.willProduceUnderstanding, false);
	assert.strictEqual(plan.reason, 'no-transcription-adapter');
	console.log('PASS: T7 plan → attachment-only when nothing configured');
}

async function testUnderstandVideoDegrades() {
	const runtime = new MediaUnderstandingRuntime({
		transcription: null,
		audioExtractor: null,
	});
	const outcome = await runtime.understand({
		bytes: new Uint8Array(4),
		mediaKind: 'video',
		mimeType: 'video/mp4',
	});
	assert.strictEqual(outcome.source, 'attachment-only');
	assert.strictEqual(outcome.transcript, undefined);
	assert.ok(outcome.error, 'error field set with machine reason');
	console.log('PASS: T8 understand → attachment-only (no fake transcript)');
}

(async () => {
	testWavHeaderShape();
	testWavClipping();
	await testTranscriptionAdapterHappyPath();
	await testTranscriptionAdapterAuthError();
	testPlanNativeVideoInput();
	testPlanAudioWithTranscription();
	testPlanVideoAttachmentOnly();
	await testUnderstandVideoDegrades();
	console.log('All media-understanding tests passed');
})().catch((err) => {
	console.error('media-understanding tests failed:', err);
	process.exit(1);
});
