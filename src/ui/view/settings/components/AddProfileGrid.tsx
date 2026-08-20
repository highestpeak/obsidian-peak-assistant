import React, { useState } from 'react';
import type { ProfileKind } from '@/core/profiles/types';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';
import { Button } from '@/ui/component/shared-ui/button';

const KINDS: ProfileKind[] = ['openai', 'anthropic', 'openrouter', 'ollama', 'codex', 'claude-code', 'google', 'perplexity', 'litellm', 'custom', 'simulator'];

interface AddProfileGridProps {
    onSelect: (kind: ProfileKind) => void;
    onCancel: () => void;
    existingKinds: Set<ProfileKind>;
}

export function AddProfileGrid({ onSelect, onCancel, existingKinds }: AddProfileGridProps) {
    const [showAll, setShowAll] = useState(false);

    const newKinds = KINDS.filter(k => !existingKinds.has(k));
    const displayKinds = showAll ? KINDS : newKinds;
    const hasExisting = existingKinds.size > 0 && newKinds.length < KINDS.length;

    return (
        <div className="pk-profile-add-grid pktw-border pktw-border-pk-border pktw-rounded-lg pktw-p-4 pktw-mb-3">
            <div className="pk-profile-add-grid__header pktw-flex pktw-justify-between pktw-items-center pktw-mb-3">
                <span className="pktw-text-sm pktw-font-medium">Choose provider</span>
                <Button variant="ghost" size="xs" className="pk-profile-add-grid__cancel" onClick={onCancel}>Cancel</Button>
            </div>
            <div className="pk-profile-add-grid__options pktw-grid pktw-grid-cols-4 pktw-gap-2.5">
                {displayKinds.map(kind => {
                    const meta = PROVIDER_LABELS[kind];
                    const alreadyExists = existingKinds.has(kind);
                    return (
                        <Button key={kind}
                             variant="unstyled"
                             className="pk-profile-add-grid__option pktw-flex pktw-flex-col pktw-items-center pktw-gap-1.5 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-cursor-pointer hover:pktw-border-pk-accent hover:pktw-shadow-md pktw-transition-all pktw-duration-200"
                             onClick={() => onSelect(kind)}>
                            <ProviderIcon kind={kind} size={36} />
                            <span className="pktw-text-xs pktw-font-medium">{meta.label}</span>
                            <span className="pktw-text-pk-xs pktw-text-pk-foreground-faint">
                                {alreadyExists && showAll ? 'already configured' : meta.desc}
                            </span>
                        </Button>
                    );
                })}
            </div>
            {hasExisting && !showAll && (
                <Button
                    variant="ghost"
                    className="pk-profile-add-grid__show-all pktw-block pktw-text-center pktw-text-pk-sm pktw-text-pk-muted-foreground pktw-mt-3 pktw-cursor-pointer hover:pktw-text-pk-foreground pktw-transition-colors"
                    onClick={() => setShowAll(true)}
                >
                    Add another instance of existing provider
                </Button>
            )}
        </div>
    );
}
