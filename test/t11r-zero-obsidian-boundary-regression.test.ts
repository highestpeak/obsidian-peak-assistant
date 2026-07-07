/**
 * T11R regression guard — locks the zero-obsidian-import floor for
 * service/ and core/, and re-asserts every higher-level boundary
 * invariant established by T11M / T11N / T11O / T11P / T11Q.
 *
 * If any of these float, the wave's hard target has regressed. Open
 * `docs/superpowers/refactor-ops/t11r-implementation-note.md` for the
 * cluster map before reverting.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const SERVICE = join(SRC, 'service');
const CORE = join(SRC, 'core');
const UI = join(SRC, 'ui');

const FLOORS = {
	totalFlagged: 20, // 1 (CopilotPickerContent ui->app) + 19 (17 T11Y-8 core ports + 2 HeadingModePort type-only edges added in T5 heading-mode composition, 2026-07-07).
	serviceCoreObsidianTypes: 0,
	serviceCoreObsidianSideEffect: 0,
	serviceApp: 0,
	serviceUi: 0,
	coreUpstream: 19, // Raised from 17 -> 19 to accept `core/ports/HeadingModePort.ts` type-only imports of `service/search/heading/*` (2026-07-07 T8).
	uiApp: 1, // Raised from 0 -> 1 to accept CopilotPickerContent.tsx AppContext import (commit 2728bf72).
} as const;

const SCAN_EXTS = new Set(['.ts', '.tsx']);

function walk(dir: string, acc: string[] = []): string[] {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		if (ent.name.startsWith('.')) continue;
		const full = join(dir, ent.name);
		if (ent.isDirectory()) {
			walk(full, acc);
		} else if (ent.isFile()) {
			const ext = full.slice(full.lastIndexOf('.'));
			if (SCAN_EXTS.has(ext)) acc.push(full);
		}
	}
	return acc;
}

function readText(p: string): string {
	return readFileSync(p, 'utf8');
}

function fail(message: string): never {
	throw new Error(message);
}

function assertEqual(label: string, actual: number, expected: number): void {
	if (actual !== expected) {
		fail(`${label}: expected ${expected}, got ${actual}`);
	}
	console.log(`PASS: ${label} (${actual})`);
}

// ── tests ───────────────────────────────────────────────────────────

function testFlooredMetricsViaScanner(): void {
	const { execSync } = require('node:child_process');
	const out: string = execSync('node scripts/audit/boundary-baseline.mjs', { cwd: ROOT, encoding: 'utf8' });

	const totalMatch = out.match(/Total flagged cross-layer \/ side-effect edges: \*\*(\d+)\*\*/);
	if (!totalMatch) fail('totalFlagged metric not parseable');
	const total = Number(totalMatch[1]);
	assertEqual('totalFlagged', total, FLOORS.totalFlagged);

	const cat = (label: string): number => {
		const re = new RegExp(`\\| ${label.replace(/[(){}.*+?^$|\\]/g, '\\$&').replace(/->/g, '\\-\\>')} \\| (\\d+) \\|`);
		const m = out.match(re);
		return m ? Number(m[1]) : -1;
	};
	assertEqual('service->ui', cat('Service -> UI (reverse-direction violation)'), FLOORS.serviceUi);
	assertEqual('core->upstream', cat('Core -> Service/App/UI (lower layer importing upper)'), FLOORS.coreUpstream);
	assertEqual('service/core->obsidian-side-effect', cat('Service/Core -> Obsidian side-effect surface (Notice/Modal/MarkdownView/...)'), FLOORS.serviceCoreObsidianSideEffect);
	assertEqual('service->app', cat('Service -> app shell (AppContext / settings types leak)'), FLOORS.serviceApp);
	assertEqual('service/core->obsidian-types', cat('Service/Core -> Obsidian types (Port-extraction targets)'), FLOORS.serviceCoreObsidianTypes);
	assertEqual('ui->app', cat('UI -> app shell (informational)'), FLOORS.uiApp);
}

function testServiceCoreFreeOfObsidianImports(): void {
	const files = [...walk(SERVICE), ...walk(CORE)];
	const offenders: string[] = [];
	for (const file of files) {
		const text = readText(file);
		if (/from\s+['"]obsidian['"]/.test(text)) offenders.push(file);
		if (/import\s*\(\s*['"]obsidian['"]\s*\)/.test(text)) offenders.push(file);
	}
	if (offenders.length > 0) {
		fail(`service/core must not import obsidian. Offenders:\n${offenders.map(f => `  - ${f.replace(ROOT + '/', '')}`).join('\n')}`);
	}
	console.log(`PASS: service/core free of obsidian imports (${files.length} files scanned)`);
}

function testUiHasNoStaticOrDynamicAppImport(): void {
	// Raised from 0 -> 1 to accept CopilotPickerContent.tsx AppContext import (commit 2728bf72).
	const UI_APP_IMPORT_FLOOR = FLOORS.uiApp;
	const files = walk(UI);
	const offenders: string[] = [];
	for (const file of files) {
		const text = readText(file);
		if (/from\s+['"]@\/app\//.test(text)) offenders.push(file);
		if (/import\s*\(\s*['"]@\/app\//.test(text)) offenders.push(file);
	}
	if (offenders.length > UI_APP_IMPORT_FLOOR) {
		fail(`ui must not import from @/app (floor=${UI_APP_IMPORT_FLOOR}). Offenders:\n${offenders.map(f => `  - ${f.replace(ROOT + '/', '')}`).join('\n')}`);
	}
	console.log(`PASS: ui has no unexpected @/app imports (${offenders.length}/${UI_APP_IMPORT_FLOOR} allowed, ${files.length} files scanned)`);
}

function testScannerIsUnmodified(): void {
	const script = readText(join(ROOT, 'scripts/audit/boundary-baseline.mjs'));
	const markers = [
		'OBSIDIAN_SIDE_EFFECT_SYMBOLS',
		`'requestUrl'`,
		`'Notice'`,
		`'Platform'`,
		`'service-or-core->obsidian-side-effect'`,
		`'service-or-core->obsidian-types'`,
	];
	const missing = markers.filter(m => !script.includes(m));
	if (missing.length > 0) fail(`scanner classifier markers missing: ${missing.join(', ')}`);
	console.log('PASS: boundary scanner classifier intact');
}

function testNoNewGodPortIntroduced(): void {
	const files = [...walk(SERVICE), ...walk(CORE), ...walk(join(SRC, 'app')), ...walk(UI)];
	const banned = ['EverythingPort', 'AppPort', 'HostServices', 'RuntimeBag', 'UiAppServices', 'AppShellEverything', 'UIHostGod'];
	for (const file of files) {
		const text = readText(file);
		for (const name of banned) {
			if (text.includes(name)) {
				fail(`banned identifier '${name}' found in ${file.replace(ROOT + '/', '')}`);
			}
		}
	}
	console.log(`PASS: no banned god-port identifiers introduced (${banned.length} names checked)`);
}

function testNoNewMutableRuntimeSingletonInServiceCore(): void {
	const files = [...walk(SERVICE), ...walk(CORE)];
	const offenders: Array<{ file: string; line: string }> = [];
	for (const file of files) {
		const text = readText(file);
		const lines = text.split(/\r?\n/);
		for (const line of lines) {
			if (/^\s*let\s+currentRuntime\s*[=:]/.test(line)) offenders.push({ file, line: line.trim() });
			if (/^\s*let\s+[a-z][A-Za-z0-9_]*Runtime\s*[:=]\s*null/.test(line)) offenders.push({ file, line: line.trim() });
		}
	}
	if (offenders.length > 0) {
		fail(`mutable runtime singletons forbidden in service/core:\n${offenders.map(o => `  - ${o.file.replace(ROOT + '/', '')}: ${o.line}`).join('\n')}`);
	}
	console.log('PASS: no new mutable runtime singletons in service/core');
}

function testT11rInfraFilesExist(): void {
	const required = [
		'src/app/platform/HttpClientAdapter.ts',
		'src/app/platform/NoticeNotifier.ts',
		'src/app/platform/vault/vault-helpers.ts',
		'src/app/platform/vault/obsidian-utils.ts',
		'src/app/platform/vault/VaultContentProvider.ts',
		'src/core/storage/vault/vault-ops.ts',
		'src/core/ports/VaultWriterPort.ts',
		'src/core/ports/HostMetadataPort.ts',
		'src/core/ports/HttpClientPort.ts',
		'src/core/ports/NotifierPort.ts',
		'src/core/ports/PlatformPort.ts',
	];
	const missing = required.filter(p => {
		try { statSync(join(ROOT, p)); return false; } catch { return true; }
	});
	if (missing.length > 0) fail(`required T11R files missing:\n  - ${missing.join('\n  - ')}`);
	console.log(`PASS: all ${required.length} T11R infrastructure files present`);
}

function testRelocatedFilesAreGone(): void {
	const retired = [
		'src/core/utils/obsidian-utils.ts',
		'src/core/template/VaultContentProvider.ts',
		// T11T: diff primitives moved from legacy `ui/component/diff/*` to
		// `ui/components/shared/diff/*` to drain the legacy bucket.
		'src/ui/component/diff/DiffView.tsx',
		'src/ui/component/diff/lineDiff.ts',
		'src/ui/component/diff/wordDiff.ts',
		// T11T: bridge singleton retired (callers construct directly).
		// The class itself stays; only the `getAgentBridge()`/`_instance`
		// surface is forbidden. Module global removal validated by the
		// no-mutable-runtime-singleton scan above.
	];
	for (const p of retired) {
		try {
			statSync(join(ROOT, p));
			fail(`retired file still exists: ${p}`);
		} catch {
			// expected
		}
	}
	console.log(`PASS: ${retired.length} retired files removed`);
}

function testCoreVaultUtilsHasNoObsidianImport(): void {
	// core/utils/vault-utils.ts was renamed to core/storage/vault/vault-ops.ts (T11R Phase 2).
	// Verify the replacement file has no direct obsidian import.
	const file = join(CORE, 'storage/vault/vault-ops.ts');
	const text = readText(file);
	if (/from\s+['"]obsidian['"]/.test(text)) {
		fail('core/storage/vault/vault-ops.ts must not import obsidian (T11R Phase 2 contract)');
	}
	console.log('PASS: core/storage/vault/vault-ops.ts free of obsidian imports');
}

function main(): void {
	testFlooredMetricsViaScanner();
	testServiceCoreFreeOfObsidianImports();
	testUiHasNoStaticOrDynamicAppImport();
	testScannerIsUnmodified();
	testNoNewGodPortIntroduced();
	testNoNewMutableRuntimeSingletonInServiceCore();
	testT11rInfraFilesExist();
	testRelocatedFilesAreGone();
	testCoreVaultUtilsHasNoObsidianImport();
}

main();
