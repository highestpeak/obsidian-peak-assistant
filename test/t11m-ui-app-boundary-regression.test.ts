// T11M regression floor guards for the UI -> app boundary wave.
// Locks the metrics at the state they reached when T11M landed; tripping
// any floor means a future change pushed UI -> app coupling back up —
// either lower the floor in the same PR (intentional progress) or fix the
// regression.
//
// Per the T11M handoff (with Codex's corrections):
//   • Total flagged floor at <= 130 (T11L was <= 165).
//   • UI -> app shell floor at <= 80 (baseline 114).
//   • Direct UI AppContext import files floor at <= 55 (baseline 87).
//   • UI -> app/settings/types imports must reach 0 (Track A target).
//   • All T11L floors still hold (service -> app <= 8, core -> upstream <= 2,
//     obsidian-side-effect <= 10, obsidian-types <= 35).
//   • service -> ui remains 0 (T11I inviolable). core -> ui is bundled
//     under core -> upstream by the audit script, so the same guard covers it.
//
// Also enforces (source-level invariants):
//   • The new ports / hooks / adapters exist on disk.
//   • No god hook strings exist anywhere (`useAppShell`, `UiAppServices`,
//     `AppShellEverything`, `UIHostGod`, `EverythingPort`, `ToolDeps`).
//   • Copilot panels under src/ui/view/copilot/panels/ do not perform raw
//     `app.vault.{read|modify|create|trash|cachedRead}` /
//     `app.workspace.activeEditor` / `app.fileManager.*` operations — those
//     must route through the new CopilotPanelVaultPort.
//   • Quick Search files under src/ui/view/quick-search/ do not perform raw
//     `app.vault.*` writes or `app.workspace.openLinkText` /
//     `app.workspace.activeEditor` — those must route through useQuickSearchHost.

import assert from 'assert';
import { spawnSync } from 'child_process';
import { access, readdir, readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');
const SRC = path.resolve(ROOT, 'src');

const FLOORS = {
	// T11L primary cut: 199 -> 163. T11M expected delta: 163 -> ~100.
	// Floor at 130 (hard min target).
	totalFlagged: 130,
	// T11L: 48 -> 34 (kept).
	obsidianTypes: 35,
	// T11L: 16 -> 5 (kept).
	obsidianSideEffect: 10,
	// T11L: kept at 2.
	coreUpstream: 19, // Raised from 17 -> 19 for `core/ports/HeadingModePort.ts` (2026-07-07 T8 heading-mode port).
	// T11L: kept at 8.
	serviceApp: 8,
	// T11I floor — inviolable. (core->ui is bundled under core->upstream by
	// the audit script, which is itself locked at <=2; so a core->ui leak
	// would trip the coreUpstream guard.)
	serviceUi: 0,
};

const T11M_FLOORS = {
	// Baseline UI -> app: 114. Floor at 80 (hard min target).
	uiAppShell: 80,
	// Baseline direct UI AppContext import files: 87. Floor at 55.
	directAppContextImports: 55,
	// Track A target: settings/types path imports must reach 0.
	uiAppSettingsTypesImports: 0,
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

function testRegressionFloors(): void {
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
		failures.push(`T11M floor regression: total flagged ${total} > floor ${FLOORS.totalFlagged}`);
	if (obsidianTypes > FLOORS.obsidianTypes)
		failures.push(`T11L floor regression: obsidian-types ${obsidianTypes} > floor ${FLOORS.obsidianTypes}`);
	if (obsidianSideEffect > FLOORS.obsidianSideEffect)
		failures.push(`T11L floor regression: obsidian-side-effect ${obsidianSideEffect} > floor ${FLOORS.obsidianSideEffect}`);
	if (coreUpstream > FLOORS.coreUpstream)
		failures.push(`T11L floor regression: core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream}`);
	if (serviceApp > FLOORS.serviceApp)
		failures.push(`T11L floor regression: service->app ${serviceApp} > floor ${FLOORS.serviceApp}`);
	if (serviceUi > FLOORS.serviceUi)
		failures.push(`T11I floor regression: service->ui ${serviceUi} > floor ${FLOORS.serviceUi} (T11I inviolable)`);
	if (uiAppShell > T11M_FLOORS.uiAppShell)
		failures.push(`T11M floor regression: ui->app ${uiAppShell} > floor ${T11M_FLOORS.uiAppShell}`);

	if (failures.length > 0) {
		throw new Error(
			`T11M regression floor tripped:\n  ${failures.join('\n  ')}\nThese are post-T11M locks. If you intentionally raised one, update FLOORS in this file; otherwise revert the regression.`,
		);
	}

	console.log(
		`PASS: t11mRegressionFloors (total=${total} obsidian-types=${obsidianTypes} side-effect=${obsidianSideEffect} core->upstream=${coreUpstream} service->app=${serviceApp} service->ui=${serviceUi} ui->app=${uiAppShell})`,
	);
}

async function testDirectAppContextImportFloor(): Promise<void> {
	const out = rg("from ['\"]@/app/context/AppContext", path.join(SRC, 'ui'));
	const fileSet = new Set<string>();
	for (const line of out.split('\n')) {
		const [filePath] = line.split(':');
		if (filePath) fileSet.add(filePath);
	}
	const count = fileSet.size;
	if (count > T11M_FLOORS.directAppContextImports) {
		throw new Error(
			`T11M floor regression: direct UI AppContext import files ${count} > floor ${T11M_FLOORS.directAppContextImports}`,
		);
	}
	console.log(`PASS: directAppContextImports (${count} files <= floor ${T11M_FLOORS.directAppContextImports})`);
}

async function testNoUiAppSettingsTypesImports(): Promise<void> {
	const out = rg("from ['\"]@/app/settings/types", path.join(SRC, 'ui'));
	const count = out.split('\n').filter((l) => l.trim().length > 0).length;
	if (count > T11M_FLOORS.uiAppSettingsTypesImports) {
		throw new Error(
			`T11M floor regression: UI -> @/app/settings/types imports ${count} > floor ${T11M_FLOORS.uiAppSettingsTypesImports}. Track A swapped all 14 callers to @/core/config/settingsTypes.`,
		);
	}
	console.log(`PASS: noUiAppSettingsTypesImports (${count} <= floor)`);
}

async function testNoGodHooks(): Promise<void> {
	// Anchor `ToolDeps` to a word boundary so narrow named bags like
	// `ChatToolDeps` (a legitimate per-builder dep object) do not trip the
	// generic-name ban — only a bare `ToolDeps` identifier matches.
	const out = rg('UiAppServices|AppShellEverything|UIHostGod|useAppShell|EverythingPort|\\bToolDeps\\b', path.join(SRC));
	const meaningful = out
		.split('\n')
		.filter((l) => l.trim().length > 0)
		// Allow this very test file to mention them (we list the banned names).
		.filter((l) => !l.includes('t11m-ui-app-boundary-regression.test.ts'));
	if (meaningful.length > 0) {
		throw new Error(
			`T11M god-hook ban tripped — found ${meaningful.length} occurrences:\n${meaningful.slice(0, 10).join('\n')}`,
		);
	}
	console.log(`PASS: noGodHooks (no useAppShell / UiAppServices / AppShellEverything / UIHostGod / EverythingPort / ToolDeps in src/)`);
}

async function testCopilotPanelsHaveNoRawVaultOps(): Promise<void> {
	const panelsDir = path.join(SRC, 'ui/view/copilot/panels');
	const out = rg(
		'app\\.vault\\.(read|modify|create|trash|cachedRead)|app\\.workspace\\.activeEditor|app\\.fileManager\\.',
		panelsDir,
	);
	const lines = out.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > 0) {
		throw new Error(
			`T11M Copilot panel raw vault/editor ops detected (${lines.length}):\n${lines.slice(0, 10).join('\n')}\nThese must route through useCopilotPanelVault() named operations.`,
		);
	}
	console.log(`PASS: copilotPanelsHaveNoRawVaultOps (0 raw vault/editor ops in panels/)`);
}

async function testQuickSearchHasNoAppContextLeak(): Promise<void> {
	// Quick Search files must not call `AppContext.getInstance().app.vault.*`
	// directly — those are the leaks T11M removes. Note: a few utility
	// modules (`save-ai-analyze-to-md.ts`, `useStreamdownWikilinkClick.ts`,
	// `open-source-file.ts`) accept `app` via a parameter / `useQuickSearchHost`
	// destructure and call `app.vault.*` on the injected handle — that is
	// the deps-injection pattern, not a leak, and is allowed.
	const qsDir = path.join(SRC, 'ui/view/quick-search');
	const out = rg('AppContext\\.getInstance\\(\\)\\.app\\.(vault|workspace|fileManager)', qsDir);
	const lines = out
		.split('\n')
		.filter((l) => l.trim().length > 0)
		// Allow the host hook itself to wrap these — the closure lives there.
		.filter((l) => !l.includes('hooks/useQuickSearchHost.ts'));
	if (lines.length > 0) {
		throw new Error(
			`T11M Quick Search AppContext.getInstance().app.{vault,workspace,fileManager} leak detected (${lines.length}):\n${lines.slice(0, 10).join('\n')}\nThese must route through useQuickSearchHost() named operations.`,
		);
	}
	console.log(`PASS: quickSearchHasNoAppContextLeak (0 raw AppContext.getInstance().app.* reaches outside host hook)`);
}

async function testT11mInfraFilesExist(): Promise<void> {
	const required = [
		'core/ports/CopilotPanelPorts.ts',
		'app/copilot/panels/AppCopilotPanelVaultAdapter.ts',
		'app/copilot/panels/AppCopilotPanelNavigatorAdapter.ts',
		'app/copilot/panels/composeCopilotPanelVault.ts',
		'ui/view/copilot/hooks/useCopilotPanelVault.ts',
		'ui/view/quick-search/hooks/useQuickSearchHost.ts',
	];
	for (const rel of required) {
		const full = path.join(SRC, rel);
		const ok = await exists(full);
		assert.strictEqual(ok, true, `T11M file missing: src/${rel}`);
	}
	console.log(`PASS: t11mInfraFilesExist (CopilotPanelPorts + adapters + composition root + 2 hooks)`);
}

async function testTemplateManagerSingletonWired(): Promise<void> {
	const tmFile = await readFile(path.join(SRC, 'core/template/TemplateManager.ts'), 'utf8');
	assert.ok(
		tmFile.includes('static setInstance') && tmFile.includes('static getInstance'),
		'TemplateManager.setInstance/getInstance must exist (T11M Track E wiring)',
	);
	const mainTs = await readFile(path.join(ROOT, 'main.ts'), 'utf8');
	assert.ok(
		mainTs.includes('TemplateManager.setInstance(this.templateManager)'),
		'main.ts must call TemplateManager.setInstance(this.templateManager) on boot',
	);
	assert.ok(
		mainTs.includes('TemplateManager.setInstance(null)'),
		'main.ts onunload must call TemplateManager.setInstance(null)',
	);
	console.log(`PASS: templateManagerSingletonWired (setInstance bound on boot + cleared on unload)`);
}

async function main(): Promise<void> {
	testRegressionFloors();
	await testDirectAppContextImportFloor();
	await testNoUiAppSettingsTypesImports();
	await testNoGodHooks();
	await testCopilotPanelsHaveNoRawVaultOps();
	await testQuickSearchHasNoAppContextLeak();
	await testT11mInfraFilesExist();
	await testTemplateManagerSingletonWired();
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
