// B7 IndexGraphPort — shape guard + implements test.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { IndexGraphPort } from '@/core/ports/IndexGraphPort';

const PORT_PATH = path.resolve(process.cwd(), 'src/core/ports/IndexGraphPort.ts');
const SERVICE_PATH = path.resolve(process.cwd(), 'src/service/search/index/indexService.ts');

const portSource = fs.readFileSync(PORT_PATH, 'utf8');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');

function testPortShape(): void {
	const required = [
		'runMobiusGlobalMaintenance(',
		'refreshMobiusAggregates(',
		'recomputeVaultPageRank(',
		'recomputeSemanticPageRank(',
		'rebuildSemanticEdgesForTenant(',
		'rebuildFolderHubStats(',
	];
	for (const m of required) {
		assert.ok(portSource.includes(m), `IndexGraphPort missing '${m}'`);
	}
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	// Non-graph maintenance surfaces belong to IndexMaintenancePort, not here.
	for (const forbidden of ['runPendingLlmIndexEnrichment(', 'runPendingVectorIndexEnrichment(', 'cleanupOrphanedSearchIndexData(', 'indexDocument(', 'getIndexStatus(']) {
		assert.ok(!stripped.includes(forbidden), `IndexGraphPort must not include '${forbidden}'`);
	}
	console.log('PASS: portShape');
}

function testPortBoundary(): void {
	// Boundary discipline: `core/ports/**` must not import from service/*.
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	assert.ok(!/from ['"]@\/service\//.test(stripped), 'IndexGraphPort must not import from @/service/*');
	assert.ok(!/from ['"]@\/app\//.test(stripped), 'IndexGraphPort must not import from @/app/*');
	assert.ok(!/from ['"]@\/ui\//.test(stripped), 'IndexGraphPort must not import from @/ui/*');
	console.log('PASS: portBoundary');
}

function testServiceImplementsPort(): void {
	assert.match(
		serviceSource,
		/class IndexService\s+implements[\s\S]*?IndexGraphPort/,
		'IndexService must declare `implements ... IndexGraphPort`',
	);
	console.log('PASS: serviceImplementsPort');
}

function testStubSatisfiesPort(): void {
	const stub: IndexGraphPort = {
		async runMobiusGlobalMaintenance(_tenants, _options) {
			// no-op
		},
		async refreshMobiusAggregates(_tenants, _options) {
			// no-op
		},
		async recomputeVaultPageRank(_tenants, _options) {
			// no-op
		},
		async recomputeSemanticPageRank(_tenants, _options) {
			// no-op
		},
		async rebuildSemanticEdgesForTenant(_tenants, _options) {
			// no-op
		},
		async rebuildFolderHubStats(_options) {
			// no-op
		},
	};
	assert.ok(stub, 'stub construction ok');
	console.log('PASS: stubSatisfiesPort');
}

testPortShape();
testPortBoundary();
testServiceImplementsPort();
testStubSatisfiesPort();
console.log('index-graph-port: all guards passed');
