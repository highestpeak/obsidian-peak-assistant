import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { ChevronRight, Sparkles, Wand2 } from 'lucide-react';

export interface WelcomeStepProps {
    isReRun: boolean;
    onStart: () => void;
    onManual: () => void;
}

export function WelcomeStep({ isReRun, onStart, onManual }: WelcomeStepProps) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-6 pktw-py-6 pktw-px-8">
            <Sparkles size={36} className="pktw-text-[--interactive-accent]" />
            <div className="pktw-text-center pktw-max-w-md">
                <span className="pktw-block pktw-text-lg pktw-font-semibold pktw-text-[--text-normal] pktw-mb-2">
                    {isReRun ? '重新配置 Agent Harness' : '配置 Agent Harness'}
                </span>
                <span className="pktw-block pktw-text-sm pktw-text-[--text-muted] pktw-leading-relaxed">
                    我们会基于你的环境（RAM、已装 Ollama、已配 API Key、笔记语言）和你的偏好
                    （预算、速度 vs 质量），为 Quick / Deep / Premium 三个能力档自动选 model。
                    你随时可以接受、编辑、或重来。
                </span>
            </div>
            <div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full pktw-max-w-xs">
                <Button onClick={onStart} className="pktw-gap-2 pktw-w-full">
                    <Wand2 size={16} /> 开始
                    <ChevronRight size={16} className="pktw-ml-auto" />
                </Button>
                <Button onClick={onManual} variant="ghost" size="sm" className="pktw-w-full pktw-text-xs">
                    跳过 — 我自己配（高级）
                </Button>
            </div>
        </div>
    );
}
