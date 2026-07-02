// T3 shared helper guard.
//
// Locks the contract of `defaultClock` and `defaultIdFactory` so future
// capability runners can rely on:
//   - defaultClock().now() returns a number close to Date.now()
//   - defaultIdFactory(prefix) mints unique ids matching the shape
//     `<prefix>-<base36-timestamp>-<seq>` with strictly increasing seq.
//
// Also source-scans the file for the boundary rules:
//   - No imports from `@/app/*`, `@/ui/*`, `obsidian`, `zustand`, `react`,
//     or `better-sqlite3`.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { defaultClock, defaultIdFactory } from '@/service/run-envelope';

const HELPERS_PATH = path.resolve(
	process.cwd(),
	'src/service/run-envelope/helpers.ts',
);
const helpersSource = fs.readFileSync(HELPERS_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Rule 1 — helpers.ts imports only its local `./types`.
// ---------------------------------------------------------------------------

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	return out;
}

function testHelpersImportsAreLocal(): void {
	const specifiers = extractImportSpecifiers(helpersSource);
	for (const spec of specifiers) {
		assert.strictEqual(
			spec,
			'./types',
			`helpers.ts may only import from './types'; found '${spec}'`,
		);
	}
	console.log(`PASS: helpersImportsAreLocal (${specifiers.length} import(s) checked)`);
}

// ---------------------------------------------------------------------------
// Rule 2 — defaultClock.now() returns a fresh Date.now()-shaped number.
// ---------------------------------------------------------------------------

function testDefaultClockReturnsFreshNumber(): void {
	const clock = defaultClock();
	const t1 = clock.now();
	const t2 = clock.now();
	assert.ok(typeof t1 === 'number' && Number.isFinite(t1), 'clock.now() must return a finite number');
	assert.ok(t2 >= t1, 'clock.now() must be monotonic-nondecreasing');
	assert.ok(Math.abs(t1 - Date.now()) < 5000, 'clock.now() must be close to Date.now()');
	console.log('PASS: defaultClockReturnsFreshNumber');
}

// ---------------------------------------------------------------------------
// Rule 3 — defaultIdFactory mints unique ids in the documented shape.
// ---------------------------------------------------------------------------

function testDefaultIdFactoryShape(): void {
	const factory = defaultIdFactory('t3-test');
	const ids = [factory.next(), factory.next(), factory.next()];
	const shape = /^t3-test-[0-9a-z]+-\d+$/;
	for (const id of ids) {
		assert.match(id, shape, `id '${id}' does not match <prefix>-<base36>-<seq>`);
	}
	assert.strictEqual(new Set(ids).size, ids.length, 'ids must be unique');
	// Seq monotonic.
	const seqs = ids.map((id) => Number(id.split('-').at(-1)));
	assert.deepStrictEqual(seqs, [1, 2, 3], 'seq must be 1, 2, 3');
	console.log('PASS: defaultIdFactoryShape');
}

// ---------------------------------------------------------------------------
// Rule 4 — two independent factories have independent seqs.
// ---------------------------------------------------------------------------

function testFactoriesAreIndependent(): void {
	const a = defaultIdFactory('a');
	const b = defaultIdFactory('b');
	assert.strictEqual(a.next().endsWith('-1'), true);
	assert.strictEqual(a.next().endsWith('-2'), true);
	assert.strictEqual(b.next().endsWith('-1'), true, 'b factory must start its own seq');
	console.log('PASS: factoriesAreIndependent');
}

// ---------------------------------------------------------------------------

testHelpersImportsAreLocal();
testDefaultClockReturnsFreshNumber();
testDefaultIdFactoryShape();
testFactoriesAreIndependent();

console.log('run-envelope-helpers: all guards passed');
