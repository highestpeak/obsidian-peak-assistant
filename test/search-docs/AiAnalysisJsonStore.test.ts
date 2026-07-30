import assert from 'assert';
import {
	buildAnalysisJsonRecord,
	saveAnalysisJson,
	listAnalysisJson,
	loadAnalysisJson,
	resolveAnalysisSnapshotFromVault,
	AI_ANALYSIS_JSON_FORMAT_VERSION,
	type AiAnalysisStoreVaultAdapter,
} from '@/core/storage/vault/search-docs/AiAnalysisJsonStore';
import { buildMarkdown, fromCompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import { getAIAnalysisJsonStoreFolder } from '@/core/config/folderPaths';
import type { CompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';

// Minimal in-memory vault adapter — no Obsidian dependency.
class MemAdapter implements AiAnalysisStoreVaultAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();
	async ensureFolder(folderPath: string): Promise<void> { if (folderPath) this.folders.add(folderPath); }
	exists(path: string): boolean { return this.files.has(path); }
	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) throw new Error(`file already exists: ${path}`);
		this.files.set(path, content);
	}
	async read(path: string): Promise<string | null> { return this.files.get(path) ?? null; }
	listJsonPaths(folderPath: string): string[] {
		const prefix = folderPath ? `${folderPath}/` : '';
		return [...this.files.keys()].filter((k) =>
			k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && k.endsWith('.json'),
		);
	}
}

function makeSnapshot(overrides: Partial<CompletedAnalysisSnapshot> = {}): CompletedAnalysisSnapshot {
	return {
		version: 1,
		analysisStartedAtMs: 1700000000000,
		duration: 1234,
		usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
		title: 'My Title',
		summaries: ['Hello summary'],
		summaryVersion: 1,
		topics: [],
		sources: [],
		graph: null,
		dashboardBlocks: [],
		...overrides,
	};
}

const FOLDER = getAIAnalysisJsonStoreFolder('ChatFolder');

async function testRoundTripSaveListLoad(): Promise<void> {
	const adapter = new MemAdapter();
	const snapshot = makeSnapshot({
		v2ReportSections: [{
			id: 'section-stable-id',
			title: 'Evidence-backed section',
			content: 'Section body.',
			missionRole: 'synthesis',
			evidencePaths: ['notes/source.md'],
		}],
		blocksFollowupsByBlockId: {
			'section-stable-id': [{
				question: 'What supports this?',
				answer: 'The cited source.',
			}],
		},
	});
	const record = buildAnalysisJsonRecord(snapshot, { query: 'what is x', webEnabled: true, savedAt: 111 });

	assert.strictEqual(record.formatVersion, AI_ANALYSIS_JSON_FORMAT_VERSION, 'format version stamped');
	assert.strictEqual(record.title, 'My Title', 'title falls back to snapshot.title');

	const { path } = await saveAnalysisJson(adapter, {
		folderPath: FOLDER,
		analysisStartedAtMs: snapshot.analysisStartedAtMs!,
		titleOrQuery: snapshot.title!,
		record,
	});
	assert.strictEqual(path, `${FOLDER}/1700000000000 - My Title.json`, 'filename mirrors <startedAt> - <title>.json');
	assert.ok(adapter.folders.has(FOLDER), 'store folder ensured');

	const entries = await listAnalysisJson(adapter, FOLDER);
	assert.strictEqual(entries.length, 1, 'one entry listed');
	assert.strictEqual(entries[0].path, path, 'entry path');
	assert.strictEqual(entries[0].savedAt, 111, 'entry savedAt');
	assert.strictEqual(entries[0].query, 'what is x', 'entry query');
	assert.strictEqual(entries[0].webEnabled, true, 'entry webEnabled');

	const loaded = await loadAnalysisJson(adapter, path);
	assert.ok(loaded, 'record loaded');
	assert.strictEqual(loaded!.snapshot.summaries[0], 'Hello summary', 'snapshot round-trips');
	assert.strictEqual(loaded!.query, 'what is x', 'query round-trips');
	assert.strictEqual(
		loaded!.snapshot.v2ReportSections?.[0]?.id,
		'section-stable-id',
		'V2 section id survives canonical JSON round-trip',
	);
	assert.strictEqual(
		loaded!.snapshot.blocksFollowupsByBlockId?.['section-stable-id']?.[0]?.answer,
		'The cited source.',
		'section follow-up remains attached to the stable section id',
	);

	console.log('[AiAnalysisJsonStore] round-trip save/list/load: PASS');
}

async function testListSortedDescBySavedAt(): Promise<void> {
	const adapter = new MemAdapter();
	await saveAnalysisJson(adapter, {
		folderPath: FOLDER,
		analysisStartedAtMs: 1000,
		titleOrQuery: 'Older',
		record: buildAnalysisJsonRecord(makeSnapshot({ title: 'Older' }), { query: 'a', webEnabled: false, savedAt: 100 }),
	});
	await saveAnalysisJson(adapter, {
		folderPath: FOLDER,
		analysisStartedAtMs: 2000,
		titleOrQuery: 'Newer',
		record: buildAnalysisJsonRecord(makeSnapshot({ title: 'Newer' }), { query: 'b', webEnabled: false, savedAt: 200 }),
	});

	const entries = await listAnalysisJson(adapter, FOLDER);
	assert.strictEqual(entries.length, 2, 'two entries');
	assert.strictEqual(entries[0].savedAt, 200, 'newest first');
	assert.strictEqual(entries[1].savedAt, 100, 'oldest last');

	console.log('[AiAnalysisJsonStore] list sorted desc: PASS');
}

async function testCollisionSuffix(): Promise<void> {
	const adapter = new MemAdapter();
	const args = {
		folderPath: FOLDER,
		analysisStartedAtMs: 5000,
		titleOrQuery: 'Same',
		record: buildAnalysisJsonRecord(makeSnapshot({ title: 'Same' }), { query: 'q', webEnabled: false, savedAt: 1 }),
	};
	const first = await saveAnalysisJson(adapter, args);
	const second = await saveAnalysisJson(adapter, args);
	assert.strictEqual(first.path, `${FOLDER}/5000 - Same.json`, 'first uses clean name');
	assert.notStrictEqual(second.path, first.path, 'collision produces a distinct path');
	assert.ok(second.path.endsWith('.json'), 'collision path still .json');

	console.log('[AiAnalysisJsonStore] collision suffix: PASS');
}

function testResolveJsonRecord(): void {
	const snapshot = makeSnapshot();
	const record = buildAnalysisJsonRecord(snapshot, { query: 'q', webEnabled: true, savedAt: 111 });
	const text = JSON.stringify(record);

	const resolved = resolveAnalysisSnapshotFromVault(`${FOLDER}/x.json`, text, 999);
	assert.ok(resolved, 'json resolves');
	assert.strictEqual(resolved!.query, 'q', 'query from record');
	// snapshot.analysisStartedAtMs present → wins over createdAtTs fallback.
	assert.strictEqual(resolved!.snapshot.analysisStartedAtMs, 1700000000000, 'existing startedAt preserved');

	// Missing startedAt → backfilled from createdAtTs.
	const noStart = buildAnalysisJsonRecord(makeSnapshot({ analysisStartedAtMs: null }), { query: 'q2', webEnabled: false, savedAt: 5 });
	const resolved2 = resolveAnalysisSnapshotFromVault(`${FOLDER}/y.json`, JSON.stringify(noStart), 424242);
	assert.strictEqual(resolved2!.snapshot.analysisStartedAtMs, 424242, 'startedAt backfilled from createdAtTs');

	console.log('[AiAnalysisJsonStore] resolve json record: PASS');
}

function testResolveLegacyMarkdown(): void {
	const snapshot = makeSnapshot({
		v2ReportSections: [{
			id: 'section-stable-id',
			title: 'Evidence-backed section',
			content: 'Section body.',
			missionRole: 'synthesis',
			evidencePaths: ['notes/source.md'],
		}],
		blocksFollowupsByBlockId: {
			'section-stable-id': [{
				question: 'What supports this?',
				answer: 'The cited source.',
			}],
		},
	});
	const doc = fromCompletedAnalysisSnapshot(snapshot, 'legacy query', true);
	const md = buildMarkdown(doc, {});

	const resolved = resolveAnalysisSnapshotFromVault('ChatFolder/AI-Analysis/legacy.md', md, 123);
	assert.ok(resolved, 'legacy md resolves via parse()');
	assert.strictEqual(resolved!.query, 'legacy query', 'query recovered from md frontmatter');
	assert.strictEqual(
		resolved!.snapshot.v2ReportSections?.[0]?.id,
		'section-stable-id',
		'V2 section id survives Markdown round-trip',
	);
	console.log('[AiAnalysisJsonStore] resolve legacy markdown: PASS');
}

async function main(): Promise<void> {
	await testRoundTripSaveListLoad();
	await testListSortedDescBySavedAt();
	await testCollisionSuffix();
	testResolveJsonRecord();
	testResolveLegacyMarkdown();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
