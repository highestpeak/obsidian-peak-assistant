import assert from 'assert';
import { SEED_PATTERNS, buildSeedRecords } from '@/service/context/seed-patterns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract all {variable} tokens from a template string */
function extractTemplateVars(template: string): string[] {
	const matches = template.match(/\{(\w+)\}/g) ?? [];
	return matches.map((m) => m.slice(1, -1));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

function testMinPatternCount(): void {
	assert.ok(SEED_PATTERNS.length >= 5, `Expected at least 5 seed patterns, got ${SEED_PATTERNS.length}`);
}

function testEveryTemplateHasVariable(): void {
	for (const pattern of SEED_PATTERNS) {
		const vars = extractTemplateVars(pattern.template);
		assert.ok(
			vars.length >= 1,
			`Template "${pattern.template}" has no {variable} placeholders`
		);
	}
}

function testTemplateVarsMatchDeclared(): void {
	for (const pattern of SEED_PATTERNS) {
		const templateVars = extractTemplateVars(pattern.template);
		for (const v of templateVars) {
			assert.ok(
				pattern.variables.includes(v),
				`Variable "{${v}}" in template "${pattern.template}" is missing from variables array ${JSON.stringify(pattern.variables)}`
			);
		}
	}
}

function testBuildSeedRecordsShape(): void {
	const records = buildSeedRecords();

	assert.strictEqual(records.length, SEED_PATTERNS.length, 'record count should match SEED_PATTERNS length');

	for (const record of records) {
		assert.strictEqual(record.source, 'default', 'source should be "default"');
		assert.strictEqual(record.confidence, 1.0, 'confidence should be 1.0');
		assert.strictEqual(record.usage_count, 0, 'usage_count should be 0');
		assert.strictEqual(typeof record.discovered_at, 'number', 'discovered_at should be a number');
		assert.strictEqual(record.last_used_at, null, 'last_used_at should be null');
		assert.strictEqual(record.deprecated, 0, 'deprecated should be 0');
		assert.ok(record.id.startsWith('seed-'), `id "${record.id}" should start with "seed-"`);
	}
}

function testSeedRecordIdsAreUnique(): void {
	const records = buildSeedRecords();
	const ids = records.map((r) => r.id);
	const unique = new Set(ids);
	assert.strictEqual(unique.size, ids.length, 'all seed record IDs should be unique');
}

function testSeedRecordIdsAreDeterministic(): void {
	const first = buildSeedRecords().map((r) => r.id);
	const second = buildSeedRecords().map((r) => r.id);
	assert.deepStrictEqual(first, second, 'buildSeedRecords IDs should be deterministic across calls');
}

function testSeedRecordVariablesAreJsonArray(): void {
	const records = buildSeedRecords();
	for (const record of records) {
		const parsed = JSON.parse(record.variables);
		assert.ok(Array.isArray(parsed), `variables field for "${record.id}" should be a JSON array`);
	}
}

function testSeedRecordConditionsAreJsonObject(): void {
	const records = buildSeedRecords();
	for (const record of records) {
		const parsed = JSON.parse(record.conditions);
		assert.strictEqual(typeof parsed, 'object', `conditions field for "${record.id}" should be a JSON object`);
		assert.ok(!Array.isArray(parsed), `conditions field for "${record.id}" should not be an array`);
	}
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => void }> = [
		{ name: 'SEED_PATTERNS has at least 5 entries', fn: testMinPatternCount },
		{ name: 'every template has at least one {variable}', fn: testEveryTemplateHasVariable },
		{ name: 'every template variable exists in variables array', fn: testTemplateVarsMatchDeclared },
		{ name: 'buildSeedRecords returns correct shape', fn: testBuildSeedRecordsShape },
		{ name: 'seed record IDs are unique', fn: testSeedRecordIdsAreUnique },
		{ name: 'seed record IDs are deterministic', fn: testSeedRecordIdsAreDeterministic },
		{ name: 'seed record variables field is JSON array', fn: testSeedRecordVariablesAreJsonArray },
		{ name: 'seed record conditions field is JSON object', fn: testSeedRecordConditionsAreJsonObject },
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			test.fn();
			console.log(`✅ PASS: ${test.name}`);
			passed += 1;
		} catch (error) {
			failed += 1;
			console.error(`❌ FAIL: ${test.name}`);
			console.error(error);
		}
	}

	console.log(`\nSeed patterns tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exit(1);
	}
}

void run();
