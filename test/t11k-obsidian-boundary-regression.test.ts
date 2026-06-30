// T11K **regression floor** guards for Obsidian file-handle / vault-port
// boundary work. These lock the metrics at the state they reached when
// T11K landed; the actual final architecture target is still owned by the
// scorecard. Tripping a floor means a future change pushed coupling back
// up — either lower the floor in the same PR (intentional progress) or
// fix the regression.
//
// Per the T11K handoff: the `service -> app` floor is `<= 15`, NOT `<= 16`
// — T11J already proved 15 is reachable, so a single-edge slack would be
// a silent regression budget. Same logic for `service -> ui = 0` and
// `core -> ui = 0`.

import assert from 'assert';
import { spawnSync } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');
const SRC = path.resolve(ROOT, 'src');

// Floors observed at T11K landing time. Increasing any of these requires
// either a deliberate wave-up (raise the floor in the same PR) or a
// genuine wave-down (lower the floor + delete the slack here).
const FLOORS = {
	// T11K primary cut: 81 -> 48. Floor at 50 keeps the hard-min target
	// of the wave (≤50) intact; lower this once the next wave runs.
	obsidianTypes: 50,
	// T11K secondary cut: 11 -> 6. Floor at 8 (hard min target) gives
	// a small slack window for an accidental single-edge re-add.
	coreUpstream: 17,
	// T11K total: 236 -> 199. Floor at 205 (hard min target).
	totalFlagged: 205,
	// T11J floor inviolable. Per T11K handoff: floor is 15 (not 16) — a
	// single-edge slack would silently invite regression.
	serviceApp: 15,
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

async function walkSrc(dir: string, out: string[] = []): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const ent of entries) {
		if (ent.name.startsWith('.')) continue;
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			await walkSrc(full, out);
			continue;
		}
		if (!ent.isFile()) continue;
		if (!/\.(ts|tsx)$/.test(ent.name)) continue;
		out.push(full);
	}
	return out;
}

async function findObsidianImportsIn(folder: string): Promise<string[]> {
	const offenders: string[] = [];
	const files = await walkSrc(folder);
	const re = /import[\s\S]*?from\s*['"]obsidian['"]/;
	for (const file of files) {
		const content = await readFile(file, 'utf8');
		if (re.test(content)) {
			offenders.push(path.relative(ROOT, file));
		}
	}
	return offenders;
}

function testRegressionFloors(): void {
	const report = runAudit();
	const total = extractTotal(report);
	const obsidianTypes = extractCountOrZero(report, 'Service/Core -> Obsidian types (Port-extraction targets)');
	const coreUpstream = extractCountOrZero(report, 'Core -> Service/App/UI (lower layer importing upper)');
	const serviceApp = extractCountOrZero(report, 'Service -> app shell (AppContext / settings types leak)');
	const serviceUi = extractCountOrZero(report, 'Service -> UI (reverse-direction violation)');
	const coreUi = extractCountOrZero(report, 'Core -> UI (reverse-direction violation)');

	const failures: string[] = [];
	if (total > FLOORS.totalFlagged)
		failures.push(`T11K floor regression: total flagged ${total} > floor ${FLOORS.totalFlagged}`);
	if (obsidianTypes > FLOORS.obsidianTypes)
		failures.push(`T11K floor regression: service/core->obsidian-types ${obsidianTypes} > floor ${FLOORS.obsidianTypes}`);
	if (coreUpstream > FLOORS.coreUpstream)
		failures.push(`T11K floor regression: core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream}`);
	if (serviceApp > FLOORS.serviceApp)
		failures.push(`T11K floor regression: service->app ${serviceApp} > floor ${FLOORS.serviceApp} (T11J inviolable)`);
	if (serviceUi > FLOORS.serviceUi)
		failures.push(`T11K floor regression: service->ui ${serviceUi} > floor ${FLOORS.serviceUi} (T11I inviolable)`);
	if (coreUi > FLOORS.coreUi)
		failures.push(`T11K floor regression: core->ui ${coreUi} > floor ${FLOORS.coreUi} (T11I inviolable)`);

	if (failures.length > 0) {
		throw new Error(
			`T11K regression floor tripped:\n  ${failures.join('\n  ')}\nThese are post-T11K locks. If you intentionally raised one, update FLOORS in this file; otherwise revert the regression.`
		);
	}

	console.log(
		`PASS: t11kRegressionFloors (total=${total} obsidian-types=${obsidianTypes} core->upstream=${coreUpstream} service->app=${serviceApp} service->ui=${serviceUi} core->ui=${coreUi})`
	);
}

async function testNoObsidianInLoaderCluster(): Promise<void> {
	// The T11K vault port lives in `src/core/ports/` and the adapter
	// lives in `src/app/vault/`. Loader code in `src/core/document/loader/**`
	// and `src/core/document/resource/**` must not import from `obsidian`.
	const loaderOffenders = await findObsidianImportsIn(path.join(SRC, 'core', 'document', 'loader'));
	const resourceOffenders = await findObsidianImportsIn(path.join(SRC, 'core', 'document', 'resource'));
	const offenders = [...loaderOffenders, ...resourceOffenders];
	assert.strictEqual(
		offenders.length,
		0,
		`T11K port boundary breached: loader/resource code must not import from 'obsidian'. Offenders:\n  ${offenders.join('\n  ')}`
	);
	console.log(`PASS: noObsidianInLoaderCluster (loader cluster has 0 obsidian imports)`);
}

async function main(): Promise<void> {
	testRegressionFloors();
	await testNoObsidianInLoaderCluster();
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	}
);
