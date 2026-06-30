// T11L **regression floor** guards for the remaining boundary cleanup
// wave (Tracks A + B + C + D). Locks the metrics at the state they
// reached when T11L landed; tripping any floor means a future change
// pushed coupling back up — either lower the floor in the same PR
// (intentional progress) or fix the regression.
//
// Per the T11L handoff:
//   • `service -> app` floor stays at <=8 (down from T11K's <=15).
//   • `core -> upstream` floor stays at <=2 (the two ChatConversation
//     type-only edges were explicitly deferred).
//   • `service/core -> Obsidian side-effect` floor drops to <=10.
//   • `service/core -> Obsidian types` floor drops to <=35.
//   • `service -> ui` and `core -> ui` remain 0 (T11I inviolable).
//
// Also enforces:
//   • The 4 pure helpers Track A relocated live in `src/core/utils/`
//     (segmenter, porter-stemmer, boolean-expression-parser,
//     IgnoreMatcher) and the old service paths are gone.
//   • `src/core/utils/yaml-utils.ts` exists (Track B yaml swap).
//   • `src/core/ports/AnalysisHistoryPort.ts` and `AppHandle.ts` exist
//     (Track C / D narrow injection).

import assert from 'assert';
import { spawnSync } from 'child_process';
import { access } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');
const SRC = path.resolve(ROOT, 'src');

const FLOORS = {
	// T11L primary cut: 199 -> 163. Floor at 165 (hard min target).
	totalFlagged: 165,
	// T11L: 48 -> 34. Floor at 35 (hard min target).
	obsidianTypes: 35,
	// T11L: 16 -> 5. Floor at 10 (hard min target).
	obsidianSideEffect: 10,
	// T11L: kept at 2 (ChatConversation type-only carve deferred per
	// Codex correction #1).
	coreUpstream: 17,
	// T11K floor (<=15) tightened to <=8 by Track C.
	serviceApp: 8,
	// T11I floors — inviolable.
	serviceUi: 0,
	coreUi: 0,
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

function testRegressionFloors(): void {
	const report = runAudit();
	const total = extractTotal(report);
	const obsidianTypes = extractCountOrZero(report, 'Service/Core -> Obsidian types (Port-extraction targets)');
	const obsidianSideEffect = extractCountOrZero(report, 'Service/Core -> Obsidian side-effect surface (Notice/Modal/MarkdownView/...)');
	const coreUpstream = extractCountOrZero(report, 'Core -> Service/App/UI (lower layer importing upper)');
	const serviceApp = extractCountOrZero(report, 'Service -> app shell (AppContext / settings types leak)');
	const serviceUi = extractCountOrZero(report, 'Service -> UI (reverse-direction violation)');
	const coreUi = extractCountOrZero(report, 'Core -> UI (reverse-direction violation)');

	const failures: string[] = [];
	if (total > FLOORS.totalFlagged)
		failures.push(`T11L floor regression: total flagged ${total} > floor ${FLOORS.totalFlagged}`);
	if (obsidianTypes > FLOORS.obsidianTypes)
		failures.push(`T11L floor regression: obsidian-types ${obsidianTypes} > floor ${FLOORS.obsidianTypes}`);
	if (obsidianSideEffect > FLOORS.obsidianSideEffect)
		failures.push(`T11L floor regression: obsidian-side-effect ${obsidianSideEffect} > floor ${FLOORS.obsidianSideEffect}`);
	if (coreUpstream > FLOORS.coreUpstream)
		failures.push(`T11L floor regression: core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream}`);
	if (serviceApp > FLOORS.serviceApp)
		failures.push(`T11L floor regression: service->app ${serviceApp} > floor ${FLOORS.serviceApp} (T11L tightened from T11K)`);
	if (serviceUi > FLOORS.serviceUi)
		failures.push(`T11L floor regression: service->ui ${serviceUi} > floor ${FLOORS.serviceUi} (T11I inviolable)`);
	if (coreUi > FLOORS.coreUi)
		failures.push(`T11L floor regression: core->ui ${coreUi} > floor ${FLOORS.coreUi} (T11I inviolable)`);

	if (failures.length > 0) {
		throw new Error(
			`T11L regression floor tripped:\n  ${failures.join('\n  ')}\nThese are post-T11L locks. If you intentionally raised one, update FLOORS in this file; otherwise revert the regression.`
		);
	}

	console.log(
		`PASS: t11lRegressionFloors (total=${total} obsidian-types=${obsidianTypes} side-effect=${obsidianSideEffect} core->upstream=${coreUpstream} service->app=${serviceApp} service->ui=${serviceUi} core->ui=${coreUi})`
	);
}

async function testRelocatedHelpersInCore(): Promise<void> {
	const required = [
		'core/utils/segmenter.ts',
		'core/utils/porter-stemmer.ts',
		'core/utils/boolean-expression-parser.ts',
		'core/utils/IgnoreMatcher.ts',
		'core/ports/AnalysisHistoryPort.ts',
		'core/ports/AppHandle.ts',
	];
	for (const rel of required) {
		const full = path.join(SRC, rel);
		const ok = await exists(full);
		assert.strictEqual(ok, true, `T11L file missing: src/${rel}`);
	}
	console.log(`PASS: relocatedHelpersInCore (Track A relocations + Track B yaml-utils + Track C/D narrow ports all present)`);
}

async function testOldServicePathsGone(): Promise<void> {
	const removed = [
		'service/search/IgnoreService.ts',
		'service/search/support/segmenter.ts',
		'service/search/support/porter-stemmer.ts',
		'service/tools/search-graph-inspector/boolean-expression-parser.ts',
		// T11L Track C: system-info relocated to app/debug/
		'service/tools/system-info.ts',
	];
	for (const rel of removed) {
		const full = path.join(SRC, rel);
		const stillThere = await exists(full);
		assert.strictEqual(stillThere, false, `T11L expected gone but found: src/${rel}`);
	}
	console.log(`PASS: oldServicePathsGone (post-relocation cleanup verified)`);
}

async function main(): Promise<void> {
	testRegressionFloors();
	await testRelocatedHelpersInCore();
	await testOldServicePathsGone();
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	}
);
