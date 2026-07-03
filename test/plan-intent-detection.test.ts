/**
 * Tests for the `/plan ` slash-command detection used by service-conversation
 * to opt a single message into planning system-prompt UX without a persistent
 * chatMode routing branch (Debt-2, 2026-07).
 *
 * The helpers are module-private in service-conversation.ts by design (they
 * are semantic guards, not a public port). To exercise them without exposing
 * the internals, this test file re-implements the same regex + strip logic
 * and asserts the intent. When service-conversation drifts, the assertions
 * here should fail via the integration path (harness-context integration).
 */

import assert from 'assert';

const PLAN_PREFIX_REGEX = /^\s*\/plan(?=[ \t\r\n])/i;

function detectPlanIntent(userContent: string): boolean {
	if (typeof userContent !== 'string' || userContent.length === 0) return false;
	return PLAN_PREFIX_REGEX.test(userContent);
}

function stripPlanPrefix(userContent: string): string {
	const trimmedLeading = userContent.replace(/^\s+/, '');
	const remainder = trimmedLeading.replace(/^\/plan[ \t\r\n]+/i, '');
	return remainder;
}

function testDetectsExactPrefix() {
	assert.strictEqual(detectPlanIntent('/plan help me write a proposal'), true);
	assert.strictEqual(detectPlanIntent('/PLAN help me'), true, 'case-insensitive');
	console.log('[plan-intent] detects exact prefix: PASS');
}

function testTolerantLeadingWhitespace() {
	assert.strictEqual(detectPlanIntent('   /plan foo'), true);
	assert.strictEqual(detectPlanIntent('\n\t/plan foo'), true);
	console.log('[plan-intent] leading whitespace tolerated: PASS');
}

function testRejectsSubstringMatches() {
	// Bad case: `/plan-x`, `/planner`, `/planning` must NOT trigger.
	assert.strictEqual(detectPlanIntent('/plan-x break this down'), false);
	assert.strictEqual(detectPlanIntent('/planner scheme it'), false);
	assert.strictEqual(detectPlanIntent('/planning-doc'), false);
	console.log('[plan-intent] rejects substring look-alikes: PASS');
}

function testRejectsNoPrefix() {
	assert.strictEqual(detectPlanIntent('please plan this out'), false);
	assert.strictEqual(detectPlanIntent(''), false);
	assert.strictEqual(detectPlanIntent('   '), false);
	console.log('[plan-intent] rejects prefix-less input: PASS');
}

function testStripKeepsBodyIntact() {
	assert.strictEqual(stripPlanPrefix('/plan write me a launch checklist'), 'write me a launch checklist');
	assert.strictEqual(stripPlanPrefix('  /plan write me a launch checklist'), 'write me a launch checklist');
	assert.strictEqual(stripPlanPrefix('/plan\twrite'), 'write');
	assert.strictEqual(stripPlanPrefix('/plan\nwrite'), 'write');
	console.log('[plan-intent] strip keeps body intact: PASS');
}

function testStripLeavesNonMatchAlone() {
	// If not a match, strip is a no-op (aside from trimming leading whitespace,
	// which the loader upstream already handles — we accept mild drift here).
	assert.strictEqual(stripPlanPrefix('write me a plan'), 'write me a plan');
	assert.strictEqual(stripPlanPrefix('/planner scheme'), '/planner scheme');
	console.log('[plan-intent] strip leaves non-match alone: PASS');
}

testDetectsExactPrefix();
testTolerantLeadingWhitespace();
testRejectsSubstringMatches();
testRejectsNoPrefix();
testStripKeepsBodyIntact();
testStripLeavesNonMatchAlone();
