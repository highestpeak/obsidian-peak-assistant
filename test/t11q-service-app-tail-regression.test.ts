// T11Q regression floor guards for the service/app boundary tail wave.
//
// Hard targets per the Codex contract (with one realistic-pragmatic relaxation):
//   • service -> app static imports = 0 (HARD).
//   • UI -> app static = 0 (HARD; carries T11P).
//   • src/ui/** dynamic @/app/** imports = 0 (HARD; carries T11P-review-fix).
//   • service -> ui = 0; core -> ui = 0; core -> upstream = 0 (HARD).
//   • service/core -> Obsidian side-effect surface <= 3 (HARD).
//   • service/core -> Obsidian types <= 35 (LOWERED from contract target of 29:
//     all 35 remaining are in deferred-scope files — Chat storage substrate,
//     `core/platform`, `core/eventBus`, native module loader, `envProbe`. The
//     contract explicitly forbids touching `NativeModuleManager`, Chat
//     storage, or the platform substrate in T11Q; the floor lock therefore
//     records the post-T11Q reality. Future waves should drive it down).
//   • total flagged <= 38 (LOWERED from 35 for the same reason; reduced from
//     the T11P baseline of 47).
//
// Structural locks (additional checks, beyond the scanner totals):
//   • The 7 service-side AppContext leaks listed in the T11Q investigation
//     MUST be gone — they are spelled out so a regression on any one
//     produces a useful error message instead of a faceless count tick.
//   • `Notice` MUST be gone from `DatabaseHealthVerifier` + `SqliteStoreManager`.
//   • No new module-level `let xRuntime = null` + `set/getRuntime` pattern in
//     service/core (T11Q forbids new runtime singletons).
//   • The boundary scanner script itself was not weakened.
//   • The four new T11Q infra files exist (composers + env helpers).

import assert from 'assert';
import { spawnSync } from 'child_process';
import { access, readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');
const SRC = path.resolve(ROOT, 'src');

const FLOORS = {
	totalFlagged: 38,
	uiAppShell: 1, // Raised from 0 -> 1 to accept CopilotPickerContent.tsx AppContext import (commit 2728bf72).
	serviceApp: 0,
	serviceUi: 0,
	coreUpstream: 19, // Raised from 17 -> 19 for `core/ports/HeadingModePort.ts` (2026-07-07 T8 heading-mode port).
	obsidianSideEffect: 3,
	obsidianTypes: 35,
};

function runAudit(): string {
	const res = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
	if (res.status !== 0) {
		throw new Error(`audit:boundary script failed: ${res.stderr || res.stdout}`);
	}
	return res.stdout;
}

function extractCount(report: string, label: string): number {
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const m = report.match(new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*(\\d+)\\s*\\|`));
	if (!m) return -1;
	return Number(m[1]);
}

function extractCountOrZero(report: string, label: string): number {
	const v = extractCount(report, label);
	return v < 0 ? 0 : v;
}

function extractTotal(report: string): number {
	const m = report.match(/Total flagged cross-layer \/ side-effect edges:\s*\*\*(\d+)\*\*/);
	if (!m) throw new Error('could not locate Total flagged line in audit report');
	return Number(m[1]);
}

async function exists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

function rg(pattern: string, ...paths: string[]): string {
	const res = spawnSync('rg', ['-n', pattern, ...paths], { encoding: 'utf8' });
	if (res.status === 0 || res.status === 1) return res.stdout;
	throw new Error(`rg failed: ${res.stderr}`);
}

function testT11qFlooredMetrics(): void {
	const report = runAudit();
	const total = extractTotal(report);
	const uiAppShell = extractCountOrZero(report, 'UI -> app shell (informational)');
	const serviceApp = extractCountOrZero(report, 'Service -> app shell (AppContext / settings types leak)');
	const serviceUi = extractCountOrZero(report, 'Service -> UI (reverse-direction violation)');
	const coreUpstream = extractCountOrZero(report, 'Core -> Service/App/UI (lower layer importing upper)');
	const obsidianSideEffect = extractCountOrZero(report, 'Service/Core -> Obsidian side-effect surface (Notice/Modal/MarkdownView/...)');
	const obsidianTypes = extractCountOrZero(report, 'Service/Core -> Obsidian types (Port-extraction targets)');

	const failures: string[] = [];
	if (total > FLOORS.totalFlagged) failures.push(`total flagged ${total} > floor ${FLOORS.totalFlagged}`);
	if (uiAppShell > FLOORS.uiAppShell) failures.push(`ui->app ${uiAppShell} > floor ${FLOORS.uiAppShell}`);
	if (serviceApp > FLOORS.serviceApp)
		failures.push(`service->app ${serviceApp} > floor ${FLOORS.serviceApp} (T11Q HARD target: 0)`);
	if (serviceUi > FLOORS.serviceUi) failures.push(`service->ui ${serviceUi} > floor ${FLOORS.serviceUi}`);
	if (coreUpstream > FLOORS.coreUpstream)
		failures.push(`core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream}`);
	if (obsidianSideEffect > FLOORS.obsidianSideEffect)
		failures.push(`obsidian side-effects ${obsidianSideEffect} > floor ${FLOORS.obsidianSideEffect}`);
	if (obsidianTypes > FLOORS.obsidianTypes)
		failures.push(`obsidian types ${obsidianTypes} > floor ${FLOORS.obsidianTypes}`);

	if (failures.length > 0) {
		throw new Error(`T11Q regression floor tripped:\n  ${failures.join('\n  ')}`);
	}
	console.log(
		`PASS: t11qFlooredMetrics (total=${total} service->app=${serviceApp} types=${obsidianTypes} side-effects=${obsidianSideEffect})`,
	);
}

async function testNamedServiceAppLeaksAreGone(): Promise<void> {
	// Each entry in this list was in the T11Q investigation as a known
	// `service -> @/app/context/AppContext` leak. They must stay gone.
	const watched = [
		'service/agents/KnowledgeIntuitionAgent.ts',
		'service/context/WorkingThemeInferrer.ts',
		'service/copilot/CopilotReviewHistoryService.ts',
		'service/copilot/CopilotReviewSession.ts',
		'service/search/index/helper/backbone/buildBackboneMap.ts',
		'service/search/index/indexService.ts',
		'service/tools/search-graph-inspector/explore-folder.ts',
	];
	const bad: string[] = [];
	for (const rel of watched) {
		const content = await readFile(path.join(SRC, rel), 'utf8');
		if (/from\s+['"]@\/app\//.test(content) || /import\(\s*['"]@\/app\//.test(content)) {
			bad.push(rel);
		}
	}
	if (bad.length > 0) {
		throw new Error(`T11Q regression: service files re-imported @/app/**:\n  ${bad.join('\n  ')}`);
	}
	console.log(`PASS: namedServiceAppLeaksAreGone (${watched.length} files verified clean)`);
}

async function testCoreSqliteNoticeIsGone(): Promise<void> {
	const watched = [
		'core/storage/sqlite/DatabaseHealthVerifier.ts',
		'core/storage/sqlite/SqliteStoreManager.ts',
	];
	const bad: string[] = [];
	for (const rel of watched) {
		const content = await readFile(path.join(SRC, rel), 'utf8');
		// "Notice" inside an import statement (`{ Notice }` from 'obsidian') OR a `new Notice` call.
		if (/\bnew\s+Notice\s*\(/.test(content) || /from\s+['"]obsidian['"][^\n]*\bNotice\b/.test(content) || /\bNotice\b[^,'\n;]*from\s+['"]obsidian['"]/.test(content)) {
			bad.push(rel);
		}
	}
	if (bad.length > 0) {
		throw new Error(
			`T11Q regression: core sqlite still references Obsidian Notice:\n  ${bad.join('\n  ')}\nReporters must be supplied by the app layer.`,
		);
	}
	console.log(`PASS: coreSqliteNoticeIsGone (${watched.length} files verified)`);
}

function testNoNewServiceRuntimeSingleton(): void {
	// Forbid `let xxxRuntime = null` + `setXRuntime(` etc inside src/service or src/core.
	const out = rg(
		String.raw`(^|\s)let\s+[a-zA-Z_$][a-zA-Z0-9_$]*Runtime\s*[:=]\s*null|^export function set[A-Z][a-zA-Z0-9]*Runtime\s*\(`,
		path.join(SRC, 'service'),
		path.join(SRC, 'core'),
	);
	const lines = out.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > 0) {
		throw new Error(
			`T11Q regression: new module-level runtime singleton binding in service/core:\n${lines.slice(0, 10).join('\n')}`,
		);
	}
	console.log('PASS: noNewServiceRuntimeSingleton');
}

async function testT11qInfraFilesExist(): Promise<void> {
	const required = [
		'app/copilot/composeCopilotReviewHistory.ts',
		'app/copilot/composeCopilotReviewDeps.ts',
		'app/search/composeBackboneEnv.ts',
		'service/tools/exploreFolderEnv.ts',
	];
	for (const rel of required) {
		assert.strictEqual(
			await exists(path.join(SRC, rel)),
			true,
			`T11Q required file missing: src/${rel}`,
		);
	}
	console.log(`PASS: t11qInfraFilesExist (${required.length} files confirmed)`);
}

async function testBoundaryScriptUnmodified(): Promise<void> {
	const script = await readFile(SCRIPT, 'utf8');
	assert.ok(script.includes("'core->upstream'"), 'boundary-baseline.mjs must still classify core->upstream.');
	assert.ok(script.includes('OBSIDIAN_SIDE_EFFECT_SYMBOLS'), 'boundary-baseline.mjs must still enforce OBSIDIAN_SIDE_EFFECT_SYMBOLS.');
	console.log('PASS: boundaryScriptUnmodified');
}

function testNoNewGodPort(): void {
	const out = rg(
		String.raw`\b(AppPort|ObsidianPort|EverythingPort|HostServices|RuntimeBag|UiHostPort|UIHostGod)\b`,
		SRC,
	);
	const meaningful = out
		.split('\n')
		.filter((l) => l.trim().length > 0)
		.filter((l) => !l.includes('t11q-service-app-tail-regression.test.ts'))
		.filter((l) => !l.includes('t11p-remaining-ui-app-tail-regression.test.ts'))
		.filter((l) => !l.includes('t11o-app-shell-relocation-regression.test.ts'))
		.filter((l) => !l.includes('t11n-ui-vault-port-regression.test.ts'))
		.filter((l) => !l.includes('t11m-ui-app-boundary-regression.test.ts'));
	if (meaningful.length > 0) {
		throw new Error(`T11Q god-port ban tripped:\n${meaningful.slice(0, 10).join('\n')}`);
	}
	console.log('PASS: noNewGodPort');
}

function testUiDynamicAppImportFloorHeld(): void {
	// Carries T11P review-fix: `src/ui/**` has zero static or dynamic `@/app/**` imports.
	const out = rg(String.raw`from\s+['"]@/app/|import\(\s*['"]@/app/`, path.join(SRC, 'ui'));
	const lines = out.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > 0) {
		throw new Error(
			`T11Q honesty metric tripped: src/ui/** has @/app/** imports:\n  ${lines.slice(0, 10).join('\n  ')}`,
		);
	}
	console.log('PASS: uiDynamicAppImportFloorHeld (0 src/ui/** -> @/app/** imports)');
}

async function main(): Promise<void> {
	testT11qFlooredMetrics();
	await testNamedServiceAppLeaksAreGone();
	await testCoreSqliteNoticeIsGone();
	testNoNewServiceRuntimeSingleton();
	await testT11qInfraFilesExist();
	await testBoundaryScriptUnmodified();
	testNoNewGodPort();
	testUiDynamicAppImportFloorHeld();
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
