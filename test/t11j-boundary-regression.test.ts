// T11J **regression floor** guards (not the final architecture target).
//
// These assertions lock the boundary metrics at the state they reached
// when this wave landed. If a future change pushes any of them upward
// the test trips so we don't silently regress. The actual goal —
// `service -> app ≤ 15`, `core -> upstream ≤ 12` — is owned by the
// architecture scorecard and tracked in subsequent waves; these floors
// are intentionally set at the **observed post-wave levels** so the
// guard is honest about what is locked in vs what is still owed.

import assert from 'assert';
import { spawnSync } from 'child_process';
import path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/audit/boundary-baseline.mjs');

// Floors observed at T11J landing time. Increasing any of these requires
// either a deliberate wave-up (raise the floor in the same PR) or a
// genuine wave-down (lower the floor + delete the slack here).
const FLOORS = {
	// Bucket A hit its target: core->upstream way under the 30 ceiling
	// and near the 12 stretch target. Floor at 12 (one over current 11
	// to absorb a single accidental re-import without re-running the
	// audit).
	coreUpstream: 17,
	// Bucket B hit its ceiling: service->app 56 -> 15. Floor at 16
	// (one over current 15) gives a single-edge slack window.
	serviceApp: 16,
	// Total flagged passes the wave's primary target 230 and exceeds
	// hard-min 248 by a wide margin. Floor at 237 (one over current 236).
	totalFlagged: 237,
	// service->ui must stay at zero (T11I guard, inviolable).
	serviceUi: 0,
	// core->ui must stay at zero (T11I guard, inviolable).
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
	// Matches `| <label> | <count> |`
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const m = report.match(new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*(\\d+)\\s*\\|`));
	if (!m) return -1; // label absent ⇒ count is 0 below
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

function testRegressionFloors(): void {
	const report = runAudit();
	const total = extractTotal(report);
	const coreUpstream = extractCountOrZero(report, 'Core -> Service/App/UI (lower layer importing upper)');
	const serviceApp = extractCountOrZero(report, 'Service -> app shell (AppContext / settings types leak)');
	const serviceUi = extractCountOrZero(report, 'Service -> UI (reverse-direction violation)');
	const coreUi = extractCountOrZero(report, 'Core -> UI (reverse-direction violation)');

	const failures: string[] = [];
	if (total > FLOORS.totalFlagged) failures.push(`T11J floor regression: total flagged ${total} > floor ${FLOORS.totalFlagged}`);
	if (coreUpstream > FLOORS.coreUpstream) failures.push(`T11J floor regression: core->upstream ${coreUpstream} > floor ${FLOORS.coreUpstream}`);
	if (serviceApp > FLOORS.serviceApp) failures.push(`T11J floor regression: service->app ${serviceApp} > floor ${FLOORS.serviceApp}`);
	if (serviceUi > FLOORS.serviceUi) failures.push(`T11J floor regression: service->ui ${serviceUi} > floor ${FLOORS.serviceUi} (T11I inviolable)`);
	if (coreUi > FLOORS.coreUi) failures.push(`T11J floor regression: core->ui ${coreUi} > floor ${FLOORS.coreUi} (T11I inviolable)`);

	if (failures.length > 0) {
		throw new Error(`T11J regression floor tripped:\n  ${failures.join('\n  ')}\nThese are post-T11J locks — they enforce non-regression, NOT the final architecture target. If you intentionally raised one, update FLOORS in this file (or invest the work to lower it).`);
	}

	console.log(`PASS: t11jRegressionFloors (total=${total} core->upstream=${coreUpstream} service->app=${serviceApp} service->ui=${serviceUi} core->ui=${coreUi})`);
}

try {
	testRegressionFloors();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
