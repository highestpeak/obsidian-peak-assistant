import assert from 'assert';
import { HealthScoreEngine } from '@/service/lint/HealthScoreEngine';
import type { LintFinding, LintSignalDetector, LintScanContext, VaultLintConfig, LintDimension } from '@/service/lint/types';
import { DEFAULT_VAULT_LINT_CONFIG, LINT_DIMENSIONS } from '@/service/lint/types';

// ─── Helpers ────────────────────────────────────────────────────────────

function makeFinding(signalId: string, filePath: string): LintFinding {
	return {
		id: `${signalId}:${filePath}`,
		signalId: signalId as LintFinding['signalId'],
		severity: 'warning',
		filePath,
		title: 'test',
		description: 'test',
		fixActions: [],
		metadata: {},
		status: 'open',
	};
}

function makeDetector(
	id: string,
	dimension: LintDimension,
	severity: 'error' | 'warning' | 'info',
	signalWeight: number,
): LintSignalDetector {
	return {
		id: id as LintSignalDetector['id'],
		dimension,
		severity,
		signalWeight,
		label: id,
		description: id,
		requiresLlm: false,
		detect: async () => [],
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────

function testNoFindings(): void {
	const detectors = [
		makeDetector('S-ORPHAN', 'structural', 'warning', 0.30),
		makeDetector('C-EMPTY', 'content', 'warning', 0.30),
	];
	const engine = new HealthScoreEngine(detectors, DEFAULT_VAULT_LINT_CONFIG);
	const result = engine.compute([], 100);

	assert.strictEqual(result.healthScore, 100, 'No findings → overall score should be 100');
	for (const dim of LINT_DIMENSIONS) {
		assert.strictEqual(result.dimensionScores[dim], 100, `${dim} should be 100 with no findings`);
	}
}

function testSomeWarningsOneDimension(): void {
	const detectors = [
		makeDetector('S-ORPHAN', 'structural', 'warning', 0.30),
		makeDetector('C-EMPTY', 'content', 'warning', 0.30),
	];
	const engine = new HealthScoreEngine(detectors, DEFAULT_VAULT_LINT_CONFIG);

	// 10 orphans out of 100 notes
	const findings = Array.from({ length: 10 }, (_, i) => makeFinding('S-ORPHAN', `note${i}.md`));
	const result = engine.compute(findings, 100);

	assert.ok(result.dimensionScores.structural < 100, 'Structural dimension should be penalized');
	assert.strictEqual(result.dimensionScores.content, 100, 'Content dimension should be 100');
	assert.strictEqual(result.dimensionScores.temporal, 100, 'Temporal dimension should be 100');
	assert.strictEqual(result.dimensionScores.semantic, 100, 'Semantic dimension should be 100');
	assert.strictEqual(result.dimensionScores.tags, 100, 'Tags dimension should be 100');

	// Structural: penalty = (10/100) * 1.5 * 0.30 = 0.045 → score = round(100 * (1 - 0.045)) = 96
	assert.strictEqual(result.dimensionScores.structural, 96, 'Structural score should be 96');
}

function testErrorsPenalizeMoreThanWarnings(): void {
	const errorDetector = makeDetector('S-BROKEN-LINK', 'structural', 'error', 0.25);
	const warningDetector = makeDetector('S-ORPHAN', 'structural', 'warning', 0.25);

	// Same weight, same count, different severity
	const totalNotes = 100;
	const errorFindings = Array.from({ length: 10 }, (_, i) => makeFinding('S-BROKEN-LINK', `note${i}.md`));
	const warningFindings = Array.from({ length: 10 }, (_, i) => makeFinding('S-ORPHAN', `note${i}.md`));

	const errorEngine = new HealthScoreEngine([errorDetector], DEFAULT_VAULT_LINT_CONFIG);
	const warningEngine = new HealthScoreEngine([warningDetector], DEFAULT_VAULT_LINT_CONFIG);

	const errorResult = errorEngine.compute(errorFindings, totalNotes);
	const warningResult = warningEngine.compute(warningFindings, totalNotes);

	// error multiplier = 3.0, warning multiplier = 1.5 → error penalty is 2x warning penalty
	// Error: penalty = (10/100) * 3.0 * 0.25 = 0.075 → 93
	// Warning: penalty = (10/100) * 1.5 * 0.25 = 0.0375 → 96
	assert.strictEqual(errorResult.dimensionScores.structural, 93, 'Error penalty should yield 93');
	assert.strictEqual(warningResult.dimensionScores.structural, 96, 'Warning penalty should yield 96');
	assert.ok(
		errorResult.dimensionScores.structural < warningResult.dimensionScores.structural,
		'Errors should penalize more than warnings',
	);
}

function testAllNotesAffectedDimensionZero(): void {
	// signalWeight = 1.0, severity = error (3.0) → penalty = (100/100) * 3.0 * 1.0 = 3.0 → clamped to 1 → score = 0
	const detector = makeDetector('S-ORPHAN', 'structural', 'error', 1.0);
	const engine = new HealthScoreEngine([detector], DEFAULT_VAULT_LINT_CONFIG);

	const findings = Array.from({ length: 100 }, (_, i) => makeFinding('S-ORPHAN', `note${i}.md`));
	const result = engine.compute(findings, 100);

	assert.strictEqual(result.dimensionScores.structural, 0, 'All notes affected → dimension score = 0');
}

function testOverallIsWeightedSum(): void {
	// Create detectors in structural and content dimensions with large enough penalties to produce distinct scores
	const structDetector = makeDetector('S-ORPHAN', 'structural', 'warning', 0.30);
	const contentDetector = makeDetector('C-EMPTY', 'content', 'warning', 0.30);
	const engine = new HealthScoreEngine([structDetector, contentDetector], DEFAULT_VAULT_LINT_CONFIG);

	// 20 orphans, 10 empty, out of 100
	const findings = [
		...Array.from({ length: 20 }, (_, i) => makeFinding('S-ORPHAN', `orphan${i}.md`)),
		...Array.from({ length: 10 }, (_, i) => makeFinding('C-EMPTY', `empty${i}.md`)),
	];
	const result = engine.compute(findings, 100);

	// Structural: penalty = (20/100) * 1.5 * 0.30 = 0.09 → round(100 * 0.91) = 91
	// Content: penalty = (10/100) * 1.5 * 0.30 = 0.045 → round(100 * 0.955) = 96
	// Other dims: 100
	assert.strictEqual(result.dimensionScores.structural, 91);
	assert.strictEqual(result.dimensionScores.content, 96);

	// Overall = 91*0.30 + 96*0.20 + 100*0.15 + 100*0.25 + 100*0.10
	// = 27.3 + 19.2 + 15 + 25 + 10 = 96.5 → round = 97
	// (note: round(96.5) = 97 in JS — Math.round rounds .5 up)
	const expected = Math.round(
		91 * 0.30 + 96 * 0.20 + 100 * 0.15 + 100 * 0.25 + 100 * 0.10,
	);
	assert.strictEqual(result.healthScore, expected, `Overall should be weighted sum: ${expected}`);
}

function testZeroTotalNotes(): void {
	const detector = makeDetector('S-ORPHAN', 'structural', 'warning', 0.30);
	const engine = new HealthScoreEngine([detector], DEFAULT_VAULT_LINT_CONFIG);
	const result = engine.compute([], 0);

	assert.strictEqual(result.healthScore, 100, 'Zero total notes → score 100');
	for (const dim of LINT_DIMENSIONS) {
		assert.strictEqual(result.dimensionScores[dim], 100, `${dim} should be 100 with zero notes`);
	}
}

// ─── Runner ─────────────────────────────────────────────────────────────

const tests = [
	{ name: 'No findings → score 100', fn: testNoFindings },
	{ name: 'Some warnings in one dimension', fn: testSomeWarningsOneDimension },
	{ name: 'Errors penalize 3x vs warnings 1.5x', fn: testErrorsPenalizeMoreThanWarnings },
	{ name: 'All notes affected → dimension score = 0', fn: testAllNotesAffectedDimensionZero },
	{ name: 'Overall score is weighted sum of dimension scores', fn: testOverallIsWeightedSum },
	{ name: 'Zero total notes → score 100', fn: testZeroTotalNotes },
];

async function run(): Promise<void> {
	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			await test.fn();
			console.log(`PASS: ${test.name}`);
			passed += 1;
		} catch (error) {
			failed += 1;
			console.error(`FAIL: ${test.name}`);
			console.error(error);
		}
	}

	console.log(`\nHealthScoreEngine tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exit(1);
	}
}

void run();
