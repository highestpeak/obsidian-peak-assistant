/**
 * Two-question preference form. See spec §5.3.
 *
 * Mock layout: vertical column of grouped questions, each rendered as a
 * three-row list of pkonb-radio-card items. Selected state uses accent-soft
 * background + 3px accent left border + check icon (per design contract).
 */

import React from 'react';
import { Check } from 'lucide-react';
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
}: PreferenceQuestionsStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.preferences;
    return (
        <div className="pkonb-section">
            <div>
                <div className="pkonb-section__title">{copy.title}</div>
                <div className="pkonb-section__desc">{copy.description}</div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pk-space-2)' }}>
            <span className="pkonb-section__kicker">{label}</span>
            <div className="pkonb-radio-list">
                {options.map((opt) => {
                    const selected = value === opt.value;
                    return (
                        <button
                            type="button"
                            key={opt.value}
                            className="pkonb-radio-card"
                            data-selected={selected ? 'true' : undefined}
                            onClick={() => onChange(opt.value)}
                        >
                            <span className="pkonb-radio-card__body">
                                <span className="pkonb-radio-card__title">{opt.label}</span>
                                <span className="pkonb-radio-card__hint">{opt.hint}</span>
                            </span>
                            <span className="pkonb-radio-card__check">
                                <Check />
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
