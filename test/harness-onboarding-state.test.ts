/**
 * Pure-reducer tests for the harness onboarding wizard state machine.
 * No DOM / Obsidian / React — just transitions.
 */

import {
    canContinue,
    initialState,
    reduce,
    stepIndex,
    VISIBLE_STEPS,
    type WizardState,
} from '@/ui/view/modals/harness-onboarding/state';

interface Case {
    name: string;
    run: () => boolean;
}

const cases: Case[] = [];
function test(name: string, run: () => boolean): void {
    cases.push({ name, run });
}

function expectEq<T>(actual: T, expected: T, msg: string): boolean {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) console.log(`    ✗ ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return ok;
}

function expectTrue(actual: boolean, msg: string): boolean {
    if (!actual) console.log(`    ✗ ${msg}`);
    return actual;
}

// ─── initialState ──────────────────────────────────────────────────

test('initialState defaults to welcome and no selections', () => {
    const s = initialState();
    return expectEq(s.step, 'welcome', 'starts at welcome')
        && expectEq(s.selectedProfileId, null, 'no profile selected')
        && expectEq(s.bootstrap, null, 'no bootstrap selected')
        && expectEq(s.isReRun, false, 'isReRun false by default');
});

test('initialState carries isReRun=true', () => {
    return expectEq(initialState({ isReRun: true }).isReRun, true, 'isReRun set');
});

// ─── start ─────────────────────────────────────────────────────────

test('start advances welcome → choose-provider', () => {
    const next = reduce(initialState(), { type: 'start' });
    return expectEq(next.step, 'choose-provider', 'advances to choose-provider');
});

test('start is a no-op after welcome', () => {
    const provider: WizardState = { ...initialState(), step: 'choose-provider' };
    const next = reduce(provider, { type: 'start' });
    return expectEq(next.step, 'choose-provider', 'stays at choose-provider');
});

test('skip-welcome works from any earlier step', () => {
    const next = reduce(initialState(), { type: 'skip-welcome' });
    return expectEq(next.step, 'choose-provider', 'skips to choose-provider');
});

// ─── select-profile / clear-profile ────────────────────────────────

test('select-profile stores profileId', () => {
    const next = reduce(initialState(), { type: 'select-profile', profileId: 'p1' });
    return expectEq(next.selectedProfileId, 'p1', 'profile stored');
});

test('clear-profile resets profile and bootstrap', () => {
    let s = initialState();
    s = reduce(s, { type: 'select-bootstrap', profileId: 'p1', modelId: 'm1' });
    s = reduce(s, { type: 'clear-profile' });
    return expectEq(s.selectedProfileId, null, 'profile cleared')
        && expectEq(s.bootstrap, null, 'bootstrap cleared');
});

// ─── select-bootstrap ──────────────────────────────────────────────

test('select-bootstrap sets both profileId and bootstrap', () => {
    const next = reduce(initialState(), { type: 'select-bootstrap', profileId: 'p1', modelId: 'haiku' });
    return expectEq(next.selectedProfileId, 'p1', 'profileId set')
        && expectEq(next.bootstrap, { profileId: 'p1', modelId: 'haiku' }, 'bootstrap set');
});

// ─── continue gating ───────────────────────────────────────────────

test('continue from choose-provider blocks without selection', () => {
    const s: WizardState = { ...initialState(), step: 'choose-provider' };
    const next = reduce(s, { type: 'continue' });
    return expectEq(next.step, 'choose-provider', 'stays put when no profile');
});

test('continue from choose-provider advances when profile selected', () => {
    let s: WizardState = { ...initialState(), step: 'choose-provider' };
    s = reduce(s, { type: 'select-profile', profileId: 'p1' });
    s = reduce(s, { type: 'continue' });
    return expectEq(s.step, 'choose-bootstrap', 'advances to choose-bootstrap');
});

test('continue from choose-bootstrap blocks without bootstrap', () => {
    const s: WizardState = { ...initialState(), step: 'choose-bootstrap', selectedProfileId: 'p1' };
    const next = reduce(s, { type: 'continue' });
    return expectEq(next.step, 'choose-bootstrap', 'stays put when no bootstrap');
});

test('continue from choose-bootstrap advances when bootstrap selected', () => {
    let s: WizardState = { ...initialState(), step: 'choose-bootstrap', selectedProfileId: 'p1' };
    s = reduce(s, { type: 'select-bootstrap', profileId: 'p1', modelId: 'haiku' });
    s = reduce(s, { type: 'continue' });
    return expectEq(s.step, 'preference-questions', 'advances to preference-questions (PR3 stub)');
});

// ─── back ──────────────────────────────────────────────────────────

test('back from choose-provider returns to welcome', () => {
    const s: WizardState = { ...initialState(), step: 'choose-provider' };
    return expectEq(reduce(s, { type: 'back' }).step, 'welcome', 'goes back to welcome');
});

test('back from welcome stays at welcome', () => {
    return expectEq(reduce(initialState(), { type: 'back' }).step, 'welcome', 'no underflow');
});

// ─── canContinue ──────────────────────────────────────────────────

test('canContinue gates correctly per step', () => {
    return expectTrue(canContinue(initialState()), 'welcome always continuable')
        && expectTrue(!canContinue({ ...initialState(), step: 'choose-provider' }), 'choose-provider needs profile')
        && expectTrue(canContinue({ ...initialState(), step: 'choose-provider', selectedProfileId: 'p1' }), 'choose-provider continuable with profile')
        && expectTrue(!canContinue({ ...initialState(), step: 'choose-bootstrap', selectedProfileId: 'p1' }), 'choose-bootstrap needs bootstrap')
        && expectTrue(canContinue({ ...initialState(), step: 'choose-bootstrap', selectedProfileId: 'p1', bootstrap: { profileId: 'p1', modelId: 'm1' } }), 'choose-bootstrap continuable with bootstrap');
});

// ─── stepIndex / VISIBLE_STEPS ─────────────────────────────────────

test('stepIndex returns ordered positions for visible steps', () => {
    return expectEq(stepIndex('welcome'), 0, 'welcome=0')
        && expectEq(stepIndex('choose-provider'), 1, 'choose-provider=1')
        && expectEq(stepIndex('choose-bootstrap'), 2, 'choose-bootstrap=2');
});

test('VISIBLE_STEPS excludes done', () => {
    return expectTrue(!VISIBLE_STEPS.includes('done' as never), 'done is not visible');
});

// ─── cancel ────────────────────────────────────────────────────────

test('cancel resets to welcome but preserves isReRun', () => {
    let s = initialState({ isReRun: true });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'select-profile', profileId: 'p1' });
    const reset = reduce(s, { type: 'cancel' });
    return expectEq(reset.step, 'welcome', 'reset to welcome')
        && expectEq(reset.selectedProfileId, null, 'profile cleared')
        && expectEq(reset.isReRun, true, 'isReRun preserved');
});

// ─── preferences ──────────────────────────────────────────────────

test('set-budget updates budget only', () => {
    const next = reduce(initialState(), { type: 'set-budget', budget: 'zero' });
    return expectEq(next.preferences.budget, 'zero', 'budget set')
        && expectEq(next.preferences.speedQuality, 'balanced', 'speedQuality unchanged');
});

test('set-speed-quality updates preference only', () => {
    const next = reduce(initialState(), { type: 'set-speed-quality', preference: 'quality' });
    return expectEq(next.preferences.speedQuality, 'quality', 'speedQuality set')
        && expectEq(next.preferences.budget, 'low', 'budget unchanged');
});

// ─── curator lifecycle ───────────────────────────────────────────

const FAKE_RESULT = {
    recommendation: {
        bindings: { quick: 'a', deep: 'b', premium: 'c' },
        cascadeEnabled: true,
        modelsToDownload: [] as string[],
        apiKeysNeeded: [] as never[],
        rationale: '...',
    },
    fromLLM: true,
    attempts: [] as never[],
} as const;

test('continue from preference-questions starts running-curator', () => {
    const s: WizardState = { ...initialState(), step: 'preference-questions' };
    const next = reduce(s, { type: 'continue' });
    return expectEq(next.step, 'running-curator', 'enters running-curator')
        && expectEq(next.isRunning, true, 'isRunning true');
});

test('run-curator-success transitions to review with result', () => {
    const s: WizardState = { ...initialState(), step: 'running-curator', isRunning: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = reduce(s, { type: 'run-curator-success', result: FAKE_RESULT as any });
    return expectEq(next.step, 'review-recommendation', 'goes to review')
        && expectEq(next.isRunning, false, 'isRunning cleared')
        && expectEq(next.result?.recommendation.bindings.quick, 'a', 'result stored');
});

test('run-curator-error clears isRunning and records message', () => {
    const s: WizardState = { ...initialState(), step: 'running-curator', isRunning: true };
    const next = reduce(s, { type: 'run-curator-error', message: 'boom' });
    return expectEq(next.isRunning, false, 'isRunning cleared')
        && expectEq(next.error, 'boom', 'error stored')
        && expectEq(next.step, 'running-curator', 'step unchanged so user sees error inline');
});

// ─── edit + redo ─────────────────────────────────────────────────

test('open-edit only works after a result', () => {
    const noResult = reduce(initialState(), { type: 'open-edit' });
    const withResult: WizardState = {
        ...initialState(),
        step: 'review-recommendation',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: FAKE_RESULT as any,
    };
    const ok = reduce(withResult, { type: 'open-edit' });
    return expectEq(noResult.step, 'welcome', 'no-op without result')
        && expectEq(ok.step, 'edit-recommendation', 'goes to edit with result');
});

test('update-binding mutates the active recommendation', () => {
    const s: WizardState = {
        ...initialState(),
        step: 'edit-recommendation',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: FAKE_RESULT as any,
    };
    const next = reduce(s, { type: 'update-binding', capability: 'quick', modelId: 'NEW' });
    return expectEq(next.result?.recommendation.bindings.quick, 'NEW', 'quick updated')
        && expectEq(next.result?.recommendation.bindings.deep, 'b', 'deep unchanged');
});

test('back from edit/redo returns to review', () => {
    const e: WizardState = { ...initialState(), step: 'edit-recommendation' };
    const r: WizardState = { ...initialState(), step: 'redo-input' };
    return expectEq(reduce(e, { type: 'back' }).step, 'review-recommendation', 'edit→review')
        && expectEq(reduce(r, { type: 'back' }).step, 'review-recommendation', 'redo→review');
});

test('submit-redo enters running-curator with isRunning', () => {
    const s: WizardState = { ...initialState(), step: 'redo-input', redoNote: 'cheaper plz' };
    const next = reduce(s, { type: 'submit-redo' });
    return expectEq(next.step, 'running-curator', 'reruns curator')
        && expectEq(next.isRunning, true, 'isRunning true')
        && expectEq(next.redoNote, 'cheaper plz', 'note preserved for the next run');
});

test('accept-recommendation moves to done', () => {
    const s: WizardState = { ...initialState(), step: 'review-recommendation' };
    return expectEq(reduce(s, { type: 'accept-recommendation' }).step, 'done', 'accepted → done');
});

// ─── run ───────────────────────────────────────────────────────────

function runTests(): boolean {
    let passed = 0;
    let failed = 0;
    for (const c of cases) {
        try {
            if (c.run()) {
                console.log(`  ✓ ${c.name}`);
                passed++;
            } else {
                console.log(`  ✗ ${c.name}`);
                failed++;
            }
        } catch (e) {
            console.log(`  ✗ ${c.name} — threw: ${(e as Error).message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    return failed === 0;
}

export { runTests };

if (typeof window === 'undefined') {
    const ok = runTests();
    if (!ok) process.exit(1);
}
