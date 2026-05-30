/**
 * Harness Onboarding Modal — the Curator-driven capability-binding wizard.
 *
 * As of PR-A this modal is driven by the new 7-step OnboardingStateMachine
 * (see src/ui/view/onboarding/OnboardingStateMachine.ts). The existing per-step
 * components for the Curator sub-flow (Welcome / Provider / Bootstrap /
 * PreferenceQuestions / RunningCurator / Review / Edit / Redo) are reused
 * verbatim during PR-A; PR-C will rewrite them on top of the PR-0 design-system
 * primitives.
 *
 * The 4 brand-new primary steps introduced by the 7-step contract —
 * `capabilities`, `index-readiness`, `system-check`, `ready-to-try` — render
 * a minimal pass-through placeholder so the wizard compiles and walks end-to-
 * end. Visual fidelity to the mocks lands in PR-C.
 *
 * Curator backend (src/service/agents/harness/curator/*) and HarnessSettings
 * persistence (via applyRecommendation.ts) are unchanged.
 */

import React, { useCallback } from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { cn } from '@/ui/react/lib/utils';
import {
    PRIMARY_STEPS,
    type OnboardingController,
    type OnboardingEvent,
    type OnboardingState,
    type PrimaryStep,
    useOnboardingState,
} from '@/ui/view/onboarding/OnboardingStateMachine';
import { WelcomeStep } from './harness-onboarding/WelcomeStep';
import { ProviderStep } from './harness-onboarding/ProviderStep';
import { BootstrapModelStep } from './harness-onboarding/BootstrapModelStep';
import { PreferenceQuestionsStep } from './harness-onboarding/PreferenceQuestionsStep';
import { RunningCuratorStep } from './harness-onboarding/RunningCuratorStep';
import { ReviewRecommendationStep } from './harness-onboarding/ReviewRecommendationStep';
import { EditRecommendationStep } from './harness-onboarding/EditRecommendationStep';
import { RedoInputStep } from './harness-onboarding/RedoInputStep';

// ─── Obsidian Modal wrapper ────────────────────────────────────────────

export interface HarnessOnboardingOptions {
    /** True when the user is re-running, not in initial setup. */
    isReRun?: boolean;
    /** Optional starting primary step (re-run / repair-CTA deep link). */
    initialStep?: PrimaryStep;
}

export class HarnessOnboardingModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;

    constructor(
        private readonly appContext: AppContext,
        private readonly options: HarnessOnboardingOptions = {},
    ) {
        super(appContext.app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        contentEl.addClass('peak-harness-onboarding-modal');
        contentEl.addClass('peak-design-root');
        contentEl.addClass('pktw-root');
        contentEl.style.padding = '0';

        modalEl.style.width = '560px';
        modalEl.style.maxWidth = '92vw';
        modalEl.style.padding = '0';

        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                HarnessOnboardingWizard,
                {
                    isReRun: !!this.options.isReRun,
                    initialStep: this.options.initialStep,
                    onClose: () => this.close(),
                },
                this.appContext,
            ),
        );
    }

    onClose(): void {
        const r = this.reactRenderer;
        this.reactRenderer = null;
        if (r) {
            setTimeout(() => {
                r.unmount();
                this.contentEl.empty();
            }, 0);
        } else {
            this.contentEl.empty();
        }
    }
}

// ─── Step indicator (7-step contract) ──────────────────────────────────

function StepIndicator({ current }: { current: PrimaryStep }) {
    const idx = PRIMARY_STEPS.indexOf(current);
    return (
        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-justify-center pktw-py-3">
            {PRIMARY_STEPS.map((step, i) => (
                <div
                    key={step}
                    className={cn(
                        'pktw-h-1.5 pktw-rounded-full pktw-transition-all pktw-duration-300',
                        i === idx
                            ? 'pktw-w-8 pktw-bg-[--interactive-accent]'
                            : i < idx
                                ? 'pktw-w-4 pktw-bg-[--interactive-accent]/50'
                                : 'pktw-w-4 pktw-bg-[--background-modifier-border]',
                    )}
                />
            ))}
        </div>
    );
}

// ─── Wizard root ───────────────────────────────────────────────────────

interface WizardProps {
    isReRun: boolean;
    initialStep?: PrimaryStep;
    onClose: () => void;
}

function HarnessOnboardingWizard({ isReRun, initialStep, onClose }: WizardProps) {
    const controller = useOnboardingState({ isReRun, initialStep });
    const { state, dispatch } = controller;

    // Auto-close when the wizard reaches the `done` state.
    React.useEffect(() => {
        if (state.done) onClose();
    }, [state.done, onClose]);

    return (
        <div className="pktw-flex pktw-flex-col">
            <StepIndicator current={state.step} />
            <PrimaryStepView state={state} dispatch={dispatch} onClose={onClose} />
        </div>
    );
}

// ─── Primary step router ───────────────────────────────────────────────

interface PrimaryStepViewProps {
    state: OnboardingState;
    dispatch: OnboardingController['dispatch'];
    onClose: () => void;
}

function PrimaryStepView({ state, dispatch, onClose }: PrimaryStepViewProps) {
    switch (state.step) {
        case 'welcome':
            return (
                <WelcomeStep
                    isReRun={state.isReRun}
                    onStart={() => dispatch({ type: 'next' })}
                    onManual={onClose}
                />
            );
        case 'capabilities':
            return <CapabilitiesPlaceholder dispatch={dispatch} />;
        case 'provider':
            return (
                <ProviderStep
                    selectedProfileId={state.provider.selectedProfileId}
                    onSelect={(profileId) => dispatch({ type: 'select-profile', profileId })}
                    onClear={() => dispatch({ type: 'clear-profile' })}
                    onBack={() => dispatch({ type: 'back' })}
                    onContinue={() => dispatch({ type: 'next' })}
                />
            );
        case 'ai-behavior':
            return <AiBehaviorRouter state={state} dispatch={dispatch} />;
        case 'index-readiness':
            return <IndexReadinessPlaceholder state={state} dispatch={dispatch} />;
        case 'system-check':
            return <SystemCheckPlaceholder dispatch={dispatch} />;
        case 'ready-to-try':
            return <ReadyToTryPlaceholder dispatch={dispatch} />;
    }
}

// ─── ai-behavior substep router ────────────────────────────────────────

function AiBehaviorRouter({ state, dispatch }: { state: OnboardingState; dispatch: (e: OnboardingEvent) => void }) {
    const ai = state.aiBehavior;
    const back = useCallback(() => {
        // From the first substep, back returns to the previous primary step.
        if (ai.substep === 'choose-bootstrap') {
            dispatch({ type: 'back' });
            return;
        }
        dispatch({ type: 'ai-behavior-back-substep' });
    }, [ai.substep, dispatch]);

    switch (ai.substep) {
        case 'choose-bootstrap':
            return (
                <BootstrapModelStep
                    profileId={state.provider.selectedProfileId}
                    selectedModelId={ai.bootstrap?.modelId ?? null}
                    onSelect={(profileId, modelId) => dispatch({ type: 'select-bootstrap', profileId, modelId })}
                    onBack={back}
                    onContinue={() => dispatch({ type: 'next' })}
                />
            );
        case 'preference-questions':
            return (
                <PreferenceQuestionsStep
                    preferences={ai.preferences}
                    onBudgetChange={(budget) => dispatch({ type: 'set-budget', budget })}
                    onSpeedQualityChange={(preference) => dispatch({ type: 'set-speed-quality', preference })}
                    onBack={back}
                    onContinue={() => dispatch({ type: 'next' })}
                />
            );
        case 'running-curator':
            return (
                <RunningCuratorStep
                    bootstrap={ai.bootstrap}
                    preferences={ai.preferences}
                    userNote={ai.redoNote}
                    error={ai.error}
                    onSuccess={(result) => dispatch({ type: 'run-curator-success', result })}
                    onError={(message) => dispatch({ type: 'run-curator-error', message })}
                    onCancel={back}
                />
            );
        case 'review-recommendation':
            if (!ai.result) {
                // Defensive: running-curator gates this; fall back to bootstrap.
                dispatch({ type: 'ai-behavior-back-substep' });
                return null;
            }
            return (
                <ReviewRecommendationStep
                    result={ai.result}
                    onEdit={() => dispatch({ type: 'open-edit-recommendation' })}
                    onRedo={() => dispatch({ type: 'open-redo-input' })}
                    onAccepted={() => dispatch({ type: 'accept-recommendation' })}
                    onBack={back}
                />
            );
        case 'edit-recommendation':
            if (!ai.result) {
                dispatch({ type: 'ai-behavior-back-substep' });
                return null;
            }
            return (
                <EditRecommendationStep
                    recommendation={ai.result.recommendation}
                    onChange={(capability, modelId) => dispatch({ type: 'update-binding', capability, modelId })}
                    onBack={back}
                    onDone={() => dispatch({ type: 'next' })}
                />
            );
        case 'redo-input':
            return (
                <RedoInputStep
                    note={ai.redoNote}
                    onNoteChange={(note) => dispatch({ type: 'set-redo-note', note })}
                    onBack={back}
                    onSubmit={() => dispatch({ type: 'submit-redo' })}
                />
            );
    }
}

// ─── Placeholder UIs for new primary steps (PR-C will replace) ─────────

interface PlaceholderProps {
    dispatch: (e: OnboardingEvent) => void;
}

interface IndexReadinessPlaceholderProps {
    state: OnboardingState;
    dispatch: (e: OnboardingEvent) => void;
}

function StepFooter({
    onBack,
    onContinue,
    continueDisabled = false,
    continueLabel = 'Continue',
}: {
    onBack?: () => void;
    onContinue: () => void;
    continueDisabled?: boolean;
    continueLabel?: string;
}) {
    return (
        <div className="pktw-flex pktw-items-center pktw-justify-between pktw-mt-6">
            {onBack ? (
                <button type="button" className="pktw-text-sm pktw-opacity-70 hover:pktw-opacity-100" onClick={onBack}>
                    Back
                </button>
            ) : (
                <span />
            )}
            <button
                type="button"
                className={cn(
                    'pktw-px-4 pktw-py-2 pktw-rounded-md pktw-text-sm',
                    'pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent]',
                    continueDisabled && 'pktw-opacity-50 pktw-cursor-not-allowed',
                )}
                disabled={continueDisabled}
                onClick={onContinue}
            >
                {continueLabel}
            </button>
        </div>
    );
}

function CapabilitiesPlaceholder({ dispatch }: PlaceholderProps) {
    // PR-C will replace with the 4-card "What Peak can do" layout (spec §5.3 Step 2).
    return (
        <div className="pktw-px-6 pktw-pb-6">
            <div className="pktw-text-lg pktw-font-semibold pktw-mb-2">What Peak can do</div>
            <div className="pktw-text-sm pktw-opacity-80">
                Chat with your vault, search it, run analysis, and use Copilot on notes.
            </div>
            <StepFooter
                onBack={() => dispatch({ type: 'back' })}
                onContinue={() => {
                    dispatch({ type: 'acknowledge-capabilities' });
                    dispatch({ type: 'next' });
                }}
                continueLabel="Got it"
            />
        </div>
    );
}

function IndexReadinessPlaceholder({ state, dispatch }: IndexReadinessPlaceholderProps) {
    // PR-C will replace with the detected-state + recommended-action layout
    // (spec §5.3 Step 5). For PR-A, expose the action selector minimally so the
    // user can walk through.
    const selected = state.indexReadiness.selectedAction;
    return (
        <div className="pktw-px-6 pktw-pb-6">
            <div className="pktw-text-lg pktw-font-semibold pktw-mb-2">Check your vault index</div>
            <div className="pktw-text-sm pktw-opacity-80 pktw-mb-3">
                Pick an indexing action to continue. (PR-C will replace this with the recommended-action UI.)
            </div>
            <div className="pktw-flex pktw-flex-col pktw-gap-2">
                {(['use-existing', 'build-text', 'enable-semantic', 'skip'] as const).map((action) => (
                    <button
                        type="button"
                        key={action}
                        className={cn(
                            'pktw-px-3 pktw-py-2 pktw-rounded-md pktw-text-sm pktw-text-left',
                            'pktw-border pktw-border-[--background-modifier-border]',
                            selected === action && 'pktw-bg-[--background-secondary]',
                        )}
                        onClick={() => dispatch({ type: 'select-index-action', action })}
                    >
                        {action}
                    </button>
                ))}
            </div>
            <StepFooter
                onBack={() => dispatch({ type: 'back' })}
                onContinue={() => dispatch({ type: 'next' })}
                continueDisabled={selected === null}
            />
        </div>
    );
}

function SystemCheckPlaceholder({ dispatch }: PlaceholderProps) {
    // PR-C / PR-E will replace with the readiness-row summary fed by
    // CapabilityRegistry.getAll().
    return (
        <div className="pktw-px-6 pktw-pb-6">
            <div className="pktw-text-lg pktw-font-semibold pktw-mb-2">System check</div>
            <div className="pktw-text-sm pktw-opacity-80">
                Provider, AI behavior, vault index, web access, and safety summary. (PR-C / PR-E will replace.)
            </div>
            <StepFooter
                onBack={() => dispatch({ type: 'back' })}
                onContinue={() => {
                    dispatch({ type: 'acknowledge-system-check' });
                    dispatch({ type: 'next' });
                }}
            />
        </div>
    );
}

function ReadyToTryPlaceholder({ dispatch }: PlaceholderProps) {
    // PR-C will replace with the launchpad (summary card + action cards).
    return (
        <div className="pktw-px-6 pktw-pb-6">
            <div className="pktw-text-lg pktw-font-semibold pktw-mb-2">You&apos;re ready to use Peak Assistant</div>
            <div className="pktw-text-sm pktw-opacity-80">
                Open Chat, search your vault, run AI Analysis, or use Copilot. (PR-C will replace with the launchpad.)
            </div>
            <StepFooter onBack={() => dispatch({ type: 'back' })} onContinue={() => dispatch({ type: 'finish' })} continueLabel="Open Chat" />
        </div>
    );
}
