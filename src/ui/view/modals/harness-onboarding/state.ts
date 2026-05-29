/**
 * Pure state machine for the Harness Onboarding wizard.
 *
 * UI lives in HarnessOnboardingModal.tsx; this file is framework-agnostic so
 * the transitions can be unit-tested without React. See spec §5.2.
 *
 * PR2 covers steps Welcome → ChooseProvider → ChooseBootstrap. PR3 will add
 * PreferenceQuestions / RunningCurator / ReviewRecommendation / Done.
 */

export type StepId =
    | 'welcome'
    | 'choose-provider'
    | 'choose-bootstrap'
    | 'preference-questions'  // PR3
    | 'running-curator'        // PR3
    | 'review-recommendation'  // PR3
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
    /** Selected bootstrap model. Set in ChooseBootstrap, used by Curator (PR3). */
    bootstrap: BootstrapSelection | null;
    /** True when the wizard was launched as "re-run", i.e. user already has bindings. */
    isReRun: boolean;
}

export type WizardEvent =
    | { type: 'start' }
    | { type: 'skip-welcome' }
    | { type: 'select-profile'; profileId: string }
    | { type: 'clear-profile' }
    | { type: 'select-bootstrap'; profileId: string; modelId: string }
    | { type: 'back' }
    | { type: 'continue' }   // generic next; the reducer decides where based on current step
    | { type: 'finish' }
    | { type: 'cancel' };

export function initialState(opts: { isReRun?: boolean } = {}): WizardState {
    return {
        step: 'welcome',
        selectedProfileId: null,
        bootstrap: null,
        isReRun: !!opts.isReRun,
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

        case 'continue': {
            if (state.step === 'choose-provider') {
                if (!state.selectedProfileId) return state;
                return { ...state, step: 'choose-bootstrap' };
            }
            if (state.step === 'choose-bootstrap') {
                if (!state.bootstrap) return state;
                // PR3 will transition into preference-questions instead of done.
                return { ...state, step: 'preference-questions' };
            }
            return { ...state, step: advance(state.step) };
        }

        case 'back':
            return { ...state, step: retreat(state.step) };

        case 'finish':
            return { ...state, step: 'done' };

        case 'cancel':
            // Reset to welcome — the modal close handler takes care of unmount.
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
        default:
            return false;
    }
}

/** Visible steps for the StepIndicator dots (excludes terminal 'done'). */
export const VISIBLE_STEPS: readonly StepId[] = [
    'welcome',
    'choose-provider',
    'choose-bootstrap',
    'preference-questions',
    'running-curator',
    'review-recommendation',
];

export function stepIndex(step: StepId): number {
    const i = VISIBLE_STEPS.indexOf(step);
    return i === -1 ? VISIBLE_STEPS.length - 1 : i;
}
