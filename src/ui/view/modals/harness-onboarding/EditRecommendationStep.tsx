/**
 * Inline editor for the three capability bindings. The dropdown for each tier
 * lists catalog entries marked suitable for that tier (filterByTier) so the
 * user sees recommended-by-catalog choices first.
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

const CAPABILITY_LABEL: Record<Capability, string> = {
    quick: 'Quick',
    deep: 'Deep',
    premium: 'Premium',
};

export interface EditRecommendationStepProps {
    recommendation: Recommendation;
    onChange: (capability: Capability, modelId: string) => void;
    onBack: () => void;
    onDone: () => void;
}

export function EditRecommendationStep({ recommendation, onChange, onBack, onDone }: EditRecommendationStepProps) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    手动编辑三档绑定
                </span>
                <span className="pktw-text-xs pktw-text-[--text-muted]">
                    每档列出 catalog 中标注适合的 model。改完点 "完成" 回到推荐预览。
                </span>
            </div>

            {CAPABILITY_ORDER.map((cap) => (
                <CapabilityRow
                    key={cap}
                    capability={cap}
                    modelId={recommendation.bindings[cap]}
                    onSelect={(id) => onChange(cap, id)}
                />
            ))}

            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1 pktw-text-xs">
                    <ChevronLeft size={14} /> 返回
                </Button>
                <Button size="sm" onClick={onDone} className="pktw-gap-1">
                    <Check size={14} /> 完成
                </Button>
            </div>
        </div>
    );
}

function CapabilityRow({
    capability,
    modelId,
    onSelect,
}: {
    capability: Capability;
    modelId: string;
    onSelect: (id: string) => void;
}) {
    const candidates = filterByTier(capability);
    const current = lookupModel(modelId);
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-2">
            <div className="pktw-flex pktw-items-baseline pktw-gap-2">
                <span className="pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">
                    {CAPABILITY_LABEL[capability]}
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
                {!current && <option value={modelId}>{modelId} (未知 — 改个吧)</option>}
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
