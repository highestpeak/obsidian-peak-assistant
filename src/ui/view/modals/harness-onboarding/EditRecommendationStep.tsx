/**
 * Inline editor for the three tier bindings — one FormRow.Select per tier.
 * The dropdown lists catalog entries marked suitable for that tier
 * (filterByTier) so recommended choices float to the top.
 */

import React from 'react';
import {
    CAPABILITY_ORDER,
    filterByTier,
    lookupModel,
    type Capability,
    type Recommendation,
} from '@/service/agents/harness/curator';
import { FormGrid, FormRow } from '@/ui/components/primitives';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface EditRecommendationStepProps {
    recommendation: Recommendation;
    onChange: (capability: Capability, modelId: string) => void;
    onBack: () => void;
    onDone: () => void;
}

export function EditRecommendationStep({ recommendation, onChange }: EditRecommendationStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.editRecommendation;
    return (
        <div className="pkonb-section">
            <div>
                <div className="pkonb-section__title">{copy.title}</div>
                <div className="pkonb-section__desc">{copy.description}</div>
            </div>

            <FormGrid>
                {CAPABILITY_ORDER.map((cap) => (
                    <CapabilityRow
                        key={cap}
                        capability={cap}
                        modelId={recommendation.bindings[cap]}
                        onSelect={(id) => onChange(cap, id)}
                        strings={strings}
                    />
                ))}
            </FormGrid>
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
    const tierDesc = strings.steps.review.tierDescriptions[capability];
    const unknownSuffix = strings.steps.editRecommendation.unknownModelPlaceholderSuffix;
    return (
        <FormRow>
            <FormRow.Label>
                {tierLabel}
                <FormRow.LabelHint>{tierDesc}</FormRow.LabelHint>
            </FormRow.Label>
            <FormRow.Control>
                <FormRow.Select value={modelId} onChange={(e) => onSelect(e.target.value)}>
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
                </FormRow.Select>
                {current && (
                    <FormRow.ControlHint>{current.displayName}</FormRow.ControlHint>
                )}
            </FormRow.Control>
        </FormRow>
    );
}

function summary(m: { kind: string; ramRequiredGB: number | null; costPer1MInput: number }): string {
    if (m.kind === 'ollama') return m.ramRequiredGB ? `local, ${m.ramRequiredGB}GB` : 'local';
    return m.costPer1MInput > 0 ? `$${m.costPer1MInput}/1M` : 'free';
}
