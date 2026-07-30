// B2.copilot / B2.analysis / B2.harness — structural wire-in guards.
//
// All three follow the same pattern: an existing `*Run.ts` wrapper is
// invoked at the top of the live feature path so the RunEnvelope
// records start/finish/error events for every user turn / review
// session / analysis run.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

function read(rel: string): string {
	return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ---------------------------------------------------------------------------
// B2.copilot — CopilotAutoRunContent wraps the review generator via
// `runCopilotReview` (envelope version) from `CopilotReviewRun`.
// ---------------------------------------------------------------------------

function testCopilotWireIn(): void {
	const src = read('src/ui/view/copilot/CopilotAutoRunContent.tsx');
	assert.ok(
		src.includes(`from '@/service/copilot/CopilotReviewRun'`),
		'CopilotAutoRunContent must import from CopilotReviewRun (envelope wrapper)',
	);
	assert.ok(
		src.includes('runCopilotReviewEnvelope'),
		'CopilotAutoRunContent must alias the envelope runner (avoids name clash with session generator)',
	);
	const stripped = stripComments(src);
	assert.match(
		stripped,
		/runCopilotReviewEnvelope\s*\(\s*\{[\s\S]*?trigger:\s*['"]manual['"][\s\S]*?review:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?runCopilotReview\s*\(\s*\{[\s\S]*?\}\s*\)/,
		'CopilotAutoRunContent must dispatch through runCopilotReviewEnvelope({ trigger: "manual", review: async () => runCopilotReview(...) })',
	);
	console.log('PASS: copilotWireIn');
}

// ---------------------------------------------------------------------------
// B2.analysis — useSearchSession.handleApprovePlan wraps `generateReport`
// in `runAnalysisReport({ trigger: 'manual', generate })`.
// ---------------------------------------------------------------------------

function testAnalysisWireIn(): void {
	const src = read('src/ui/view/quick-search/hooks/useSearchSession.ts');
	assert.ok(
		src.includes(`'@/service/agents/report/AnalysisReportRun'`),
		'useSearchSession must reach for @/service/agents/report/AnalysisReportRun',
	);
	assert.ok(
		src.includes('runAnalysisReport'),
		'useSearchSession must call runAnalysisReport',
	);
	const stripped = stripComments(src);
	assert.match(
		stripped,
		/runAnalysisReport\s*\(\s*\{[\s\S]*?trigger:\s*['"]manual['"][\s\S]*?generate:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?reportOrchestrator\.generateReport\s*\(/,
		'handleApprovePlan must invoke runAnalysisReport({ trigger: "manual", generate: async () => reportOrchestrator.generateReport(...) })',
	);
	console.log('PASS: analysisWireIn');
}

// ---------------------------------------------------------------------------
// B2.harness — HarnessRunBridge.run wraps the single-path harness
// dispatch in `runHarnessAgent({ trigger: 'manual', execute })`. Post
// 2026-07 SDK-backend retirement, the SDK branch is gone; the bridge is a
// thin RunEnvelope wrapper over `runAgentLoop`.
// ---------------------------------------------------------------------------

function testHarnessWireIn(): void {
	const src = read('src/service/agents/harness-bridge/HarnessRunBridge.ts');
	assert.ok(
		src.includes(`'@/service/agents/harness/HarnessAgentRun'`),
		'HarnessRunBridge must reach for HarnessAgentRun',
	);
	assert.ok(
		src.includes('runHarnessAgent'),
		'HarnessRunBridge must call runHarnessAgent',
	);
	const stripped = stripComments(src);
	assert.match(
		stripped,
		/runHarnessAgent<AgentLoopResult>\s*\(\s*\{[\s\S]*?trigger:\s*['"]manual['"][\s\S]*?execute:\s*async\s*\(\)\s*=>\s*runAgentLoop\s*\(\s*loopConfig\s*\)/,
		'bridge.run must dispatch through runHarnessAgent({ trigger: "manual", execute: () => runAgentLoop(loopConfig) })',
	);
	assert.ok(
		stripped.includes('withDefaultContextManager'),
		'bridge.run must install the production ContextManager seam before runAgentLoop',
	);
	// The pre-retirement SDK path pattern must not resurface without being wrapped.
	assert.ok(
		!/shouldUseSDK|runViaSDK/.test(stripped),
		'bridge.run must NOT contain SDK dispatch helpers — retired 2026-07',
	);
	console.log('PASS: harnessWireIn');
}

testCopilotWireIn();
testAnalysisWireIn();
testHarnessWireIn();
console.log('b2-copilot-analysis-harness-wire-in: all guards passed');
