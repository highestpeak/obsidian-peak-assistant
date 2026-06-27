// T11P regression floor guards for the remaining UI-app tail closure wave.
//
// Per the T11P Codex-approved contract (with corrections):
//   • UI -> app static imports = 0 (HARD).
//   • useServiceContext().app consumers = 0 (HARD honesty metric).
//   • Total flagged <= 47.
//   • service -> app held at <= 7.
//   • service -> ui MUST stay 0.
//   • core -> upstream and core -> ui MUST stay 0.
//   • UI raw vault/editor leak floor <= 7 (T11N infrastructure unchanged).
//   • Scanner script thresholds were not weakened.
//
// Additional structural locks (Tracks A–J corrections):
//   • `src/ui/view/chat-view/chatNavigation.ts` MUST NOT import
//     `@/app/context/AppContext` and MUST NOT import any `@/app/view/*` type.
//   • Settings tabs (MaintenanceTab, AISetupTab, AdvancedTab, OverviewTab,
//     KnowledgeIndexTab) MUST NOT import `@/app/commands/PeakCommandActions`
//     statically or via dynamic `import()`.
//   • `ServiceContext.tsx` MUST NOT publish `app:` as a context field.
//   • `ServiceContext.tsx` MUST NOT import from `@/app/**`.
//   • No banned broad port names ever introduced.
//   • `VaultNavigationPort` MUST NOT expose raw Obsidian primitives
//     (`getVault`, `getWorkspace`, `getAbstractFileByPath`, …).

import assert from 'assert';
import { spawnSync } from 'child_process';
import { access, readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');
const SRC = path.resolve(ROOT, 'src');

const FLOORS = {
	totalFlagged: 47,
	uiAppShell: 0,
	serviceApp: 7,
	serviceUi: 0,
	coreUpstream: 0,
	uiRawVaultOps: 7,
	useServiceContextApp: 0,
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

function testT11pFlooredMetrics(): void {
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
		failures.push(`ui->app ${uiAppShell} > floor ${FLOORS.uiAppShell} (T11P hard target: 0)`);
	if (serviceApp > FLOORS.serviceApp)
		failures.push(`service->app ${serviceApp} > floor ${FLOORS.serviceApp}`);
	if (serviceUi > FLOORS.serviceUi)
		failures.push(`service->ui ${serviceUi} > floor ${FLOORS.serviceUi}`);
	if (coreUpstream > FLOORS.coreUpstream)
		failures.push(`core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream}`);

	if (failures.length > 0) {
		throw new Error(
			`T11P regression floor tripped:\n  ${failures.join('\n  ')}\nThese are post-T11P locks. If you intentionally raised one, update FLOORS in this file; otherwise revert the regression.`,
		);
	}
	console.log(
		`PASS: t11pFlooredMetrics (total=${total} ui->app=${uiAppShell} service->app=${serviceApp} service->ui=${serviceUi} core->upstream=${coreUpstream})`,
	);
}

function testUseServiceContextAppHonestyMetric(): void {
	// T11P hard target: 0 raw `app` consumers in src/ui.
	const out = rg(
		String.raw`useServiceContext\(\).*\bapp\b|const \{[^}]*\bapp\b[^}]*\} = useServiceContext\(\)`,
		path.join(SRC, 'ui'),
	);
	const count = out.split('\n').filter((l) => l.trim().length > 0).length;
	if (count > FLOORS.useServiceContextApp) {
		throw new Error(
			`T11P honesty metric tripped: useServiceContext().app consumers = ${count} > floor ${FLOORS.useServiceContextApp}.\nNo new consumer of raw 'app' is allowed — introduce a narrow named port (vaultNavigation, vaultPreview, wikilink, vaultStats, settingsActions, chatNavigation, ...) instead.`,
		);
	}
	console.log(`PASS: useServiceContextAppHonestyMetric (${count} consumers <= floor ${FLOORS.useServiceContextApp})`);
}

function testServiceContextDoesNotPublishRawApp(): void {
	// Per Codex correction: ServiceContext must never publish `app: App` again.
	const contextFile = path.join(SRC, 'ui/context/ServiceContext.tsx');
	const content = require('fs').readFileSync(contextFile, 'utf8') as string;
	// Look at the ServiceContextValue interface — match `interface ServiceContextValue { ... app: App ... }`.
	const interfaceMatch = content.match(/interface ServiceContextValue \{([^}]*)\}/);
	if (!interfaceMatch) {
		throw new Error('Could not locate ServiceContextValue interface in ServiceContext.tsx');
	}
	const body = interfaceMatch[1];
	if (/\bapp\s*:\s*App\b/.test(body)) {
		throw new Error(
			'T11P regression: ServiceContext publishes `app: App` again. Drop the field and migrate consumers to a narrow port.',
		);
	}
	console.log('PASS: serviceContextDoesNotPublishRawApp');
}

async function testServiceContextHasNoAppImports(): Promise<void> {
	const sc = await readFile(path.join(SRC, 'ui/context/ServiceContext.tsx'), 'utf8');
	const matches = [...sc.matchAll(/from\s+['"]@\/app\/[^'"]+['"]/g)];
	if (matches.length > 0) {
		throw new Error(
			`T11P regression: ServiceContext.tsx still imports from @/app/**:\n  ${matches.map((m) => m[0]).join('\n  ')}`,
		);
	}
	console.log('PASS: serviceContextHasNoAppImports');
}

async function testChatNavigationHasNoAppImport(): Promise<void> {
	const f = await readFile(path.join(SRC, 'ui/view/chat-view/chatNavigation.ts'), 'utf8');
	if (/from\s+['"]@\/app\/[^'"]+['"]/.test(f)) {
		throw new Error(
			'T11P regression: chatNavigation.ts imports from @/app/** — the AppContext fallback / ViewManager type must come from a neutral port.',
		);
	}
	// Strip comments before checking for active AppContext references.
	const stripped = f.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
	if (/\bAppContext\b/.test(stripped)) {
		throw new Error(
			'T11P regression: chatNavigation.ts still references AppContext outside comments — the fallback must be removed.',
		);
	}
	console.log('PASS: chatNavigationHasNoAppImport');
}

async function testSettingsTabsHaveNoPeakCommandActionsImports(): Promise<void> {
	const tabs = [
		'ui/view/settings/MaintenanceTab.tsx',
		'ui/view/settings/tabs/AISetupTab.tsx',
		'ui/view/settings/tabs/AdvancedTab.tsx',
		'ui/view/settings/tabs/OverviewTab.tsx',
		'ui/view/settings/tabs/KnowledgeIndexTab.tsx',
	];
	const bad: string[] = [];
	for (const rel of tabs) {
		const content = await readFile(path.join(SRC, rel), 'utf8');
		if (/from\s+['"]@\/app\/commands\/PeakCommandActions['"]/.test(content)) {
			bad.push(`${rel} (static import)`);
		}
		if (/import\(\s*['"]@\/app\/commands\/PeakCommandActions['"]\s*\)/.test(content)) {
			bad.push(`${rel} (dynamic import shim)`);
		}
	}
	if (bad.length > 0) {
		throw new Error(
			`T11P regression: settings tabs must consume settingsActions instead of PeakCommandActions:\n  ${bad.join('\n  ')}`,
		);
	}
	console.log(`PASS: settingsTabsHaveNoPeakCommandActionsImports (${tabs.length} tabs verified)`);
}

async function testNewPortFilesExist(): Promise<void> {
	const required = [
		'service/view/ViewActivationPort.ts',
		'service/chat/navigation/ChatNavigationPort.ts',
		'service/navigation/WikilinkPort.ts',
		'service/stats/VaultStatsPort.ts',
		'service/settings/SettingsActionsPort.ts',
		'ui/view/chat-view/useChatNavigation.ts',
	];
	const compositionFiles = [
		'app/commands/composeSettingsActions.ts',
		'app/navigation/AppWikilinkAdapter.ts',
		'app/stats/AppVaultStatsAdapter.ts',
		'app/quick-search/composeQuickSearchHost.ts',
	];
	for (const rel of [...required, ...compositionFiles]) {
		assert.strictEqual(
			await exists(path.join(SRC, rel)),
			true,
			`T11P required port/adapter missing: src/${rel}`,
		);
	}
	console.log(`PASS: newPortFilesExist (${required.length + compositionFiles.length} files confirmed)`);
}

function testVaultNavigationPortHasNoRawObsidianPrimitives(): void {
	const port = require('fs').readFileSync(
		path.join(SRC, 'service/navigation/VaultNavigationPort.ts'),
		'utf8',
	) as string;
	const banned = [
		/getVault\s*\(/,
		/getWorkspace\s*\(/,
		/getAbstractFileByPath\s*\(/,
		/getActiveLeaf\s*\(/,
		/getApp\s*\(/,
		/:\s*App\b/,
		/:\s*Vault\b/,
		/:\s*Workspace\b/,
	];
	const hits: string[] = [];
	for (const re of banned) {
		const m = port.match(re);
		if (m) hits.push(m[0]);
	}
	if (hits.length > 0) {
		throw new Error(
			`T11P Codex correction #2 tripped: VaultNavigationPort exposes raw Obsidian primitives: ${hits.join(', ')}. The port must publish user-level actions only.`,
		);
	}
	console.log('PASS: vaultNavigationPortHasNoRawObsidianPrimitives');
}

function testUiRawVaultOpFloorUnchanged(): void {
	const out = rg(
		String.raw`\bapp\.vault\.(read|modify|create|trash|cachedRead|readBinary)|\bapp\.workspace\.activeEditor|\bapp\.fileManager\.|\bapp\.workspace\.openLinkText`,
		path.join(SRC, 'ui'),
	);
	const lines = out.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > FLOORS.uiRawVaultOps) {
		throw new Error(
			`T11P carries T11N raw-IO floor: ${lines.length} matches in src/ui > floor ${FLOORS.uiRawVaultOps}.`,
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
	console.log('PASS: boundaryScriptUnmodified');
}

function testUiHasNoAppImportsStaticOrDynamic(): void {
	// T11P review-fix: the original guard only checked selected files. Codex found
	// `src/ui/view/quick-search/hooks/useGraphAgent.ts` still hiding a dynamic
	// `await import('@/app/context/AppContext')`. Lock the entire `src/ui/**`
	// tree against *any* form of `@/app/**` import — static OR dynamic.
	const pattern = String.raw`from\s+['"]@/app/|import\(\s*['"]@/app/`;
	const out = rg(pattern, path.join(SRC, 'ui'));
	const lines = out.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > 0) {
		throw new Error(
			`T11P review-fix tripped: src/ui/** still imports from @/app/** (static or dynamic):\n  ${lines.slice(0, 20).join('\n  ')}\nRoute the dependency through a narrow named port composed in the app layer.`,
		);
	}
	console.log('PASS: uiHasNoAppImportsStaticOrDynamic (0 src/ui/** -> @/app/** imports)');
}

function testNoNewGodPort(): void {
	const out = rg(
		String.raw`\b(UiHostPort|AppPort|UIHostGod|AppShellEverything|EverythingPort|UiPluginPort)\b`,
		SRC,
	);
	const meaningful = out
		.split('\n')
		.filter((l) => l.trim().length > 0)
		.filter((l) => !l.includes('t11p-remaining-ui-app-tail-regression.test.ts'))
		.filter((l) => !l.includes('t11o-app-shell-relocation-regression.test.ts'))
		.filter((l) => !l.includes('t11n-ui-vault-port-regression.test.ts'))
		.filter((l) => !l.includes('t11m-ui-app-boundary-regression.test.ts'));
	if (meaningful.length > 0) {
		throw new Error(
			`T11P god-port ban tripped:\n${meaningful.slice(0, 10).join('\n')}`,
		);
	}
	console.log('PASS: noNewGodPort');
}

function testUseServiceContextPluginNotInflated(): void {
	// Codex correction #3: removing `app` must not be replaced by raw `plugin`.
	// The T11O baseline (T11P start) had this many `useServiceContext().plugin`
	// consumers — T11P must not add new ones.
	const PLUGIN_CONSUMER_FLOOR = 3; // T11P landing — 3 known consumers (KnowledgeIndexTab, useSearchSession, host plugin.saveSettings).
	const out = rg(
		String.raw`useServiceContext\(\).*\bplugin\b|const \{[^}]*\bplugin\b[^}]*\} = useServiceContext\(\)`,
		path.join(SRC, 'ui'),
	);
	const count = out.split('\n').filter((l) => l.trim().length > 0).length;
	if (count > PLUGIN_CONSUMER_FLOOR) {
		throw new Error(
			`T11P Codex correction #3 tripped: useServiceContext().plugin consumers = ${count} > floor ${PLUGIN_CONSUMER_FLOOR}.\nDo not migrate UI from \`app\` to raw \`plugin\` — expose a narrow action / stats / settings port instead.`,
		);
	}
	console.log(`PASS: useServiceContextPluginNotInflated (${count} consumers <= floor ${PLUGIN_CONSUMER_FLOOR})`);
}

async function main(): Promise<void> {
	testT11pFlooredMetrics();
	testUseServiceContextAppHonestyMetric();
	testUseServiceContextPluginNotInflated();
	testUiRawVaultOpFloorUnchanged();
	testServiceContextDoesNotPublishRawApp();
	await testServiceContextHasNoAppImports();
	await testChatNavigationHasNoAppImport();
	await testSettingsTabsHaveNoPeakCommandActionsImports();
	await testNewPortFilesExist();
	testVaultNavigationPortHasNoRawObsidianPrimitives();
	await testBoundaryScriptUnmodified();
	testUiHasNoAppImportsStaticOrDynamic();
	testNoNewGodPort();
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
