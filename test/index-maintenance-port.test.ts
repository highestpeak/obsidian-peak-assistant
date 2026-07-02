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
