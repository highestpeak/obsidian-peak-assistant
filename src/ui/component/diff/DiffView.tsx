import React from 'react';
import { diffWords } from './wordDiff';
import { cn } from '@/ui/react/lib/utils';

interface DiffViewProps {
    original: string;
    modified: string;
    className?: string;
}

export const DiffView: React.FC<DiffViewProps> = ({ original, modified, className }) => {
    const segments = diffWords(original, modified);

    return (
        <div className={cn("pktw-whitespace-pre-wrap pktw-text-sm pktw-leading-relaxed", className)}>
            {segments.map((seg, i) => {
                if (seg.type === 'equal') {
                    return <span key={i}>{seg.text}</span>;
                }
                if (seg.type === 'removed') {
                    return (
                        <span
                            key={i}
                            className="pktw-bg-[var(--pk-error-muted,rgba(239,68,68,0.15))] pktw-text-[var(--pk-error,#ef4444)] pktw-line-through"
                        >
                            {seg.text}
                        </span>
                    );
                }
                return (
                    <span
                        key={i}
                        className="pktw-bg-[var(--pk-success-muted,rgba(34,197,94,0.15))] pktw-text-[var(--pk-success,#22c55e)]"
                    >
                        {seg.text}
                    </span>
                );
            })}
        </div>
    );
};
