/**
 * Two-question preference form. See spec §5.3.
 *
 * Mirrors the mockup verbatim:
 *   1. Monthly API budget?           ($0 / minimal | $5–20 | $50+)
 *   2. Speed vs quality?             (Speed first | Balanced | Quality first)
 *
 * User-visible copy lives in `templates/config/onboarding.json` (key
 * `steps.preferences`); see `src/ui/view/onboarding/onboardingStrings.ts`.
 */

import React from 'react';
import { ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type { BudgetTier, SpeedQualityPreference, UserPreferences } from '@/service/agents/harness/curator';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface PreferenceQuestionsStepProps {
    preferences: UserPreferences;
    onBudgetChange: (budget: BudgetTier) => void;
    onSpeedQualityChange: (pref: SpeedQualityPreference) => void;
    onBack: () => void;
    onContinue: () => void;
}

interface Option<T> {
    value: T;
    label: string;
    hint: string;
}

function buildBudgetOptions(strings: OnboardingStrings): Option<BudgetTier>[] {
    const opts = strings.steps.preferences.budgetOptions;
    return [
        { value: 'zero', label: opts.zero.label, hint: opts.zero.hint },
        { value: 'low', label: opts.low.label, hint: opts.low.hint },
        { value: 'high', label: opts.high.label, hint: opts.high.hint },
    ];
}

function buildSpeedOptions(strings: OnboardingStrings): Option<SpeedQualityPreference>[] {
    const opts = strings.steps.preferences.speedOptions;
    return [
        { value: 'speed', label: opts.speed.label, hint: opts.speed.hint },
        { value: 'balanced', label: opts.balanced.label, hint: opts.balanced.hint },
        { value: 'quality', label: opts.quality.label, hint: opts.quality.hint },
    ];
}

export function PreferenceQuestionsStep({
    preferences,
    onBudgetChange,
    onSpeedQualityChange,
    onBack,
    onContinue,
}: PreferenceQuestionsStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.preferences;
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-5 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    {copy.title}
                </span>
                <span className="pktw-text-xs pktw-text-[--text-muted]">
                    {copy.description}
                </span>
            </div>

            <RadioGroup
                label={copy.budgetQuestion}
                options={buildBudgetOptions(strings)}
                value={preferences.budget}
                onChange={onBudgetChange}
            />

            <RadioGroup
                label={copy.speedQuestion}
                options={buildSpeedOptions(strings)}
                value={preferences.speedQuality}
                onChange={onSpeedQualityChange}
            />

            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
                    <ChevronLeft size={14} /> {strings.actions.back}
                </Button>
                <Button size="sm" onClick={onContinue} className="pktw-gap-1">
                    <Wand2 size={14} /> {strings.actions.runCurator} <ChevronRight size={14} />
                </Button>
            </div>
        </div>
    );
}

interface RadioGroupProps<T> {
    label: string;
    options: Option<T>[];
    value: T;
    onChange: (v: T) => void;
}

function RadioGroup<T extends string>({ label, options, value, onChange }: RadioGroupProps<T>) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-2">
            <span className="pktw-text-sm pktw-text-[--text-normal] pktw-font-medium">{label}</span>
            <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
                {options.map((opt) => {
                    const selected = value === opt.value;
                    return (
                        <div
                            key={opt.value}
                            onClick={() => onChange(opt.value)}
                            className={cn(
                                'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2 pktw-rounded-md pktw-border pktw-cursor-pointer pktw-transition-colors',
                                selected
                                    ? 'pktw-border-[--interactive-accent] pktw-bg-[--interactive-accent]/10'
                                    : 'pktw-border-[--background-modifier-border] hover:pktw-bg-[--background-modifier-hover]',
                            )}
                        >
                            <div
                                className={cn(
                                    'pktw-w-3.5 pktw-h-3.5 pktw-rounded-full pktw-border-2 pktw-shrink-0 pktw-transition-colors',
                                    selected
                                        ? 'pktw-border-[--interactive-accent] pktw-bg-[--interactive-accent]'
                                        : 'pktw-border-[--background-modifier-border]',
                                )}
                            />
                            <span className="pktw-text-sm pktw-text-[--text-normal] pktw-flex-1">{opt.label}</span>
                            <span className="pktw-text-[10px] pktw-text-[--text-muted]">{opt.hint}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
