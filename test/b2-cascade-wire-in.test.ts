// B2.cascade — CascadeWorker idle path routes through runCascadeDrain.
//
// Structural source-scan guard so a future refactor doesn't quietly
// drop the RunEnvelope by inlining `void this.drainDebtOnce()` back
// into the scheduler onIdle callback.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const WORKER_PATH = path.resolve(process.cwd(), 'src/service/search/index/cascade/CascadeWorker.ts');
const source = fs.readFileSync(WORKER_PATH, 'utf8');

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function testWorkerImportsRunner(): void {
	assert.ok(
		source.includes(`from './CascadeWorkerRun'`),
		'CascadeWorker.ts must import from ./CascadeWorkerRun',
	);
	assert.ok(
		source.includes('runCascadeDrain'),
		'CascadeWorker.ts must reference runCascadeDrain',
	);
	console.log('PASS: workerImportsRunner');
}

function testIdleCallbackGoesThroughEnvelope(): void {
	const stripped = stripComments(source);
	// The scheduler's onIdle must call `this.runIdleDrain()` (which
	// wraps drainDebtOnce with runCascadeDrain), NOT drainDebtOnce
	// directly.
	assert.match(
		stripped,
		/onIdle:\s*\(\)\s*=>\s*void\s+this\.runIdleDrain\s*\(/,
		'scheduler.onIdle must route through this.runIdleDrain() so the RunEnvelope is applied',
	);
	assert.ok(
		!/onIdle:\s*\(\)\s*=>\s*void\s+this\.drainDebtOnce\s*\(/.test(stripped),
		'scheduler.onIdle must NOT call drainDebtOnce directly — that bypasses the RunEnvelope',
	);
	console.log('PASS: idleCallbackGoesThroughEnvelope');
}

function testRunIdleDrainCallsRunCascadeDrain(): void {
	const stripped = stripComments(source);
	assert.match(
		stripped,
		/runIdleDrain[\s\S]*?runCascadeDrain\s*\(/,
		'runIdleDrain must invoke runCascadeDrain',
	);
	assert.match(
		stripped,
		/runCascadeDrain\s*\(\s*\{[\s\S]*?drain:\s*\(callbacks\)\s*=>\s*this\.drainDebtOnce\s*\(\s*callbacks\s*\)[\s\S]*?trigger:\s*['"]scheduled['"][\s\S]*?\}\s*\)/,
		'runCascadeDrain must be called with drain=this.drainDebtOnce and trigger="scheduled"',
	);
	console.log('PASS: runIdleDrainCallsRunCascadeDrain');
}

function testDrainDebtOnceIsReachableAndReturnsSummary(): void {
	const stripped = stripComments(source);
	assert.match(
		stripped,
		/async\s+drainDebtOnce\s*\([^)]*\)\s*:\s*Promise<CascadeDrainSummary>/,
		'drainDebtOnce must be typed to return Promise<CascadeDrainSummary>',
	);
	// summary tuple return.
	assert.match(
		stripped,
		/processedCount:\s*processedIds\.length[\s\S]*?affectedDocCount:\s*affectedDocIds\.size[\s\S]*?remainingCount:\s*remaining/,
		'drainDebtOnce must return { processedCount, affectedDocCount, remainingCount }',
	);
	console.log('PASS: drainDebtOnceIsReachableAndReturnsSummary');
}

testWorkerImportsRunner();
testIdleCallbackGoesThroughEnvelope();
testRunIdleDrainCallsRunCascadeDrain();
testDrainDebtOnceIsReachableAndReturnsSummary();
console.log('b2-cascade-wire-in: all guards passed');
