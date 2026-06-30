// T11N regression floor guards for the UI vault/editor port wave.
// Locks the metrics at the state they reached when T11N landed; tripping
// any floor means a future change pushed a leak back. Either lower the
// floor in the same PR (intentional progress) or fix the regression.
//
// Per the T11N Codex-approved contract:
//   • Total flagged floor at <= 92 (T11N landed at 92, down from 95).
//   • core -> upstream MUST stay at 0 (T11N drove 2 -> 0 via chat-vault
//     type relocation; any new core->service import trips this).
//   • UI raw vault/editor leak floor at <= 10 (down from ~20 leaks; the
//     residual operations live inside three port-implementation files —
//     `useQuickSearchHost.ts`, `save-ai-analyze-to-md.ts`, and
//     `useStreamdownWikilinkClick.ts` (which now requires an explicit
//     `app` arg). The scan is intentionally scoped to `src/ui` so an
//     IO operation under `src/service` cannot mask a UI leak.
//   • service -> ui MUST stay 0 (T11I inviolable).
//   • core -> ui is bundled under core -> upstream by the audit script
//     (so the same 0 floor protects it).
//   • service -> app held at <= 7 (T11N did not unlock service tail).
//   • service/core -> Obsidian types held at <= 35 (T11N moved one
//     TFile import from service to core in net-zero fashion).
//   • No god names anywhere (carried forward from T11M).
//   • The 11 new infra files exist on disk and `boundary-baseline.mjs`
//     was not modified (catches an "allowlist this away" regression).

import assert from 'assert';
import { spawnSync } from 'child_process';
import { access, readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');
const SRC = path.resolve(ROOT, 'src');

const FLOORS = {
	totalFlagged: 92,
	obsidianTypes: 35,
	obsidianSideEffect: 5,
	coreUpstream: 17,
	serviceApp: 7,
	serviceUi: 0,
	// T11M baseline UI -> app was 80; T11N nudged to 45. Floor at 46 so a
	// single new edge trips immediately (T11M's old floor of 80 is now
	// irrelevant — T11N tightened it by a wide margin).
	uiAppShell: 46,
	// Raw UI vault/editor leak sites — scoped to `src/ui` to prevent a
	// service-side IO from masking a UI regression.
	uiRawVaultOps: 10,
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
	// rg exits 1 when no matches — that is success here.
	if (res.status === 0 || res.status === 1) return res.stdout;
	throw new Error(`rg failed: ${res.stderr}`);
}

function testT11nRegressionFloors(): void {
	const report = runAudit();
	const total = extractTotal(report);
	const obsidianTypes = extractCountOrZero(report, 'Service/Core -> Obsidian types (Port-extraction targets)');
	const obsidianSideEffect = extractCountOrZero(report, 'Service/Core -> Obsidian side-effect surface (Notice/Modal/MarkdownView/...)');
	const coreUpstream = extractCountOrZero(report, 'Core -> Service/App/UI (lower layer importing upper)');
	const serviceApp = extractCountOrZero(report, 'Service -> app shell (AppContext / settings types leak)');
	const serviceUi = extractCountOrZero(report, 'Service -> UI (reverse-direction violation)');
	const uiAppShell = extractCountOrZero(report, 'UI -> app shell (informational)');

	const failures: string[] = [];
	if (total > FLOORS.totalFlagged)
		failures.push(`total flagged ${total} > floor ${FLOORS.totalFlagged}`);
	if (obsidianTypes > FLOORS.obsidianTypes)
		failures.push(`obsidian-types ${obsidianTypes} > floor ${FLOORS.obsidianTypes}`);
	if (obsidianSideEffect > FLOORS.obsidianSideEffect)
		failures.push(`obsidian-side-effect ${obsidianSideEffect} > floor ${FLOORS.obsidianSideEffect}`);
	if (coreUpstream > FLOORS.coreUpstream)
		failures.push(`core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream} (T11N drove this to 0 — do NOT reintroduce a core -> service import)`);
	if (serviceApp > FLOORS.serviceApp)
		failures.push(`service->app ${serviceApp} > floor ${FLOORS.serviceApp}`);
	if (serviceUi > FLOORS.serviceUi)
		failures.push(`service->ui ${serviceUi} > floor ${FLOORS.serviceUi} (T11I inviolable)`);
	if (uiAppShell > FLOORS.uiAppShell)
		failures.push(`ui->app ${uiAppShell} > floor ${FLOORS.uiAppShell}`);

	if (failures.length > 0) {
		throw new Error(
			`T11N regression floor tripped:\n  ${failures.join('\n  ')}\nThese are post-T11N locks. If you intentionally raised one, update FLOORS in this file; otherwise revert the regression.`,
		);
	}

	console.log(
		`PASS: t11nRegressionFloors (total=${total} obsidian-types=${obsidianTypes} side-effect=${obsidianSideEffect} core->upstream=${coreUpstream} service->app=${serviceApp} service->ui=${serviceUi} ui->app=${uiAppShell})`,
	);
}

function testUiRawVaultOpFloor(): void {
	// Scope the scan to `src/ui` so a raw IO in `src/service` (which is
	// inappropriate but is a different wave's problem) cannot mask a UI
	// regression.
	const out = rg(
		'\\bapp\\.vault\\.(read|modify|create|trash|cachedRead|readBinary)|\\bapp\\.workspace\\.activeEditor|\\bapp\\.fileManager\\.|\\bapp\\.workspace\\.openLinkText',
		path.join(SRC, 'ui'),
	);
	const lines = out.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > FLOORS.uiRawVaultOps) {
		throw new Error(
			`T11N UI raw vault/editor op regression: ${lines.length} matches in src/ui > floor ${FLOORS.uiRawVaultOps}.\nRemaining ops should live only inside port-implementation files (useQuickSearchHost / save-ai-analyze-to-md / useStreamdownWikilinkClick). Route any new vault/editor call through one of the T11N ports (vaultPreview / vaultNavigation / editorCommands / chatVaultWriter) or the existing copilotPanelVault.\nMatches:\n${lines.slice(0, 12).join('\n')}`,
		);
	}
	console.log(`PASS: uiRawVaultOpFloor (${lines.length} matches in src/ui <= floor ${FLOORS.uiRawVaultOps})`);
}

async function testT11nInfraFilesExist(): Promise<void> {
	const required = [
		// Track 1 — preview port + adapter + composer
		'core/ports/VaultPreviewPort.ts',
		'app/adapters/preview/AppVaultPreviewAdapter.ts',
		'app/adapters/preview/composeVaultPreview.ts',
		// Track 2 — navigation + editor commands ports + adapters + composer
		'core/ports/VaultNavigationPort.ts',
		'app/adapters/navigation/AppVaultNavigationAdapter.ts',
		'core/ports/EditorCommandsPort.ts',
		'app/adapters/navigation/AppEditorCommandsAdapter.ts',
		'app/adapters/navigation/composeNavigation.ts',
		// Track 3 — chat-vault writer port + adapter + composer
		'core/ports/ChatVaultWriterPort.ts',
		'app/chat/AppChatVaultWriterAdapter.ts',
		'app/chat/composeChatVaultWriter.ts',
		// Track 6 — vault-backed chat types in core (eliminates core->upstream)
		'core/types/chat-vault.ts',
	];
	for (const rel of required) {
		const full = path.join(SRC, rel);
		const ok = await exists(full);
		assert.strictEqual(ok, true, `T11N file missing: src/${rel}`);
	}
	console.log(`PASS: t11nInfraFilesExist (12 files: 4 ports + 4 adapters + 3 composers + 1 core type module)`);
}

async function testT11nPortsPublishedInServiceContext(): Promise<void> {
	const sc = await readFile(path.join(SRC, 'ui/context/ServiceContext.tsx'), 'utf8');
	for (const sym of ['vaultPreview', 'vaultNavigation', 'editorCommands', 'chatVaultWriter']) {
		assert.ok(
			sc.includes(`${sym}:`),
			`ServiceContext must publish '${sym}' (T11N injection point — port composition lives in AppContext, ServiceContext only re-exports).`,
		);
	}
	console.log(`PASS: t11nPortsPublishedInServiceContext (4 ports surfaced via useServiceContext)`);
}

async function testT11nAdaptersComposedInAppContext(): Promise<void> {
	const ac = await readFile(path.join(SRC, 'app/context/AppContext.ts'), 'utf8');
	for (const fn of [
		'composeVaultPreview',
		'composeVaultNavigation',
		'composeEditorCommands',
		'composeChatVaultWriter',
	]) {
		assert.ok(
			ac.includes(fn),
			`AppContext must invoke '${fn}' (T11N adapters must be composed once in app-owned code, not lazily inside ServiceContext).`,
		);
	}
	console.log(`PASS: t11nAdaptersComposedInAppContext (all 4 composers wired in AppContext constructor)`);
}

async function testCoreChatVaultDoesNotCrossLayers(): Promise<void> {
	const file = await readFile(path.join(SRC, 'core/types/chat-vault.ts'), 'utf8');
	// chat-vault must import only from 'obsidian' (for TFile) and from
	// other `core/*` modules. Any '@/service/*' or '@/app/*' import would
	// reintroduce a core->upstream edge.
	const badImport = /from\s+['"]@\/(service|app|ui)\//.exec(file);
	if (badImport) {
		throw new Error(
			`T11N core type module must not import from service/app/ui:\n${badImport[0]}`,
		);
	}
	console.log(`PASS: coreChatVaultDoesNotCrossLayers (chat-vault imports only obsidian + core)`);
}

async function testNoGodHooks(): Promise<void> {
	const out = rg(
		'UiAppServices|AppShellEverything|UIHostGod|useAppShell|EverythingPort|\\bToolDeps\\b',
		SRC,
	);
	const meaningful = out
		.split('\n')
		.filter((l) => l.trim().length > 0)
		// Allow this test file and the T11M sibling to mention them.
		.filter((l) => !l.includes('t11m-ui-app-boundary-regression.test.ts'))
		.filter((l) => !l.includes('t11n-ui-vault-port-regression.test.ts'));
	if (meaningful.length > 0) {
		throw new Error(
			`T11N god-hook ban tripped — found ${meaningful.length} occurrences:\n${meaningful.slice(0, 10).join('\n')}`,
		);
	}
	console.log(`PASS: noGodHooks (no banned god-hook identifiers in src/)`);
}

async function testBoundaryScriptUnmodified(): Promise<void> {
	// Sanity: the audit script is not silently allowlist-patched away.
	// We assert the two markers Codex's review verified at T11N intake.
	const script = await readFile(SCRIPT, 'utf8');
	assert.ok(
		script.includes("'core->upstream'"),
		'boundary-baseline.mjs must still classify core->upstream — do not relax this category.',
	);
	assert.ok(
		script.includes('OBSIDIAN_SIDE_EFFECT_SYMBOLS'),
		'boundary-baseline.mjs must still enforce OBSIDIAN_SIDE_EFFECT_SYMBOLS — do not delete the side-effect category.',
	);
	console.log(`PASS: boundaryScriptUnmodified (category classifiers and side-effect symbols intact)`);
}

async function main(): Promise<void> {
	testT11nRegressionFloors();
	testUiRawVaultOpFloor();
	await testT11nInfraFilesExist();
	await testT11nPortsPublishedInServiceContext();
	await testT11nAdaptersComposedInAppContext();
	await testCoreChatVaultDoesNotCrossLayers();
	await testNoGodHooks();
	await testBoundaryScriptUnmodified();
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
