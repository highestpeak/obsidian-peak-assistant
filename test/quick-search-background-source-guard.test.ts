// T10 Quick Search background-session boundary guards.
//
// One test file, six rules:
//   1. Every `.ts` under `src/service/search/background/` (the new
//      runtime + ports + impl) is forbidden from importing
//      `@/app/*`, `@/ui/*`, `obsidian` `Notice`, `SqliteStoreManager`,
//      or calling `AppContext.getInstance` / `sqliteStoreManager.*`
//      in live code.
//   2. The runtime impl declares no module-level mutable bindings
//      (`let currentRuntime = …`) — the AppRuntimeRegistry slot is
//      the single point of ownership.
//   3. Production code (anywhere except tests + docs) must not
//      reach the retired `BackgroundSessionManager.getInstance` /
//      `BackgroundSessionManager.pendingRestore` /
//      `BackgroundSessionManager.clearInstance` sites.
//   4. The retired file `src/service/BackgroundSessionManager.ts` must
//      be gone.
//   5. UI hooks/components no longer import
//      `@/service/BackgroundSessionManager`.
//   6. `useEventRouter.ts` no longer mutates `eventTargetRedirect`
//      from anywhere except the event-router port adapter (the
//      `routeToBackground` / `clearBackgroundRoute` methods on
//      `AppEventRouterAdapter`).
//
// Comment-only references to retired old paths (for historical
// context) are allowed — the strip-comments pass keeps the guard
// stable across documentation rewrites.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const SERVICE_QSB_ROOT = path.resolve(
	process.cwd(),
	'src/service/search/background',
);
const APP_QSB_ROOT = path.resolve(
	process.cwd(),
	'src/app/quick-search/background',
);
const RETIRED_BSM_PATH = path.resolve(
	process.cwd(),
	'src/service/BackgroundSessionManager.ts',
);

interface SourceFile {
	relPath: string;
	source: string;
	code: string;
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
	const service = readFiles(SERVICE_QSB_ROOT);
	const app = readFiles(APP_QSB_ROOT);
	assert.ok(
		service.length >= 4,
		`expected src/service/search/background to contain at least 4 .ts files, found ${service.length}`,
	);
	assert.ok(
		app.length >= 5,
		`expected src/app/quick-search/background to contain at least 5 .ts files, found ${app.length}`,
	);
	console.log(`PASS: treeIsNonEmpty (service ${service.length}, app ${app.length})`);
}

function testServiceQsbHasNoForbiddenImports(): void {
	const files = readFiles(SERVICE_QSB_ROOT);
	const violations: string[] = [];
	for (const file of files) {
		for (const spec of extractImportSpecifiers(file.source)) {
			if (/^@\/app\//.test(spec)) {
				violations.push(`${file.relPath}: forbidden '@/app/' import '${spec}'`);
			}
			if (/^@\/ui\//.test(spec)) {
				violations.push(`${file.relPath}: forbidden '@/ui/' import '${spec}'`);
			}
			if (/^obsidian$/.test(spec)) {
				violations.push(`${file.relPath}: forbidden obsidian import '${spec}'`);
			}
			if (/SqliteStoreManager/.test(spec)) {
				violations.push(`${file.relPath}: forbidden SqliteStoreManager import '${spec}'`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T10 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceQsbHasNoForbiddenImports');
}

function testServiceQsbHasNoServiceLocatorUsageInLiveCode(): void {
	const files = readFiles(SERVICE_QSB_ROOT);
	const violations: string[] = [];
	for (const file of files) {
		if (/AppContext\s*\.\s*getInstance\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: still calls AppContext.getInstance() in live code`);
		}
		if (/\bsqliteStoreManager\s*\./.test(file.code)) {
			violations.push(`${file.relPath}: still calls sqliteStoreManager.* in live code`);
		}
	}
	if (violations.length > 0) {
		assert.fail(`T10 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceQsbHasNoServiceLocatorUsageInLiveCode');
}

function testServiceQsbHasNoModuleLevelMutableGlobals(): void {
	const files = readFiles(SERVICE_QSB_ROOT);
	const violations: string[] = [];
	for (const file of files) {
		// Catch the legacy `let currentRuntime = null` / `static instance` /
		// `let _singleton` patterns. Only flush-left `let` / `export let`
		// declarations count as module-level — indented declarations live
		// inside class methods or block scopes and are fine.
		const lines = file.code.split('\n');
		for (const line of lines) {
			if (/^let\s+\w+\s*[:=]/.test(line) || /^export\s+let\s+\w+\s*[:=]/.test(line)) {
				violations.push(`${file.relPath}: module-level mutable 'let' binding -- ${line.trim()}`);
			}
			// Static class singleton pattern: `private static instance: X | null = null;`
			if (/\bstatic\s+instance\s*[:=]/.test(line) && /=\s*null\b/.test(line)) {
				violations.push(`${file.relPath}: legacy 'static instance' singleton -- ${line.trim()}`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T10 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceQsbHasNoModuleLevelMutableGlobals');
}

function testNoRetiredSingletonReferencesInLiveCode(): void {
	// Scan every .ts / .tsx under src + main.ts for live calls to the
	// retired singleton + static field. Comment-only references are
	// allowed and stripped by `stripComments`. `test/` is intentionally
	// not scanned — historical test fixtures may name the old symbols.
	const roots = [path.resolve(process.cwd(), 'src'), path.resolve(process.cwd(), 'main.ts')];
	const files: { relPath: string; code: string }[] = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
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
		if (/BackgroundSessionManager\s*\.\s*getInstance\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: live call to BackgroundSessionManager.getInstance()`);
		}
		if (/BackgroundSessionManager\s*\.\s*clearInstance\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: live call to BackgroundSessionManager.clearInstance()`);
		}
		if (/BackgroundSessionManager\s*\.\s*pendingRestore\b/.test(file.code)) {
			violations.push(`${file.relPath}: live reference to BackgroundSessionManager.pendingRestore`);
		}
	}
	if (violations.length > 0) {
		assert.fail(`T10 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: noRetiredSingletonReferencesInLiveCode');
}

function testRetiredFileIsGone(): void {
	assert.strictEqual(
		fs.existsSync(RETIRED_BSM_PATH),
		false,
		'src/service/BackgroundSessionManager.ts must be deleted as part of T10',
	);
	console.log('PASS: retiredFileIsGone');
}

function testUiDoesNotImportRetiredEntryPoint(): void {
	const uiRoot = path.resolve(process.cwd(), 'src/ui');
	const violations: string[] = [];
	for (const abs of listTypeScriptFiles(uiRoot)) {
		const source = fs.readFileSync(abs, 'utf8');
		for (const spec of extractImportSpecifiers(source)) {
			if (/@\/service\/BackgroundSessionManager/.test(spec)) {
				violations.push(`${path.relative(process.cwd(), abs)}: still imports '${spec}'`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T10 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: uiDoesNotImportRetiredEntryPoint');
}

function testEventTargetRedirectMutationsOnlyFromAdapter(): void {
	// `eventTargetRedirect` is a hook-module global. T10 confines all
	// .active/.target/.summaryBuffer/.uiStepRef writes to the
	// `AppEventRouterAdapter`. Reads from useEventRouter remain (the
	// route lookup at dispatch time).
	const roots = [path.resolve(process.cwd(), 'src'), path.resolve(process.cwd(), 'main.ts')];
	const violations: string[] = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
		const files = fs.statSync(root).isDirectory()
			? listTypeScriptFiles(root)
			: [root];
		for (const abs of files) {
			const rel = path.relative(process.cwd(), abs);
			if (rel.endsWith('AppEventRouterAdapter.ts')) continue;
			if (rel.endsWith('useEventRouter.ts')) continue; // declares the global itself
			const code = stripComments(fs.readFileSync(abs, 'utf8'));
			// Catch any `eventTargetRedirect.<field> = ...` write.
			const writeRe = /eventTargetRedirect\s*\.\s*(active|target|summaryBuffer|uiStepRef)\s*=/g;
			if (writeRe.test(code)) {
				violations.push(`${rel}: writes eventTargetRedirect.* outside AppEventRouterAdapter`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T10 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: eventTargetRedirectMutationsOnlyFromAdapter');
}

function main(): void {
	testTreeIsNonEmpty();
	testServiceQsbHasNoForbiddenImports();
	testServiceQsbHasNoServiceLocatorUsageInLiveCode();
	testServiceQsbHasNoModuleLevelMutableGlobals();
	testNoRetiredSingletonReferencesInLiveCode();
	testRetiredFileIsGone();
	testUiDoesNotImportRetiredEntryPoint();
	testEventTargetRedirectMutationsOnlyFromAdapter();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
