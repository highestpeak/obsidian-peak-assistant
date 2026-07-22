// OpenAINativeVideoAdapter (Sora, zero-gap §5 B1) — submit / poll / download
// state machine + failure classification. Uses fetch stubs, no network.

import assert from 'assert';
import { OpenAINativeVideoAdapter } from '@/app/platform/media/OpenAINativeVideoAdapter';
import {
	AdapterConfigurationError,
	AdapterTransientError,
} from '@/app/platform/media/OpenAINativeImageAdapter';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import type { MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';
import type { ResolvedMediaReference } from '@/core/ports/MediaReferenceResolver';

interface FetchCall {
	url: string;
	init?: RequestInit;
}

function makeFetchStub(handler: (call: FetchCall) => Response | Promise<Response>): {
	fn: typeof fetch;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
		calls.push({ url, init });
		return await handler({ url, init });
	}) as unknown as typeof fetch;
	return { fn, calls };
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function textResponse(status: number, text: string): Response {
	return new Response(text, { status });
}

function bytesResponse(status: number, bytes: Uint8Array): Response {
	return new Response(bytes, { status });
}

function makeAdapter(fn: typeof fetch, apiKey = 'sk-test') {
	return new OpenAINativeVideoAdapter({
		hasProfileWithKey: () => apiKey.length > 0,
		resolveCallOptions: async () => ({
			config: DEFAULT_MEDIA_GENERATION_CONFIG.native.openai,
			apiKey,
			baseUrl: undefined,
		}),
		fetchImpl: fn,
	});
}

function videoReq(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
	return {
		kind: 'video',
		prompt: 'a red panda cooking',
		modelId: 'sora-2',
		aspectRatio: '9:16',
		durationSeconds: 8,
		...overrides,
	};
}

let passed = 0;

async function testSubmitJsonWhenNoReference() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { id: 'vid_abc', status: 'queued' }));
	const adapter = makeAdapter(fn);
	const res = await adapter.submit(videoReq());
	assert.strictEqual(calls[0].url, 'https://api.openai.com/v1/videos');
	const headers = calls[0].init?.headers as Record<string, string>;
	assert.strictEqual(headers['Authorization'], 'Bearer sk-test');
	assert.strictEqual(headers['Content-Type'], 'application/json');
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(body.model, 'sora-2');
	assert.strictEqual(body.prompt, 'a red panda cooking');
	assert.strictEqual(body.seconds, '8', 'seconds is a string enum');
	assert.strictEqual(body.size, '720x1280', '9:16 → 720x1280 per videoSizeByAspect');
	assert.strictEqual(res.providerRequestId, 'vid_abc');
	assert.strictEqual(res.providerResponseUrl, 'https://api.openai.com/v1/videos/vid_abc');
	console.log('  ✓ submit JSON: url + auth + payload + response cursor');
	passed += 1;
}

async function testSubmitMultipartWhenReferenceProvided() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { id: 'vid_ref', status: 'queued' }));
	const adapter = makeAdapter(fn);
	const reference: ResolvedMediaReference = {
		ref: 'in.png',
		mimeType: 'image/png',
		bytes: new Uint8Array([1, 2, 3]),
		dataUri: 'data:image/png;base64,AQID',
		filename: 'in.png',
	};
	await adapter.submit(videoReq({ references: [reference] }));
	const body = calls[0].init?.body;
	// FormData → not JSON. No Content-Type manual header.
	const headers = calls[0].init?.headers as Record<string, string>;
	assert.strictEqual(headers['Content-Type'], undefined, 'multipart never sets Content-Type manually');
	assert.ok(body instanceof FormData, 'body is FormData');
	// The `input_reference` part must be present.
	const iref = (body as FormData).get('input_reference');
	assert.ok(iref, 'input_reference part present');
	assert.strictEqual((body as FormData).get('model'), 'sora-2');
	console.log('  ✓ submit multipart when reference present (input_reference part)');
	passed += 1;
}

async function testSecondsRoundedToNearestAllowed() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { id: 'vid_x', status: 'queued' }));
	const adapter = makeAdapter(fn);
	await adapter.submit(videoReq({ durationSeconds: 5 }));
	// Allowed = 4|8|12; nearest to 5 is 4.
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(body.seconds, '4', 'nearest allowed enum for 5 is 4');
	console.log('  ✓ seconds rounds to nearest allowed enum (5 → "4")');
	passed += 1;
}

async function testPollStatesQueuedInProgressCompleted() {
	const { fn } = makeFetchStub(({ url }) => {
		if (url.endsWith('/vid_x')) return jsonResponse(200, { id: 'vid_x', status: 'queued' });
		return textResponse(500, 'unused');
	});
	const adapter = makeAdapter(fn);
	const queued = await adapter.poll('https://api.openai.com/v1/videos/vid_x');
	assert.strictEqual(queued.kind, 'pending');

	const { fn: fn2 } = makeFetchStub(() => jsonResponse(200, { id: 'v', status: 'in_progress' }));
	const p2 = await makeAdapter(fn2).poll('https://api.openai.com/v1/videos/v');
	assert.strictEqual(p2.kind, 'pending');

	const { fn: fn3 } = makeFetchStub(() => jsonResponse(200, { id: 'v', status: 'completed' }));
	const p3 = await makeAdapter(fn3).poll('https://api.openai.com/v1/videos/v');
	assert.strictEqual(p3.kind, 'ready');
	assert.ok(p3.kind === 'ready' && (p3.final as any).status === 'completed');
	console.log('  ✓ poll states: queued/in_progress → pending; completed → ready');
	passed += 1;
}

async function testPollFailedTerminal() {
	const { fn } = makeFetchStub(() => jsonResponse(200, {
		id: 'v', status: 'failed', error: { message: 'render exploded' },
	}));
	const status = await makeAdapter(fn).poll('https://api.openai.com/v1/videos/v');
	assert.strictEqual(status.kind, 'failed');
	assert.ok(status.kind === 'failed' && /render exploded/.test(status.reason));
	console.log('  ✓ poll failed with error message → terminal reason');
	passed += 1;
}

async function testDownloadFetchesContentPath() {
	const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // fake mp4 preamble
	const { fn, calls } = makeFetchStub(({ url }) => {
		if (url.endsWith('/vid_x/content')) return bytesResponse(200, bytes);
		return textResponse(500, 'unused');
	});
	const adapter = makeAdapter(fn);
	const result = await adapter.download(videoReq(), { id: 'vid_x', status: 'completed' } as any);
	assert.strictEqual(calls[0].url, 'https://api.openai.com/v1/videos/vid_x/content');
	assert.strictEqual(result.extension, 'mp4');
	assert.strictEqual(result.mimeType, 'video/mp4');
	assert.strictEqual(result.bytes.length, 4);
	console.log('  ✓ download hits /content path and returns mp4 bytes');
	passed += 1;
}

async function testUnauthorizedMapsToConfigurationError() {
	const { fn } = makeFetchStub(() => jsonResponse(401, { error: { message: 'no key' } }));
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.submit(videoReq()),
		(err) => err instanceof AdapterConfigurationError && /401/.test(err.message),
	);
	console.log('  ✓ 401 on submit → AdapterConfigurationError');
	passed += 1;
}

async function testServerErrorMapsToTransient() {
	const { fn } = makeFetchStub(() => textResponse(503, 'busy'));
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.submit(videoReq()),
		(err) => err instanceof AdapterTransientError && /503/.test(err.message),
	);
	console.log('  ✓ 5xx on submit → AdapterTransientError');
	passed += 1;
}

async function testCancelIsFalse() {
	const { fn } = makeFetchStub(() => textResponse(200, ''));
	const adapter = makeAdapter(fn);
	// The Videos API has no mid-render cancel; return false so the runner
	// stops locally.
	assert.strictEqual(await adapter.cancel!('rid', 'url'), false);
	console.log('  ✓ cancel() returns false (no mid-render cancel API)');
	passed += 1;
}

async function main() {
	await testSubmitJsonWhenNoReference();
	await testSubmitMultipartWhenReferenceProvided();
	await testSecondsRoundedToNearestAllowed();
	await testPollStatesQueuedInProgressCompleted();
	await testPollFailedTerminal();
	await testDownloadFetchesContentPath();
	await testUnauthorizedMapsToConfigurationError();
	await testServerErrorMapsToTransient();
	await testCancelIsFalse();
	console.log(`\nopenai-video-adapter: PASS (${passed}/9)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
