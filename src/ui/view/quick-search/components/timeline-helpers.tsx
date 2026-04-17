import React from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, FileText, Search, Brain, FolderOpen, Link } from 'lucide-react';
import type { V2TimelineItem, V2ToolStep } from '../types/search-steps';

/** Get icon for tool type */
function ToolIcon({ toolName }: { toolName: string }) {
    const short = toolName.replace(/^mcp__vault__/, '');
    switch (short) {
        case 'vault_list_folders': return <FolderOpen className="pktw-w-3.5 pktw-h-3.5" />;
        case 'vault_read_folder': return <FolderOpen className="pktw-w-3.5 pktw-h-3.5" />;
        case 'vault_read_note': return <FileText className="pktw-w-3.5 pktw-h-3.5" />;
        case 'vault_grep': return <Search className="pktw-w-3.5 pktw-h-3.5" />;
        case 'vault_wikilink_expand': return <Link className="pktw-w-3.5 pktw-h-3.5" />;
        case 'vault_submit_plan': return <Brain className="pktw-w-3.5 pktw-h-3.5" />;
        default: return <FileText className="pktw-w-3.5 pktw-h-3.5" />;
    }
}

/** Single tool step — one compact line */
export const ToolRow: React.FC<{ step: V2ToolStep }> = ({ step }) => {
    const isRunning = step.status === 'running';
    const isSubmitPlan = step.toolName.endsWith('vault_submit_plan');

    return (
        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1 pktw-px-1">
            {/* Status dot */}
            {isRunning ? (
                <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                    <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed] pktw-animate-spin" />
                </div>
            ) : (
                <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-green-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                    <Check className="pktw-w-2.5 pktw-h-2.5 pktw-text-green-600" />
                </div>
            )}

            {/* Tool icon + name */}
            <div className="pktw-text-[#7c3aed] pktw-shrink-0"><ToolIcon toolName={step.toolName} /></div>
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338] pktw-truncate">
                {step.displayName}
            </span>

            {/* Summary + duration right-aligned */}
            <span className="pktw-flex-1" />
            {step.summary && (
                <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-shrink-0 pktw-truncate pktw-max-w-[200px]" title={step.summary}>
                    {step.summary}
                </span>
            )}
            {!isRunning && step.endedAt && step.startedAt ? (
                <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-font-mono pktw-tabular-nums pktw-shrink-0 pktw-ml-1">
                    {(step.endedAt - step.startedAt) < 100 ? '<0.1s' : `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s`}
                </span>
            ) : isRunning && !isSubmitPlan ? (
                <span className="pktw-text-[10px] pktw-text-[#7c3aed] pktw-font-mono pktw-shrink-0 pktw-ml-1">...</span>
            ) : null}
        </div>
    );
};

/** Batch reading — compact */
export const BatchRow: React.FC<{ steps: V2ToolStep[] }> = ({ steps }) => {
    const allDone = steps.every((s) => s.status === 'done');
    const names = steps.map((s) => {
        const path = String(s.input.path ?? '');
        return path.split('/').pop()?.replace(/\.md$/, '') || 'note';
    });
    const shown = names.slice(0, 4).join(', ');
    const extra = names.length > 4 ? ` +${names.length - 4}` : '';

    return (
        <ToolRow step={{
            id: `batch-${steps[0].id}`,
            toolName: 'mcp__vault__vault_read_note',
            displayName: `Reading ${steps.length} notes in depth`,
            icon: '',
            input: {},
            status: allDone ? 'done' : 'running',
            startedAt: steps[0].startedAt,
            endedAt: allDone ? steps[steps.length - 1].endedAt : undefined,
            summary: allDone ? shown + extra : undefined,
        }} />
    );
};

/** Thinking text — collapsed to last line, click to expand */
export const ThinkingRow: React.FC<{ text: string }> = ({ text }) => {
    const [expanded, setExpanded] = React.useState(false);
    const trimmed = text.trim();
    if (!trimmed) return null;

    const lines = trimmed.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;
    const lastLine = lines[lines.length - 1].trim();
    const hasMore = lines.length > 1;

    return (
        <div
            className="pktw-py-0.5 pktw-px-1 pktw-ml-6 pktw-text-[11px] pktw-text-[#9ca3af] pktw-cursor-pointer hover:pktw-text-[#6b7280] pktw-transition-colors pktw-leading-relaxed"
            onClick={() => hasMore && setExpanded(!expanded)}
        >
            {expanded ? (
                <span className="pktw-whitespace-pre-wrap pktw-break-words pktw-text-[#6b7280]">{trimmed}</span>
            ) : (
                <span className="pktw-truncate pktw-block">{lastLine}{hasMore ? ' ▸' : ''}</span>
            )}
        </div>
    );
};

export type GroupedItem =
    | { kind: 'text'; text: string }
    | { kind: 'tool'; step: V2ToolStep }
    | { kind: 'batch'; steps: V2ToolStep[] };

/** Group consecutive vault_read_note items */
export function groupTimeline(timeline: V2TimelineItem[]): GroupedItem[] {
    const result: GroupedItem[] = [];
    let i = 0;
    while (i < timeline.length) {
        const item = timeline[i];
        if (item.kind === 'text') {
            result.push({ kind: 'text', text: item.chunks.join('') });
        } else if (item.kind === 'tool' && item.step.toolName.endsWith('vault_read_note')) {
            const batch: V2ToolStep[] = [item.step];
            while (i + 1 < timeline.length) {
                const next = timeline[i + 1];
                if (next.kind === 'tool' && next.step.toolName.endsWith('vault_read_note')) {
                    batch.push(next.step);
                    i++;
                } else break;
            }
            result.push(batch.length >= 2 ? { kind: 'batch', steps: batch } : { kind: 'tool', step: batch[0] });
        } else if (item.kind === 'tool') {
            result.push({ kind: 'tool', step: item.step });
        }
        i++;
    }
    return result;
}
