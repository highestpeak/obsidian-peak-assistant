// T7 Vault Lint boundary guards.
//
// One test file, one rule: every `.ts` under `src/service/lint/`
// (including detectors in `signals/`) is forbidden from importing
// `@/app/*`, `@/ui/*`, `SqliteStoreManager`, or running
// `AppContext.getInstance` / `sqliteStoreManager` in live code. T6/T6R
// already locked down the engine and runtime files; T7 extends the
// same scan to every file under the capability tree.
//
// Comment-only references to retired old paths (for historical
// context) are allowed — the strip-comments pass keeps the guard
// stable across documentation rewrites.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const LINT_ROOT = path.resolve(process.cwd(), 'src/service/lint');
const SIGNALS_DIR = path.join(LINT_ROOT, 'signals');

interface SourceFile {
	relPath: string;
	source: string;
	code: string; // comments stripped
}

function listTypeScriptFiles(root: string): string[] {
	const out: string[] = [];
	function walk(dir: string): void {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && full.endsWith('.ts')) {
				out.push(full);
			}
		}
	}
	walk(root);
	return out;
}

function readSourceFiles(): SourceFile[] {
	return listTypeScriptFiles(LINT_ROOT).map((abs) => {
		const source = fs.readFileSync(abs, 'utf8');
		const code = source
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/[^\n]*/g, '');
		return {
			relPath: path.relative(process.cwd(), abs),
			source,
			code,
		};
	});
}

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push(m[1]!);
	return out;
}

function testTreeIsNonEmpty(): void {
	// Sanity: if the scan returns no files, the guard is silently
	// useless and would let regressions through.
	const files = readSourceFiles();
	assert.ok(
		files.length >= 10,
		`expected src/service/lint to contain at least 10 .ts files, found ${files.length}`,
	);
	console.log(`PASS: treeIsNonEmpty (${files.length} files scanned)`);
}

function testNoAppOrUiOrSqliteImportsAnywhere(): void {
	const files = readSourceFiles();
	const violations: string[] = [];
	for (const file of files) {
		for (const spec of extractImportSpecifiers(file.source)) {
			if (/^@\/app\//.test(spec)) {
				violations.push(`${file.relPath}: forbidden '@/app/' import '${spec}'`);
			}
			if (/^@\/ui\//.test(spec)) {
				violations.push(`${file.relPath}: forbidden '@/ui/' import '${spec}'`);
			}
			if (/SqliteStoreManager/.test(spec)) {
				violations.push(`${file.relPath}: forbidden SqliteStoreManager import '${spec}'`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(
			`T7 closure violated:\n  ${violations.join('\n  ')}`,
		);
	}
	console.log('PASS: noAppOrUiOrSqliteImportsAnywhere');
}

function testNoServiceLocatorUsageInLiveCode(): void {
	const files = readSourceFiles();
	const violations: string[] = [];
	// Match real service-locator CALLS rather than the bare symbol so
	// `VaultLintContract.ts` may still inventory historical sites as
	// string literals (e.g. `access: 'AppContext.getInstance().app...'`).
	// The contract file is exempt from these scans by name — it is
	// documentation, not runtime code.
	for (const file of files) {
		if (file.relPath.endsWith('VaultLintContract.ts')) continue;
		if (/AppContext\s*\.\s*getInstance\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: still calls AppContext.getInstance() in live code`);
		}
		if (/\bsqliteStoreManager\s*\./.test(file.code)) {
			violations.push(`${file.relPath}: still calls sqliteStoreManager.* in live code`);
		}
	}
	if (violations.length > 0) {
		assert.fail(
			`T7 closure violated:\n  ${violations.join('\n  ')}`,
		);
	}
	console.log('PASS: noServiceLocatorUsageInLiveCode');
}

function testSignalsDirectoryHasNoToolOrPortMisuse(): void {
	// Extra paranoia for `signals/`: detectors must not pull from the
	// graph inspector tool, must not declare module-level mutable
	// defaults, and must not import the ports file directly (they
	// receive the port through `LintScanContext.detectorContext`).
	const detectorFiles = listTypeScriptFiles(SIGNALS_DIR).map((abs) => ({
		relPath: path.relative(process.cwd(), abs),
		source: fs.readFileSync(abs, 'utf8'),
	}));
	const violations: string[] = [];
	for (const file of detectorFiles) {
		const specs = extractImportSpecifiers(file.source);
		for (const spec of specs) {
			if (/^@\/service\/tools\//.test(spec)) {
				violations.push(`${file.relPath}: detectors must not pull from '@/service/tools/' (graph inspector), found '${spec}'`);
			}
			if (/^@\/core\/storage\//.test(spec)) {
				violations.push(`${file.relPath}: detectors must not pull from '@/core/storage/' (sqlite), found '${spec}'`);
			}
			if (/^obsidian(\/.*)?$/.test(spec)) {
				violations.push(`${file.relPath}: detectors must not import Obsidian directly, found '${spec}'`);
			}
			if (/\/ports\/VaultLintPorts$/.test(spec)) {
				violations.push(`${file.relPath}: detectors must not import the ports file directly; receive the port via LintScanContext.detectorContext`);
			}
		}
		// Top-level `let` (module-level mutable state). Only flag lines
		// that start with `let` at column 0 — `let` inside a function
		// body (indented) is fine.
		for (const line of file.source.split(/\r?\n/)) {
			if (/^let\b/.test(line)) {
				violations.push(`${file.relPath}: top-level 'let' binding (module-level mutable state) — '${line.trim()}'`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T7 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log(`PASS: signalsDirectoryHasNoToolOrPortMisuse (${detectorFiles.length} detector file(s) scanned)`);
}

function testGetSemanticNeighborsImportIsConfinedToAppLayer(): void {
	// The free-function `getSemanticNeighbors` (defined in
	// `src/service/tools/search-graph-inspector/common.ts`) may only
	// be imported by the app-layer adapter
	// (`src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts`).
	// Anywhere in `src/service/lint/` is forbidden — detectors call
	// the SAME-NAMED method on `LintScanContext.detectorContext`,
	// which is intentional and distinct from importing the helper.
	const files = readSourceFiles();
	const violations: string[] = [];
	for (const file of files) {
		for (const spec of extractImportSpecifiers(file.source)) {
			if (/search-graph-inspector/.test(spec)) {
				violations.push(`${file.relPath}: forbidden import '${spec}' (graph inspector helpers)`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T7 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: getSemanticNeighborsImportIsConfinedToAppLayer');
}

function main(): void {
	testTreeIsNonEmpty();
	testNoAppOrUiOrSqliteImportsAnywhere();
	testNoServiceLocatorUsageInLiveCode();
	testSignalsDirectoryHasNoToolOrPortMisuse();
	testGetSemanticNeighborsImportIsConfinedToAppLayer();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
