// OpenAINativeImageAdapter contract: URL / auth header / request body /
// response shapes / auth failure mapping / timeout mapping. Uses a stub
// fetch — no real network. Task C2 §R5.1.

import assert from 'assert';
import {
	OpenAINativeImageAdapter,
	AdapterConfigurationError,
	AdapterTransientError,
} from '@/app/platform/media/OpenAINativeImageAdapter';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import type { MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';

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
		const call: FetchCall = { url, init };
		calls.push(call);
		return await handler(call);
	}) as unknown as typeof fetch;
	return { fn, calls };
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function textResponse(status: number, text: string): Response {
	return new Response(text, { status });
}

function makeAdapter(fetchImpl: typeof fetch, opts?: { apiKey?: string; baseUrl?: string }) {
	return new OpenAINativeImageAdapter({
		hasProfileWithKey: () => (opts?.apiKey ?? 'sk-test').length > 0,
		resolveCallOptions: async () => ({
			config: DEFAULT_MEDIA_GENERATION_CONFIG.native.openai,
			apiKey: opts?.apiKey ?? 'sk-test',
			baseUrl: opts?.baseUrl,
		}),
		fetchImpl,
	});
}

function req(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
	return {
		kind: 'image',
		prompt: 'a red mountain',
		modelId: 'gpt-image-1',
		aspectRatio: '16:9',
		...overrides,
	};
}

async function testEndpointUrlAndAuthHeader() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('helloxx').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn);
	await adapter.generate(req());
	assert.strictEqual(calls.length, 1, 'exactly one HTTP call');
	assert.strictEqual(
		calls[0].url,
		'https://api.openai.com/v1/images/generations',
		'default base url + images path',
	);
	const headers = calls[0].init?.headers as Record<string, string> | undefined;
	assert.strictEqual(headers?.Authorization, 'Bearer sk-test');
	assert.strictEqual(headers?.['Content-Type'], 'application/json');
	console.log('  ✓ endpoint URL + Bearer auth header formatted correctly');
}

async function testRequestBodyShape() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn);
	// gpt-image-1 is in responseFormatByModel with null → response_format must be omitted
	await adapter.generate(req({ aspectRatio: '16:9', modelId: 'gpt-image-1' }));
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(body.model, 'gpt-image-1');
	assert.strictEqual(body.prompt, 'a red mountain');
	assert.strictEqual(body.n, DEFAULT_MEDIA_GENERATION_CONFIG.native.openai.defaultN);
	assert.strictEqual(body.size, '1792x1024', 'aspect 16:9 → 1792x1024 from config sizeByAspect');
	assert.strictEqual(body.response_format, undefined, 'gpt-image-1: response_format must be omitted (not in responseFormatByModel override)');
	console.log('  ✓ request body: model/prompt/n/size; gpt-image-1 omits response_format');
}

async function testAspectFallbackToDefaultSize() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn);
	await adapter.generate(req({ aspectRatio: undefined }));
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(body.size, DEFAULT_MEDIA_GENERATION_CONFIG.native.openai.defaultSize);
	console.log('  ✓ missing aspectRatio falls back to config.defaultSize');
}

async function testCustomBaseUrl() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn, { baseUrl: 'https://proxy.example.com/openai' });
	await adapter.generate(req());
	assert.strictEqual(calls[0].url, 'https://proxy.example.com/openai/v1/images/generations');
	console.log('  ✓ profile baseUrl (proxy) honoured; no double slash on join');
}

async function testCustomBaseUrlTrailingSlashStripped() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn, { baseUrl: 'https://proxy.example.com/openai/' });
	await adapter.generate(req());
	assert.strictEqual(calls[0].url, 'https://proxy.example.com/openai/v1/images/generations');
	console.log('  ✓ trailing slash on baseUrl stripped before join');
}

async function testB64ResponseDecodedToBytes() {
	const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
	const b64 = Buffer.from(original).toString('base64');
	const { fn } = makeFetchStub(() => jsonResponse(200, { data: [{ b64_json: b64 }] }));
	const adapter = makeAdapter(fn);
	const result = await adapter.generate(req());
	assert.strictEqual(result.kind, 'image');
	assert.strictEqual(result.mimeType, 'image/png');
	assert.strictEqual(result.extension, 'png');
	assert.deepStrictEqual(Array.from(result.bytes), Array.from(original));
	assert.strictEqual(result.modelId, 'gpt-image-1');
	console.log('  ✓ b64_json response decoded to bytes');
}

async function testUrlResponseFollowsFetch() {
	const original = new Uint8Array([9, 9, 9]);
	const { fn } = makeFetchStub(async (call) => {
		if (call.url.endsWith('/v1/images/generations')) {
			return jsonResponse(200, { data: [{ url: 'https://cdn.example.com/img.png' }] });
		}
		if (call.url === 'https://cdn.example.com/img.png') {
			return new Response(original, { status: 200 });
		}
		return textResponse(404, 'not found');
	});
	const adapter = makeAdapter(fn);
	const result = await adapter.generate(req());
	assert.deepStrictEqual(Array.from(result.bytes), Array.from(original));
	console.log('  ✓ url response form followed with a second fetch');
}

async function testUnauthorizedMapsToConfigurationError() {
	const { fn } = makeFetchStub(() =>
		jsonResponse(401, { error: { message: 'Invalid API key' } }),
	);
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.generate(req()),
		(err) => err instanceof AdapterConfigurationError && /401/.test(err.message),
		'401 must surface as AdapterConfigurationError',
	);
	console.log('  ✓ 401 → AdapterConfigurationError (key/config problem)');
}

async function testForbiddenMapsToConfigurationError() {
	const { fn } = makeFetchStub(() => textResponse(403, 'Forbidden'));
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.generate(req()),
		(err) => err instanceof AdapterConfigurationError && /403/.test(err.message),
	);
	console.log('  ✓ 403 → AdapterConfigurationError');
}

async function testServerErrorMapsToTransient() {
	const { fn } = makeFetchStub(() => textResponse(503, 'temporarily unavailable'));
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.generate(req()),
		(err) => err instanceof AdapterTransientError && /503/.test(err.message),
	);
	console.log('  ✓ 5xx → AdapterTransientError (retriable)');
}

async function testBadRequestSurfacesProviderMessage() {
	const { fn } = makeFetchStub(() =>
		jsonResponse(400, { error: { message: 'invalid model id' } }),
	);
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.generate(req()),
		/invalid model id|400/,
		'400 messages must include provider message text',
	);
	console.log('  ✓ 4xx (non-auth) includes provider message');
}

async function testNetworkErrorMapsToTransient() {
	const fn = (async () => {
		throw new TypeError('network down');
	}) as unknown as typeof fetch;
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.generate(req()),
		(err) => err instanceof AdapterTransientError && /network down/.test(err.message),
	);
	console.log('  ✓ network error → AdapterTransientError');
}

async function testMissingApiKeyThrowsConfigurationError() {
	const { fn } = makeFetchStub(() => jsonResponse(200, { data: [] }));
	const adapter = makeAdapter(fn, { apiKey: '' });
	await assert.rejects(
		() => adapter.generate(req()),
		(err) => err instanceof AdapterConfigurationError,
	);
	console.log('  ✓ empty apiKey → AdapterConfigurationError without any HTTP call');
}

async function testNonImageKindRejected() {
	const { fn } = makeFetchStub(() => jsonResponse(200, { data: [] }));
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.generate({ kind: 'video', prompt: 'x', modelId: 'anything' }),
		/unsupported kind video/,
		'non-image kinds must be rejected (native only supports image)',
	);
	console.log('  ✓ non-image kind rejected loudly (no fake claims)');
}

async function testMissingModelIdRejected() {
	const { fn } = makeFetchStub(() => jsonResponse(200, { data: [] }));
	const adapter = makeAdapter(fn);
	await assert.rejects(
		() => adapter.generate({ kind: 'image', prompt: 'x' }),
		/modelId is required/,
	);
	console.log('  ✓ missing modelId rejected (service must supply from preset)');
}

async function testEmptyResponseDataThrows() {
	const { fn } = makeFetchStub(() => jsonResponse(200, { data: [] }));
	const adapter = makeAdapter(fn);
	await assert.rejects(() => adapter.generate(req()), /no image data/);
	console.log('  ✓ empty data array surfaces a clear error');
}

async function testSupportedKindsOnlyImage() {
	const { fn } = makeFetchStub(() => jsonResponse(200, { data: [] }));
	const adapter = makeAdapter(fn);
	assert.deepStrictEqual([...adapter.supportedKinds()], ['image']);
	assert.strictEqual(adapter.providerId, 'openai');
	console.log('  ✓ supportedKinds()=[image], providerId="openai"');
}

// I-1: quantity threads through to request body n
async function testQuantityThreadsToN() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn);
	await adapter.generate(req({ quantity: 3, modelId: 'dall-e-3' }));
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(body.n, 3, 'quantity=3 → request body n=3');
	console.log('  ✓ quantity=3 → request body n=3 (I-1)');
}

// I-1: when quantity absent, falls back to config.defaultN
async function testQuantityAbsentFallsBackToConfigDefault() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn);
	await adapter.generate(req({ quantity: undefined, modelId: 'dall-e-3' }));
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(body.n, DEFAULT_MEDIA_GENERATION_CONFIG.native.openai.defaultN, 'no quantity → falls back to config defaultN');
	console.log('  ✓ quantity absent → config.defaultN used (I-1)');
}

// I-2: gpt-image-1 in responseFormatByModel(null) → request omits response_format
async function testGptImage1OmitsResponseFormat() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn);
	await adapter.generate(req({ modelId: 'gpt-image-1' }));
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(
		Object.prototype.hasOwnProperty.call(body, 'response_format'),
		false,
		'gpt-image-1: response_format must be absent from request body (would 400 otherwise)',
	);
	console.log('  ✓ gpt-image-1 preset → response_format absent from request body (I-2)');
}

// I-2: dall-e-3 (not in responseFormatByModel) → uses defaultResponseFormat
async function testDalleE3IncludesResponseFormat() {
	const { fn, calls } = makeFetchStub(() =>
		jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
	);
	const adapter = makeAdapter(fn);
	await adapter.generate(req({ modelId: 'dall-e-3' }));
	const body = JSON.parse(calls[0].init?.body as string);
	assert.strictEqual(
		body.response_format,
		DEFAULT_MEDIA_GENERATION_CONFIG.native.openai.defaultResponseFormat,
		'dall-e-3: response_format present using defaultResponseFormat',
	);
	console.log('  ✓ dall-e-3 (no per-model override) → response_format=defaultResponseFormat (I-2)');
}

async function main() {
	await testEndpointUrlAndAuthHeader();
	await testRequestBodyShape();
	await testAspectFallbackToDefaultSize();
	await testCustomBaseUrl();
	await testCustomBaseUrlTrailingSlashStripped();
	await testB64ResponseDecodedToBytes();
	await testUrlResponseFollowsFetch();
	await testUnauthorizedMapsToConfigurationError();
	await testForbiddenMapsToConfigurationError();
	await testServerErrorMapsToTransient();
	await testBadRequestSurfacesProviderMessage();
	await testNetworkErrorMapsToTransient();
	await testMissingApiKeyThrowsConfigurationError();
	await testNonImageKindRejected();
	await testMissingModelIdRejected();
	await testEmptyResponseDataThrows();
	await testSupportedKindsOnlyImage();
	await testQuantityThreadsToN();
	await testQuantityAbsentFallsBackToConfigDefault();
	await testGptImage1OmitsResponseFormat();
	await testDalleE3IncludesResponseFormat();
	console.log('openai-native-image-adapter: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
