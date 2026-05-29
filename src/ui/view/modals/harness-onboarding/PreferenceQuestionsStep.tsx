/**
 * Two-question preference form. See spec §5.3.
 *
 * Mirrors the mockup verbatim:
 *   1. 每月愿意花多少 API 钱?      ($0 / 极少 / $5-20 / $50+)
 *   2. 速度 vs 质量?               (速度 / 平衡 / 质量)
 */

import React from 'react';
import { ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type { BudgetTier, SpeedQualityPreference, UserPreferences } from '@/service/agents/harness/curator';

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

const BUDGET_OPTIONS: Option<BudgetTier>[] = [
    { value: 'zero', label: '$0 / 极少', hint: '全本地，离线可用' },
    { value: 'low', label: '$5-20', hint: '中等使用' },
    { value: 'high', label: '$50+', hint: '重度使用' },
];

const SPEED_OPTIONS: Option<SpeedQualityPreference>[] = [
    { value: 'speed', label: '速度优先', hint: '1s 内出结果' },
    { value: 'balanced', label: '平衡', hint: '默认推荐' },
    { value: 'quality', label: '质量优先', hint: '关键时刻用旗舰' },
];

export function PreferenceQuestionsStep({
    preferences,
    onBudgetChange,
    onSpeedQualityChange,
    onBack,
    onContinue,
}: PreferenceQuestionsStepProps) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-5 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    最后 2 个问题
                </span>
                <span className="pktw-text-xs pktw-text-[--text-muted]">
                    配置助手会根据你的回答给出推荐 — 不是承诺，你可以接受、编辑或重来。
                </span>
            </div>

            <RadioGroup
                label="1. 每月愿意花多少 API 钱？"
                options={BUDGET_OPTIONS}
                value={preferences.budget}
                onChange={onBudgetChange}
            />

            <RadioGroup
                label="2. 速度 vs 质量？"
                options={SPEED_OPTIONS}
                value={preferences.speedQuality}
                onChange={onSpeedQualityChange}
            />

            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
                    <ChevronLeft size={14} /> 返回
                </Button>
                <Button size="sm" onClick={onContinue} className="pktw-gap-1">
                    <Wand2 size={14} /> 跑配置助手 <ChevronRight size={14} />
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
