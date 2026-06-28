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
                            className="pktw-bg-[var(--pk-error-muted)] pktw-text-[var(--pk-error)] pktw-line-through"
                        >
                            {seg.text}
                        </span>
                    );
                }
                return (
                    <span
                        key={i}
                        className="pktw-bg-[var(--pk-success-muted)] pktw-text-[var(--pk-success)]"
                    >
                        {seg.text}
                    </span>
                );
            })}
        </div>
    );
};
