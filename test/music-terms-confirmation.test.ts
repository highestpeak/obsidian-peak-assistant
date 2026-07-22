// Zero-gap Track E — Music licensing confirmation gate.
//
// Tests:
//   T1. First-run: no acceptance record → confirm gate is disabled with
//        reason='music-terms-not-accepted' and requiresAcceptance=true.
//   T2. Session checkbox flip: user checks the box → gate opens (disabled
//        false) but still requiresAcceptance=true so the acceptance record
//        is written on the confirm click.
//   T3. Prior acceptance matching current policy version → gate opens and
//        requiresAcceptance=false (checkbox suppressed).
//   T4. Prior acceptance for a DIFFERENT policy version → treated as
//        first-run again (disabled).
//   T5. Non-music receipts always open.
//   T6. buildAcceptanceRecord writes both policyVersion and confirmedAt.

import assert from 'assert';
import {
	evaluateMusicTermsAcceptance,
	buildAcceptanceRecord,
	musicConfirmGate,
} from '@/service/media/musicTermsAcceptance';

function testFirstRunDisabled() {
	const view = evaluateMusicTermsAcceptance({ activePolicyVersion: '2026-07-21' });
	assert.strictEqual(view.alreadyAccepted, false);
	const gate = musicConfirmGate({ mediaKind: 'music', acceptance: view, checkedThisSession: false });
	assert.strictEqual(gate.disabled, true);
	assert.strictEqual(gate.requiresAcceptance, true);
	assert.strictEqual(gate.reason, 'music-terms-not-accepted');
	console.log('PASS: T1 first-run confirm disabled');
}

function testSessionCheckboxOpens() {
	const view = evaluateMusicTermsAcceptance({ activePolicyVersion: '2026-07-21' });
	const gate = musicConfirmGate({ mediaKind: 'music', acceptance: view, checkedThisSession: true });
	assert.strictEqual(gate.disabled, false);
	assert.strictEqual(gate.requiresAcceptance, true, 'confirm handler should still persist acceptance');
	console.log('PASS: T2 session checkbox opens gate, keeps requiresAcceptance');
}

function testPriorAcceptanceOpens() {
	const view = evaluateMusicTermsAcceptance({
		activePolicyVersion: '2026-07-21',
		acceptance: { policyVersion: '2026-07-21', confirmedAt: 1234567890 },
	});
	assert.strictEqual(view.alreadyAccepted, true);
	const gate = musicConfirmGate({ mediaKind: 'music', acceptance: view, checkedThisSession: false });
	assert.strictEqual(gate.disabled, false);
	assert.strictEqual(gate.requiresAcceptance, false, 'checkbox suppressed');
	console.log('PASS: T3 prior acceptance opens gate silently');
}

function testPolicyVersionBumpRePrompts() {
	const view = evaluateMusicTermsAcceptance({
		activePolicyVersion: '2027-01-01',
		acceptance: { policyVersion: '2026-07-21', confirmedAt: 1234567890 },
	});
	assert.strictEqual(view.alreadyAccepted, false);
	const gate = musicConfirmGate({ mediaKind: 'music', acceptance: view, checkedThisSession: false });
	assert.strictEqual(gate.disabled, true);
	console.log('PASS: T4 policy version bump re-prompts');
}

function testNonMusicAlwaysOpen() {
	const view = evaluateMusicTermsAcceptance({ activePolicyVersion: '2026-07-21' });
	const gate = musicConfirmGate({ mediaKind: 'video', acceptance: view, checkedThisSession: false });
	assert.strictEqual(gate.disabled, false);
	assert.strictEqual(gate.requiresAcceptance, false);
	console.log('PASS: T5 non-music always open');
}

function testBuildAcceptanceRecord() {
	const rec = buildAcceptanceRecord('2026-07-21', 999);
	assert.deepStrictEqual(rec, { policyVersion: '2026-07-21', confirmedAt: 999 });
	console.log('PASS: T6 buildAcceptanceRecord shape');
}

testFirstRunDisabled();
testSessionCheckboxOpens();
testPriorAcceptanceOpens();
testPolicyVersionBumpRePrompts();
testNonMusicAlwaysOpen();
testBuildAcceptanceRecord();
console.log('All music-terms-confirmation tests passed');
