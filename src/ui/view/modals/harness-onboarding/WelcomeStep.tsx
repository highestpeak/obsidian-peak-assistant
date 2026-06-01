/**
 * Welcome step — hero with brand mark, title, sub-copy, and two CTAs.
 *
 * Layout:
 *   - Centered hero (mark + title + sub-copy)
 *   - Pill-button "Start" (primary)
 *   - Pill-button "Skip — configure manually" (ghost)
 *
 * Design primitives: <Pill> (accent + neutral). All copy via useOnboardingStrings.
 */

import React from 'react';
import { Sparkles, Wand2, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { useOnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface WelcomeStepProps {
    isReRun: boolean;
    onStart: () => void;
    onManual: () => void;
}

export function WelcomeStep({ isReRun, onStart, onManual }: WelcomeStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.welcome;
    return (
        <div className="pkonb-hero">
            <span className="pkonb-hero__mark">
                <Sparkles />
            </span>
            <span className="pkonb-hero__title">
                {isReRun ? copy.titleReRun : copy.titleInitial}
            </span>
            <span className="pkonb-hero__sub">{copy.description}</span>
            <div className="pkonb-hero__actions">
                <Button variant="primary" onClick={onStart}>
                    <Wand2 />
                    <span>{copy.startCta}</span>
                    <ChevronRight style={{ marginLeft: 'auto' }} />
                </Button>
                <Button variant="ghost" onClick={onManual}>
                    {copy.manualCta}
                </Button>
            </div>
        </div>
    );
}
