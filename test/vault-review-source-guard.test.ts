// T9 Vault Review boundary guards.
//
// One test file, six rules:
//   1. Every `.ts` under `src/service/copilot/vault/` is forbidden from
//      importing `@/app/context/AppContext`,
//      `@/core/storage/sqlite/SqliteStoreManager`, or calling
//      `AppContext.getInstance` / `sqliteStoreManager.*` in live code.
//   2. Every `.ts` under `src/service/copilot/vault/` is forbidden
//      from importing the concrete Obsidian runtime symbols `Notice`,
//      `TFile`, or `TFolder` as values. Type-only imports
//      (`import type { App } from 'obsidian'`) are allowed because
//      TypeScript erases them at runtime.
//   3. Production code must not call the retired
//      `getVaultReviewReportService()` singleton in live code. The
//      symbol no longer exists; this guard catches reintroductions.
//   4. Production UI under `src/ui/view/copilot/` must not import
//      `runVaultReview`, `listClusterMembers`, or
//      `getVaultReviewReportService` directly. UI flows must go
//      through `AppContext.tryGetVaultReviewRuntime()`.
//   5. The retired module global `_singleton` (in the old
//      `VaultReviewReportService`) must not reappear in service code.
//   6. The retired module global `_cached` fingerprint store (in the
//      old `VaultFingerprintService`) must not reappear in service
//      code.
//
// Comment-only references to retired old paths (for historical
// context) are allowed — the strip-comments pass keeps the guard
// stable across documentation rewrites.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const SERVICE_VAULT_ROOT = path.resolve(process.cwd(), 'src/service/copilot/vault');
const APP_VAULT_ROOT = path.resolve(process.cwd(), 'src/app/copilot/vault');
const UI_COPILOT_ROOT = path.resolve(process.cwd(), 'src/ui/view/copilot');

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

function extractImportSpecifiers(source: string): Array<{ spec: string; clause: string }> {
	const out: Array<{ spec: string; clause: string }> = [];
	const re = /import\s+([\s\S]*?)from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push({ clause: m[1]!.trim(), spec: m[2]! });
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push({ clause: '', spec: m[1]! });
	return out;
}

function testTreeIsNonEmpty(): void {
	const service = readFiles(SERVICE_VAULT_ROOT);
	const app = readFiles(APP_VAULT_ROOT);
	assert.ok(
		service.length >= 6,
		`expected src/service/copilot/vault to contain at least 6 .ts files, found ${service.length}`,
	);
	assert.ok(
		app.length >= 5,
		`expected src/app/copilot/vault to contain at least 5 .ts files, found ${app.length}`,
	);
	console.log(`PASS: treeIsNonEmpty (service ${service.length}, app ${app.length})`);
}

function testServiceVaultHasNoAppContextOrSqliteImports(): void {
	const files = readFiles(SERVICE_VAULT_ROOT);
	const violations: string[] = [];
	for (const file of files) {
		for (const { spec } of extractImportSpecifiers(file.source)) {
			if (/@\/app\/context\/AppContext/.test(spec)) {
				violations.push(`${file.relPath}: forbidden AppContext import '${spec}'`);
			}
			if (/SqliteStoreManager/.test(spec)) {
				violations.push(`${file.relPath}: forbidden SqliteStoreManager import '${spec}'`);
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T9 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceVaultHasNoAppContextOrSqliteImports');
}

function testServiceVaultHasNoConcreteObsidianValueImports(): void {
	const files = readFiles(SERVICE_VAULT_ROOT);
	const violations: string[] = [];
	const bannedValueSymbols = ['Notice', 'TFile', 'TFolder'];
	for (const file of files) {
		for (const { clause, spec } of extractImportSpecifiers(file.source)) {
			if (spec !== 'obsidian') continue;
			// Type-only imports (`import type { App } from 'obsidian'`)
			// erase at runtime — no concrete coupling. Allow them.
			if (/^type\b/.test(clause)) continue;
			for (const symbol of bannedValueSymbols) {
				const re = new RegExp(`(^|[\\s{,])${symbol}([\\s,}]|$)`);
				if (re.test(clause)) {
					violations.push(`${file.relPath}: forbidden value import '${symbol}' from 'obsidian'`);
				}
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T9 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceVaultHasNoConcreteObsidianValueImports');
}

function testServiceVaultHasNoServiceLocatorUsageInLiveCode(): void {
	const files = readFiles(SERVICE_VAULT_ROOT);
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
		assert.fail(`T9 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceVaultHasNoServiceLocatorUsageInLiveCode');
}

function testNoRetiredReportSingletonInLiveCode(): void {
	// Scan every .ts / .tsx under src + main.ts for live references
	// to the retired `getVaultReviewReportService()` helper. Comment-
	// only references are allowed and stripped. `test/` is not
	// scanned — historical fixtures may name old symbols.
	const roots = [
		path.resolve(process.cwd(), 'src'),
		path.resolve(process.cwd(), 'main.ts'),
	];
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
		if (/\bgetVaultReviewReportService\s*\(/.test(file.code)) {
			violations.push(`${file.relPath}: live call to getVaultReviewReportService()`);
		}
	}
	if (violations.length > 0) {
		assert.fail(`T9 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: noRetiredReportSingletonInLiveCode');
}

function testUiCopilotDoesNotImportRetiredEntryPoints(): void {
	const files = readFiles(UI_COPILOT_ROOT);
	const violations: string[] = [];
	for (const file of files) {
		for (const { clause, spec } of extractImportSpecifiers(file.source)) {
			if (!spec.startsWith('@/service/copilot/vault/')) continue;
			// Type-only re-exports (e.g. `import type { VaultReviewHistoryRecord }`)
			// stay legal — the runtime forbids value access, not type
			// access.
			if (/^type\b/.test(clause)) continue;
			for (const banned of ['runVaultReview', 'listClusterMembers', 'getVaultReviewReportService']) {
				const re = new RegExp(`(^|[\\s{,])${banned}([\\s,}]|$)`);
				if (re.test(clause)) {
					violations.push(`${file.relPath}: forbidden value import '${banned}' from '${spec}'`);
				}
			}
		}
	}
	if (violations.length > 0) {
		assert.fail(`T9 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: uiCopilotDoesNotImportRetiredEntryPoints');
}

function testServiceVaultHasNoModuleLevelMutableGlobals(): void {
	const files = readFiles(SERVICE_VAULT_ROOT);
	const violations: string[] = [];
	// The retired report singleton lived at `let _singleton: VaultReviewReportService | null = null;`.
	// The retired fingerprint cache lived at `let _cached: VaultFingerprint | null = null;`.
	// Both names should be absent from service-side live code.
	for (const file of files) {
		if (/\blet\s+_singleton\b/.test(file.code)) {
			violations.push(`${file.relPath}: retired module global '_singleton' reappeared`);
		}
		if (/\blet\s+_cached\b/.test(file.code)) {
			violations.push(`${file.relPath}: retired module global '_cached' reappeared`);
		}
	}
	if (violations.length > 0) {
		assert.fail(`T9 closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceVaultHasNoModuleLevelMutableGlobals');
}

function main(): void {
	testTreeIsNonEmpty();
	testServiceVaultHasNoAppContextOrSqliteImports();
	testServiceVaultHasNoConcreteObsidianValueImports();
	testServiceVaultHasNoServiceLocatorUsageInLiveCode();
	testNoRetiredReportSingletonInLiveCode();
	testUiCopilotDoesNotImportRetiredEntryPoints();
	testServiceVaultHasNoModuleLevelMutableGlobals();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
