/**
 * Free-form input for "再来一次 (告诉我哪里不对)". The text is appended to the
 * curator prompt on the next invocation so the LLM can adjust.
 */

import React from 'react';
import { ChevronLeft, Wand2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';

export interface RedoInputStepProps {
    note: string;
    onNoteChange: (note: string) => void;
    onBack: () => void;
    onSubmit: () => void;
}

const PRESETS = [
    'Premium 太贵，换便宜点的',
    '太偏向云端，多用本地模型',
    'Quick 太弱，要更聪明的',
    'Deep 太慢，要快的',
];

export function RedoInputStep({ note, onNoteChange, onBack, onSubmit }: RedoInputStepProps) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    告诉配置助手哪里不对
                </span>
                <span className="pktw-text-xs pktw-text-[--text-muted]">
                    它会基于你的反馈重新推荐。
                </span>
            </div>

            <textarea
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="比如：Premium 用 Opus 太贵，换 Sonnet"
                rows={4}
                className="pktw-w-full pktw-bg-[--background-primary] pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-px-3 pktw-py-2 pktw-text-sm pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent] pktw-resize-none"
            />

            <div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
                {PRESETS.map((p) => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => onNoteChange(note ? `${note}\n${p}` : p)}
                        className="pktw-text-[11px] pktw-px-2 pktw-py-1 pktw-rounded-full pktw-border pktw-border-[--background-modifier-border] pktw-text-[--text-muted] hover:pktw-bg-[--background-modifier-hover]"
                    >
                        + {p}
                    </button>
                ))}
            </div>

            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1 pktw-text-xs">
                    <ChevronLeft size={14} /> 返回
                </Button>
                <Button size="sm" onClick={onSubmit} disabled={!note.trim()} className="pktw-gap-1">
                    <Wand2 size={14} /> 重新生成
                </Button>
            </div>
        </div>
    );
}
