/**
 * Pure state machine for the Harness Onboarding wizard.
 *
 * UI lives in HarnessOnboardingModal.tsx; this file is framework-agnostic so
 * the transitions can be unit-tested without React. See spec §5.2.
 */

import type {
    BudgetTier,
    CuratorResult,
    SpeedQualityPreference,
    UserPreferences,
} from '@/service/agents/harness/curator';

export type StepId =
    | 'welcome'
    | 'choose-provider'
    | 'choose-bootstrap'
    | 'preference-questions'
    | 'running-curator'
    | 'review-recommendation'
    | 'edit-recommendation'
    | 'redo-input'
    | 'done';

export interface BootstrapSelection {
    profileId: string;
    modelId: string;
}

export interface WizardState {
    step: StepId;
    /**
     * Selected profile after the ChooseProvider step. May predate the wizard
     * (existing profile picked) or come from a new profile added inside the
     * wizard.
     */
    selectedProfileId: string | null;
    /** Selected bootstrap model. Set in ChooseBootstrap, used by Curator. */
    bootstrap: BootstrapSelection | null;
    /** Preferences gathered from the user. Defaults seed sensible mid-points. */
    preferences: UserPreferences;
    /** True when the wizard was launched as "re-run", i.e. user already has bindings. */
    isReRun: boolean;
    /** Set while RunningCurator step is in flight. */
    isRunning: boolean;
    /** Latest curator result (LLM or fallback). null until first run completes. */
    result: CuratorResult | null;
    /** Last invocation error, if any. */
    error: string | null;
    /** Free-form note appended on "redo". Cleared after the next run. */
    redoNote: string;
}

export type WizardEvent =
    | { type: 'start' }
    | { type: 'skip-welcome' }
    | { type: 'select-profile'; profileId: string }
    | { type: 'clear-profile' }
    | { type: 'select-bootstrap'; profileId: string; modelId: string }
    | { type: 'set-budget'; budget: BudgetTier }
    | { type: 'set-speed-quality'; preference: SpeedQualityPreference }
    | { type: 'run-curator-start' }
    | { type: 'run-curator-success'; result: CuratorResult }
    | { type: 'run-curator-error'; message: string }
    | { type: 'open-edit' }
    | { type: 'open-redo' }
    | { type: 'set-redo-note'; note: string }
    | { type: 'submit-redo' }
    | { type: 'accept-recommendation' }
    | { type: 'update-binding'; capability: 'quick' | 'deep' | 'premium'; modelId: string }
    | { type: 'back' }
    | { type: 'continue' }
    | { type: 'finish' }
    | { type: 'cancel' };

const DEFAULT_PREFERENCES: UserPreferences = {
    budget: 'low',
    speedQuality: 'balanced',
};

export function initialState(opts: { isReRun?: boolean } = {}): WizardState {
    return {
        step: 'welcome',
        selectedProfileId: null,
        bootstrap: null,
        preferences: { ...DEFAULT_PREFERENCES },
        isReRun: !!opts.isReRun,
        isRunning: false,
        result: null,
        error: null,
        redoNote: '',
    };
}

const ORDER: StepId[] = [
    'welcome',
    'choose-provider',
    'choose-bootstrap',
    'preference-questions',
    'running-curator',
    'review-recommendation',
    'done',
];

function advance(step: StepId): StepId {
    const i = ORDER.indexOf(step);
    if (i === -1 || i === ORDER.length - 1) return step;
    return ORDER[i + 1];
}

function retreat(step: StepId): StepId {
    // Edit / redo are detours off review; back from them returns to review.
    if (step === 'edit-recommendation' || step === 'redo-input') return 'review-recommendation';
    const i = ORDER.indexOf(step);
    if (i <= 0) return step;
    return ORDER[i - 1];
}

/**
 * Pure reducer. Never mutates the input state. Invalid transitions return the
 * input unchanged so the UI can ignore stray events.
 */
export function reduce(state: WizardState, event: WizardEvent): WizardState {
    switch (event.type) {
        case 'start':
            if (state.step !== 'welcome') return state;
            return { ...state, step: 'choose-provider' };

        case 'skip-welcome':
            return { ...state, step: 'choose-provider' };

        case 'select-profile':
            return { ...state, selectedProfileId: event.profileId };

        case 'clear-profile':
            return { ...state, selectedProfileId: null, bootstrap: null };

        case 'select-bootstrap':
            return {
                ...state,
                selectedProfileId: event.profileId,
                bootstrap: { profileId: event.profileId, modelId: event.modelId },
            };

        case 'set-budget':
            return { ...state, preferences: { ...state.preferences, budget: event.budget } };

        case 'set-speed-quality':
            return { ...state, preferences: { ...state.preferences, speedQuality: event.preference } };

        case 'run-curator-start':
            return { ...state, step: 'running-curator', isRunning: true, error: null };

        case 'run-curator-success':
            return {
                ...state,
                step: 'review-recommendation',
                isRunning: false,
                result: event.result,
                error: null,
                redoNote: '',
            };

        case 'run-curator-error':
            return { ...state, isRunning: false, error: event.message };

        case 'open-edit':
            if (!state.result) return state;
            return { ...state, step: 'edit-recommendation' };

        case 'open-redo':
            if (!state.result) return state;
            return { ...state, step: 'redo-input' };

        case 'set-redo-note':
            return { ...state, redoNote: event.note };

        case 'submit-redo':
            return { ...state, step: 'running-curator', isRunning: true, error: null };

        case 'update-binding': {
            if (!state.result) return state;
            const next = {
                ...state.result,
                recommendation: {
                    ...state.result.recommendation,
                    bindings: {
                        ...state.result.recommendation.bindings,
                        [event.capability]: event.modelId,
                    },
                },
            };
            return { ...state, result: next };
        }

        case 'accept-recommendation':
            return { ...state, step: 'done' };

        case 'continue': {
            if (state.step === 'choose-provider') {
                if (!state.selectedProfileId) return state;
                return { ...state, step: 'choose-bootstrap' };
            }
            if (state.step === 'choose-bootstrap') {
                if (!state.bootstrap) return state;
                return { ...state, step: 'preference-questions' };
            }
            if (state.step === 'preference-questions') {
                return { ...state, step: 'running-curator', isRunning: true, error: null };
            }
            if (state.step === 'edit-recommendation') {
                return { ...state, step: 'review-recommendation' };
            }
            return { ...state, step: advance(state.step) };
        }

        case 'back':
            return { ...state, step: retreat(state.step) };

        case 'finish':
            return { ...state, step: 'done' };

        case 'cancel':
            return initialState({ isReRun: state.isReRun });
    }
}

/**
 * Can the user proceed from the current step?  Used to enable/disable the
 * "Continue" button.
 */
export function canContinue(state: WizardState): boolean {
    switch (state.step) {
        case 'welcome':
            return true;
        case 'choose-provider':
            return !!state.selectedProfileId;
        case 'choose-bootstrap':
            return !!state.bootstrap;
        case 'preference-questions':
            return true;
        case 'review-recommendation':
            return !!state.result;
        case 'edit-recommendation':
            return !!state.result;
        default:
            return false;
    }
}

/** Visible steps for the StepIndicator dots (excludes terminal 'done' and detour steps). */
export const VISIBLE_STEPS: readonly StepId[] = [
    'welcome',
    'choose-provider',
    'choose-bootstrap',
    'preference-questions',
    'running-curator',
    'review-recommendation',
];

export function stepIndex(step: StepId): number {
    // Detour steps collapse onto review for indicator purposes.
    if (step === 'edit-recommendation' || step === 'redo-input') return VISIBLE_STEPS.indexOf('review-recommendation');
    const i = VISIBLE_STEPS.indexOf(step);
    return i === -1 ? VISIBLE_STEPS.length - 1 : i;
}
