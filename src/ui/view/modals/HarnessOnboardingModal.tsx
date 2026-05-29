/**
 * Harness Onboarding Modal — the Curator-driven capability-binding wizard.
 *
 * Separate from the general OnboardingModal (which sets up SQLite, indexing,
 * and the general profile). This wizard is rerunnable from Settings →
 * Agent Harness and from the "Harness Setup Wizard" command.
 *
 * State lives in state.ts (pure reducer, unit-tested). UI here is just the
 * Modal wrapper + wizard root + step indicator.
 *
 * Currently PR2 implements Welcome → ChooseProvider → ChooseBootstrap.
 * Curator-driven steps land in PR3.
 */

import React, { useReducer, useCallback } from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { cn } from '@/ui/react/lib/utils';
import {
    initialState,
    reduce,
    stepIndex,
    VISIBLE_STEPS,
    type StepId,
    type WizardEvent,
    type WizardState,
} from './harness-onboarding/state';
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

// ─── Step indicator ────────────────────────────────────────────────────

function StepIndicator({ current }: { current: StepId }) {
    const idx = stepIndex(current);
    return (
        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-justify-center pktw-py-3">
            {VISIBLE_STEPS.map((step, i) => (
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
    onClose: () => void;
}

function HarnessOnboardingWizard({ isReRun, onClose }: WizardProps) {
    const [state, dispatchRaw] = useReducer(reduce, undefined, () => initialState({ isReRun }));

    // Wrap so step components can ignore the event types argument.
    const dispatch = useCallback((event: WizardEvent) => dispatchRaw(event), []);

    const renderStep = (s: WizardState): React.ReactNode => {
        switch (s.step) {
            case 'welcome':
                return (
                    <WelcomeStep
                        isReRun={s.isReRun}
                        onStart={() => dispatch({ type: 'start' })}
                        onManual={onClose}
                    />
                );
            case 'choose-provider':
                return (
                    <ProviderStep
                        selectedProfileId={s.selectedProfileId}
                        onSelect={(profileId) => dispatch({ type: 'select-profile', profileId })}
                        onClear={() => dispatch({ type: 'clear-profile' })}
                        onBack={() => dispatch({ type: 'back' })}
                        onContinue={() => dispatch({ type: 'continue' })}
                    />
                );
            case 'choose-bootstrap':
                return (
                    <BootstrapModelStep
                        profileId={s.selectedProfileId}
                        selectedModelId={s.bootstrap?.modelId ?? null}
                        onSelect={(profileId, modelId) => dispatch({ type: 'select-bootstrap', profileId, modelId })}
                        onBack={() => dispatch({ type: 'back' })}
                        onContinue={() => dispatch({ type: 'continue' })}
                    />
                );
            case 'preference-questions':
                return (
                    <PreferenceQuestionsStep
                        preferences={s.preferences}
                        onBudgetChange={(budget) => dispatch({ type: 'set-budget', budget })}
                        onSpeedQualityChange={(preference) => dispatch({ type: 'set-speed-quality', preference })}
                        onBack={() => dispatch({ type: 'back' })}
                        onContinue={() => dispatch({ type: 'continue' })}
                    />
                );
            case 'running-curator':
                return (
                    <RunningCuratorStep
                        bootstrap={s.bootstrap}
                        preferences={s.preferences}
                        userNote={s.redoNote}
                        error={s.error}
                        onSuccess={(result) => dispatch({ type: 'run-curator-success', result })}
                        onError={(message) => dispatch({ type: 'run-curator-error', message })}
                        onCancel={() => dispatch({ type: 'back' })}
                    />
                );
            case 'review-recommendation':
                if (!s.result) {
                    // Shouldn't happen — running-curator gates this. Fall back to back.
                    dispatch({ type: 'back' });
                    return null;
                }
                return (
                    <ReviewRecommendationStep
                        result={s.result}
                        onEdit={() => dispatch({ type: 'open-edit' })}
                        onRedo={() => dispatch({ type: 'open-redo' })}
                        onAccepted={() => dispatch({ type: 'accept-recommendation' })}
                        onBack={() => dispatch({ type: 'back' })}
                    />
                );
            case 'edit-recommendation':
                if (!s.result) {
                    dispatch({ type: 'back' });
                    return null;
                }
                return (
                    <EditRecommendationStep
                        recommendation={s.result.recommendation}
                        onChange={(capability, modelId) => dispatch({ type: 'update-binding', capability, modelId })}
                        onBack={() => dispatch({ type: 'back' })}
                        onDone={() => dispatch({ type: 'continue' })}
                    />
                );
            case 'redo-input':
                return (
                    <RedoInputStep
                        note={s.redoNote}
                        onNoteChange={(note) => dispatch({ type: 'set-redo-note', note })}
                        onBack={() => dispatch({ type: 'back' })}
                        onSubmit={() => dispatch({ type: 'submit-redo' })}
                    />
                );
            case 'done':
                onClose();
                return null;
        }
    };

    return (
        <div className="pktw-flex pktw-flex-col">
            <StepIndicator current={state.step} />
            {renderStep(state)}
        </div>
    );
}
