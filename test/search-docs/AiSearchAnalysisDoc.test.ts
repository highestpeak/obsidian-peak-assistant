/**
 * Test file for AiSearchAnalysisDoc.parse and buildMarkdown methods.
 * Fixtures live in ./fixtures/*.md
 * Run with: npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse, buildMarkdown } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import type { AiSearchAnalysisDocModel } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';

function readTestFile(filename: string): string {
	const filePath = join(process.cwd(), 'test', 'search-docs', 'fixtures', filename);
	return readFileSync(filePath, 'utf-8');
}

function docModelsEqual(a: AiSearchAnalysisDocModel, b: AiSearchAnalysisDocModel): { ok: boolean; msg?: string } {
	if (a.summary !== b.summary) return { ok: false, msg: 'summary' };
	if (a.query !== b.query) return { ok: false, msg: 'query' };
	if (a.webEnabled !== b.webEnabled) return { ok: false, msg: 'webEnabled' };
	if (a.topics.length !== b.topics.length) return { ok: false, msg: `topics.length ${a.topics.length} vs ${b.topics.length}` };
	for (let i = 0; i < a.topics.length; i++) {
		if (a.topics[i].label !== b.topics[i].label || a.topics[i].weight !== b.topics[i].weight) return { ok: false, msg: `topics[${i}]` };
	}
	if (a.sources.length !== b.sources.length) return { ok: false, msg: `sources.length ${a.sources.length} vs ${b.sources.length}` };
	for (let i = 0; i < a.sources.length; i++) {
		const sa = a.sources[i];
		const sb = b.sources[i];
		if (sa.path !== sb.path || sa.title !== sb.title || sa.reasoning !== sb.reasoning) return { ok: false, msg: `sources[${i}]` };
		if (JSON.stringify(sa.badges) !== JSON.stringify(sb.badges)) return { ok: false, msg: `sources[${i}].badges` };
	}
	if ((a.graph?.nodes?.length ?? 0) !== (b.graph?.nodes?.length ?? 0)) return { ok: false, msg: 'graph.nodes' };
	if ((a.graph?.edges?.length ?? 0) !== (b.graph?.edges?.length ?? 0)) return { ok: false, msg: 'graph.edges' };
	const topicNames = new Set([...Object.keys(a.topicInspectResults), ...Object.keys(b.topicInspectResults)]);
	for (const name of topicNames) {
		const ia = a.topicInspectResults[name] ?? [];
		const ib = b.topicInspectResults[name] ?? [];
		if (ia.length !== ib.length) return { ok: false, msg: `topicInspect[${name}]` };
		for (let j = 0; j < ia.length; j++) {
			if (ia[j].path !== ib[j].path || ia[j].title !== ib[j].title) return { ok: false, msg: `topicInspect[${name}][${j}]` };
		}
	}
	const expandTopics = new Set([...Object.keys(a.topicAnalyzeResults), ...Object.keys(b.topicAnalyzeResults)]);
	for (const name of expandTopics) {
		const qaA = a.topicAnalyzeResults[name] ?? [];
		const qaB = b.topicAnalyzeResults[name] ?? [];
		if (qaA.length !== qaB.length) return { ok: false, msg: `topicAnalyze[${name}]` };
		for (let j = 0; j < qaA.length; j++) {
			if (qaA[j].question !== qaB[j].question || qaA[j].answer !== qaB[j].answer) return { ok: false, msg: `topicAnalyze[${name}][${j}]` };
		}
	}
	if (a.dashboardBlocks.length !== b.dashboardBlocks.length) return { ok: false, msg: 'dashboardBlocks.length' };
	if (JSON.stringify(a.v2ProcessLog ?? []) !== JSON.stringify(b.v2ProcessLog ?? [])) return { ok: false, msg: 'v2ProcessLog' };
	if ((a.v2PlanOutline ?? '') !== (b.v2PlanOutline ?? '')) return { ok: false, msg: 'v2PlanOutline' };
	if ((a.v2ReportSections?.length ?? 0) !== (b.v2ReportSections?.length ?? 0)) return { ok: false, msg: 'v2ReportSections.length' };
	if ((a.v2GraphJson ?? '') !== (b.v2GraphJson ?? '')) return { ok: false, msg: 'v2GraphJson' };
	if (JSON.stringify(a.v2FollowUpQuestions ?? []) !== JSON.stringify(b.v2FollowUpQuestions ?? [])) return { ok: false, msg: 'v2FollowUpQuestions' };
	return { ok: true };
}

function testRoundtrip(name: string, markdown: string): boolean {
	console.log(`\n=== Test: ${name} ===`);
	try {
		const parsed = parse(markdown);
		console.log(`  Summary: ${parsed.summary ? 'Yes' : 'No'}`);
		console.log(`  Topics: ${parsed.topics.length}`);
		console.log(`  Sources: ${parsed.sources.length}`);
		console.log(`  Graph nodes: ${parsed.graph?.nodes?.length ?? 0}`);
		console.log(`  Topic expansions: ${Object.keys(parsed.topicAnalyzeResults).length}`);

		const rebuilt = buildMarkdown(parsed);
		const reparsed = parse(rebuilt);

		const result = docModelsEqual(parsed, reparsed);
		const passed = result.ok;
		console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}`);
		if (!passed) {
			console.log('Diff at:', result.msg);
		}
		return passed;
	} catch (error) {
		console.error(`\n❌ ERROR: ${error}`);
		if (error instanceof Error) console.error(error.stack);
		return false;
	}
}

function testBuildFromModel(name: string, docModel: AiSearchAnalysisDocModel): boolean {
	console.log(`\n=== Test: ${name} ===`);
	try {
		const built = buildMarkdown(docModel);
		const parsed = parse(built);
		const result = docModelsEqual(docModel, parsed);
		const passed = result.ok;
		console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}`);
		if (!passed) console.log('Diff at:', result.msg);
		return passed;
	} catch (error) {
		console.error(`\n❌ ERROR: ${error}`);
		if (error instanceof Error) console.error(error.stack);
		return false;
	}
}

function testV2Roundtrip(): boolean {
	console.log('\n=== Test: V2 format round-trip ===');
	try {
		const md = readTestFile('v2-roundtrip.md');
		const parsed = parse(md);

		// V2-specific fields
		if (!parsed.v2ProcessLog) throw new Error('v2ProcessLog not parsed');
		if (parsed.v2ProcessLog.length !== 3) throw new Error(`v2ProcessLog.length: ${parsed.v2ProcessLog.length}, expected 3`);
		if (!parsed.v2PlanOutline) throw new Error('v2PlanOutline not parsed');
		if (!parsed.v2ReportSections || parsed.v2ReportSections.length !== 2) throw new Error(`v2ReportSections count: ${parsed.v2ReportSections?.length}, expected 2`);
		if (parsed.v2ReportSections[0].title !== '结构分析') throw new Error(`section title: ${parsed.v2ReportSections[0].title}`);
		if (!parsed.v2ReportSections[0].content.includes('82 个笔记')) throw new Error('section content missing');
		if (!parsed.v2GraphJson) throw new Error('v2GraphJson not parsed');
		if (!parsed.v2FollowUpQuestions || parsed.v2FollowUpQuestions.length !== 2) throw new Error(`followup count: ${parsed.v2FollowUpQuestions?.length}`);

		// Rebuild and verify structure preserved
		const rebuilt = buildMarkdown(parsed, { runAnalysisMode: 'vaultFull' });
		if (!rebuilt.includes('> [!abstract]- Process Log')) throw new Error('rebuilt missing Process Log');
		if (!rebuilt.includes('> [!note]- Analysis Plan')) throw new Error('rebuilt missing Analysis Plan');
		if (!rebuilt.includes('## 1. 结构分析')) throw new Error('rebuilt missing section heading');
		if (!rebuilt.includes('> [!tip]- Graph Data')) throw new Error('rebuilt missing Graph Data');
		if (!rebuilt.includes('> [!question] Follow-up Questions')) throw new Error('rebuilt missing Follow-up Questions');
		if (!rebuilt.includes('82 个笔记')) throw new Error('rebuilt missing section content');

		// Re-parse the rebuilt markdown to verify round-trip
		const reparsed = parse(rebuilt);
		if (reparsed.v2ProcessLog?.length !== 3) throw new Error('re-parsed processLog mismatch');
		if (reparsed.v2ReportSections?.length !== 2) throw new Error('re-parsed sections mismatch');
		if (reparsed.v2FollowUpQuestions?.length !== 2) throw new Error('re-parsed followup mismatch');
		if (!reparsed.v2PlanOutline) throw new Error('re-parsed v2PlanOutline missing');
		if (!reparsed.v2GraphJson) throw new Error('re-parsed v2GraphJson missing');

		console.log('  ✅ V2 round-trip passed');
		return true;
	} catch (e) {
		console.error(`  ❌ V2 round-trip FAILED: ${e}`);
		return false;
	}
}

console.log('Starting AiSearchAnalysisDoc tests...\n');
console.log('='.repeat(60));

let allPassed = true;

try {
	const md1 = readTestFile('case1-full-sections.md');
	allPassed = testRoundtrip('Case 1: Full sections', md1) && allPassed;
} catch (e) {
	console.error(`Failed to read case1: ${e}`);
	allPassed = false;
}

try {
	const md2 = readTestFile('case2-minimal.md');
	allPassed = testRoundtrip('Case 2: Minimal', md2) && allPassed;
} catch (e) {
	console.error(`Failed to read case2: ${e}`);
	allPassed = false;
}

try {
	const md3 = readTestFile('case3-mermaid-graph.md');
	allPassed = testRoundtrip('Case 3: Mermaid graph', md3) && allPassed;
} catch (e) {
	console.error(`Failed to read case3: ${e}`);
	allPassed = false;
}

try {
	const md4 = readTestFile('case4-sources-with-extras.md');
	allPassed = testRoundtrip('Case 4: Sources with extras', md4) && allPassed;
} catch (e) {
	console.error(`Failed to read case4: ${e}`);
	allPassed = false;
}

try {
	const md5 = readTestFile('case5-cjk-characters.md');
	allPassed = testRoundtrip('Case 5: CJK characters', md5) && allPassed;
} catch (e) {
	console.error(`Failed to read case5: ${e}`);
	allPassed = false;
}

try {
	allPassed = testV2Roundtrip() && allPassed;
} catch (e) {
	console.error(`V2 roundtrip failed: ${e}`);
	allPassed = false;
}

try {
	const docModel: AiSearchAnalysisDocModel = {
		version: 1,
		created: '2025-01-31T12:00:00.000Z',
		analysisStartedAtMs: 1738310400000,
		duration: 3000,
		usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
		summary: 'Test summary',
		query: 'test query',
		webEnabled: true,
		topics: [{ label: 'Topic A', weight: 1 }, { label: 'Topic B', weight: 2 }],
		dashboardBlocks: [],
		sources: [
			{
				id: 'replay:path1',
				path: 'path1.md',
				title: 'Title 1',
				reasoning: 'Reason',
				badges: ['a', 'b'],
				score: { physical: 80, semantic: 90, average: 85 },
			},
		],
		graph: {
			nodes: [{ id: 'n1', type: 'concept', title: 'Node1', attributes: {} }],
			edges: [{ id: 'e1', source: 'n1', target: 'n1', type: 'link', attributes: {} }],
		},
		topicInspectResults: { T1: [{ id: 'i1', type: 'markdown', title: 'Item', path: 'p.md', lastModified: 0 }] },
		topicAnalyzeResults: { T1: [{ question: 'Q?', answer: 'A' }] },
		topicGraphResults: {},
	};
	allPassed = testBuildFromModel('Case 6: Build from model', docModel) && allPassed;
} catch (e) {
	console.error(`Build from model failed: ${e}`);
	allPassed = false;
}

console.log('\n' + '='.repeat(60));
console.log(allPassed ? '\n✅ All tests PASSED' : '\n❌ Some tests FAILED');
process.exit(allPassed ? 0 : 1);
