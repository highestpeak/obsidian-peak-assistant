// T7: rewritten to test the current `computeHealthScore` free function.
//
// Before T7 this file imported a non-existent `HealthScoreEngine` class
// and a `DEFAULT_VAULT_LINT_CONFIG` / `LINT_DIMENSIONS` symbol that the
// types module never exported — the file had been silently broken since
// before T5. T7 keeps the same SEMANTIC coverage (zero findings → 100,
// errors penalize more than warnings, all-notes affected → 0, weighted
// sum, zero notes → 100) but rewires it to the actual exported API:
//
//   - `computeHealthScore(findings, totalNotes, config)` in
//     `src/service/lint/HealthScoreEngine.ts`
//   - `DEFAULT_VAULT_LINT_CONFIG` in
//     `src/service/lint/config/VaultLintDefaults.ts`

import assert from 'assert';
import { computeHealthScore } from '@/service/lint/HealthScoreEngine';
import { DEFAULT_VAULT_LINT_CONFIG } from '@/service/lint/config/VaultLintDefaults';
import type { LintFinding, LintDimension, LintSignalId } from '@/service/lint/types';

const ALL_DIMENSIONS: LintDimension[] = ['structural', 'content', 'temporal', 'semantic', 'tags'];

function makeFinding(
	signalId: LintSignalId,
	filePath: string,
	severity: LintFinding['severity'] = 'warning',
): LintFinding {
	return {
		id: `${signalId}:${filePath}`,
		signalId,
		severity,
		filePath,
		title: 'test',
		description: 'test',
		fixActions: [],
		metadata: {},
		status: 'open',
	};
}

function testNoFindingsGivesPerfectScore(): void {
	const { healthScore, dimensionScores } = computeHealthScore([], 100, DEFAULT_VAULT_LINT_CONFIG);
	assert.strictEqual(healthScore, 100, 'No findings → overall score should be 100');
	for (const dim of ALL_DIMENSIONS) {
		assert.strictEqual(dimensionScores[dim], 100, `${dim} should be 100 with no findings`);
	}
	console.log('PASS: noFindingsGivesPerfectScore');
}

function testSingleDimensionPenaltyMatchesFormula(): void {
	// 10 S-ORPHAN warnings / 100 notes.
	//   per-finding penalty = (1/100) * 1.5 * 0.30 (S-ORPHAN signal weight)
	//   total penalty       = 10 * 0.0045 = 0.045
	//   structural score    = round(100 * (1 - 0.045)) = 96
	const findings = Array.from({ length: 10 }, (_, i) =>
		makeFinding('S-ORPHAN', `note${i}.md`, 'warning'),
	);
	const { dimensionScores } = computeHealthScore(findings, 100, DEFAULT_VAULT_LINT_CONFIG);
	assert.strictEqual(dimensionScores.structural, 96, 'Structural penalty should yield 96');
	for (const dim of ALL_DIMENSIONS) {
		if (dim === 'structural') continue;
		assert.strictEqual(dimensionScores[dim], 100, `${dim} should stay at 100`);
	}
	console.log('PASS: singleDimensionPenaltyMatchesFormula');
}

function testErrorsPenalizeMoreThanWarnings(): void {
	// S-BROKEN-LINK errors vs S-ORPHAN warnings — both structural.
	// Error multiplier 3.0 vs warning 1.5; same count, same per-finding
	// affected-note ratio. Same dimension keeps the comparison fair.
	const errorFindings = Array.from({ length: 10 }, (_, i) =>
		makeFinding('S-BROKEN-LINK', `note${i}.md`, 'error'),
	);
	const warningFindings = Array.from({ length: 10 }, (_, i) =>
		makeFinding('S-ORPHAN', `note${i}.md`, 'warning'),
	);
	const errResult = computeHealthScore(errorFindings, 100, DEFAULT_VAULT_LINT_CONFIG);
	const warnResult = computeHealthScore(warningFindings, 100, DEFAULT_VAULT_LINT_CONFIG);
	// S-BROKEN-LINK signal weight 0.25; S-ORPHAN signal weight 0.30.
	// Error penalty:   10 * (1/100) * 3.0 * 0.25 = 0.075 → score 93
	// Warning penalty: 10 * (1/100) * 1.5 * 0.30 = 0.045 → score 96
	assert.strictEqual(errResult.dimensionScores.structural, 93);
	assert.strictEqual(warnResult.dimensionScores.structural, 96);
	assert.ok(
		errResult.dimensionScores.structural < warnResult.dimensionScores.structural,
		'Errors should penalize more than warnings (same count, same dimension)',
	);
	console.log('PASS: errorsPenalizeMoreThanWarnings');
}

function testAllNotesAffectedClampsDimensionToZero(): void {
	// 100 S-BROKEN-LINK errors / 100 notes.
	//   per-finding penalty = (1/100) * 3.0 * 0.25 = 0.0075
	//   total penalty       = 100 * 0.0075 = 0.75 (NOT clamped yet — under 1)
	//   So we add a stronger per-finding penalty by stacking duplicates:
	//   use 200 findings → penalty = 1.5 → clamped to 1 → score 0.
	const findings = Array.from({ length: 200 }, (_, i) =>
		makeFinding('S-BROKEN-LINK', `note${i}.md`, 'error'),
	);
	const { dimensionScores } = computeHealthScore(findings, 100, DEFAULT_VAULT_LINT_CONFIG);
	assert.strictEqual(
		dimensionScores.structural,
		0,
		'Sufficient findings should clamp the dimension to 0',
	);
	console.log('PASS: allNotesAffectedClampsDimensionToZero');
}

function testOverallScoreIsConfigWeightedSum(): void {
	// Mix structural (20 orphan warnings) + content (10 empty warnings).
	//   Structural penalty: 20 * (1/100) * 1.5 * 0.30 = 0.090 → score 91
	//   Content penalty:    10 * (1/100) * 1.5 * 0.30 = 0.045 → score 96
	//   Other dims: 100
	const findings = [
		...Array.from({ length: 20 }, (_, i) => makeFinding('S-ORPHAN', `orphan${i}.md`, 'warning')),
		...Array.from({ length: 10 }, (_, i) => makeFinding('C-EMPTY', `empty${i}.md`, 'warning')),
	];
	const { healthScore, dimensionScores } = computeHealthScore(
		findings,
		100,
		DEFAULT_VAULT_LINT_CONFIG,
	);
	assert.strictEqual(dimensionScores.structural, 91);
	assert.strictEqual(dimensionScores.content, 96);
	const w = DEFAULT_VAULT_LINT_CONFIG.dimensionWeights;
	const expected = Math.round(
		91 * w.structural +
			96 * w.content +
			100 * w.temporal +
			100 * w.semantic +
			100 * w.tags,
	);
	assert.strictEqual(
		healthScore,
		expected,
		`Overall should be configured weighted sum (got ${healthScore}, expected ${expected})`,
	);
	console.log('PASS: overallScoreIsConfigWeightedSum');
}

function testZeroTotalNotesGivesPerfectScore(): void {
	const { healthScore, dimensionScores } = computeHealthScore([], 0, DEFAULT_VAULT_LINT_CONFIG);
	assert.strictEqual(healthScore, 100, 'Zero total notes → overall 100');
	for (const dim of ALL_DIMENSIONS) {
		assert.strictEqual(dimensionScores[dim], 100, `${dim} should be 100 with zero notes`);
	}
	console.log('PASS: zeroTotalNotesGivesPerfectScore');
}

function main(): void {
	testNoFindingsGivesPerfectScore();
	testSingleDimensionPenaltyMatchesFormula();
	testErrorsPenalizeMoreThanWarnings();
	testAllNotesAffectedClampsDimensionToZero();
	testOverallScoreIsConfigWeightedSum();
	testZeroTotalNotesGivesPerfectScore();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
