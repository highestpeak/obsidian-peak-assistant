import React from 'react';

interface DocTypeGridProps {
    types: Record<string, boolean>;
    onToggle: (type: string, value: boolean) => void;
}

export function DocTypeGrid({ types, onToggle }: DocTypeGridProps) {
    return (
        <div className="pktw-grid pktw-grid-cols-4 pktw-gap-1.5 pktw-my-2">
            {Object.entries(types).map(([type, enabled]) => (
                <div key={type}
                     className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-rounded-md pktw-border pktw-text-xs pktw-cursor-pointer pktw-transition-colors ${
                         enabled
                             ? 'pktw-border-pk-accent pktw-text-pk-accent pktw-bg-pk-accent-muted'
                             : 'pktw-border-pk-border pktw-text-pk-foreground-muted'
                     }`}
                     onClick={() => onToggle(type, !enabled)}>
                    <div className={`pktw-w-2 pktw-h-2 pktw-rounded-sm pktw-border ${
                        enabled ? 'pktw-bg-pk-accent pktw-border-pk-accent' : 'pktw-border-pk-foreground-faint'
                    }`} />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                </div>
            ))}
        </div>
    );
}
