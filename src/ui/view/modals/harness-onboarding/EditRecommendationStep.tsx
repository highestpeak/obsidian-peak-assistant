/**
 * Inline editor for the three tier bindings. The dropdown for each tier lists
 * catalog entries marked suitable for that tier (filterByTier) so the user
 * sees recommended-by-catalog choices first.
 *
 * User-visible copy lives in `templates/config/onboarding.json` (key
 * `steps.editRecommendation` + shared `steps.review.tierLabels`).
 */

import React from 'react';
import { ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import {
    CAPABILITY_ORDER,
    filterByTier,
    lookupModel,
    type Capability,
    type Recommendation,
} from '@/service/agents/harness/curator';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface EditRecommendationStepProps {
    recommendation: Recommendation;
    onChange: (capability: Capability, modelId: string) => void;
    onBack: () => void;
    onDone: () => void;
}

export function EditRecommendationStep({ recommendation, onChange, onBack, onDone }: EditRecommendationStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.editRecommendation;
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    {copy.title}
                </span>
                <span className="pktw-text-xs pktw-text-[--text-muted]">
                    {copy.description}
                </span>
            </div>

            {CAPABILITY_ORDER.map((cap) => (
                <CapabilityRow
                    key={cap}
                    capability={cap}
                    modelId={recommendation.bindings[cap]}
                    onSelect={(id) => onChange(cap, id)}
                    strings={strings}
                />
            ))}

            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1 pktw-text-xs">
                    <ChevronLeft size={14} /> {strings.actions.back}
                </Button>
                <Button size="sm" onClick={onDone} className="pktw-gap-1">
                    <Check size={14} /> {copy.doneCta}
                </Button>
            </div>
        </div>
    );
}

function CapabilityRow({
    capability,
    modelId,
    onSelect,
    strings,
}: {
    capability: Capability;
    modelId: string;
    onSelect: (id: string) => void;
    strings: OnboardingStrings;
}) {
    const candidates = filterByTier(capability);
    const current = lookupModel(modelId);
    const tierLabel = strings.steps.review.tierLabels[capability];
    const unknownSuffix = strings.steps.editRecommendation.unknownModelPlaceholderSuffix;
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-2">
            <div className="pktw-flex pktw-items-baseline pktw-gap-2">
                <span className="pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">
                    {tierLabel}
                </span>
                {current && (
                    <span className="pktw-text-[10px] pktw-text-[--text-muted]">
                        {current.displayName}
                    </span>
                )}
            </div>
            <select
                value={modelId}
                onChange={(e) => onSelect(e.target.value)}
                className="pktw-w-full pktw-bg-[--background-primary] pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent]"
            >
                {!current && (
                    <option value={modelId}>
                        {modelId} {unknownSuffix}
                    </option>
                )}
                {candidates.map((m) => (
                    <option key={m.id} value={m.id}>
                        {m.displayName} — {summary(m)}
                    </option>
                ))}
            </select>
        </div>
    );
}

function summary(m: { kind: string; ramRequiredGB: number | null; costPer1MInput: number }): string {
    if (m.kind === 'ollama') return m.ramRequiredGB ? `local, ${m.ramRequiredGB}GB` : 'local';
    return m.costPer1MInput > 0 ? `$${m.costPer1MInput}/1M` : 'free';
}
