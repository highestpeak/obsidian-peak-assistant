import assert from 'assert';
import { normalizeTemplate, isDuplicate, mergeDiscoveredPatterns } from '@/service/PatternMergeService';
import type { PatternDiscoveryOutput } from '@/core/schemas/agents/pattern-discovery-schemas';
import type { QueryPatternRepo } from '@/core/storage/sqlite/repositories/QueryPatternRepo';

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

function testNormalizeTemplate(): void {
	assert.strictEqual(
		normalizeTemplate('Analyze {activeDocumentTitle} in {currentFolder}'),
		'Analyze {} in {}',
		'should replace named variables with {}',
	);
	assert.strictEqual(
		normalizeTemplate('Show me recent documents'),
		'Show me recent documents',
		'should leave templates without variables unchanged',
	);
	assert.strictEqual(
		normalizeTemplate('{topic}'),
		'{}',
		'single variable only',
	);
	assert.strictEqual(
		normalizeTemplate('{a} and {b} and {c}'),
		'{} and {} and {}',
		'multiple variables',
	);
	assert.strictEqual(
		normalizeTemplate('no braces at all'),
		'no braces at all',
		'no variables',
	);
}

function testIsDuplicate(): void {
	// Same normalized form → duplicate
	assert.strictEqual(
		isDuplicate(
			'Analyze {activeDocumentTitle} in {currentFolder}',
			'Analyze {docTitle} in {folder}',
		),
		true,
		'different variable names but same structure → duplicate',
	);

	// Case-insensitive match
	assert.strictEqual(
		isDuplicate('what is {topic}?', 'What Is {subject}?'),
		true,
		'case-insensitive comparison',
	);

	// Different templates → not duplicate
	assert.strictEqual(
		isDuplicate('Analyze {title}', 'Summarize {title}'),
		false,
		'different leading verb → not duplicate',
	);

	// Different structure → not duplicate
	assert.strictEqual(
		isDuplicate('Find notes about {topic}', 'Find notes about {topic} in {folder}'),
		false,
		'different number of placeholders → not duplicate',
	);

	// Exact same normalized → duplicate
	assert.strictEqual(
		isDuplicate('hello {} world', 'hello {} world'),
		true,
		'identical after normalization',
	);
}

// ---------------------------------------------------------------------------
// mergeDiscoveredPatterns tests using a mock repo
// ---------------------------------------------------------------------------

type PatternRow = {
	id: string;
	template: string;
	variables: string;
	conditions: string;
	source: string;
	confidence: number;
	usage_count: number;
	discovered_at: number;
	last_used_at: number | null;
	deprecated: number;
};

function makeMockRepo(existing: PatternRow[] = []) {
	const rows = [...existing];
	const deprecatedIds: string[] = [];
	let deprecateStaleCallCount = 0;

	const repo = {
		async listAll() { return [...rows]; },
		async insert(record: PatternRow) {
			if (!rows.find((r) => r.id === record.id)) {
				rows.push({ ...record });
			}
		},
		async deprecate(id: string) { deprecatedIds.push(id); },
		async deprecateStale(_maxAgeDays: number) { deprecateStaleCallCount++; },
		// Test inspection helpers
		_rows: rows,
		_deprecatedIds: deprecatedIds,
		get _deprecateStaleCallCount() { return deprecateStaleCallCount; },
	} as unknown as QueryPatternRepo & {
		_rows: PatternRow[];
		_deprecatedIds: string[];
		_deprecateStaleCallCount: number;
	};

	return repo;
}

function makeOutput(overrides: Partial<PatternDiscoveryOutput> = {}): PatternDiscoveryOutput {
	return {
		newPatterns: [],
		deprecateIds: [],
		...overrides,
	};
}

async function testMergeInsertsNewPattern(): Promise<void> {
	const repo = makeMockRepo();
	const output = makeOutput({
		newPatterns: [
			{
				template: 'Summarize {activeDocumentTitle}',
				variables: ['activeDocumentTitle'],
				conditions: { hasActiveDocument: true },
				confidence: 0.9,
				reasoning: 'user often summarizes open docs',
			},
		],
	});

	const result = await mergeDiscoveredPatterns(repo, output);

	assert.strictEqual(result.inserted, 1, 'should insert one new pattern');
	assert.strictEqual(result.deprecated, 0, 'no deprecations');
	const rows = await (repo as any).listAll();
	assert.strictEqual(rows.length, 1);
	assert.strictEqual(rows[0].source, 'discovered');
	assert.ok(rows[0].id.startsWith('disc-'), 'id should start with disc-');
}

async function testMergeSkipsDuplicate(): Promise<void> {
	const existing: PatternRow[] = [
		{
			id: 'existing-1',
			template: 'Summarize {doc}',
			variables: JSON.stringify(['doc']),
			conditions: '{}',
			source: 'default',
			confidence: 1,
			usage_count: 5,
			discovered_at: Date.now(),
			last_used_at: null,
			deprecated: 0,
		},
	];

	const repo = makeMockRepo(existing);
	const output = makeOutput({
		newPatterns: [
			{
				// Different variable name but same normalized form → duplicate
				template: 'Summarize {activeDocumentTitle}',
				variables: ['activeDocumentTitle'],
				conditions: {},
				confidence: 0.8,
				reasoning: 'dup',
			},
		],
	});

	const result = await mergeDiscoveredPatterns(repo, output);

	assert.strictEqual(result.inserted, 0, 'duplicate should be skipped');
	const rows = await (repo as any).listAll();
	assert.strictEqual(rows.length, 1, 'no new rows should be added');
}

async function testMergeDeprecatesIds(): Promise<void> {
	const repo = makeMockRepo() as any;
	const output = makeOutput({
		deprecateIds: ['id-1', 'id-2'],
	});

	const result = await mergeDiscoveredPatterns(repo, output);

	assert.strictEqual(result.deprecated, 2);
	assert.deepStrictEqual(repo._deprecatedIds, ['id-1', 'id-2']);
}

async function testMergeCallsDeprecateStale(): Promise<void> {
	const repo = makeMockRepo() as any;
	const output = makeOutput();

	await mergeDiscoveredPatterns(repo, output);

	assert.strictEqual(repo._deprecateStaleCallCount, 1, 'deprecateStale should be called once');
}

async function testMergeDeduplicatesWithinBatch(): Promise<void> {
	const repo = makeMockRepo();
	const output = makeOutput({
		newPatterns: [
			{
				template: 'Find notes on {topic}',
				variables: ['topic'],
				conditions: {},
				confidence: 0.9,
				reasoning: 'first',
			},
			{
				// Same normalized template as the first in this batch
				template: 'Find notes on {subject}',
				variables: ['subject'],
				conditions: {},
				confidence: 0.85,
				reasoning: 'duplicate of first',
			},
		],
	});

	const result = await mergeDiscoveredPatterns(repo, output);

	assert.strictEqual(result.inserted, 1, 'second pattern in batch is a duplicate, skip it');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
		{ name: 'normalizeTemplate replaces variables with {}', fn: testNormalizeTemplate },
		{ name: 'isDuplicate detects same normalized templates (case-insensitive)', fn: testIsDuplicate },
		{ name: 'mergeDiscoveredPatterns inserts new pattern', fn: testMergeInsertsNewPattern },
		{ name: 'mergeDiscoveredPatterns skips duplicates', fn: testMergeSkipsDuplicate },
		{ name: 'mergeDiscoveredPatterns deprecates specified ids', fn: testMergeDeprecatesIds },
		{ name: 'mergeDiscoveredPatterns calls deprecateStale(30)', fn: testMergeCallsDeprecateStale },
		{ name: 'mergeDiscoveredPatterns deduplicates within same batch', fn: testMergeDeduplicatesWithinBatch },
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			await test.fn();
			console.log(`✅ PASS: ${test.name}`);
			passed++;
		} catch (err) {
			failed++;
			console.error(`❌ FAIL: ${test.name}`);
			console.error(err);
		}
	}

	console.log(`\nPatternMergeService tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
