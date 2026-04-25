import React from 'react';
import { ProfileKind } from '@/core/profiles/types';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';

const KINDS: ProfileKind[] = ['anthropic', 'openai', 'google', 'openrouter', 'perplexity', 'ollama', 'litellm', 'custom'];

interface AddProfileGridProps {
    onSelect: (kind: ProfileKind) => void;
    onCancel: () => void;
}

export function AddProfileGrid({ onSelect, onCancel }: AddProfileGridProps) {
    return (
        <div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-p-4 pktw-mb-3">
            <div className="pktw-flex pktw-justify-between pktw-items-center pktw-mb-3">
                <span className="pktw-text-sm pktw-font-medium">Choose provider</span>
                <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-cursor-pointer hover:pktw-text-pk-foreground"
                      onClick={onCancel}>Cancel</span>
            </div>
            <div className="pktw-grid pktw-grid-cols-4 pktw-gap-2.5">
                {KINDS.map(kind => {
                    const meta = PROVIDER_LABELS[kind];
                    return (
                        <div key={kind}
                             className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-1.5 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-cursor-pointer hover:pktw-border-pk-accent pktw-transition-colors"
                             onClick={() => onSelect(kind)}>
                            <ProviderIcon kind={kind} size={36} />
                            <span className="pktw-text-xs pktw-font-medium">{meta.label}</span>
                            <span className="pktw-text-[10px] pktw-text-pk-foreground-faint">{meta.desc}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
