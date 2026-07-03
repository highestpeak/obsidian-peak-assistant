// B2.graph — devtools cleanupGraphTable routes through runGraphCleanup.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const DEVTOOLS_PATH = path.resolve(process.cwd(), 'src/app/context/devtools.ts');
const source = fs.readFileSync(DEVTOOLS_PATH, 'utf8');

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function testDevtoolsImportsRunner(): void {
	assert.ok(
		source.includes(`from '@/service/search/index/maintenance/GraphCleanupRun'`),
		'devtools.ts must import runGraphCleanup from GraphCleanupRun',
	);
	console.log('PASS: devtoolsImportsRunner');
}

function testCleanupCallGoesThroughEnvelope(): void {
	const stripped = stripComments(source);
	assert.match(
		stripped,
		/w\.cleanupGraphTable\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?runGraphCleanup\s*\(\s*\{[\s\S]*?cleaner:\s*graphCleanupService[\s\S]*?trigger:\s*['"]manual['"][\s\S]*?\}\s*\)/,
		'w.cleanupGraphTable must dispatch through runGraphCleanup({ cleaner, trigger: "manual" })',
	);
	// The raw `.run()` shortcut must not survive.
	assert.ok(
		!/graphCleanupService\.run\s*\(\s*\)\s*;?\s*\}/.test(stripped),
		'devtools.ts must NOT return `graphCleanupService.run()` directly — the RunEnvelope wrapper is required',
	);
	console.log('PASS: cleanupCallGoesThroughEnvelope');
}

testDevtoolsImportsRunner();
testCleanupCallGoesThroughEnvelope();
console.log('b2-graph-wire-in: all guards passed');
