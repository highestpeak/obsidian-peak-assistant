// T8 Ambient boundary guards.
//
// One test file, four rules:
//   1. Every `.ts` under `src/service/ambient/` is forbidden from
//      importing `@/app/*`, `@/ui/*`, `SqliteStoreManager`,
//      `@/core/storage/sqlite/SqliteStoreManager`, or calling
//      `AppContext.getInstance` / `sqliteStoreManager.*` in live code.
//   2. `src/ui/store/ambientPushStore.ts` no longer imports sqlite.
//   3. Production code (anywhere except this test file) must not reach
//      the retired `AmbientPushService.getInstance` /
//      `MorningBriefingService.getInstance` singleton sites.
//   4. No `(window as any).app` anywhere under `src/service/ambient`,
//      `src/app/ambient`, or `src/ui/{store,view}` Ambient code.
//
// Comment-only references to retired old paths (for historical
// context) are allowed — the strip-comments pass keeps the guard
// stable across documentation rewrites.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const SERVICE_AMBIENT_ROOT = path.resolve(process.cwd(), 'src/service/ambient');
const APP_AMBIENT_ROOT = path.resolve(process.cwd(), 'src/app/ambient');
const AMBIENT_PUSH_STORE = path.resolve(
	process.cwd(),
	'src/ui/store/ambientPushStore.ts',
);

interface SourceFile {
	relPath: string;
	source: string;
	code: string; // comments stripped
}

function listTypeScriptFiles(root: string): string[] {
	const out: string[] = [];
	function walk(dir: string): void {
		if (!fs.existsSync(dir)) return;
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
				out.push(full);
			}
		}
	}
	walk(root);
	return out;
}

function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
}

function readFiles(root: string): SourceFile[] {
	return listTypeScriptFiles(root).map((abs) => {
		const source = fs.readFileSync(abs, 'utf8');
		return {
			relPath: path.relative(process.cwd(), abs),
			source,
			code: stripComments(source),
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
	const service = readFiles(SERVICE_AMBIENT_ROOT);
	const app = readFiles(APP_AMBIENT_ROOT);
	assert.ok(
		service.length >= 5,
		`expected src/service/ambient to contain at least 5 .ts files, found ${service.length}`,
	);
	assert.ok(
		app.length >= 5,
		`expected src/app/ambient to contain at least 5 .ts files, found ${app.length}`,
	);
	console.log(`PASS: treeIsNonEmpty (service ${service.length}, app ${app.length})`);
}

function testServiceAmbientHasNoAppOrUiOrSqliteImports(): void {
	const files = readFiles(SERVICE_AMBIENT_ROOT);
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
		assert.fail(`T8 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceAmbientHasNoAppOrUiOrSqliteImports');
}

function testServiceAmbientHasNoServiceLocatorUsageInLiveCode(): void {
	const files = readFiles(SERVICE_AMBIENT_ROOT);
	const violations: string[] = [];
	for (const file of files) {
		if (/AppContext\s*\.\s*getInstance\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: still calls AppContext.getInstance() in live code`);
		}
		if (/\bsqliteStoreManager\s*\./.test(file.code)) {
			violations.push(`${file.relPath}: still calls sqliteStoreManager.* in live code`);
		}
		// The static-class accessors that pre-T8 lived on
		// `AppContext` itself would also be forbidden here, but we
		// scan them via the import guard above; this section catches
		// the direct getInstance / locator calls in case of future
		// regression.
	}
	if (violations.length > 0) {
		assert.fail(`T8 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceAmbientHasNoServiceLocatorUsageInLiveCode');
}

function testAmbientPushStoreDoesNotImportSqlite(): void {
	const source = fs.readFileSync(AMBIENT_PUSH_STORE, 'utf8');
	const code = stripComments(source);
	const violations: string[] = [];
	for (const spec of extractImportSpecifiers(source)) {
		if (/SqliteStoreManager/.test(spec)) {
			violations.push(`ambientPushStore.ts: forbidden SqliteStoreManager import '${spec}'`);
		}
	}
	if (/\bsqliteStoreManager\s*\./.test(code)) {
		violations.push(
			'ambientPushStore.ts: still calls sqliteStoreManager.* in live code',
		);
	}
	if (violations.length > 0) {
		assert.fail(`T8 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: ambientPushStoreDoesNotImportSqlite');
}

function testNoRetiredSingletonReferencesInLiveCode(): void {
	// Scan every .ts / .tsx under src + main.ts for live calls to the
	// retired singletons. Comment-only references are allowed and
	// stripped by `stripComments`. `test/` is intentionally not
	// scanned — historical test fixtures may name the old symbols.
	const roots = [path.resolve(process.cwd(), 'src'), path.resolve(process.cwd(), 'main.ts')];
	const files: { relPath: string; code: string }[] = [];
	for (const root of roots) {
		if (fs.statSync(root).isDirectory()) {
			for (const abs of listTypeScriptFiles(root)) {
				files.push({
					relPath: path.relative(process.cwd(), abs),
					code: stripComments(fs.readFileSync(abs, 'utf8')),
				});
			}
		} else {
			files.push({
				relPath: path.relative(process.cwd(), root),
				code: stripComments(fs.readFileSync(root, 'utf8')),
			});
		}
	}

	const violations: string[] = [];
	for (const file of files) {
		if (/AmbientPushService\s*\.\s*getInstance\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: live call to AmbientPushService.getInstance()`);
		}
		if (/MorningBriefingService\s*\.\s*getInstance\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: live call to MorningBriefingService.getInstance()`);
		}
	}
	if (violations.length > 0) {
		assert.fail(`T8 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: noRetiredSingletonReferencesInLiveCode');
}

function testNoWindowAsAnyAppInAmbientCode(): void {
	const roots = [
		SERVICE_AMBIENT_ROOT,
		APP_AMBIENT_ROOT,
		path.resolve(process.cwd(), 'src/ui/view/ambient-push'),
		path.resolve(process.cwd(), 'src/ui/view/morning-briefing'),
		path.resolve(process.cwd(), 'src/ui/store'),
	];
	const violations: string[] = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
		for (const abs of listTypeScriptFiles(root)) {
			const file = {
				relPath: path.relative(process.cwd(), abs),
				code: stripComments(fs.readFileSync(abs, 'utf8')),
			};
			// `ambientPushStore.ts`, `morningBriefingStore.ts`, and
			// the gutter widget are the historical hotspots. Anywhere
			// reaching `(window as any).app` again should fail this
			// scan in live code; the comment-stripped form catches
			// regressions cleanly.
			if (/\(window\s+as\s+any\)\s*\.\s*app/.test(file.code)) {
				violations.push(`${file.relPath}: live (window as any).app reference`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T8 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: noWindowAsAnyAppInAmbientCode');
}

function main(): void {
	testTreeIsNonEmpty();
	testServiceAmbientHasNoAppOrUiOrSqliteImports();
	testServiceAmbientHasNoServiceLocatorUsageInLiveCode();
	testAmbientPushStoreDoesNotImportSqlite();
	testNoRetiredSingletonReferencesInLiveCode();
	testNoWindowAsAnyAppInAmbientCode();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
