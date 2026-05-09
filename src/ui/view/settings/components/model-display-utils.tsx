import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import type { ModelCapabilities } from '@/core/providers/types';

export function formatCtx(maxCtx?: number): string | null {
    if (!maxCtx) return null;
    if (maxCtx >= 1_000_000) return `${Math.round(maxCtx / 1_000_000)}M`;
    if (maxCtx >= 1_000) return `${Math.round(maxCtx / 1_000)}K`;
    return `${maxCtx}`;
}

export function CapTags({ caps }: { caps?: ModelCapabilities }) {
    if (!caps) return null;
    const tags: { label: string; cls: string }[] = [];
    if (caps.reasoning) tags.push({ label: 'reason', cls: 'pktw-bg-yellow-500/20 pktw-text-yellow-700 dark:pktw-text-yellow-400' });
    if (caps.vision) tags.push({ label: 'vision', cls: 'pktw-bg-blue-500/20 pktw-text-blue-700 dark:pktw-text-blue-400' });
    if (caps.webSearch) tags.push({ label: 'search', cls: 'pktw-bg-green-500/20 pktw-text-green-700 dark:pktw-text-green-400' });
    const ctx = formatCtx(caps.maxCtx);
    if (ctx) tags.push({ label: ctx, cls: 'pktw-bg-pk-border/40 pktw-text-pk-muted-foreground' });
    if (tags.length === 0) return null;
    return (
        <span className="pktw-flex pktw-gap-1 pktw-shrink-0">
            {tags.map((t) => (
                <span key={t.label} className={cn('pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-text-[10px] pktw-font-medium pktw-leading-none', t.cls)}>
                    {t.label}
                </span>
            ))}
        </span>
    );
}

export function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return (
        <>
            {text.slice(0, idx)}
            <span className="pktw-text-pk-accent pktw-font-semibold">{text.slice(idx, idx + query.length)}</span>
            {text.slice(idx + query.length)}
        </>
    );
}
