import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Source-scan guard for T2B. This test does NOT exercise indexing logic at
// runtime (that would require faking IndexService, SqliteStoreManager,
// DocumentLoaderManager, and Obsidian's App, which is intentionally out of
// T2B scope per docs/superpowers/refactor-ops/t2b-index-initializer-progress-reporter-handoff.md).
// Its job is to prove the import boundary stays clean as T2B intended.

const INDEX_INITIALIZER_PATH = path.resolve(
	process.cwd(),
	'src/service/search/index/indexInitializer.ts',
);

function readSource(): string {
	return fs.readFileSync(INDEX_INITIALIZER_PATH, 'utf8');
}

function testFileDoesNotImportConcreteNoticeFromObsidian(): void {
	const source = readSource();
	// Reject any `import { ... Notice ... } from 'obsidian'` regardless of
	// the `type` keyword, multi-line braces, or other co-imported symbols.
	const re = /import\s+(?:type\s+)?\{[^}]*\bNotice\b[^}]*\}\s+from\s+['"]obsidian['"]/m;
	assert.ok(
		!re.test(source),
		'indexInitializer.ts must not import `Notice` from obsidian (T2B contract)',
	);
	console.log('PASS: fileDoesNotImportConcreteNoticeFromObsidian');
}

function testFileDoesNotConstructNoticeDirectly(): void {
	const source = readSource();
	const re = /\bnew\s+Notice\b/;
	assert.ok(
		!re.test(source),
		'indexInitializer.ts must not call `new Notice(...)` (T2B contract)',
	);
	console.log('PASS: fileDoesNotConstructNoticeDirectly');
}

function testTypeOnlyAppImportFromObsidianIsStillAllowed(): void {
	const source = readSource();
	// T11R Phase 2: the obsidian App import was migrated to the AppHandle port.
	// We now assert the port-based App import is present instead.
	// Previously checked: import type { App } from 'obsidian'
	// Now checks: import type { AppHandle as App } from '@/core/ports/AppHandle'
	const re = /import\s+type\s+\{[^}]*\bAppHandle\b[^}]*\}\s+from\s+['"]@\/core\/ports\/AppHandle['"]/m;
	assert.ok(
		re.test(source),
		'indexInitializer.ts is expected to import AppHandle (as App) from @/core/ports/AppHandle (T11R Phase 2 port migration)',
	);
	console.log('PASS: typeOnlyAppImportFromObsidianIsStillAllowed');
}

function testFileImportsProgressReporterPort(): void {
	const source = readSource();
	const re = /from\s+['"]@\/service\/ports\/ProgressReporterPort['"]/;
	assert.ok(
		re.test(source),
		'indexInitializer.ts must import ProgressReporterPort (T2B reuse contract)',
	);
	console.log('PASS: fileImportsProgressReporterPort');
}

function testFileDoesNotImportObsidianAdapterDirectly(): void {
	const source = readSource();
	// Service code is forbidden from importing app-layer adapters; the
	// reporter must always come through the port (constructor arg or the
	// module-level default).
	const re = /ObsidianProgressReporter/;
	assert.ok(
		!re.test(source),
		'indexInitializer.ts must not reference ObsidianProgressReporter; the port is the only allowed boundary',
	);
	console.log('PASS: fileDoesNotImportObsidianAdapterDirectly');
}

function testPrivateOpenPipelineNoticeHelperIsRemoved(): void {
	const source = readSource();
	// The legacy private helper folded its native-setMessage heuristic into
	// ObsidianProgressReporter.setMessage in T2B. The helper itself must no
	// longer exist in this file.
	assert.ok(
		!/\bopenPipelineNotice\b/.test(source),
		'indexInitializer.ts must no longer declare or call openPipelineNotice (T2B helper deletion)',
	);
	console.log('PASS: privateOpenPipelineNoticeHelperIsRemoved');
}

function testReporterShowReplacedAllNoticeCallSites(): void {
	const source = readSource();
	const showCount = (source.match(/this\.reporter\.show\(/g) ?? []).length;
	// 17 one-shot replacements + 3 long-running pipeline replacements
	// (Mobius maintenance, Step 2/4 vector pipeline, Step 2/2 fast-path
	// graph maintenance) = 20 reporter.show calls. The exact count is the
	// closest cheap proxy for "all sites were ported and none were missed".
	assert.strictEqual(
		showCount,
		20,
		`expected 20 this.reporter.show(...) calls in indexInitializer.ts after T2B, found ${showCount}`,
	);
	console.log('PASS: reporterShowReplacedAllNoticeCallSites');
}

function testIndexProgressTrackerConstructionAlwaysPassesReporter(): void {
	const source = readSource();
	const trackerCtorRe = /new\s+IndexProgressTracker\s*\([^)]*\)/g;
	const ctorCalls = source.match(trackerCtorRe) ?? [];
	assert.ok(
		ctorCalls.length > 0,
		'IndexInitializer is expected to construct IndexProgressTracker at least once',
	);
	for (const call of ctorCalls) {
		// this.reporter may be first or last arg depending on the constructor signature.
		assert.ok(
			/\(\s*this\.reporter[\s,]|,\s*this\.reporter\s*\)/.test(call),
			`IndexProgressTracker construction must pass this.reporter as an argument; found: ${call}`,
		);
	}
	console.log(`PASS: indexProgressTrackerConstructionAlwaysPassesReporter (${ctorCalls.length} construction site(s) checked)`);
}

function testConstructorAcceptsOptionalProgressReporterPort(): void {
	const source = readSource();
	// T2B originally planned reporter as optional (?); the parameter was later
	// promoted to required (all callers now pass it). Accept either form.
	const re = /constructor\([^)]*reporter\??:\s*ProgressReporterPort/s;
	assert.ok(
		re.test(source),
		'IndexInitializer constructor must accept a ProgressReporterPort parameter (T2B reuse-not-replace wiring)',
	);
	console.log('PASS: constructorAcceptsOptionalProgressReporterPort');
}

try {
	testFileDoesNotImportConcreteNoticeFromObsidian();
	testFileDoesNotConstructNoticeDirectly();
	testTypeOnlyAppImportFromObsidianIsStillAllowed();
	testFileImportsProgressReporterPort();
	testFileDoesNotImportObsidianAdapterDirectly();
	testPrivateOpenPipelineNoticeHelperIsRemoved();
	testReporterShowReplacedAllNoticeCallSites();
	testIndexProgressTrackerConstructionAlwaysPassesReporter();
	testConstructorAcceptsOptionalProgressReporterPort();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
