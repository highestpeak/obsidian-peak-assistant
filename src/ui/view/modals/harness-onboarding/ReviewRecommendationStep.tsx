/**
 * Shows the Curator recommendation: bindings table, models-to-download list,
 * api-keys-needed list, and a rationale. Three actions: accept (writes to
 * HarnessSettings), edit (per-tier override), redo (re-run with a note).
 *
 * See spec §5.4.
 */

import React, { useCallback, useState } from 'react';
import { Notice } from 'obsidian';
import {
    AlertTriangle,
    ArrowDownToLine,
    Check,
    ChevronLeft,
    Edit3,
    KeyRound,
    Loader2,
    RotateCcw,
    Sparkles,
} from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { lookupModel, type CuratorResult } from '@/service/agents/harness/curator';
import { applyRecommendation } from './applyRecommendation';
import type { Capability } from '@/service/agents/harness/curator';
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
    onBack,
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
        <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-items-center pktw-gap-2">
                <Sparkles size={16} className="pktw-text-[--interactive-accent]" />
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    {copy.title}
                </span>
                {!fromLLM && (
                    <span className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-amber-100 pktw-text-amber-700 pktw-flex pktw-items-center pktw-gap-1">
                        <AlertTriangle size={10} /> {copy.fallbackChip}
                    </span>
                )}
            </div>

            {/* Bindings table */}
            <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
                {(['quick', 'deep', 'premium'] as const).map((cap) => (
                    <BindingRow key={cap} capability={cap} modelId={recommendation.bindings[cap]} strings={strings} />
                ))}
            </div>

            {/* Models to download */}
            {recommendation.modelsToDownload.length > 0 && (
                <InfoBlock
                    icon={<ArrowDownToLine size={14} />}
                    title={copy.downloadsTitle}
                    items={recommendation.modelsToDownload.map((m) => `ollama pull ${m}`)}
                />
            )}

            {/* API keys needed */}
            {recommendation.apiKeysNeeded.length > 0 && (
                <InfoBlock
                    icon={<KeyRound size={14} />}
                    title={copy.apiKeysTitle}
                    items={recommendation.apiKeysNeeded.map((k) => `${k} ${copy.apiKeyInstructionSuffix}`)}
                />
            )}

            {/* Cascade */}
            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[--text-muted]">
                <span>{copy.cascadeLabel}</span>
                <span className={cn('pktw-font-medium', recommendation.cascadeEnabled ? 'pktw-text-green-600' : 'pktw-text-[--text-muted]')}>
                    {recommendation.cascadeEnabled ? copy.cascadeOn : copy.cascadeOff}
                </span>
            </div>

            {/* Rationale */}
            <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-3 pktw-rounded-lg pktw-bg-[--background-primary-alt] pktw-border pktw-border-[--background-modifier-border]">
                <span className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-text-[--text-muted] pktw-font-semibold">
                    {copy.rationaleTitle}
                </span>
                <span className="pktw-text-xs pktw-text-[--text-normal] pktw-leading-relaxed">
                    {recommendation.rationale}
                </span>
            </div>

            {/* Actions */}
            <div className="pktw-flex pktw-justify-between pktw-items-center pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1 pktw-text-xs" disabled={applying}>
                    <ChevronLeft size={14} /> {strings.actions.back}
                </Button>
                <div className="pktw-flex pktw-gap-2">
                    <Button variant="ghost" size="sm" onClick={onRedo} disabled={applying} className="pktw-gap-1 pktw-text-xs">
                        <RotateCcw size={12} /> {strings.actions.regenerate}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onEdit} disabled={applying} className="pktw-gap-1 pktw-text-xs">
                        <Edit3 size={12} /> {strings.actions.edit}
                    </Button>
                    <Button size="sm" onClick={handleAccept} disabled={applying} className="pktw-gap-1">
                        {applying ? <Loader2 size={12} className="pktw-animate-spin" /> : <Check size={14} />}
                        {strings.actions.accept}
                    </Button>
                </div>
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
    return (
        <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2 pktw-rounded-md pktw-border pktw-border-[--background-modifier-border]">
            <div className="pktw-w-32 pktw-shrink-0">
                <span className="pktw-text-xs pktw-font-semibold pktw-text-[--text-normal]">
                    {copy.tierLabels[capability]}
                </span>
            </div>
            <div className="pktw-flex-1 pktw-min-w-0">
                <span className="pktw-block pktw-text-sm pktw-font-mono pktw-text-[--text-normal] pktw-truncate">
                    {modelId}
                </span>
                <span className="pktw-block pktw-text-[10px] pktw-text-[--text-muted]">
                    {entry ? entry.displayName : copy.unknownModel} · {copy.tierDescriptions[capability]}
                </span>
            </div>
            {entry && (
                <span className="pktw-text-[10px] pktw-text-[--text-muted] pktw-shrink-0 pktw-font-mono">
                    {entry.kind === 'ollama'
                        ? entry.ramRequiredGB
                            ? `${entry.ramRequiredGB}GB RAM`
                            : 'local'
                        : entry.costPer1MInput > 0
                            ? `$${entry.costPer1MInput}/1M`
                            : 'free'}
                </span>
            )}
        </div>
    );
}

function InfoBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-p-2.5 pktw-rounded-md pktw-bg-[--background-primary-alt] pktw-border pktw-border-[--background-modifier-border]">
            <span className="pktw-text-[10px] pktw-text-[--text-muted] pktw-flex pktw-items-center pktw-gap-1.5 pktw-font-semibold pktw-uppercase pktw-tracking-wider">
                {icon} {title}
            </span>
            {items.map((it) => (
                <span key={it} className="pktw-text-xs pktw-font-mono pktw-text-[--text-normal]">{it}</span>
            ))}
        </div>
    );
}
