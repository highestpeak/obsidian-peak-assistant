import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { PromptItem } from './PromptItem';
import type { PromptItemData } from './PromptItem';
import type { TemplateId } from '@/core/template/TemplateRegistry';

interface Props {
    label: string;
    items: PromptItemData[];
    defaultExpanded: boolean;
    overrides: Set<string>;
    onOpen: (id: TemplateId) => void;
    onReset: (id: TemplateId) => void;
    searchQuery?: string;
}

export const PromptGroupSection: React.FC<Props> = ({
    label, items, defaultExpanded, overrides, onOpen, onReset, searchQuery,
}) => {
    const [manualExpanded, setManualExpanded] = useState(defaultExpanded);
    const isSearching = !!searchQuery;

    const filteredItems = isSearching
        ? items.filter(item => {
            const q = searchQuery!.toLowerCase();
            const matchLabel = (item.meta.label || '').toLowerCase().includes(q);
            const matchDesc = (item.meta.description || '').toLowerCase().includes(q);
            const matchId = String(item.id).toLowerCase().includes(q);
            return matchLabel || matchDesc || matchId;
        })
        : items;

    if (isSearching && filteredItems.length === 0) return null;

    const isExpanded = isSearching ? true : manualExpanded;

    const overrideCount = items.reduce((n, item) => {
        if (overrides.has(String(item.id))) n++;
        if (item.systemEntry && overrides.has(String(item.systemEntry.id))) n++;
        return n;
    }, 0);
    const totalCount = items.reduce((n, item) => n + (item.systemEntry ? 2 : 1), 0);

    return (
        <div>
            <div
                className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-5 pktw-py-2.5 pktw-cursor-pointer pktw-select-none hover:pktw-bg-[var(--pk-bg-secondary)] pktw-transition-colors"
                onClick={() => setManualExpanded(!manualExpanded)}
            >
                <ChevronDown className={cn(
                    'pktw-w-3.5 pktw-h-3.5 pktw-text-[var(--pk-text-tertiary)] pktw-transition-transform pktw-duration-200',
                    !isExpanded && 'pktw-rotate-[-90deg]',
                )} />
                <span className="pktw-text-[12px] pktw-font-semibold pktw-text-[var(--pk-text-secondary)] pktw-uppercase pktw-tracking-wider">
                    {label}
                </span>
                <span className="pktw-text-[10px] pktw-text-[var(--pk-text-tertiary)] pktw-ml-auto">
                    {overrideCount > 0 && (
                        <span className="pktw-text-[var(--pk-accent)]">{overrideCount}</span>
                    )}
                    {overrideCount > 0 && ' / '}
                    {totalCount}
                </span>
            </div>

            {isExpanded && (
                <div className="pktw-pb-1">
                    {filteredItems.map(item => (
                        <PromptItem
                            key={String(item.id)}
                            item={item}
                            overrides={overrides}
                            onOpen={onOpen}
                            onReset={onReset}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
