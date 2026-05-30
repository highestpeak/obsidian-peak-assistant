/**
 * Shows the Curator recommendation: tier-bindings (pk-row), models-to-download
 * + api-keys-needed (pk-disclosure-body), and the rationale hint. Three terminal
 * actions: accept (writes to HarnessSettings), edit, regenerate.
 *
 * Visual primitives: <Row>, <Chip>, <Pill>, <BrandAvatar>; namespaced helpers
 * use pkonb-hint for the rationale banner. All strings via useOnboardingStrings.
 */

import React, { useCallback, useState } from 'react';
import { Notice } from 'obsidian';
import {
    AlertTriangle,
    ArrowDownToLine,
    Check,
    Edit3,
    KeyRound,
    Loader2,
    RotateCcw,
    Sparkles,
    Info,
} from 'lucide-react';
import { lookupModel, type CuratorResult } from '@/service/agents/harness/curator';
import { applyRecommendation } from './applyRecommendation';
import type { Capability } from '@/service/agents/harness/curator';
import { Row, Chip, Pill } from '@/ui/components/primitives';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface ReviewRecommendationStepProps {
    result: CuratorResult;
    onEdit: () => void;
    onRedo: () => void;
    onAccepted: () => void;
    onBack: () => void;
}

export function ReviewRecommendationStep({
    result,
    onEdit,
    onRedo,
    onAccepted,
}: ReviewRecommendationStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.review;
    const { recommendation, fromLLM } = result;
    const [applying, setApplying] = useState(false);

    const handleAccept = useCallback(async () => {
        setApplying(true);
        const res = await applyRecommendation(recommendation);
        setApplying(false);
        if (!res.success) {
            new Notice(copy.applyAllFailedNotice);
            return;
        }
        if (res.skippedCapabilities.length > 0) {
            new Notice(
                copy.applyPartialNotice
                    .replace('{applied}', res.appliedCapabilities.join(', '))
                    .replace('{skipped}', res.skippedCapabilities.join(', ')),
            );
        } else {
            new Notice(copy.applySuccessNotice);
        }
        onAccepted();
    }, [recommendation, onAccepted, copy]);

    return (
        <div className="pkonb-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pk-space-2)' }}>
                <Sparkles
                    style={{ width: 16, height: 16, color: 'var(--pk-accent)' }}
                />
                <div className="pkonb-section__title">{copy.title}</div>
                {!fromLLM && (
                    <Chip variant="warning">
                        <AlertTriangle />
                        <span>{copy.fallbackChip}</span>
                    </Chip>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pk-space-2)' }}>
                {(['quick', 'deep', 'premium'] as const).map((cap) => (
                    <BindingRow
                        key={cap}
                        capability={cap}
                        modelId={recommendation.bindings[cap]}
                        strings={strings}
                    />
                ))}
            </div>

            {recommendation.modelsToDownload.length > 0 && (
                <InfoBlock
                    icon={<ArrowDownToLine />}
                    title={copy.downloadsTitle}
                    items={recommendation.modelsToDownload.map((m) => `ollama pull ${m}`)}
                />
            )}

            {recommendation.apiKeysNeeded.length > 0 && (
                <InfoBlock
                    icon={<KeyRound />}
                    title={copy.apiKeysTitle}
                    items={recommendation.apiKeysNeeded.map((k) => `${k} ${copy.apiKeyInstructionSuffix}`)}
                />
            )}

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--pk-space-2)',
                    fontSize: 'var(--pk-text-base)',
                    color: 'var(--pk-text-secondary)',
                }}
            >
                <span>{copy.cascadeLabel}</span>
                <Chip variant={recommendation.cascadeEnabled ? 'success' : 'neutral'}>
                    {recommendation.cascadeEnabled ? copy.cascadeOn : copy.cascadeOff}
                </Chip>
            </div>

            <div className="pkonb-hint pkonb-hint--accent">
                <Info />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="pkonb-section__kicker">{copy.rationaleTitle}</span>
                    <span>{recommendation.rationale}</span>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 'var(--pk-space-2)',
                    marginTop: 'var(--pk-space-2)',
                }}
            >
                <Pill onClick={onRedo} disabled={applying}>
                    <RotateCcw />
                    <span>{strings.actions.regenerate}</span>
                </Pill>
                <Pill onClick={onEdit} disabled={applying}>
                    <Edit3 />
                    <span>{strings.actions.edit}</span>
                </Pill>
                <Pill selected onClick={handleAccept} disabled={applying}>
                    {applying ? <Loader2 className="pkonb-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check />}
                    <span>{strings.actions.accept}</span>
                </Pill>
            </div>
        </div>
    );
}

function BindingRow({
    capability,
    modelId,
    strings,
}: {
    capability: Capability;
    modelId: string;
    strings: OnboardingStrings;
}) {
    const entry = lookupModel(modelId);
    const copy = strings.steps.review;
    const cost =
        entry?.kind === 'ollama'
            ? entry.ramRequiredGB
                ? `${entry.ramRequiredGB}GB RAM`
                : 'local'
            : entry
                ? entry.costPer1MInput > 0
                    ? `$${entry.costPer1MInput}/1M`
                    : 'free'
                : undefined;
    return (
        <Row>
            <Row.Icon>
                <Sparkles />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{copy.tierLabels[capability]}</Row.Title>
                <Row.Desc>{copy.tierDescriptions[capability]}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <Row.Value>{modelId}</Row.Value>
                {cost && <Chip variant="neutral">{cost}</Chip>}
                {!entry && <Chip variant="warning">{copy.unknownModel}</Chip>}
            </Row.Right>
        </Row>
    );
}

function InfoBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--pk-space-1)',
                padding: 'var(--pk-space-3)',
                borderRadius: 'var(--pk-radius-md)',
                background: 'var(--pk-surface-sunken)',
                border: '1px solid var(--pk-border)',
            }}
        >
            <span
                className="pkonb-section__kicker"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
                {icon} {title}
            </span>
            {items.map((it) => (
                <span
                    key={it}
                    style={{
                        fontFamily: 'var(--pk-font-mono)',
                        fontSize: 'var(--pk-text-base)',
                        color: 'var(--pk-text-primary)',
                    }}
                >
                    {it}
                </span>
            ))}
        </div>
    );
}
