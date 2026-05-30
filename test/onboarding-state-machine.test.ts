/**
 * Pure-reducer tests for the 7-step OnboardingStateMachine.
 * No DOM / Obsidian / React — just transitions.
 */

import {
    canContinue,
    initialState,
    PRIMARY_STEPS,
    primaryStepIndex,
    reduce,
    substepLabel,
    type OnboardingState,
} from '@/ui/view/onboarding/OnboardingStateMachine';

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

// ─── 7-step contract ───────────────────────────────────────────────────

test('PRIMARY_STEPS lists the 7 canonical steps in order', () => {
    return expectEq(
        PRIMARY_STEPS as readonly string[],
        ['welcome', 'capabilities', 'provider', 'ai-behavior', 'index-readiness', 'system-check', 'ready-to-try'],
        'canonical 7-step order',
    );
});

test('initialState defaults to welcome and clean slate', () => {
    const s = initialState();
    return expectEq(s.step, 'welcome', 'starts at welcome')
        && expectEq(s.isReRun, false, 'isReRun false')
        && expectEq(s.provider.selectedProfileId, null, 'no profile')
        && expectEq(s.aiBehavior.bootstrap, null, 'no bootstrap')
        && expectEq(s.aiBehavior.substep, 'choose-bootstrap', 'first ai-behavior substep')
        && expectEq(s.aiBehavior.result, null, 'no curator result')
        && expectEq(s.indexReadiness.selectedAction, null, 'no index action')
        && expectEq(s.done, false, 'not done');
});

test('initialState skips welcome in re-run mode', () => {
    const s = initialState({ isReRun: true });
    return expectEq(s.step, 'capabilities', 're-run starts at capabilities')
        && expectEq(s.isReRun, true, 'isReRun true');
});

test('initialState honors explicit initialStep override', () => {
    const s = initialState({ isReRun: true, initialStep: 'ai-behavior' });
    return expectEq(s.step, 'ai-behavior', 'starts at requested step');
});

// ─── primary nav ───────────────────────────────────────────────────────

test('next advances welcome → capabilities', () => {
    const s = reduce(initialState(), { type: 'next' });
    return expectEq(s.step, 'capabilities', 'capabilities follows welcome');
});

test('back from capabilities returns to welcome (not in re-run)', () => {
    const s = reduce({ ...initialState(), step: 'capabilities' }, { type: 'back' });
    return expectEq(s.step, 'welcome', 'welcome');
});

test('back from capabilities is a no-op in re-run mode (welcome skipped)', () => {
    const s = reduce(initialState({ isReRun: true }), { type: 'back' });
    return expectEq(s.step, 'capabilities', 'stays put');
});

test('jump moves to a valid primary step', () => {
    const s = reduce(initialState(), { type: 'jump', step: 'index-readiness' });
    return expectEq(s.step, 'index-readiness', 'jumped');
});

// ─── provider step ─────────────────────────────────────────────────────

test('next from provider blocks without a selection', () => {
    const s: OnboardingState = { ...initialState(), step: 'provider' };
    return expectEq(reduce(s, { type: 'next' }).step, 'provider', 'stays put');
});

test('select-profile + next advances to ai-behavior', () => {
    let s: OnboardingState = { ...initialState(), step: 'provider' };
    s = reduce(s, { type: 'select-profile', profileId: 'p1' });
    s = reduce(s, { type: 'next' });
    return expectEq(s.step, 'ai-behavior', 'advanced')
        && expectEq(s.provider.selectedProfileId, 'p1', 'profile retained');
});

test('clear-profile resets both profile and bootstrap', () => {
    let s = initialState();
    s = reduce(s, { type: 'select-bootstrap', profileId: 'p1', modelId: 'm1' });
    s = reduce(s, { type: 'clear-profile' });
    return expectEq(s.provider.selectedProfileId, null, 'profile cleared')
        && expectEq(s.aiBehavior.bootstrap, null, 'bootstrap cleared');
});

// ─── ai-behavior substep flow ──────────────────────────────────────────

test('ai-behavior next blocks without bootstrap', () => {
    const s: OnboardingState = { ...initialState(), step: 'ai-behavior' };
    return expectEq(reduce(s, { type: 'next' }).aiBehavior.substep, 'choose-bootstrap', 'stays put');
});

test('select-bootstrap + next moves to preference-questions', () => {
    let s: OnboardingState = { ...initialState(), step: 'ai-behavior' };
    s = reduce(s, { type: 'select-bootstrap', profileId: 'p1', modelId: 'haiku' });
    s = reduce(s, { type: 'next' });
    return expectEq(s.aiBehavior.substep, 'preference-questions', 'preferences')
        && expectEq(s.aiBehavior.bootstrap, { profileId: 'p1', modelId: 'haiku' }, 'bootstrap');
});

test('preference-questions next enters running-curator with isRunning', () => {
    const s: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'preference-questions' },
    };
    const next = reduce(s, { type: 'next' });
    return expectEq(next.aiBehavior.substep, 'running-curator', 'running')
        && expectEq(next.aiBehavior.isRunning, true, 'isRunning true');
});

const FAKE_RESULT = {
    recommendation: {
        bindings: { quick: 'a', deep: 'b', premium: 'c' },
        cascadeEnabled: true,
        modelsToDownload: [] as string[],
        apiKeysNeeded: [] as never[],
        rationale: '…',
    },
    fromLLM: true,
    attempts: [] as never[],
} as const;

test('run-curator-success moves to review with result', () => {
    const s: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'running-curator', isRunning: true },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = reduce(s, { type: 'run-curator-success', result: FAKE_RESULT as any });
    return expectEq(next.aiBehavior.substep, 'review-recommendation', 'review')
        && expectEq(next.aiBehavior.isRunning, false, 'isRunning false')
        && expectEq(next.aiBehavior.result?.recommendation.bindings.quick, 'a', 'result stored');
});

test('run-curator-error keeps substep and records message', () => {
    const s: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'running-curator', isRunning: true },
    };
    const next = reduce(s, { type: 'run-curator-error', message: 'boom' });
    return expectEq(next.aiBehavior.substep, 'running-curator', 'stays in running')
        && expectEq(next.aiBehavior.isRunning, false, 'isRunning false')
        && expectEq(next.aiBehavior.error, 'boom', 'error stored');
});

test('open-edit-recommendation requires a result', () => {
    const blank = reduce({ ...initialState(), step: 'ai-behavior' }, { type: 'open-edit-recommendation' });
    const withResult: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiBehavior: { ...initialState().aiBehavior, substep: 'review-recommendation', result: FAKE_RESULT as any },
    };
    const ok = reduce(withResult, { type: 'open-edit-recommendation' });
    return expectEq(blank.aiBehavior.substep, 'choose-bootstrap', 'no-op without result')
        && expectEq(ok.aiBehavior.substep, 'edit-recommendation', 'opens edit with result');
});

test('update-binding mutates only the requested capability', () => {
    const s: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiBehavior: { ...initialState().aiBehavior, substep: 'edit-recommendation', result: FAKE_RESULT as any },
    };
    const next = reduce(s, { type: 'update-binding', capability: 'quick', modelId: 'NEW' });
    return expectEq(next.aiBehavior.result?.recommendation.bindings.quick, 'NEW', 'quick updated')
        && expectEq(next.aiBehavior.result?.recommendation.bindings.deep, 'b', 'deep unchanged');
});

test('back from edit/redo returns to review', () => {
    const e: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'edit-recommendation' },
    };
    const r: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'redo-input' },
    };
    return expectEq(reduce(e, { type: 'ai-behavior-back-substep' }).aiBehavior.substep, 'review-recommendation', 'edit→review')
        && expectEq(reduce(r, { type: 'ai-behavior-back-substep' }).aiBehavior.substep, 'review-recommendation', 'redo→review');
});

test('submit-redo re-enters running-curator with note preserved', () => {
    const s: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'redo-input', redoNote: 'cheaper plz' },
    };
    const next = reduce(s, { type: 'submit-redo' });
    return expectEq(next.aiBehavior.substep, 'running-curator', 're-runs')
        && expectEq(next.aiBehavior.isRunning, true, 'isRunning true')
        && expectEq(next.aiBehavior.redoNote, 'cheaper plz', 'note preserved');
});

test('accept-recommendation advances to index-readiness', () => {
    const s: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'review-recommendation' },
    };
    const next = reduce(s, { type: 'accept-recommendation' });
    return expectEq(next.step, 'index-readiness', 'advances primary step');
});

// ─── back semantics inside ai-behavior ─────────────────────────────────

test('back from choose-bootstrap returns to provider primary step', () => {
    const s: OnboardingState = { ...initialState(), step: 'ai-behavior' };
    const next = reduce(s, { type: 'back' });
    return expectEq(next.step, 'provider', 'back to provider');
});

test('back from preference-questions stays in ai-behavior at choose-bootstrap', () => {
    const s: OnboardingState = {
        ...initialState(),
        step: 'ai-behavior',
        aiBehavior: { ...initialState().aiBehavior, substep: 'preference-questions' },
    };
    const next = reduce(s, { type: 'back' });
    return expectEq(next.step, 'ai-behavior', 'still ai-behavior')
        && expectEq(next.aiBehavior.substep, 'choose-bootstrap', 'substep stepped back');
});

// ─── index-readiness ───────────────────────────────────────────────────

test('next from index-readiness blocks without an action picked', () => {
    const s: OnboardingState = { ...initialState(), step: 'index-readiness' };
    const next = reduce(s, { type: 'next' });
    return expectEq(next.step, 'index-readiness', 'stays put');
});

test('select-index-action + next advances to system-check', () => {
    let s: OnboardingState = { ...initialState(), step: 'index-readiness' };
    s = reduce(s, { type: 'select-index-action', action: 'skip' });
    s = reduce(s, { type: 'next' });
    return expectEq(s.step, 'system-check', 'advanced');
});

// ─── system-check + ready-to-try ───────────────────────────────────────

test('system-check ack + next advances to ready-to-try', () => {
    let s: OnboardingState = { ...initialState(), step: 'system-check' };
    s = reduce(s, { type: 'acknowledge-system-check' });
    s = reduce(s, { type: 'next' });
    return expectEq(s.step, 'ready-to-try', 'advanced')
        && expectEq(s.systemCheck.acknowledged, true, 'ack recorded');
});

test('finish marks done', () => {
    const s: OnboardingState = { ...initialState(), step: 'ready-to-try' };
    const next = reduce(s, { type: 'finish' });
    return expectEq(next.done, true, 'done true');
});

// ─── cancel ────────────────────────────────────────────────────────────

test('cancel resets to initial state preserving isReRun', () => {
    let s = initialState({ isReRun: true });
    s = reduce(s, { type: 'next' });
    s = reduce(s, { type: 'select-profile', profileId: 'p1' });
    const reset = reduce(s, { type: 'cancel' });
    return expectEq(reset.step, 'capabilities', 're-run start')
        && expectEq(reset.provider.selectedProfileId, null, 'profile cleared')
        && expectEq(reset.isReRun, true, 'isReRun preserved');
});

// ─── derived helpers ───────────────────────────────────────────────────

test('canContinue gates correctly per primary step', () => {
    return expectTrue(canContinue(initialState()), 'welcome continuable')
        && expectTrue(canContinue({ ...initialState(), step: 'capabilities' }), 'capabilities continuable')
        && expectTrue(!canContinue({ ...initialState(), step: 'provider' }), 'provider needs selection')
        && expectTrue(
            canContinue({ ...initialState(), step: 'provider', provider: { selectedProfileId: 'p1' } }),
            'provider continuable with profile',
        )
        && expectTrue(
            !canContinue({ ...initialState(), step: 'index-readiness' }),
            'index-readiness needs an action',
        )
        && expectTrue(
            canContinue({ ...initialState(), step: 'index-readiness', indexReadiness: { selectedAction: 'skip' } }),
            'index-readiness continuable with action',
        );
});

test('primaryStepIndex returns ordered positions', () => {
    return expectEq(primaryStepIndex('welcome'), 0, 'welcome=0')
        && expectEq(primaryStepIndex('ai-behavior'), 3, 'ai-behavior=3')
        && expectEq(primaryStepIndex('ready-to-try'), 6, 'ready-to-try=6');
});

test('substepLabel reflects ai-behavior substep', () => {
    const base: OnboardingState = { ...initialState(), step: 'ai-behavior' };
    const review: OnboardingState = {
        ...base,
        aiBehavior: { ...base.aiBehavior, substep: 'review-recommendation' },
    };
    return expectEq(substepLabel(initialState()), null, 'null outside ai-behavior')
        && expectEq(substepLabel(base), 'Pick a starter model', 'choose-bootstrap label')
        && expectEq(substepLabel(review), 'Review your model choices', 'review label');
});

// ─── run ───────────────────────────────────────────────────────────────

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
