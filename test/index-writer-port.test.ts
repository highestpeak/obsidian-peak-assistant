// T8 IndexWriterPort — shape guard + implements test.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { IndexWriterPort, OnAfterIndexMutation } from '@/core/ports/IndexWriterPort';

const PORT_PATH = path.resolve(process.cwd(), 'src/core/ports/IndexWriterPort.ts');
const SERVICE_PATH = path.resolve(process.cwd(), 'src/service/search/index/indexService.ts');

const portSource = fs.readFileSync(PORT_PATH, 'utf8');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');

function testPortShape(): void {
	const required = [
		'indexDocument(',
		'deleteDocuments(',
		'clearAllIndexData(',
		'renameDocumentPath(',
		'addMaintenanceDebt(',
	];
	for (const m of required) {
		assert.ok(portSource.includes(m), `IndexWriterPort missing '${m}'`);
	}
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	for (const forbidden of ['getIndexStatus(', 'runMobiusGlobalMaintenance(']) {
		assert.ok(!stripped.includes(forbidden), `IndexWriterPort must not include '${forbidden}'`);
	}
	console.log('PASS: portShape');
}

function testServiceImplementsPort(): void {
	assert.match(
		serviceSource,
		/class IndexService\s+implements\s+[^{]*IndexWriterPort/,
		'IndexService must declare `implements ... IndexWriterPort`',
	);
	console.log('PASS: serviceImplementsPort');
}

function testStubSatisfiesPort(): void {
	const calls: string[] = [];
	const onAfter: OnAfterIndexMutation = (types) => {
		calls.push(types.join(','));
	};
	const stub: IndexWriterPort = {
		async indexDocument(_docPath, _settings, _indexOptions, _preloadedDocument) {
			calls.push('index');
		},
		async deleteDocuments(_paths, onAfterMutation) {
			onAfterMutation?.(['sqlite', 'graph']);
		},
		async clearAllIndexData(onAfterMutation) {
			onAfterMutation?.(['sqlite']);
		},
		async renameDocumentPath(_oldPath, _newPath) {
			return true;
		},
		async addMaintenanceDebt(_tenant, _delta) {
			calls.push('debt');
		},
	};
	void stub.deleteDocuments(['a.md'], onAfter);
	assert.ok(true, 'stub construction ok');
	console.log('PASS: stubSatisfiesPort');
}

testPortShape();
testServiceImplementsPort();
testStubSatisfiesPort();
console.log('index-writer-port: all guards passed');
