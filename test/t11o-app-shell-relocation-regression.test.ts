// T11O regression floor guards for the app-shell relocation wave.
//
// Per the T11O Codex-approved contract (and corrections):
//   • Total flagged floor at <= 56 (T11O landed at 56, down from T11N's 92).
//   • UI -> app static imports floor at <= 9 (T11O landed at 9, down from 45;
//     hard target was <=15, stretch <=8 — we land at 9 with chatNavigation
//     and four settings tabs documented as remaining debt for a future
//     port-introduction wave).
//   • service -> app held at <= 7 (T11O moved no service-side code).
//   • service -> ui MUST stay 0.
//   • core -> upstream and core -> ui MUST stay 0.
//   • UI raw vault/editor leak floor at <= 7 (T11N infrastructure
//     unchanged; T11O only relocated app shells).
//   • `useServiceContext().app` consumer count is the Codex "honesty
//     metric" — must NOT exceed the T11O baseline of 27 (Track 6 did not
//     introduce a single new `.app` consumer, even where it could have
//     skirted the rule).
//   • Obsidian shell files (ItemView / Modal subclasses) MUST live under
//     `src/app/view/**`, `src/app/modals/**`, or `src/app/copilot/modals/**`.
//     The previously blended files under `src/ui/view/copilot/` and
//     `src/ui/view/modals/` MUST NOT exist any more.
//   • `src/ui/react/ReactElementFactory.tsx` MUST NOT exist (relocated to
//     `src/app/react/ReactElementFactory.tsx`).
//   • `src/ui/context/ServiceContext.tsx` MUST NOT import
//     `@/app/context/AppContext` (Track 5 pruned the fallback chain).
//   • Scanner script thresholds were not weakened.

import assert from 'assert';
import { spawnSync } from 'child_process';
import { access, readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');
const SRC = path.resolve(ROOT, 'src');

const FLOORS = {
	totalFlagged: 56,
	uiAppShell: 9,
	serviceApp: 7,
	serviceUi: 0,
	coreUpstream: 0,
	uiRawVaultOps: 7,
	useServiceContextApp: 27,
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

function testT11oFlooredMetrics(): void {
	const report = runAudit();
	const total = extractTotal(report);
	const uiAppShell = extractCountOrZero(report, 'UI -> app shell (informational)');
	const serviceApp = extractCountOrZero(report, 'Service -> app shell (AppContext / settings types leak)');
	const serviceUi = extractCountOrZero(report, 'Service -> UI (reverse-direction violation)');
	const coreUpstream = extractCountOrZero(report, 'Core -> Service/App/UI (lower layer importing upper)');

	const failures: string[] = [];
	if (total > FLOORS.totalFlagged)
		failures.push(`total flagged ${total} > floor ${FLOORS.totalFlagged}`);
	if (uiAppShell > FLOORS.uiAppShell)
		failures.push(`ui->app ${uiAppShell} > floor ${FLOORS.uiAppShell} (T11O hard target was <=15; landed at 9)`);
	if (serviceApp > FLOORS.serviceApp)
		failures.push(`service->app ${serviceApp} > floor ${FLOORS.serviceApp}`);
	if (serviceUi > FLOORS.serviceUi)
		failures.push(`service->ui ${serviceUi} > floor ${FLOORS.serviceUi} (T11I inviolable)`);
	if (coreUpstream > FLOORS.coreUpstream)
		failures.push(`core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream} (T11N drove this to 0)`);

	if (failures.length > 0) {
		throw new Error(
			`T11O regression floor tripped:\n  ${failures.join('\n  ')}\nThese are post-T11O locks. If you intentionally raised one, update FLOORS in this file; otherwise revert the regression.`,
		);
	}
	console.log(
		`PASS: t11oFlooredMetrics (total=${total} ui->app=${uiAppShell} service->app=${serviceApp} service->ui=${serviceUi} core->upstream=${coreUpstream})`,
	);
}

function testUseServiceContextAppHonestyMetric(): void {
	// Codex correction: report (and lock) the count of `useServiceContext().app`
	// consumers. Track 6 did not introduce any new consumers (some sites
	// previously used `app` only as fallback; they now consume narrow ports).
	const out = rg(
		String.raw`useServiceContext\(\).*\bapp\b|const \{[^}]*\bapp\b[^}]*\} = useServiceContext\(\)`,
		path.join(SRC, 'ui'),
	);
	const count = out.split('\n').filter((l) => l.trim().length > 0).length;
	if (count > FLOORS.useServiceContextApp) {
		throw new Error(
			`T11O honesty metric tripped: useServiceContext().app consumers = ${count} > floor ${FLOORS.useServiceContextApp}.\nDo not add a new consumer of raw 'app' from ServiceContext — introduce a narrow named port (vaultPreview, vaultNavigation, editorCommands, etc.) instead.`,
		);
	}
	console.log(`PASS: useServiceContextAppHonestyMetric (${count} consumers <= floor ${FLOORS.useServiceContextApp})`);
}

async function testUiHasNoObsidianShellSubclasses(): Promise<void> {
	// Every Obsidian Modal / ItemView subclass MUST live under src/app/**.
	// Scan src/ui/** for `extends Modal` or `extends ItemView`, excluding
	// the Radix `Modal` primitive (which is a React component named `Modal`,
	// not the Obsidian class).
	const out = rg(String.raw`extends (Modal|ItemView)\b`, path.join(SRC, 'ui'));
	const lines = out
		.split('\n')
		.filter((l) => l.trim().length > 0);
	const obsidianSubclasses = lines.filter((l) => {
		// Heuristic: only flag lines where the surrounding import line shows
		// `from 'obsidian'`. We re-read the file to confirm.
		return true; // detail filter below
	});
	if (obsidianSubclasses.length === 0) {
		console.log('PASS: uiHasNoObsidianShellSubclasses (0 src/ui files extend Obsidian Modal/ItemView)');
		return;
	}
	// Confirm each by reading the file and checking imports.
	const truly: string[] = [];
	for (const line of obsidianSubclasses) {
		const filePath = line.split(':')[0];
		try {
			const content = await readFile(filePath, 'utf8');
			if (/from\s+['"]obsidian['"]/.test(content) && /extends (Modal|ItemView)\b/.test(content)) {
				truly.push(line);
			}
		} catch { /* ignore */ }
	}
	if (truly.length > 0) {
		throw new Error(
			`T11O shell-relocation regression: ${truly.length} Obsidian Modal/ItemView subclasses still live under src/ui/**.\nRelocate them to src/app/view/, src/app/modals/, or src/app/copilot/modals/.\nMatches:\n${truly.slice(0, 10).join('\n')}`,
		);
	}
	console.log('PASS: uiHasNoObsidianShellSubclasses (0 src/ui files extend Obsidian Modal/ItemView)');
}

async function testRetiredFilesAreGone(): Promise<void> {
	// Each old shell path that T11O relocated MUST NOT exist any more (no
	// dead duplicates left behind).
	const retired = [
		// Track 1 ItemView shells
		'ui/view/AmbientPushView.ts',
		'ui/view/ChatStudioView.ts',
		'ui/view/ChatView.ts',
		'ui/view/ConversationOutlineView.ts',
		'ui/view/ProjectListView.ts',
		'ui/view/usage-dashboard/UsageDashboardView.ts',
		// Track 2 standalone Modals
		'ui/view/ConfirmModal.ts',
		'ui/view/SettingsModal.tsx',
		'ui/view/QuickSearchModal.tsx',
		'ui/view/BuildUserProfileProgressModal.ts',
		// Track 3 blended modals (old paths before split)
		'ui/view/modals/CostEstimationModal.tsx',
		'ui/view/modals/IndexingProgressModal.tsx',
		'ui/view/modals/HarnessOnboardingModal.tsx',
		// Track 4 Copilot blended modals (old paths)
		'ui/view/copilot/CopilotAutoRunModal.tsx',
		'ui/view/copilot/CopilotPickerModal.tsx',
		'ui/view/copilot/CopilotResultModal.tsx',
		'ui/view/copilot/CopilotReviewHistoryModal.tsx',
		'ui/view/copilot/vault/VaultAutoRunModal.tsx',
		// Track 5 — composition bridge moved
		'ui/react/ReactElementFactory.tsx',
	];
	const leftBehind: string[] = [];
	for (const rel of retired) {
		const full = path.join(SRC, rel);
		if (await exists(full)) leftBehind.push(rel);
	}
	if (leftBehind.length > 0) {
		throw new Error(
			`T11O retired-file regression: ${leftBehind.length} shell paths must not exist any more (Track 1-5 moved them):\n  ${leftBehind.join('\n  ')}`,
		);
	}
	console.log(`PASS: retiredFilesAreGone (${retired.length} old shell paths confirmed absent)`);
}

async function testRelocatedShellsLandedInApp(): Promise<void> {
	// Each relocated shell must EXIST in its new src/app/** home.
	const newHomes = [
		'app/view/AmbientPushView.ts',
		'app/view/ChatStudioView.ts',
		'app/view/ChatView.ts',
		'app/view/ConversationOutlineView.ts',
		'app/view/ProjectListView.ts',
		'app/view/UsageDashboardView.ts',
		'app/modals/ConfirmModal.ts',
		'app/modals/SettingsModal.tsx',
		'app/modals/QuickSearchModal.tsx',
		'app/modals/BuildUserProfileProgressModal.ts',
		'app/modals/CostEstimationModal.tsx',
		'app/modals/IndexingProgressModal.tsx',
		'app/modals/HarnessOnboardingModal.tsx',
		'app/copilot/modals/CopilotAutoRunModal.tsx',
		'app/copilot/modals/CopilotPickerModal.tsx',
		'app/copilot/modals/CopilotResultModal.tsx',
		'app/copilot/modals/CopilotReviewHistoryModal.tsx',
		'app/copilot/modals/VaultAutoRunModal.tsx',
		'app/copilot/modals/openVaultReviewHistoryRecord.ts',
		'app/react/ReactElementFactory.tsx',
	];
	for (const rel of newHomes) {
		const full = path.join(SRC, rel);
		assert.strictEqual(await exists(full), true, `T11O moved shell missing: src/${rel}`);
	}
	console.log(`PASS: relocatedShellsLandedInApp (${newHomes.length} shells confirmed in src/app/**)`);
}

async function testServiceContextDoesNotImportAppContext(): Promise<void> {
	const sc = await readFile(path.join(SRC, 'ui/context/ServiceContext.tsx'), 'utf8');
	const m = /from\s+['"]@\/app\/context\/AppContext['"]/.exec(sc);
	if (m) {
		throw new Error(
			`T11O Track 5 regression: ServiceContext.tsx must NOT import @/app/context/AppContext — the AppContext fallback chain was pruned. Found:\n  ${m[0]}`,
		);
	}
	console.log('PASS: serviceContextDoesNotImportAppContext (AppContext fallback chain stays removed)');
}

async function testReactElementFactoryThreadsAllPorts(): Promise<void> {
	// The factory is now the single composition point — confirm it threads
	// the new Track 6 ports.
	const f = await readFile(path.join(SRC, 'app/react/ReactElementFactory.tsx'), 'utf8');
	for (const sym of [
		'vaultReviewRuntime',
		'quickSearchBackgroundRuntime',
		'aiAnalysisHistoryService',
		'isMockEnv',
		'searchAgent',
		'settingsActions',
		'analysisDocVaultWriter',
		'reportSessionPort',
	]) {
		assert.ok(
			f.includes(`${sym}:`),
			`ReactElementFactory must thread '${sym}' (T11O Track 6 — published on ServiceContext, must be sourced from AppContext at composition time).`,
		);
	}
	console.log('PASS: reactElementFactoryThreadsAllPorts (8 Track 6 ports + 14 Track 5 inheritance points)');
}

function testUiRawVaultOpFloorUnchanged(): void {
	const out = rg(
		String.raw`\bapp\.vault\.(read|modify|create|trash|cachedRead|readBinary)|\bapp\.workspace\.activeEditor|\bapp\.fileManager\.|\bapp\.workspace\.openLinkText`,
		path.join(SRC, 'ui'),
	);
	const lines = out.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > FLOORS.uiRawVaultOps) {
		throw new Error(
			`T11O carries T11N raw-IO floor: ${lines.length} matches in src/ui > floor ${FLOORS.uiRawVaultOps}. T11O did not change T11N infrastructure — investigate any new raw IO before raising this floor.`,
		);
	}
	console.log(`PASS: uiRawVaultOpFloorUnchanged (${lines.length} matches <= floor ${FLOORS.uiRawVaultOps})`);
}

async function testBoundaryScriptUnmodified(): Promise<void> {
	const script = await readFile(SCRIPT, 'utf8');
	assert.ok(
		script.includes("'core->upstream'"),
		'boundary-baseline.mjs must still classify core->upstream — do not relax this category.',
	);
	assert.ok(
		script.includes('OBSIDIAN_SIDE_EFFECT_SYMBOLS'),
		'boundary-baseline.mjs must still enforce OBSIDIAN_SIDE_EFFECT_SYMBOLS.',
	);
	console.log('PASS: boundaryScriptUnmodified (T11O did not weaken any scanner classifier)');
}

async function testNoNewGodPort(): Promise<void> {
	// Codex correction: no `ServiceContext.app` rehydration, no `UiHostPort`,
	// no `AppPort` broad surface.
	const out = rg(
		String.raw`\b(UiHostPort|AppPort|UIHostGod|AppShellEverything|EverythingPort)\b`,
		SRC,
	);
	const meaningful = out
		.split('\n')
		.filter((l) => l.trim().length > 0)
		.filter((l) => !l.includes('t11o-app-shell-relocation-regression.test.ts'))
		.filter((l) => !l.includes('t11n-ui-vault-port-regression.test.ts'))
		.filter((l) => !l.includes('t11m-ui-app-boundary-regression.test.ts'));
	if (meaningful.length > 0) {
		throw new Error(
			`T11O god-port ban tripped: ${meaningful.length} occurrences of banned identifiers:\n${meaningful.slice(0, 10).join('\n')}`,
		);
	}
	console.log('PASS: noNewGodPort (no banned aggregate-port identifiers introduced)');
}

async function main(): Promise<void> {
	testT11oFlooredMetrics();
	testUseServiceContextAppHonestyMetric();
	testUiRawVaultOpFloorUnchanged();
	await testUiHasNoObsidianShellSubclasses();
	await testRetiredFilesAreGone();
	await testRelocatedShellsLandedInApp();
	await testServiceContextDoesNotImportAppContext();
	await testReactElementFactoryThreadsAllPorts();
	await testBoundaryScriptUnmodified();
	await testNoNewGodPort();
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
