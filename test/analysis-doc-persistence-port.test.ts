import assert from 'assert';
import fs from 'fs';
import path from 'path';

// T2C source-scan guard. This test does NOT run persistSessionToVault
// because that function reaches into AppContext, the vault adapter, the
// history service, and the EventBus; standing those up under Node would
// be larger than the T2C change itself. The job here is to lock the
// import boundary, the optional-reporter contract, the fallback-notice
// resilience, and the "no new module-level mutable defaults" rule.

const PERSIST_PATH = path.resolve(
	process.cwd(),
	'src/service/search/analysisDocPersistence.ts',
);

const PORT_PATH = path.resolve(
	process.cwd(),
	'src/service/ports/ProgressReporterPort.ts',
);

function readPersist(): string { return fs.readFileSync(PERSIST_PATH, 'utf8'); }
function readPort(): string { return fs.readFileSync(PORT_PATH, 'utf8'); }

function testFileDoesNotImportConcreteNoticeFromObsidian(): void {
	const source = readPersist();
	const re = /import\s+(?:type\s+)?\{[^}]*\bNotice\b[^}]*\}\s+from\s+['"]obsidian['"]/m;
	assert.ok(
		!re.test(source),
		'analysisDocPersistence.ts must not import `Notice` from obsidian',
	);
	console.log('PASS: fileDoesNotImportConcreteNoticeFromObsidian');
}

function testFileDoesNotConstructNoticeDirectly(): void {
	const source = readPersist();
	assert.ok(
		!/\bnew\s+Notice\b/.test(source),
		'analysisDocPersistence.ts must not call `new Notice(...)`',
	);
	console.log('PASS: fileDoesNotConstructNoticeDirectly');
}

function testFileHasZeroObsidianImports(): void {
	const source = readPersist();
	const importRe = /import\s+(?:type\s+)?[^;]*?\s+from\s+['"]obsidian['"]/g;
	const hits = source.match(importRe) ?? [];
	assert.strictEqual(
		hits.length,
		0,
		`analysisDocPersistence.ts must have zero obsidian imports after T2C; found: ${JSON.stringify(hits)}`,
	);
	console.log('PASS: fileHasZeroObsidianImports');
}

function testFileImportsProgressReporterPort(): void {
	const source = readPersist();
	assert.ok(
		/from\s+['"]@\/service\/ports\/ProgressReporterPort['"]/.test(source),
		'analysisDocPersistence.ts must import ProgressReporterPort (T2C reuse contract)',
	);
	console.log('PASS: fileImportsProgressReporterPort');
}

function testFileDoesNotImportObsidianAdapterDirectly(): void {
	const source = readPersist();
	assert.ok(
		!/ObsidianProgressReporter/.test(source),
		'analysisDocPersistence.ts must not reference ObsidianProgressReporter; the port is the only allowed boundary',
	);
	console.log('PASS: fileDoesNotImportObsidianAdapterDirectly');
}

function testOptionsExposeOptionalProgressReporter(): void {
	const source = readPersist();
	// Match `progressReporter?: ProgressReporterPort` inside the options
	// object literal type, tolerating line breaks between fields.
	const re = /progressReporter\?\s*:\s*ProgressReporterPort/;
	assert.ok(
		re.test(source),
		'persistSessionToVault options must expose an optional progressReporter: ProgressReporterPort field',
	);
	console.log('PASS: optionsExposeOptionalProgressReporter');
}

function testFallbackNoticeIsWrappedInTryCatch(): void {
	const source = readPersist();
	// Look for the literal fallback message and confirm the enclosing
	// statement is inside a try/catch with a console.warn in the catch.
	const idx = source.indexOf("'Auto-save: saved to vault root (configured folder failed).'");
	assert.notStrictEqual(idx, -1, 'fallback notice text must still exist in the source');
	// Search backwards for the nearest `try {` before idx, then forwards
	// for the matching `catch (`.
	const before = source.slice(0, idx);
	const tryIdx = before.lastIndexOf('try {');
	assert.notStrictEqual(tryIdx, -1, 'fallback notice must be inside a try { … } block');
	const after = source.slice(idx);
	const catchRe = /\}\s*catch\s*\((?:e|err|_)\)\s*\{[^}]*console\.warn\([^)]*fallback notice skipped/;
	assert.ok(
		catchRe.test(after),
		'fallback notice must be guarded by `catch (e) { console.warn("[…] fallback notice skipped:", e) }` so notification failure cannot break persistence',
	);
	console.log('PASS: fallbackNoticeIsWrappedInTryCatch');
}

function testFallbackMessageTextAndTimeoutPreserved(): void {
	const source = readPersist();
	assert.ok(
		source.includes("'Auto-save: saved to vault root (configured folder failed).'"),
		'fallback message wording must be preserved verbatim',
	);
	// The fallback message text itself contains literal parens
	// ("(configured folder failed)"), so a naive `[^)]*` regex would
	// halt before reaching the timeout argument. Use a non-greedy
	// "anything but a statement terminator" run instead.
	assert.ok(
		/reporter\.show\([^;]*?5000\s*\)/.test(source),
		'fallback notice timeout must remain 5000ms',
	);
	console.log('PASS: fallbackMessageTextAndTimeoutPreserved');
}

function testFileDoesNotIntroduceNewModuleLevelMutableDefault(): void {
	const source = readPersist();
	// Forbid any `let default…` declaration at module scope in this file.
	// T2A's existing `let defaultReporter` lives in ProgressReporterPort.ts;
	// T2C must NOT copy that pattern.
	const re = /^\s*let\s+default[A-Z][A-Za-z0-9_]*\b/m;
	assert.ok(
		!re.test(source),
		'analysisDocPersistence.ts must not declare a new `let default…` module-level mutable default (forbidden by T2C handoff)',
	);
	console.log('PASS: fileDoesNotIntroduceNewModuleLevelMutableDefault');
}

function testPortFileHasNoModuleLevelMutableDefault(): void {
	const source = readPort();
	// T11X-F retired the T2A `defaultReporter` compromise: the port file
	// must now have ZERO module-level mutable defaults. The concrete
	// reporter is owned by the app layer (`AppContext.progressReporter`)
	// and threaded through constructor / options injection.
	const matches = source.match(/^\s*(?:let|var)\s+default[A-Z][A-Za-z0-9_]*\b/gm) ?? [];
	assert.strictEqual(
		matches.length,
		0,
		`ProgressReporterPort.ts must declare zero module-level mutable default reporters; found ${matches.length}: ${JSON.stringify(matches)}`,
	);
	assert.ok(
		!/setDefaultProgressReporter|getDefaultProgressReporter|clearDefaultProgressReporter/.test(source),
		'ProgressReporterPort.ts must not export set/get/clear default reporter functions (retired in T11X-F)',
	);
	console.log('PASS: portFileHasNoModuleLevelMutableDefault');
}

function stripCommentsAndStrings(source: string): string {
	// Strip /* … */ block comments first (greedy across lines).
	let out = source.replace(/\/\*[\s\S]*?\*\//g, '');
	// Then strip // line comments.
	out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
	return out;
}

function testPersistenceFileDoesNotImportAppContext(): void {
	const source = readPersist();
	// Service → app boundary: the file must not pull in the app shell at
	// runtime. Historical migration notes that mention "AppContext" in
	// JSDoc/comments are fine; what matters is the absence of any import
	// or runtime access. Strip comments before matching so the
	// "(was AppContext.getInstance().settings.search)" T11J migration
	// note doesn't trip the runtime-access guard.
	const importRe = /import\s+(?:type\s+)?[^;]*?\s+from\s+['"]@\/app\//;
	assert.ok(
		!importRe.test(source),
		'analysisDocPersistence.ts must not import any `@/app/*` module (service → app boundary)',
	);
	const code = stripCommentsAndStrings(source);
	assert.ok(
		!/\bAppContext\b/.test(code),
		'analysisDocPersistence.ts must not reference AppContext in executable code (comments are fine)',
	);
	console.log('PASS: persistenceFileDoesNotImportAppContext');
}

try {
	testFileDoesNotImportConcreteNoticeFromObsidian();
	testFileDoesNotConstructNoticeDirectly();
	testFileHasZeroObsidianImports();
	testFileImportsProgressReporterPort();
	testFileDoesNotImportObsidianAdapterDirectly();
	testOptionsExposeOptionalProgressReporter();
	testFallbackNoticeIsWrappedInTryCatch();
	testFallbackMessageTextAndTimeoutPreserved();
	testFileDoesNotIntroduceNewModuleLevelMutableDefault();
	testPortFileHasNoModuleLevelMutableDefault();
	testPersistenceFileDoesNotImportAppContext();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
