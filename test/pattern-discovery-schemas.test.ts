import assert from 'assert';
import {
	MatchConditionSchema,
	DiscoveredPatternSchema,
	PatternDiscoveryOutputSchema,
	CONTEXT_VARIABLE_NAMES,
	CONDITION_NAMES,
} from '@/core/schemas/agents/pattern-discovery-schemas';

function testValidMatchCondition(): void {
	const result = MatchConditionSchema.safeParse({
		hasActiveDocument: true,
		folderMatch: 'projects/',
		tagMatch: ['work', 'active'],
		hasOutgoingLinks: true,
		hasBacklinks: false,
		propertyMatch: { key: 'status', value: 'active' },
		keywordMatch: ['meeting', 'agenda'],
	});
	assert.strictEqual(result.success, true, 'valid MatchCondition should parse correctly');
}

function testEmptyMatchCondition(): void {
	const result = MatchConditionSchema.safeParse({});
	assert.strictEqual(result.success, true, 'empty MatchCondition (all optional) should parse');
}

function testAlwaysTrueCondition(): void {
	const result = MatchConditionSchema.safeParse({ always: true });
	assert.strictEqual(result.success, true, 'always: true condition should work');
	if (result.success) {
		assert.strictEqual(result.data.always, true, 'always should be true');
	}
}

function testPropertyMatchWithoutValue(): void {
	const result = MatchConditionSchema.safeParse({
		propertyMatch: { key: 'project' },
	});
	assert.strictEqual(result.success, true, 'propertyMatch without value should parse');
}

function testValidDiscoveredPattern(): void {
	const result = DiscoveredPatternSchema.safeParse({
		template: 'What are the key points in {{activeDocumentTitle}}?',
		variables: ['activeDocumentTitle'],
		conditions: { hasActiveDocument: true },
		confidence: 0.85,
		reasoning: 'User frequently queries active document content',
	});
	assert.strictEqual(result.success, true, 'valid DiscoveredPattern should parse');
}

function testValidPatternDiscoveryOutput(): void {
	const result = PatternDiscoveryOutputSchema.safeParse({
		newPatterns: [
			{
				template: 'Summarize {{activeDocumentTitle}}',
				variables: ['activeDocumentTitle'],
				conditions: { hasActiveDocument: true },
				confidence: 0.9,
				reasoning: 'Common summarization pattern',
			},
		],
		deprecateIds: ['pattern-123', 'pattern-456'],
	});
	assert.strictEqual(result.success, true, 'valid PatternDiscoveryOutput should parse');
}

function testEmptyPatternDiscoveryOutput(): void {
	const result = PatternDiscoveryOutputSchema.safeParse({
		newPatterns: [],
		deprecateIds: [],
	});
	assert.strictEqual(result.success, true, 'empty arrays should be valid');
}

function testConfidenceAboveOneIsRejected(): void {
	const result = DiscoveredPatternSchema.safeParse({
		template: 'test {{vaultName}}',
		variables: ['vaultName'],
		conditions: { always: true },
		confidence: 1.1,
		reasoning: 'test',
	});
	assert.strictEqual(result.success, false, 'confidence > 1 should be rejected');
}

function testConfidenceBelowZeroIsRejected(): void {
	const result = DiscoveredPatternSchema.safeParse({
		template: 'test {{vaultName}}',
		variables: ['vaultName'],
		conditions: { always: true },
		confidence: -0.1,
		reasoning: 'test',
	});
	assert.strictEqual(result.success, false, 'confidence < 0 should be rejected');
}

function testConfidenceBoundaryValues(): void {
	const zeroResult = DiscoveredPatternSchema.safeParse({
		template: 'test',
		variables: [],
		conditions: {},
		confidence: 0,
		reasoning: 'boundary',
	});
	assert.strictEqual(zeroResult.success, true, 'confidence = 0 should be valid');

	const oneResult = DiscoveredPatternSchema.safeParse({
		template: 'test',
		variables: [],
		conditions: {},
		confidence: 1,
		reasoning: 'boundary',
	});
	assert.strictEqual(oneResult.success, true, 'confidence = 1 should be valid');
}

function testContextVariableNamesCount(): void {
	assert.strictEqual(
		CONTEXT_VARIABLE_NAMES.length,
		15,
		'CONTEXT_VARIABLE_NAMES should have 15 entries'
	);
}

function testConditionNamesCount(): void {
	assert.strictEqual(CONDITION_NAMES.length, 8, 'CONDITION_NAMES should have 8 entries');
}

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => void }> = [
		{ name: 'valid MatchCondition parses correctly', fn: testValidMatchCondition },
		{ name: 'empty MatchCondition (all optional) parses', fn: testEmptyMatchCondition },
		{ name: 'always: true condition works', fn: testAlwaysTrueCondition },
		{ name: 'propertyMatch without value parses', fn: testPropertyMatchWithoutValue },
		{ name: 'valid DiscoveredPattern parses', fn: testValidDiscoveredPattern },
		{ name: 'valid PatternDiscoveryOutput parses', fn: testValidPatternDiscoveryOutput },
		{ name: 'empty PatternDiscoveryOutput arrays are valid', fn: testEmptyPatternDiscoveryOutput },
		{ name: 'confidence > 1 is rejected', fn: testConfidenceAboveOneIsRejected },
		{ name: 'confidence < 0 is rejected', fn: testConfidenceBelowZeroIsRejected },
		{ name: 'confidence boundary values (0 and 1) are valid', fn: testConfidenceBoundaryValues },
		{ name: 'CONTEXT_VARIABLE_NAMES has 15 entries', fn: testContextVariableNamesCount },
		{ name: 'CONDITION_NAMES has 8 entries', fn: testConditionNamesCount },
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

	console.log(`\nPattern discovery schema tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exit(1);
	}
}

void run();
