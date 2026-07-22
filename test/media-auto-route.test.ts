// Auto route decision: default route wins when available, otherwise falls
// through; both unavailable → needs-configuration with per-route problem
// list. Execution asserts adapter matches preflight-selected route (no
// silent billing-source switch). Task C2 §R3 + §R5.3.

import assert from 'assert';
import BetterSqlite3 from 'better-sqlite3';
import {
	Kysely,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	type CompiledQuery,
} from 'kysely';
import { migrateSqliteSchema, type Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { ChatMediaJobRepo } from '@/core/storage/sqlite/repositories/ChatMediaJobRepo';
import { MediaJobService } from '@/service/media/MediaJobService';
import { MediaGenerationService, makeChatArtifactReceiptSink } from '@/service/media/MediaGenerationService';
import {
	DEFAULT_MEDIA_GENERATION_CONFIG,
	type MediaGenerationConfig,
} from '@/service/media/mediaGenerationConfig';
import { preflightMediaRequest, type NativeMediaAvailabilityProbe } from '@/service/media/preflight';
import type { MediaAttachmentWriter } from '@/core/ports/MediaAttachmentWriter';
import type { MediaGenerationPort, MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';

type BetterSqlite3Database = ReturnType<typeof BetterSqlite3>;

function makeKysely(db: BetterSqlite3Database): Kysely<DbSchema> {
	const driver = {
		async init() {},
		async acquireConnection() {
			return {
				async executeQuery(q: CompiledQuery) {
					const stmt = db.prepare(q.sql);
					if (q.parameters && q.parameters.length > 0) {
						if (stmt.reader) return { rows: stmt.all(...(q.parameters as any[])) };
						const r = stmt.run(...(q.parameters as any[]));
						return {
							rows: [],
							numAffectedRows: BigInt(r.changes),
							insertId: r.lastInsertRowid ? BigInt(r.lastInsertRowid) : undefined,
						};
					}
					if (stmt.reader) return { rows: stmt.all() };
					const r = stmt.run();
					return {
						rows: [],
						numAffectedRows: BigInt(r.changes),
						insertId: r.lastInsertRowid ? BigInt(r.lastInsertRowid) : undefined,
					};
				},
				async *streamQuery(q: CompiledQuery): AsyncIterableIterator<any> {
					const connection = await driver.acquireConnection();
					const result: any = await connection.executeQuery(q);
					yield result;
				},
			};
		},
		async beginTransaction() { db.exec('BEGIN'); },
		async commitTransaction() { db.exec('COMMIT'); },
		async rollbackTransaction() { db.exec('ROLLBACK'); },
		async releaseConnection() {},
		async destroy() {},
	};
	return new Kysely<DbSchema>({
		dialect: {
			createDriver: () => driver as any,
			createQueryCompiler: () => new SqliteQueryCompiler(),
			createAdapter: () => new SqliteAdapter(),
			createIntrospector: (k) => new SqliteIntrospector(k),
		},
	});
}

function makeAdapter(providerId: string, opts: { configured?: boolean; supportedKinds?: readonly ('image' | 'video' | 'music' | 'tts')[] } = {}): MediaGenerationPort & { calls: number } {
	let calls = 0;
	return {
		providerId,
		get calls() { return calls; },
		set calls(v) { calls = v; },
		isConfigured: () => opts.configured ?? true,
		supportedKinds: () => opts.supportedKinds ?? ['image'],
		async generate(_req) {
			calls += 1;
			return {
				kind: 'image',
				bytes: new Uint8Array([1, 2, 3]),
				extension: 'png',
				mimeType: 'image/png',
				modelId: `${providerId}-model`,
				latencyMs: 10,
			};
		},
	} as any;
}

function makeWriter(): MediaAttachmentWriter & { written: number } {
	let written = 0;
	return {
		get written() { return written; },
		set written(v) { written = v; },
		async writeAttachment(input) {
			written += 1;
			return { path: `${input.attachmentFolder}/${input.basename}.${input.extension}` };
		},
	} as any;
}

interface Ctx {
	svc: MediaGenerationService;
	receipts: ChatArtifactReceipt[];
	nativeAdapter: ReturnType<typeof makeAdapter>;
	falAdapter: ReturnType<typeof makeAdapter>;
}

function setup(opts: {
	config?: MediaGenerationConfig;
	nativeConfigured?: boolean;
	falConfigured?: boolean;
	nativeAdapterMissing?: boolean;
	falAdapterMissing?: boolean;
	nativeSupportedKinds?: readonly ('image' | 'video' | 'music' | 'tts')[];
	falSupportedKinds?: readonly ('image' | 'video' | 'music' | 'tts')[];
}): Ctx {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new ChatMediaJobRepo(db);
	const jobService = new MediaJobService(repo);
	const nativeAdapter = makeAdapter('openai', {
		configured: opts.nativeConfigured ?? true,
		supportedKinds: opts.nativeSupportedKinds ?? ['image'],
	});
	const falAdapter = makeAdapter('fal', {
		configured: opts.falConfigured ?? true,
		supportedKinds: opts.falSupportedKinds ?? ['tts', 'image', 'video', 'music'],
	});
	const nativeAvailability: NativeMediaAvailabilityProbe = ({ kind }) => {
		if (opts.nativeAdapterMissing) return { configured: false, supportedKinds: [], reason: 'no-adapter' };
		const supportedKinds = opts.nativeSupportedKinds ?? ['image'];
		const configured = opts.nativeConfigured ?? true;
		if (!configured) return { configured: false, supportedKinds, provider: 'openai', reason: 'missing-profile' };
		if (!supportedKinds.includes(kind)) return { configured: true, supportedKinds, provider: 'openai', reason: 'unsupported-kind' };
		return { configured: true, supportedKinds, provider: 'openai' };
	};
	const writer = makeWriter();
	const receipts: ChatArtifactReceipt[] = [];
	const sink = makeChatArtifactReceiptSink(async (r) => { receipts.push(r); });
	const adapters: any = {};
	if (!opts.falAdapterMissing) adapters.fal = falAdapter;
	if (!opts.nativeAdapterMissing) adapters.native = nativeAdapter;
	const svc = new MediaGenerationService({
		adapters,
		nativeAvailability,
		writer,
		jobService,
		receiptSink: sink,
		loadConfig: async () => opts.config ?? DEFAULT_MEDIA_GENERATION_CONFIG,
		attachmentFolder: 'ChatFolder/Attachments/media',
	});
	return { svc, receipts, nativeAdapter, falAdapter };
}

function req(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
	return {
		kind: 'image',
		prompt: 'a peaceful lake at dawn',
		route: 'auto',
		presetId: 'default',
		...(overrides as any),
	};
}

async function testAutoPrefersDefaultRouteNative() {
	const cfg: MediaGenerationConfig = { ...DEFAULT_MEDIA_GENERATION_CONFIG, defaultRoute: 'native' };
	// Preset for image/default is fal by default; preflight only picks
	// route based on availability, not preset.provider — so this test
	// exercises route selection independently.
	const nativePreset = {
		...cfg.presets.image.default,
		provider: 'native' as const,
		model: 'gpt-image-1',
	};
	const cfgWithNativePreset: MediaGenerationConfig = {
		...cfg,
		presets: {
			...cfg.presets,
			image: { ...cfg.presets.image, default: nativePreset },
		},
	};
	const pre = preflightMediaRequest(
		req(),
		cfgWithNativePreset,
		{
			fal: { configured: true, supportedKinds: ['image'] },
			native: { configured: true, supportedKinds: ['image'], provider: 'openai' },
		},
	);
	assert.strictEqual(pre.state, 'ready');
	assert.strictEqual(pre.executionRoute, 'native');
	assert.strictEqual(pre.provider, 'openai');
	console.log('  ✓ defaultRoute=native picks native when both available');
}

async function testAutoPrefersDefaultRouteFal() {
	const cfg: MediaGenerationConfig = { ...DEFAULT_MEDIA_GENERATION_CONFIG, defaultRoute: 'fal' };
	const pre = preflightMediaRequest(
		req(),
		cfg,
		{
			fal: { configured: true, supportedKinds: ['image'] },
			native: { configured: true, supportedKinds: ['image'], provider: 'openai' },
		},
	);
	assert.strictEqual(pre.state, 'ready');
	assert.strictEqual(pre.executionRoute, 'fal');
	console.log('  ✓ defaultRoute=fal picks fal even when native available');
}

async function testAutoFallsBackWhenPreferredMissing() {
	const cfg: MediaGenerationConfig = { ...DEFAULT_MEDIA_GENERATION_CONFIG, defaultRoute: 'native' };
	const pre = preflightMediaRequest(
		req(),
		cfg,
		{
			fal: { configured: true, supportedKinds: ['image'] },
			native: { configured: false, supportedKinds: ['image'], provider: 'openai', reason: 'missing-profile' },
		},
	);
	assert.strictEqual(pre.state, 'ready');
	assert.strictEqual(pre.executionRoute, 'fal', 'falls back to fal when preferred native missing profile');
	console.log('  ✓ auto: preferred route missing → falls back to the other');
}

async function testAutoBothUnavailableListsPerRouteProblems() {
	const cfg = DEFAULT_MEDIA_GENERATION_CONFIG;
	const pre = preflightMediaRequest(
		req(),
		cfg,
		{
			fal: { configured: false, supportedKinds: ['image'] },
			native: { configured: false, supportedKinds: ['image'], provider: 'openai', reason: 'missing-profile' },
		},
	);
	assert.strictEqual(pre.state, 'needs-configuration');
	// Aggregate problem plus one per route (2 candidates).
	const codes = pre.problems.map((p) => p.code);
	assert.ok(codes.includes('no-available-route'), 'aggregate problem present');
	assert.ok(codes.includes('fal-missing-key'), 'fal problem listed');
	assert.ok(codes.includes('native-missing-profile'), 'native problem listed');
	// configureAction should point users to the right settings surface.
	const nativeProblem = pre.problems.find((p) => p.code === 'native-missing-profile');
	assert.strictEqual(nativeProblem?.configureAction, 'profiles');
	console.log('  ✓ both unavailable → aggregate + per-route problems with configureAction');
}

async function testAutoUnsupportedKindFallsThrough() {
	// Native supports image only; asking for video with auto + both configured
	// should route to fal (which supports video).
	const cfg = DEFAULT_MEDIA_GENERATION_CONFIG;
	const pre = preflightMediaRequest(
		req({ kind: 'video' }),
		cfg,
		{
			fal: { configured: true, supportedKinds: ['video'] },
			native: { configured: true, supportedKinds: ['image'], provider: 'openai' },
		},
	);
	// video is confirmation-required regardless of route.
	assert.strictEqual(pre.state, 'needs-confirmation');
	assert.strictEqual(pre.executionRoute, 'fal', 'unsupported native kind → fallback to fal');
	console.log('  ✓ auto skips route lacking kind support');
}

async function testExecutionAssertsPreflightRouteMatchesAdapter() {
	// Set up service where preflight picks native, but native adapter has
	// providerId 'fal' (mislabeled) — service must refuse to execute
	// rather than silently switch billing source.
	const ctx = setup({});
	const misNamed = makeAdapter('fal', { supportedKinds: ['image'] });
	(ctx.svc as any).deps.adapters.native = misNamed;
	await assert.rejects(
		() => ctx.svc.produce({
			runId: 'run-x',
			request: req({ route: 'native' }),
		}),
		/does not satisfy preflight route native/,
	);
	console.log('  ✓ adapter providerId mismatch → fail (no silent billing switch)');
}

async function testAutoRouteToNativeProducesNativeReceipt() {
	// Wire real registry: both adapters + probe → auto default with both
	// available and defaultRoute='native' should end up executing native.
	const cfg: MediaGenerationConfig = { ...DEFAULT_MEDIA_GENERATION_CONFIG, defaultRoute: 'native' };
	// Give native a preset it supports.
	const cfgWithNativePreset: MediaGenerationConfig = {
		...cfg,
		presets: {
			...cfg.presets,
			image: {
				...cfg.presets.image,
				default: {
					provider: 'native',
					model: 'gpt-image-1',
					aspectRatio: '1:1',
					quantity: 1,
					estimatedCostUsd: 0.04,
					billingUnit: 'image',
					costConfidence: 'estimated',
				},
			},
		},
	};
	const ctx = setup({ config: cfgWithNativePreset });
	await ctx.svc.produce({
		runId: 'run-native',
		request: req({ route: 'auto' }),
	});
	assert.strictEqual(ctx.nativeAdapter.calls, 1, 'native adapter invoked');
	assert.strictEqual(ctx.falAdapter.calls, 0, 'fal adapter untouched');
	assert.strictEqual(ctx.receipts.length, 1);
	const media = (ctx.receipts[0] as any).media;
	assert.strictEqual(media.executionRoute, 'native');
	assert.strictEqual(media.provider, 'openai', 'receipt records real provider from probe');
	assert.strictEqual(media.modelId, 'openai-model', 'receipt records real model from adapter');
	console.log('  ✓ auto → native happy path: receipt executionRoute=native + provider=openai');
}

async function main() {
	await testAutoPrefersDefaultRouteNative();
	await testAutoPrefersDefaultRouteFal();
	await testAutoFallsBackWhenPreferredMissing();
	await testAutoBothUnavailableListsPerRouteProblems();
	await testAutoUnsupportedKindFallsThrough();
	await testExecutionAssertsPreflightRouteMatchesAdapter();
	await testAutoRouteToNativeProducesNativeReceipt();
	console.log('media-auto-route: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
