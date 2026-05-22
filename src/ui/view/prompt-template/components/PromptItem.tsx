import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { TemplateId, TemplateMetadata } from '@/core/template/TemplateRegistry';

export interface PromptItemData {
    id: TemplateId;
    meta: TemplateMetadata;
    /** The paired system prompt entry, if any */
    systemEntry?: { id: TemplateId; meta: TemplateMetadata };
}

interface Props {
    item: PromptItemData;
    overrides: Set<string>;
    onOpen: (id: TemplateId) => void;
    onReset: (id: TemplateId) => void;
}

export const PromptItem: React.FC<Props> = ({ item, overrides, onOpen, onReset }) => {
    const hasPair = !!item.systemEntry;
    const mainOverridden = overrides.has(String(item.id));
    const systemOverridden = item.systemEntry ? overrides.has(String(item.systemEntry.id)) : false;
    const anyOverridden = mainOverridden || systemOverridden;
    const allOverridden = hasPair ? mainOverridden && systemOverridden : mainOverridden;

    const [showTooltip, setShowTooltip] = useState(false);

    const dotClass = allOverridden
        ? 'pktw-bg-[var(--pk-accent)] pktw-border-[var(--pk-accent)]'
        : anyOverridden
            ? 'pktw-border-[var(--pk-accent)]'
            : 'pktw-border-[var(--pk-text-tertiary)]';

    return (
        <div className="pktw-py-1 pktw-px-5 pktw-pl-10">
            {/* Main row */}
            <div
                className={cn(
                    'pktw-flex pktw-items-center pktw-gap-2 pktw-min-h-[28px] pktw-group pktw-relative peak-soft-hover-row',
                    'pktw-rounded-md pktw-px-2 pktw-py-1 pktw-mx-[-8px]',
                    !hasPair && 'pktw-cursor-pointer',
                )}
                onClick={!hasPair ? () => onOpen(item.id) : undefined}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                {/* Override dot */}
                <div className={cn(
                    'pktw-w-[7px] pktw-h-[7px] pktw-rounded-full pktw-border-[1.5px] pktw-flex-shrink-0 pktw-relative',
                    dotClass,
                )}>
                    {anyOverridden && !allOverridden && (
                        <div className="pktw-absolute pktw-top-1/2 pktw-left-1/2 pktw-transform pktw-translate-x-[-50%] pktw-translate-y-[-50%] pktw-w-[3px] pktw-h-[3px] pktw-rounded-full pktw-bg-[var(--pk-accent)]" />
                    )}
                </div>

                {/* Label */}
                <span className="pktw-text-[13px] pktw-text-[var(--pk-text-primary)] pktw-flex-1">
                    {item.meta.label || String(item.id)}
                </span>

                {/* Overridden badge */}
                {anyOverridden && (
                    <span className="pktw-text-[9px] pktw-px-1.5 pktw-py-[1px] pktw-rounded pktw-font-medium pktw-bg-[var(--pk-accent)]/10 pktw-text-[var(--pk-accent)] pktw-border pktw-border-[var(--pk-accent)]/20">
                        overridden
                    </span>
                )}

                {/* Reset button (hover-only) */}
                {anyOverridden && (
                    <button
                        className="pktw-text-[10px] pktw-text-[var(--pk-text-tertiary)] pktw-bg-transparent pktw-border-none pktw-cursor-pointer pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity hover:pktw-text-red-400 hover:pktw-bg-red-400/10"
                        onClick={(e) => {
                            e.stopPropagation();
                            onReset(item.id);
                        }}
                    >
                        <RotateCcw className="pktw-w-3 pktw-h-3" />
                    </button>
                )}

                {/* Tooltip */}
                {showTooltip && item.meta.description && (
                    <div className="pktw-absolute pktw-left-0 pktw-top-full pktw-mt-1 pktw-py-2 pktw-px-3 pktw-bg-pk-surface-overlay pktw-border pktw-border-pk-border pktw-rounded-lg pktw-text-[11px] pktw-text-pk-text-secondary pktw-leading-relaxed pktw-max-w-[420px] pktw-z-50 pktw-shadow-lg">
                        <div className="pktw-text-[var(--pk-text-primary)] pktw-font-medium pktw-mb-0.5">
                            {item.meta.label || String(item.id)}
                        </div>
                        {item.meta.group && (
                            <div className="pktw-text-[var(--pk-accent)] pktw-text-[10px] pktw-mb-1">
                                {item.meta.group}
                            </div>
                        )}
                        {item.meta.description}
                    </div>
                )}
            </div>

            {/* Sub-items for paired prompts */}
            {hasPair && (
                <div className="pktw-flex pktw-gap-1 pktw-mt-1 pktw-pl-4">
                    <SubItem
                        label="system"
                        overridden={systemOverridden}
                        onClick={() => onOpen(item.systemEntry!.id)}
                    />
                    <SubItem
                        label="user"
                        overridden={mainOverridden}
                        onClick={() => onOpen(item.id)}
                    />
                </div>
            )}
        </div>
    );
};

const SubItem: React.FC<{ label: string; overridden: boolean; onClick: () => void }> = ({ label, overridden, onClick }) => (
    <span
        className={cn(
            'pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-[3px] pktw-rounded-[5px] pktw-border pktw-text-[11px] pktw-cursor-pointer pktw-transition-all',
            overridden
                ? 'pktw-border-[var(--pk-accent)]/30 pktw-text-[var(--pk-accent)]'
                : 'pktw-border-[var(--pk-border)] pktw-text-[var(--pk-text-tertiary)]',
            'hover:pktw-border-[var(--pk-accent)] hover:pktw-text-[var(--pk-accent)] hover:pktw-bg-[var(--pk-accent)]/5',
        )}
        onClick={onClick}
    >
        <div className={cn(
            'pktw-w-[5px] pktw-h-[5px] pktw-rounded-full pktw-border',
            overridden
                ? 'pktw-bg-[var(--pk-accent)] pktw-border-[var(--pk-accent)]'
                : 'pktw-border-[var(--pk-text-tertiary)]',
        )} />
        {label}
    </span>
);
