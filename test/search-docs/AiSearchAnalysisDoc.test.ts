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
