/**
 * Onboarding wizard state machine — 7-step canonical contract.
 *
 * PR-A scope:
 *   - Define the 7 primary user-visible steps from spec §5.5
 *     (welcome / capabilities / provider / ai-behavior / index-readiness /
 *     system-check / ready-to-try).
 *   - Fold the existing Harness-onboarding substates (choose-bootstrap,
 *     preference-questions, running-curator, review-recommendation,
 *     edit-recommendation, redo-input) under the `ai-behavior` primary so
 *     Curator backend wiring stays unchanged.
 *   - Pure logic + a React hook wrapper. No JSX, no Obsidian dependency.
 *
 * Out of scope (later PRs in the chain):
 *   - PR-B: externalize user-facing copy to templates/config/onboarding.json
 *   - PR-C: rewrite UI on top of the PR-0 design-system primitives
 *   - PR-D: Settings IA rewrite
 *   - PR-E: per-surface readiness adapter consumer
 *
 * Curator backend (src/service/agents/curator/*) is NOT touched. The shape of
 * the state machine's `aiBehavior` slice mirrors the legacy reducer in
 * src/ui/view/modals/harness-onboarding/state.ts so existing step components
 * can continue to drive Curator the same way during this PR.
 */

import { useReducer, useCallback, useMemo } from 'react';
import type {
    BudgetTier,
    CuratorResult,
    SpeedQualityPreference,
    UserPreferences,
} from '@/service/agents/harness/curator';

// ─── Primary 7-step contract ───────────────────────────────────────────

export type PrimaryStep =
    | 'welcome'
    | 'capabilities'
    | 'provider'
    | 'ai-behavior'
    | 'index-readiness'
    | 'system-check'
    | 'ready-to-try';

/**
 * Canonical 7-step ordering used by the progress indicator. Re-run mode may
 * skip subsets but never reorders them.
 */
export const PRIMARY_STEPS: readonly PrimaryStep[] = [
    'welcome',
    'capabilities',
    'provider',
    'ai-behavior',
    'index-readiness',
    'system-check',
    'ready-to-try',
];

// ─── ai-behavior substates ─────────────────────────────────────────────

/**
 * Substates of the `ai-behavior` primary step. These DO NOT get their own
 * progress dot; they update the indicator's sublabel only (spec §5.2).
 * These exactly mirror the legacy Harness wizard's internal step IDs so
 * existing per-step React components stay drop-in compatible during PR-A.
 */
export type AiBehaviorSubstep =
    | 'choose-bootstrap'
    | 'preference-questions'
    | 'running-curator'
    | 'review-recommendation'
    | 'edit-recommendation'
    | 'redo-input';

export interface BootstrapSelection {
    profileId: string;
    modelId: string;
}

export interface AiBehaviorState {
    substep: AiBehaviorSubstep;
    /** Selected bootstrap model used to seed the Curator request. */
    bootstrap: BootstrapSelection | null;
    /** Preferences gathered before Curator runs. */
    preferences: UserPreferences;
    /** True while the Curator request is in flight. */
    isRunning: boolean;
    /** Latest Curator result (LLM or fallback) once one has succeeded. */
    result: CuratorResult | null;
    /** Last invocation error, if any. */
    error: string | null;
    /** Free-form note appended on "regenerate". Preserved until the next run completes. */
    redoNote: string;
}

// ─── Other-step state slices ───────────────────────────────────────────

/** Capabilities step is informational; no user input is captured. */
export interface CapabilitiesState {
    /** Whether the user has explicitly acknowledged ("Got it"). */
    acknowledged: boolean;
}

/**
 * Provider step — the user must have at least one provider selected to
 * continue. `selectedProfileId` mirrors the legacy wizard's selection slot.
 */
export interface ProviderState {
    selectedProfileId: string | null;
}

/**
 * Index readiness step — the user picks one of the recommended actions
 * (use-existing / update-changed / build-text / enable-semantic / skip /
 * rebuild). Default is null so the UI can recommend the best option once it
 * has detected current state.
 */
export type IndexAction =
    | 'use-existing'
    | 'update-changed'
    | 'build-text'
    | 'enable-semantic'
    | 'skip'
    | 'rebuild';

export interface IndexReadinessState {
    selectedAction: IndexAction | null;
}

/**
 * System check step — purely a readiness summary, no inputs captured beyond a
 * "user has seen this" acknowledgement that gates the Continue button when red
 * rows exist. Detailed row data is computed live from CapabilityRegistry in
 * PR-E; PR-A only models the gate.
 */
export interface SystemCheckState {
    acknowledged: boolean;
}

// ─── Composite state ───────────────────────────────────────────────────

export interface OnboardingState {
    step: PrimaryStep;
    /** True when invoked as "re-run" (user already has bindings). Welcome is skipped. */
    isReRun: boolean;
    capabilities: CapabilitiesState;
    provider: ProviderState;
    aiBehavior: AiBehaviorState;
    indexReadiness: IndexReadinessState;
    systemCheck: SystemCheckState;
    /** Set to true once the wizard completes; consumers may close the modal. */
    done: boolean;
}

// ─── Events ────────────────────────────────────────────────────────────

export type OnboardingEvent =
    // Generic primary-step nav
    | { type: 'next' }
    | { type: 'back' }
    | { type: 'jump'; step: PrimaryStep }
    | { type: 'cancel' }
    | { type: 'finish' }
    // Capabilities
    | { type: 'acknowledge-capabilities' }
    // Provider
    | { type: 'select-profile'; profileId: string }
    | { type: 'clear-profile' }
    // AI behavior substep + Curator lifecycle
    | { type: 'select-bootstrap'; profileId: string; modelId: string }
    | { type: 'set-budget'; budget: BudgetTier }
    | { type: 'set-speed-quality'; preference: SpeedQualityPreference }
    | { type: 'enter-ai-behavior-substep'; substep: AiBehaviorSubstep }
    | { type: 'ai-behavior-back-substep' }
    | { type: 'run-curator-start' }
    | { type: 'run-curator-success'; result: CuratorResult }
    | { type: 'run-curator-error'; message: string }
    | { type: 'open-edit-recommendation' }
    | { type: 'open-redo-input' }
    | { type: 'set-redo-note'; note: string }
    | { type: 'submit-redo' }
    | { type: 'update-binding'; capability: 'quick' | 'deep' | 'premium'; modelId: string }
    | { type: 'accept-recommendation' }
    // Index readiness
    | { type: 'select-index-action'; action: IndexAction }
    | { type: 'clear-index-action' }
    // System check
    | { type: 'acknowledge-system-check' };

// ─── Defaults / initial state ──────────────────────────────────────────

const DEFAULT_PREFERENCES: UserPreferences = {
    budget: 'low',
    speedQuality: 'balanced',
};

export interface InitialStateOptions {
    /** True when re-running the wizard from Settings or a repair CTA. */
    isReRun?: boolean;
    /**
     * Optional primary step to start at, used by re-run entry points
     * (e.g. Settings "Re-run recommendation" → 'ai-behavior'). When omitted
     * the wizard starts at 'welcome' (or 'capabilities' in re-run mode).
     */
    initialStep?: PrimaryStep;
}

export function initialState(opts: InitialStateOptions = {}): OnboardingState {
    const isReRun = !!opts.isReRun;
    const start: PrimaryStep = opts.initialStep ?? (isReRun ? 'capabilities' : 'welcome');
    return {
        step: start,
        isReRun,
        capabilities: { acknowledged: false },
        provider: { selectedProfileId: null },
        aiBehavior: {
            substep: 'choose-bootstrap',
            bootstrap: null,
            preferences: { ...DEFAULT_PREFERENCES },
            isRunning: false,
            result: null,
            error: null,
            redoNote: '',
        },
        indexReadiness: { selectedAction: null },
        systemCheck: { acknowledged: false },
        done: false,
    };
}

// ─── Pure navigation helpers ───────────────────────────────────────────

export function primaryStepIndex(step: PrimaryStep): number {
    const i = PRIMARY_STEPS.indexOf(step);
    return i < 0 ? 0 : i;
}

function nextPrimaryStep(step: PrimaryStep): PrimaryStep {
    const i = primaryStepIndex(step);
    if (i >= PRIMARY_STEPS.length - 1) return step;
    return PRIMARY_STEPS[i + 1];
}

function prevPrimaryStep(step: PrimaryStep, isReRun: boolean): PrimaryStep {
    const i = primaryStepIndex(step);
    if (i <= 0) return step;
    const prev = PRIMARY_STEPS[i - 1];
    // Welcome is skipped in re-run mode so back from 'capabilities' is a no-op.
    if (isReRun && prev === 'welcome') return step;
    return prev;
}

// ─── Reducer ───────────────────────────────────────────────────────────

/**
 * Pure reducer. Never mutates input. Invalid transitions return state
 * unchanged so the UI can safely emit stray events.
 */
export function reduce(state: OnboardingState, event: OnboardingEvent): OnboardingState {
    switch (event.type) {
        case 'next':
            return advance(state);

        case 'back':
            return retreat(state);

        case 'jump':
            if (!PRIMARY_STEPS.includes(event.step)) return state;
            return { ...state, step: event.step };

        case 'cancel':
            return initialState({ isReRun: state.isReRun });

        case 'finish':
            return { ...state, done: true };

        case 'acknowledge-capabilities':
            return { ...state, capabilities: { acknowledged: true } };

        case 'select-profile':
            return { ...state, provider: { selectedProfileId: event.profileId } };

        case 'clear-profile':
            return {
                ...state,
                provider: { selectedProfileId: null },
                // Clearing the profile invalidates any bootstrap selection.
                aiBehavior: { ...state.aiBehavior, bootstrap: null },
            };

        case 'select-bootstrap':
            return {
                ...state,
                provider: { selectedProfileId: event.profileId },
                aiBehavior: {
                    ...state.aiBehavior,
                    bootstrap: { profileId: event.profileId, modelId: event.modelId },
                },
            };

        case 'set-budget':
            return {
                ...state,
                aiBehavior: {
                    ...state.aiBehavior,
                    preferences: { ...state.aiBehavior.preferences, budget: event.budget },
                },
            };

        case 'set-speed-quality':
            return {
                ...state,
                aiBehavior: {
                    ...state.aiBehavior,
                    preferences: { ...state.aiBehavior.preferences, speedQuality: event.preference },
                },
            };

        case 'enter-ai-behavior-substep':
            // Only valid while in the ai-behavior primary step.
            if (state.step !== 'ai-behavior') return state;
            return { ...state, aiBehavior: { ...state.aiBehavior, substep: event.substep } };

        case 'ai-behavior-back-substep':
            if (state.step !== 'ai-behavior') return state;
            return { ...state, aiBehavior: { ...state.aiBehavior, substep: prevAiBehaviorSubstep(state.aiBehavior.substep) } };

        case 'run-curator-start':
            return {
                ...state,
                step: 'ai-behavior',
                aiBehavior: {
                    ...state.aiBehavior,
                    substep: 'running-curator',
                    isRunning: true,
                    error: null,
                },
            };

        case 'run-curator-success':
            return {
                ...state,
                aiBehavior: {
                    ...state.aiBehavior,
                    substep: 'review-recommendation',
                    isRunning: false,
                    result: event.result,
                    error: null,
                    redoNote: '',
                },
            };

        case 'run-curator-error':
            return {
                ...state,
                aiBehavior: { ...state.aiBehavior, isRunning: false, error: event.message },
            };

        case 'open-edit-recommendation':
            if (!state.aiBehavior.result) return state;
            return { ...state, aiBehavior: { ...state.aiBehavior, substep: 'edit-recommendation' } };

        case 'open-redo-input':
            if (!state.aiBehavior.result) return state;
            return { ...state, aiBehavior: { ...state.aiBehavior, substep: 'redo-input' } };

        case 'set-redo-note':
            return { ...state, aiBehavior: { ...state.aiBehavior, redoNote: event.note } };

        case 'submit-redo':
            return {
                ...state,
                aiBehavior: {
                    ...state.aiBehavior,
                    substep: 'running-curator',
                    isRunning: true,
                    error: null,
                },
            };

        case 'update-binding': {
            if (!state.aiBehavior.result) return state;
            const result = state.aiBehavior.result;
            const nextResult: CuratorResult = {
                ...result,
                recommendation: {
                    ...result.recommendation,
                    bindings: {
                        ...result.recommendation.bindings,
                        [event.capability]: event.modelId,
                    },
                },
            };
            return { ...state, aiBehavior: { ...state.aiBehavior, result: nextResult } };
        }

        case 'accept-recommendation':
            // Accepting the recommendation completes the ai-behavior step and
            // advances to the next primary step (index-readiness).
            return {
                ...state,
                step: nextPrimaryStep('ai-behavior'),
                aiBehavior: { ...state.aiBehavior, substep: 'review-recommendation' },
            };

        case 'select-index-action':
            return { ...state, indexReadiness: { selectedAction: event.action } };

        case 'clear-index-action':
            return { ...state, indexReadiness: { selectedAction: null } };

        case 'acknowledge-system-check':
            return { ...state, systemCheck: { acknowledged: true } };
    }
}

/**
 * `back` semantics inside the ai-behavior step: detours (edit, redo) return to
 * review; otherwise walk back along the linear curator substep order.
 */
function prevAiBehaviorSubstep(substep: AiBehaviorSubstep): AiBehaviorSubstep {
    if (substep === 'edit-recommendation' || substep === 'redo-input') return 'review-recommendation';
    const order: AiBehaviorSubstep[] = [
        'choose-bootstrap',
        'preference-questions',
        'running-curator',
        'review-recommendation',
    ];
    const i = order.indexOf(substep);
    if (i <= 0) return substep;
    return order[i - 1];
}

/**
 * Primary-step advance. The ai-behavior step has internal substep
 * progression that is driven by curator-specific events (continue from
 * preference-questions, accept-recommendation); plain `next` from inside
 * ai-behavior is a no-op so the UI must use the explicit events.
 */
function advance(state: OnboardingState): OnboardingState {
    if (state.step === 'ai-behavior') {
        return advanceAiBehavior(state);
    }
    if (!canContinue(state)) return state;
    return { ...state, step: nextPrimaryStep(state.step) };
}

function advanceAiBehavior(state: OnboardingState): OnboardingState {
    const sub = state.aiBehavior.substep;
    if (sub === 'choose-bootstrap') {
        if (!state.aiBehavior.bootstrap) return state;
        return { ...state, aiBehavior: { ...state.aiBehavior, substep: 'preference-questions' } };
    }
    if (sub === 'preference-questions') {
        return {
            ...state,
            aiBehavior: {
                ...state.aiBehavior,
                substep: 'running-curator',
                isRunning: true,
                error: null,
            },
        };
    }
    if (sub === 'edit-recommendation') {
        return { ...state, aiBehavior: { ...state.aiBehavior, substep: 'review-recommendation' } };
    }
    // review-recommendation / running-curator / redo-input cannot 'next' via
    // generic event — they require explicit Curator-lifecycle events.
    return state;
}

function retreat(state: OnboardingState): OnboardingState {
    if (state.step === 'ai-behavior' && state.aiBehavior.substep !== 'choose-bootstrap') {
        return { ...state, aiBehavior: { ...state.aiBehavior, substep: prevAiBehaviorSubstep(state.aiBehavior.substep) } };
    }
    return { ...state, step: prevPrimaryStep(state.step, state.isReRun) };
}

// ─── Guards / derived ──────────────────────────────────────────────────

/**
 * Whether the user can press a "Continue" / "Next" button from the current
 * (primary, substep) position. UIs should use this to enable/disable nav.
 */
export function canContinue(state: OnboardingState): boolean {
    switch (state.step) {
        case 'welcome':
            return true;
        case 'capabilities':
            return true; // ack happens on click
        case 'provider':
            return !!state.provider.selectedProfileId;
        case 'ai-behavior':
            return canContinueAiBehavior(state.aiBehavior);
        case 'index-readiness':
            // Spec §5.3 Step 5: 'skip' is allowed; only requires a chosen action.
            return state.indexReadiness.selectedAction !== null;
        case 'system-check':
            return true; // red rows are surfaced in PR-E; PR-A gates only on continue
        case 'ready-to-try':
            return true; // terminal
    }
}

function canContinueAiBehavior(s: AiBehaviorState): boolean {
    switch (s.substep) {
        case 'choose-bootstrap':
            return !!s.bootstrap;
        case 'preference-questions':
            return true;
        case 'running-curator':
            return false;
        case 'review-recommendation':
            return !!s.result;
        case 'edit-recommendation':
            return !!s.result;
        case 'redo-input':
            return false;
    }
}

/**
 * Sublabel shown in the progress header next to the step title (spec §5.2).
 * Returns null when the primary step has no substep distinction worth showing.
 */
export function substepLabel(state: OnboardingState): string | null {
    if (state.step !== 'ai-behavior') return null;
    switch (state.aiBehavior.substep) {
        case 'choose-bootstrap':
            return 'Pick a starter model';
        case 'preference-questions':
            return 'A couple of preferences';
        case 'running-curator':
            return 'Building your recommendation';
        case 'review-recommendation':
            return 'Review your model choices';
        case 'edit-recommendation':
            return 'Editing model choices';
        case 'redo-input':
            return 'Regenerate with a note';
    }
}

// ─── React hook wrapper ────────────────────────────────────────────────

export interface OnboardingController {
    state: OnboardingState;
    dispatch: (event: OnboardingEvent) => void;
    /** Index of current primary step in PRIMARY_STEPS (0..6). */
    primaryIndex: number;
    /** Whether the Continue/Next button should be enabled. */
    canContinue: boolean;
    /** Sublabel for the progress header, e.g. "Building your recommendation". */
    substepLabel: string | null;
}

export function useOnboardingState(opts: InitialStateOptions = {}): OnboardingController {
    const [state, dispatch] = useReducer(reduce, undefined, () => initialState(opts));
    const wrappedDispatch = useCallback((event: OnboardingEvent) => dispatch(event), []);
    return useMemo(
        () => ({
            state,
            dispatch: wrappedDispatch,
            primaryIndex: primaryStepIndex(state.step),
            canContinue: canContinue(state),
            substepLabel: substepLabel(state),
        }),
        [state, wrappedDispatch],
    );
}
