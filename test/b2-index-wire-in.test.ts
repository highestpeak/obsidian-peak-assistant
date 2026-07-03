// B2.index — main.ts routes startup IndexInitializer through runIndexInitializer.
//
// The runner + fixtures already have thorough coverage
// (`index-initializer-run.test.ts`). This guard exists to prevent
// regressions where the wire-in in main.ts drifts back to the raw
// `this.indexInitializer.checkAndUpdateIndex()` call — that pattern
// would skip the RunEnvelope, so startup latency / failures would
// stop showing up in the run trace.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const MAIN_TS_PATH = path.resolve(process.cwd(), 'main.ts');
const source = fs.readFileSync(MAIN_TS_PATH, 'utf8');

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function testMainImportsRunIndexInitializer(): void {
	assert.ok(
		source.includes(`from '@/service/search/index/indexInitializerRun'`)
		|| source.includes(`'@/service/search/index/indexInitializerRun'`),
		'main.ts must reach for runIndexInitializer from indexInitializerRun',
	);
	console.log('PASS: mainImportsRunIndexInitializer');
}

function testMainCallsRunIndexInitializer(): void {
	const stripped = stripComments(source);
	assert.match(
		stripped,
		/runIndexInitializer\s*\(\s*\{[\s\S]*?initializer:\s*this\.indexInitializer[\s\S]*?trigger:\s*['"]startup['"][\s\S]*?\}\s*\)/,
		'main.ts must call runIndexInitializer({ initializer: this.indexInitializer, trigger: "startup" })',
	);
	console.log('PASS: mainCallsRunIndexInitializer');
}

function testMainDoesNotBypassEnvelope(): void {
	// The raw call would drop the RunEnvelope. If someone re-adds it
	// without going through `runIndexInitializer`, this guard fires.
	const stripped = stripComments(source);
	assert.ok(
		!/this\.indexInitializer\.checkAndUpdateIndex\s*\(/.test(stripped),
		'main.ts must NOT call `this.indexInitializer.checkAndUpdateIndex()` directly — go through runIndexInitializer so the RunEnvelope stays intact',
	);
	console.log('PASS: mainDoesNotBypassEnvelope');
}

testMainImportsRunIndexInitializer();
testMainCallsRunIndexInitializer();
testMainDoesNotBypassEnvelope();
console.log('b2-index-wire-in: all guards passed');
