import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { ChevronRight, Sparkles, Wand2 } from 'lucide-react';
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
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-6 pktw-py-6 pktw-px-8">
            <Sparkles size={36} className="pktw-text-[--interactive-accent]" />
            <div className="pktw-text-center pktw-max-w-md">
                <span className="pktw-block pktw-text-lg pktw-font-semibold pktw-text-[--text-normal] pktw-mb-2">
                    {isReRun ? copy.titleReRun : copy.titleInitial}
                </span>
                <span className="pktw-block pktw-text-sm pktw-text-[--text-muted] pktw-leading-relaxed">
                    {copy.description}
                </span>
            </div>
            <div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full pktw-max-w-xs">
                <Button onClick={onStart} className="pktw-gap-2 pktw-w-full">
                    <Wand2 size={16} /> {copy.startCta}
                    <ChevronRight size={16} className="pktw-ml-auto" />
                </Button>
                <Button onClick={onManual} variant="ghost" size="sm" className="pktw-w-full pktw-text-xs">
                    {copy.manualCta}
                </Button>
            </div>
        </div>
    );
}
