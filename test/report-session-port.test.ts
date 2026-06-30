// T11I source-scan guard for the ReportOrchestrator / ReportSessionPort
// extraction. The orchestrator must accept a ReportSessionPort in its
// constructor, must call it (not the Zustand store) for all
// section/summary mutations, and must not import the UI store under
// any path.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const ORCH = path.resolve(ROOT, 'src/service/agents/report/ReportOrchestrator.ts');
const PORT = path.resolve(ROOT, 'src/core/ports/ReportSessionPort.ts');
const ADAPTER = path.resolve(ROOT, 'src/app/search/SearchSessionReportAdapter.ts');

function readNoComments(p: string): string {
	const src = fs.readFileSync(p, 'utf8');
	return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function testPortFileExists(): void {
	assert.ok(fs.existsSync(PORT), 'ReportSessionPort.ts must exist');
	const src = readNoComments(PORT);
	for (const fn of ['getUserInsights', 'getPlanSections', 'setPlanSections', 'updatePlanSection', 'appendSectionChunk', 'completeSectionContent', 'failSection', 'startSectionRegenerate', 'setSummaryStreaming', 'setSummary']) {
		assert.ok(src.includes(fn), `ReportSessionPort must declare ${fn}`);
	}
	console.log('PASS: portFileExposesAllMethods');
}

function testOrchestratorImportsPort(): void {
	const src = readNoComments(ORCH);
	assert.ok(
		/import\s+type\s+\{\s*ReportSessionPort\s*\}\s+from\s+['"]@\/core\/ports\/ReportSessionPort['"]/.test(src),
		'ReportOrchestrator must import ReportSessionPort',
	);
	console.log('PASS: orchestratorImportsPort');
}

function testOrchestratorHasNoUiImport(): void {
	const src = readNoComments(ORCH);
	assert.ok(
		!/from\s+['"]@\/ui\//.test(src),
		'ReportOrchestrator.ts must not import from @/ui/* (any subpath)',
	);
	console.log('PASS: orchestratorHasNoUiImport');
}

function testOrchestratorTakesPortInConstructor(): void {
	const src = readNoComments(ORCH);
	assert.ok(
		/constructor\([^)]*session:\s*ReportSessionPort/.test(src),
		'ReportOrchestrator constructor must accept `session: ReportSessionPort`',
	);
	console.log('PASS: orchestratorTakesPortInConstructor');
}

function testOrchestratorDoesNotCallStoreGetState(): void {
	const src = readNoComments(ORCH);
	assert.ok(
		!/useSearchSessionStore\.getState\(/.test(src),
		'ReportOrchestrator must not call useSearchSessionStore.getState() — go through the port',
	);
	console.log('PASS: orchestratorDoesNotCallStoreGetState');
}

function testAdapterExistsAndWrapsStore(): void {
	assert.ok(fs.existsSync(ADAPTER), 'SearchSessionReportAdapter.ts must exist');
	const src = readNoComments(ADAPTER);
	assert.ok(/useSearchSessionStore/.test(src), 'adapter must reference useSearchSessionStore');
	assert.ok(/implements\s+ReportSessionPort/.test(src), 'adapter must implement ReportSessionPort');
	console.log('PASS: adapterExistsAndWrapsStore');
}

try {
	testPortFileExists();
	testOrchestratorImportsPort();
	testOrchestratorHasNoUiImport();
	testOrchestratorTakesPortInConstructor();
	testOrchestratorDoesNotCallStoreGetState();
	testAdapterExistsAndWrapsStore();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
