// T8 IndexMaintenancePort — shape guard + implements test.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { IndexMaintenancePort } from '@/core/ports/IndexMaintenancePort';

const PORT_PATH = path.resolve(process.cwd(), 'src/core/ports/IndexMaintenancePort.ts');
const SERVICE_PATH = path.resolve(process.cwd(), 'src/service/search/index/indexService.ts');

const portSource = fs.readFileSync(PORT_PATH, 'utf8');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');

function testPortShape(): void {
	const required = [
		'cleanupOrphanedSearchIndexData(',
		'runMobiusGlobalMaintenance(',
		'runPendingLlmIndexEnrichment(',
		'runPendingVectorIndexEnrichment(',
		'clearPendingLlmFlags(',
	];
	for (const m of required) {
		assert.ok(portSource.includes(m), `IndexMaintenancePort missing '${m}'`);
	}
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	for (const forbidden of ['indexDocument(', 'getIndexStatus(']) {
		assert.ok(!stripped.includes(forbidden), `IndexMaintenancePort must not include '${forbidden}'`);
	}
	console.log('PASS: portShape');
}

function testServiceImplementsPort(): void {
	assert.match(
		serviceSource,
		/class IndexService\s+implements\s+[^{]*IndexMaintenancePort/,
		'IndexService must declare `implements ... IndexMaintenancePort`',
	);
	assert.match(
		serviceSource,
		/llmTelemetry\.snapshot = ev;/,
		'a document LLM completion receipt must retain its produced/partial/failed status before Scan derives progress or usage',
	);
	assert.match(
		serviceSource,
		/new LlmEnrichmentProgressTracker\(settings, ai, options\?\.llmRoute\)/,
		'Scan LLM planning and cost telemetry must use the exact per-operation route instead of the global Agent slot',
	);
	assert.ok(
		serviceSource.indexOf('plan = await tracker.planForMarkdownDoc(chars);') > serviceSource.indexOf('const t0 = Date.now();\n\t\t\t\ttry {'),
		'per-document planning failures must be captured as terminal attempts instead of unhandled worker rejections',
	);
	console.log('PASS: serviceImplementsPort');
}

function testStubSatisfiesPort(): void {
	const stub: IndexMaintenancePort = {
		async cleanupOrphanedSearchIndexData() {
			return { metaFts: 0, fts: 0, chunks: 0, embeddings: 0, graphNodes: 0 };
		},
		async runMobiusGlobalMaintenance(_tenants, _options) {
			// no-op
		},
		async runPendingLlmIndexEnrichment(_settings, _options) {
			return { processed: 0, skippedWrongTenant: 0, errors: [] };
		},
		async runPendingVectorIndexEnrichment(_settings, _options) {
			return { processed: 0, skippedWrongTenant: 0, errors: [] };
		},
		async clearPendingLlmFlags() {
			return { cleared: 0 };
		},
	};
	assert.ok(stub, 'stub construction ok');
	console.log('PASS: stubSatisfiesPort');
}

testPortShape();
testServiceImplementsPort();
testStubSatisfiesPort();
console.log('index-maintenance-port: all guards passed');
