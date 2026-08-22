// T8 IndexReaderPort — shape guard + implements test.
//
// Locks the read-only slice of IndexService behind a port so future T8
// slices can carve out writer / graph / maintenance without breaking
// consumers.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { IndexReaderPort } from '@/core/ports/IndexReaderPort';

const PORT_PATH = path.resolve(process.cwd(), 'src/core/ports/IndexReaderPort.ts');
const SERVICE_PATH = path.resolve(process.cwd(), 'src/service/search/index/indexService.ts');

const portSource = fs.readFileSync(PORT_PATH, 'utf8');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Rule 1 — Port declares the three read methods, no mutators.
// ---------------------------------------------------------------------------

function testPortShape(): void {
	const required = ['getIndexStatus(', 'countIndexedDocuments(', 'getTenantForPath(', 'isMobiusMaintenanceRecommended('];
	for (const m of required) {
		assert.ok(portSource.includes(m), `IndexReaderPort missing method '${m}'`);
	}
	// No writer methods.
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	for (const forbidden of ['indexDocument(', 'deleteDocuments(', 'clearAllIndexData(', 'runMobiusGlobalMaintenance(']) {
		assert.ok(!stripped.includes(forbidden), `IndexReaderPort must not include writer '${forbidden}'`);
	}
	console.log('PASS: portShape');
}

// ---------------------------------------------------------------------------
// Rule 2 — IndexService declares `implements IndexReaderPort`.
// ---------------------------------------------------------------------------

function testServiceImplementsPort(): void {
	assert.match(
		serviceSource,
		/class IndexService\s+implements\s+IndexReaderPort/,  // may be followed by comma-separated ports; regex is anchored on `IndexReaderPort`.
		'IndexService must declare `implements IndexReaderPort`',
	);
	assert.match(serviceSource, /offset \+= 400/, 'current Vault coverage must batch paths below SQLite variable limits');
	console.log('PASS: serviceImplementsPort');
}

// ---------------------------------------------------------------------------
// Rule 3 — a stub implementing the port can be passed via the port type
// (proves the interface is complete + type-checkable without a real
// IndexService instance).
// ---------------------------------------------------------------------------

function testStubSatisfiesPort(): void {
	const stub: IndexReaderPort = {
		async getIndexStatus() {
			return { indexBuiltAt: 1234, indexedDocs: 42, isReady: true };
		},
		async countIndexedDocuments(paths) {
			return new Set(paths).size;
		},
		getTenantForPath(_path: string) {
			return 'vault' as const;
		},
		async isMobiusMaintenanceRecommended() {
			return false;
		},
	};
	// Runtime probe.
	assert.strictEqual(stub.getTenantForPath('/x/y.md'), 'vault');
	console.log('PASS: stubSatisfiesPort');
}

// ---------------------------------------------------------------------------

testPortShape();
testServiceImplementsPort();
testStubSatisfiesPort();
console.log('index-reader-port: all guards passed');
