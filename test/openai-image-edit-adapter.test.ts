// OpenAINativeImageAdapter — edit path (zero-gap §4 A3 / §5 B).
// Confirms multipart wire shape (image[] parts, mask, model, prompt, size, n),
// per-model part-name override (dall-e-2 sends a single `image` part), and
// batch fan-out via `result.outputs`.

import assert from 'assert';
import { OpenAINativeImageAdapter } from '@/app/platform/media/OpenAINativeImageAdapter';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import type { MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';
import type { ResolvedMediaReference } from '@/core/ports/MediaReferenceResolver';

// A very small FormData reader: we cannot rely on the runtime's exact
// FormData iteration order, so we bucket entries by name and let each test
// assert what it needs.
async function readFormDataBuckets(body: BodyInit | null | undefined): Promise<{
	fields: Record<string, string[]>;
	files: Record<string, Array<{ name: string; type: string; size: number }>>;
}> {
	const fields: Record<string, string[]> = {};
	const files: Record<string, Array<{ name: string; type: string; size: number }>> = {};
	if (!(body instanceof FormData)) {
		return { fields, files };
	}
	body.forEach((value, key) => {
		if (typeof value === 'string') {
			(fields[key] ??= []).push(value);
		} else {
			// Blob | File — both expose size/type; File also exposes name.
			const asFile = value as unknown as { name?: string; type: string; size: number };
			(files[key] ??= []).push({ name: asFile.name ?? '', type: asFile.type, size: asFile.size });
		}
	});
	return { fields, files };
}

function makeFetchStub(handler: (call: { url: string; init?: RequestInit }) => Response | Promise<Response>): {
	fn: typeof fetch;
	calls: Array<{ url: string; init?: RequestInit }>;
} {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
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

function makeAdapter(fetchImpl: typeof fetch) {
	return new OpenAINativeImageAdapter({
		hasProfileWithKey: () => true,
		resolveCallOptions: async () => ({
			config: DEFAULT_MEDIA_GENERATION_CONFIG.native.openai,
			apiKey: 'sk-test',
			baseUrl: undefined,
		}),
		fetchImpl,
	});
}

function ref(refName: string, bytes: number[] = [1, 2, 3]): ResolvedMediaReference {
	return {
		ref: refName,
		mimeType: 'image/png',
		bytes: new Uint8Array(bytes),
		dataUri: 'data:image/png;base64,AQID',
		filename: refName,
	};
}

function editReq(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
	return {
		kind: 'image',
		prompt: 'add a bird',
		operation: 'edit',
		modelId: 'gpt-image-1',
		references: [ref('base.png')],
		...overrides,
	};
}

let passed = 0;

async function testEditUrlIsEditsPath() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }));
	const adapter = makeAdapter(fn);
	await adapter.generate(editReq());
	assert.strictEqual(calls[0].url, 'https://api.openai.com/v1/images/edits', 'edit routes to editsPath');
	console.log('  ✓ edit uses editsPath, not imagesPath');
	passed += 1;
}

async function testGptImage1SendsImageBracketPart() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }));
	const adapter = makeAdapter(fn);
	await adapter.generate(editReq());
	const buckets = await readFormDataBuckets(calls[0].init?.body);
	// Config default part name for gpt-image-1 is `image[]`.
	assert.ok(buckets.files['image[]']?.length === 1, 'exactly one image[] part');
	assert.strictEqual(buckets.files['image[]']![0].type, 'image/png');
	assert.strictEqual(buckets.fields.model?.[0], 'gpt-image-1');
	assert.strictEqual(buckets.fields.prompt?.[0], 'add a bird');
	assert.strictEqual(buckets.fields.n?.[0], '1');
	assert.ok(buckets.fields.size?.[0], 'size present');
	// gpt-image-1 is in responseFormatByModel(null) → response_format must be omitted.
	assert.strictEqual(buckets.fields.response_format, undefined, 'gpt-image-1 omits response_format');
	console.log('  ✓ gpt-image-1: image[] part + model/prompt/n/size present, no response_format');
	passed += 1;
}

async function testDallE2UsesSingleImagePart() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }));
	const adapter = makeAdapter(fn);
	await adapter.generate(editReq({ modelId: 'dall-e-2' }));
	const buckets = await readFormDataBuckets(calls[0].init?.body);
	assert.ok(buckets.files.image?.length === 1, 'dall-e-2 sends single `image` part');
	assert.strictEqual(buckets.files['image[]'], undefined, 'no image[] part for dall-e-2');
	console.log('  ✓ dall-e-2: editImagePartNameByModel routes to single `image` part');
	passed += 1;
}

async function testMaskPartAttached() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }));
	const adapter = makeAdapter(fn);
	await adapter.generate(editReq({ mask: ref('m.png', [9]) }));
	const buckets = await readFormDataBuckets(calls[0].init?.body);
	assert.ok(buckets.files.mask?.length === 1, 'mask part attached');
	assert.strictEqual(buckets.files.mask![0].type, 'image/png');
	console.log('  ✓ mask reference attached as `mask` part');
	passed += 1;
}

async function testBatchFanOutViaOutputs() {
	// Provider returns two images — adapter must expose both in result.outputs.
	const a = Buffer.from([1, 2, 3]).toString('base64');
	const b = Buffer.from([9, 9, 9]).toString('base64');
	const { fn } = makeFetchStub(() => jsonResponse(200, {
		data: [{ b64_json: a }, { b64_json: b }],
	}));
	const adapter = makeAdapter(fn);
	const result = await adapter.generate(editReq({ quantity: 2 }));
	assert.ok(result.outputs && result.outputs.length === 2, 'outputs has both images');
	assert.strictEqual(result.outputs![0].bytes.length, 3);
	assert.strictEqual(result.outputs![1].bytes.length, 3);
	// Primary output entry (result.bytes) is the first one for back-compat.
	assert.deepStrictEqual(Array.from(result.bytes), [1, 2, 3]);
	console.log('  ✓ batch data[] fans out to result.outputs (2 entries)');
	passed += 1;
}

async function testAuthHeader() {
	const { fn, calls } = makeFetchStub(() => jsonResponse(200, { data: [{ b64_json: Buffer.from('x').toString('base64') }] }));
	const adapter = makeAdapter(fn);
	await adapter.generate(editReq());
	const headers = calls[0].init?.headers as Record<string, string>;
	assert.strictEqual(headers.Authorization, 'Bearer sk-test');
	// CRITICAL: never set Content-Type manually on multipart — fetch derives
	// the boundary from the FormData body.
	assert.strictEqual(headers['Content-Type'], undefined, 'no manual Content-Type on multipart');
	console.log('  ✓ multipart auth: Bearer header, no manual Content-Type');
	passed += 1;
}

async function main() {
	await testEditUrlIsEditsPath();
	await testGptImage1SendsImageBracketPart();
	await testDallE2UsesSingleImagePart();
	await testMaskPartAttached();
	await testBatchFanOutViaOutputs();
	await testAuthHeader();
	console.log(`\nopenai-image-edit-adapter: PASS (${passed}/6)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
