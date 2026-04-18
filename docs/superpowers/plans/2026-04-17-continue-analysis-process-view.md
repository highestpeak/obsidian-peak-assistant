# Continue Analysis & Process View Redesign — Implementation Plan
> **STATUS: COMPLETED**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Process view to show historical rounds as collapsible blocks and move plan review inline, eliminating tab-switch friction.

**Architecture:** Extract shared timeline rendering components, create `V2RoundBlock` (collapsible round display) and `V2InlinePlanReview` (inline plan with generate button), rewrite `V2ProcessView` to render `rounds[]` + current round, remove plan review gate from `V2ReportView`.

**Tech Stack:** React 18, Zustand, Framer Motion, Tailwind (pktw- prefix), Lucide icons, shadcn Button

---

### Task 1: Extract Timeline Rendering Helpers

**Files:**
- Create: `src/ui/view/quick-search/components/timeline-helpers.tsx`
- Modify: `src/ui/view/quick-search/components/V2ProcessView.tsx:1-149`

Move `ToolIcon`, `ToolRow`, `BatchRow`, `ThinkingRow`, and `groupTimeline` out of `V2ProcessView.tsx` into a shared file so `V2RoundBlock` can import them.

- [ ] **Step 1: Create `timeline-helpers.tsx` with all extracted components**

```tsx
// src/ui/view/quick-search/components/timeline-helpers.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, FileText, Search, Brain, FolderOpen, Link } from 'lucide-react';
import type { V2TimelineItem, V2ToolStep } from '../types/search-steps';

/** Get icon for tool type */
export function ToolIcon({ toolName }: { toolName: string }) {
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
            {isRunning ? (
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"
                >
                    <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed]" />
                </motion.div>
            ) : (
                <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-green-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                    <Check className="pktw-w-2.5 pktw-h-2.5 pktw-text-green-600" />
                </div>
            )}
            <div className="pktw-text-[#7c3aed] pktw-shrink-0"><ToolIcon toolName={step.toolName} /></div>
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338] pktw-truncate">
                {step.displayName}
            </span>
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

/** Group consecutive vault_read_note items */
export type GroupedItem =
    | { kind: 'text'; text: string }
    | { kind: 'tool'; step: V2ToolStep }
    | { kind: 'batch'; steps: V2ToolStep[] };

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
```

- [ ] **Step 2: Update `V2ProcessView.tsx` to import from `timeline-helpers.tsx`**

Replace lines 1–149 of `V2ProcessView.tsx` — remove all extracted components/functions, add import:

```tsx
import { ToolRow, BatchRow, ThinkingRow, groupTimeline } from './timeline-helpers';
```

Keep all imports that `V2ProcessView` still needs (`React`, `motion`, `AnimatePresence`, store, icons used only in the main component).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Success, no compilation errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/timeline-helpers.tsx src/ui/view/quick-search/components/V2ProcessView.tsx
git commit -m "refactor: extract timeline rendering helpers from V2ProcessView"
```

---

### Task 2: Create V2RoundBlock Component

**Files:**
- Create: `src/ui/view/quick-search/components/V2RoundBlock.tsx`

A collapsible block that renders a single round (frozen or current). Reuses `ToolRow`, `BatchRow`, `ThinkingRow` from `timeline-helpers.tsx`.

- [ ] **Step 1: Create `V2RoundBlock.tsx`**

```tsx
// src/ui/view/quick-search/components/V2RoundBlock.tsx
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Check, Loader2, Brain, ExternalLink } from 'lucide-react';
import { ToolRow, BatchRow, ThinkingRow, groupTimeline } from './timeline-helpers';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2TimelineItem, V2ToolStep } from '../types/search-steps';
import type { V2Section } from '../store/searchSessionStore';

interface V2RoundBlockProps {
    roundIndex: number;
    query: string;
    steps: V2ToolStep[];
    timeline: V2TimelineItem[];
    sections: V2Section[];
    sources: { length: number };
    proposedOutline: string | null;
    isCurrent: boolean;
    defaultExpanded: boolean;
    /** Render slot for plan review + section progress (only for current round) */
    children?: React.ReactNode;
}

/** Compute duration from first step start to last step end */
function computeDuration(steps: V2ToolStep[]): string {
    if (steps.length === 0) return '';
    const start = steps[0].startedAt;
    const end = steps[steps.length - 1].endedAt;
    if (!start || !end) return '';
    const sec = (end - start) / 1000;
    return sec < 1 ? '<1s' : `${sec.toFixed(0)}s`;
}

export const V2RoundBlock: React.FC<V2RoundBlockProps> = ({
    roundIndex, query, steps, timeline, sections, sources,
    proposedOutline, isCurrent, defaultExpanded, children,
}) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const grouped = useMemo(() => groupTimeline(timeline), [timeline]);
    const duration = computeDuration(steps);

    const handleReportClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        useSearchSessionStore.getState().setV2View('report');
    };

    return (
        <div className={`pktw-mb-2 pktw-rounded-lg pktw-border ${isCurrent ? 'pktw-border-[#7c3aed]/30 pktw-bg-white' : 'pktw-border-[#e5e7eb] pktw-bg-[#fafafa]'}`}>
            {/* Header — always visible */}
            <div
                className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2.5 pktw-cursor-pointer hover:pktw-bg-[#f9fafb] pktw-rounded-t-lg pktw-transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <ChevronRight className={`pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af] pktw-transition-transform pktw-shrink-0 ${expanded ? 'pktw-rotate-90' : ''}`} />
                <span className="pktw-text-[10px] pktw-font-mono pktw-text-[#9ca3af] pktw-shrink-0">#{roundIndex + 1}</span>
                <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338] pktw-truncate pktw-flex-1" title={query}>
                    {query}
                </span>
                {/* Stats */}
                {duration && <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-font-mono pktw-shrink-0">{duration}</span>}
                <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-shrink-0">{sources.length} sources</span>
                {sections.length > 0 && (
                    <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-shrink-0">{sections.length} sections</span>
                )}
                {/* Report link (only for frozen rounds with sections) */}
                {!isCurrent && sections.length > 0 && (
                    <div
                        onClick={handleReportClick}
                        className="pktw-flex pktw-items-center pktw-gap-0.5 pktw-text-[10px] pktw-text-[#7c3aed] hover:pktw-text-[#6d28d9] pktw-shrink-0 pktw-cursor-pointer"
                    >
                        Report <ExternalLink className="pktw-w-2.5 pktw-h-2.5" />
                    </div>
                )}
            </div>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="pktw-overflow-hidden"
                    >
                        <div className="pktw-px-2 pktw-pb-2 pktw-border-t pktw-border-[#f0f0f0]">
                            {/* Timeline items */}
                            {grouped.map((item, i) => (
                                <div key={i}>
                                    {item.kind === 'text' && <ThinkingRow text={item.text} />}
                                    {item.kind === 'tool' && <ToolRow step={item.step} />}
                                    {item.kind === 'batch' && <BatchRow steps={item.steps} />}
                                </div>
                            ))}
                            {/* Children slot: plan review + section progress for current round */}
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success (component not yet used, but should compile)

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2RoundBlock.tsx
git commit -m "feat: add V2RoundBlock collapsible round component"
```

---

### Task 3: Create V2InlinePlanReview Component

**Files:**
- Create: `src/ui/view/quick-search/components/V2InlinePlanReview.tsx`

Extracted from `V2PlanReview.tsx` (lines 103–274), adapted for inline use in Process view with collapse/expand. Reuses `SectionCard`, `MISSION_ROLES`, `VISUAL_TYPE_LABELS` from `V2PlanReview.tsx` (import them, or move the shared constants).

- [ ] **Step 1: Create `V2InlinePlanReview.tsx`**

This component wraps the existing plan review UI with a collapsible header. Before approval it's expanded with the Generate button. After approval it collapses to a compact summary.

```tsx
// src/ui/view/quick-search/components/V2InlinePlanReview.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronUp, ChevronDown, Trash2, Sparkles, FileText, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Section } from '../store/searchSessionStore';

const VISUAL_TYPE_LABELS: Record<string, string> = {
    table: 'Table', quadrantChart: 'Quadrant', flowchart: 'Flowchart',
    timeline: 'Timeline', mindmap: 'Mindmap', none: '',
};

const MISSION_ROLES: Array<{ key: string; label: string; icon: string; color: string; bgColor: string; required: boolean }> = [
    { key: 'synthesis', label: 'Synthesis', icon: '🔬', color: 'pktw-text-emerald-700', bgColor: 'pktw-bg-emerald-50 pktw-border-emerald-200', required: true },
    { key: 'contradictions', label: 'Contradictions', icon: '⚡', color: 'pktw-text-red-700', bgColor: 'pktw-bg-red-50 pktw-border-red-200', required: false },
    { key: 'trade_off', label: 'Trade-off', icon: '⚖️', color: 'pktw-text-amber-700', bgColor: 'pktw-bg-amber-50 pktw-border-amber-200', required: false },
    { key: 'action_plan', label: 'Action Plan', icon: '🎯', color: 'pktw-text-blue-700', bgColor: 'pktw-bg-blue-50 pktw-border-blue-200', required: true },
    { key: 'risk_audit', label: 'Risk Audit', icon: '🛡️', color: 'pktw-text-orange-700', bgColor: 'pktw-bg-orange-50 pktw-border-orange-200', required: false },
    { key: 'roadmap', label: 'Roadmap', icon: '🗺️', color: 'pktw-text-indigo-700', bgColor: 'pktw-bg-indigo-50 pktw-border-indigo-200', required: false },
    { key: 'decomposition', label: 'Decomposition', icon: '🧩', color: 'pktw-text-violet-700', bgColor: 'pktw-bg-violet-50 pktw-border-violet-200', required: false },
    { key: 'blindspots', label: 'Blindspots', icon: '👁️', color: 'pktw-text-pink-700', bgColor: 'pktw-bg-pink-50 pktw-border-pink-200', required: false },
    { key: 'probing_horizon', label: 'Probing Horizon', icon: '🔭', color: 'pktw-text-cyan-700', bgColor: 'pktw-bg-cyan-50 pktw-border-cyan-200', required: false },
];

/** A single section card nested under its role */
const SectionCard: React.FC<{
    sec: V2Section;
    index: number;
    total: number;
    onMove: (id: string, dir: -1 | 1) => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, updater: (s: V2Section) => V2Section) => void;
}> = ({ sec, index, total, onMove, onRemove, onUpdate }) => (
    <div className="pktw-flex pktw-items-start pktw-gap-2 pktw-py-2 pktw-px-3 pktw-bg-white pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-group">
        <div className="pktw-flex pktw-flex-col pktw-gap-0 pktw-shrink-0 pktw-pt-0.5">
            <div onClick={() => onMove(sec.id, -1)} className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${index === 0 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}>
                <ChevronUp className="pktw-w-3 pktw-h-3" />
            </div>
            <div onClick={() => onMove(sec.id, 1)} className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${index === total - 1 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}>
                <ChevronDown className="pktw-w-3 pktw-h-3" />
            </div>
        </div>
        <div className="pktw-flex-1 pktw-min-w-0">
            <span
                className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-block pktw-mb-0.5 pktw-outline-none pktw-rounded pktw-px-0.5 pktw--mx-0.5 focus:pktw-ring-1 focus:pktw-ring-[#7c3aed]/40 focus:pktw-bg-white"
                contentEditable suppressContentEditableWarning
                onBlur={(e) => { const text = (e.target as HTMLSpanElement).textContent?.trim() || sec.title; if (text !== sec.title) onUpdate(sec.id, (s) => ({ ...s, title: text })); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
            >{sec.title}</span>
            <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1">
                {sec.visualType && sec.visualType !== 'none' && (
                    <span className="pktw-px-1.5 pktw-py-0.5 pktw-text-[9px] pktw-font-medium pktw-bg-gray-100 pktw-text-[#6b7280] pktw-rounded">{VISUAL_TYPE_LABELS[sec.visualType] ?? sec.visualType}</span>
                )}
                <span className="pktw-text-[9px] pktw-text-[#9ca3af]">{sec.evidencePaths.length} sources</span>
            </div>
            <span
                className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed pktw-outline-none pktw-rounded pktw-px-0.5 pktw--mx-0.5 focus:pktw-ring-1 focus:pktw-ring-[#7c3aed]/40 focus:pktw-bg-white"
                contentEditable suppressContentEditableWarning
                onBlur={(e) => { const text = (e.target as HTMLSpanElement).textContent?.trim() || sec.brief; if (text !== sec.brief) onUpdate(sec.id, (s) => ({ ...s, brief: text })); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
            >{sec.brief}</span>
        </div>
        <div onClick={() => onRemove(sec.id)} className="pktw-p-1 pktw-rounded pktw-text-[#e5e7eb] group-hover:pktw-text-[#9ca3af] hover:!pktw-text-red-500 pktw-cursor-pointer pktw-transition-colors pktw-shrink-0">
            <Trash2 className="pktw-w-3 pktw-h-3" />
        </div>
    </div>
);

interface V2InlinePlanReviewProps {
    onApprove: () => void;
}

export const V2InlinePlanReview: React.FC<V2InlinePlanReviewProps> = ({ onApprove }) => {
    const sections = useSearchSessionStore((s) => s.v2PlanSections);
    const overview = useSearchSessionStore((s) => s.v2ProposedOutline);
    const planApproved = useSearchSessionStore((s) => s.v2PlanApproved);
    const removePlanSection = useSearchSessionStore((s) => s.removePlanSection);
    const reorderPlanSections = useSearchSessionStore((s) => s.reorderPlanSections);
    const updatePlanSection = useSearchSessionStore((s) => s.updatePlanSection);
    const insights = useSearchSessionStore((s) => s.v2UserInsights);
    const [insightInput, setInsightInput] = useState('');
    const [expanded, setExpanded] = useState(!planApproved);

    const moveSection = useCallback((id: string, direction: -1 | 1) => {
        const ids = sections.map((s) => s.id);
        const idx = ids.indexOf(id);
        if (idx < 0) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= ids.length) return;
        [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
        reorderPlanSections(ids);
    }, [sections, reorderPlanSections]);

    const roleGroups = useMemo(() => {
        const grouped = new Map<string, V2Section[]>();
        for (const sec of sections) {
            const role = sec.missionRole || 'synthesis';
            const list = grouped.get(role) ?? [];
            list.push(sec);
            grouped.set(role, list);
        }
        return grouped;
    }, [sections]);

    const coveredRoles = useMemo(() => new Set(sections.map((s) => s.missionRole)), [sections]);
    const missingRequired = MISSION_ROLES.filter((r) => r.required && !coveredRoles.has(r.key));

    if (!overview && sections.length === 0) return null;

    return (
        <div className="pktw-mt-2 pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-[#f9fafb]">
            {/* Collapsible header */}
            <div
                className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-cursor-pointer hover:pktw-bg-[#f3f4f6] pktw-rounded-t-lg pktw-transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <ChevronRight className={`pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af] pktw-transition-transform ${expanded ? 'pktw-rotate-90' : ''}`} />
                <FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
                <span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338]">Report Outline</span>
                <span className="pktw-text-[10px] pktw-text-[#9ca3af]">{sections.length} sections</span>
                {planApproved && (
                    <div className="pktw-flex pktw-items-center pktw-gap-1 pktw-ml-auto">
                        <Check className="pktw-w-3 pktw-h-3 pktw-text-green-500" />
                        <span className="pktw-text-[10px] pktw-text-green-600">Approved</span>
                    </div>
                )}
            </div>

            {/* Compact section titles (visible when collapsed) */}
            {!expanded && !planApproved && (
                <div className="pktw-px-3 pktw-pb-2 pktw-space-y-0.5">
                    {sections.map((sec) => (
                        <span key={sec.id} className="pktw-block pktw-text-[11px] pktw-text-[#6b7280] pktw-truncate pktw-pl-6">
                            {sec.title}
                        </span>
                    ))}
                </div>
            )}

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="pktw-overflow-hidden"
                    >
                        <div className="pktw-px-3 pktw-pb-3 pktw-border-t pktw-border-[#f0f0f0]">
                            {/* Overview */}
                            {overview && (
                                <div className="pktw-bg-white pktw-rounded-lg pktw-p-3 pktw-border pktw-border-[#e5e7eb] pktw-my-2">
                                    <span className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed">{overview}</span>
                                </div>
                            )}

                            {/* Executive Summary marker */}
                            <div className="pktw-mb-2 pktw-ml-1 pktw-pl-3 pktw-border-l-2 pktw-border-[#7c3aed]/30">
                                <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5">
                                    <Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
                                    <span className="pktw-text-xs pktw-font-semibold pktw-text-[#7c3aed]">Executive Summary</span>
                                    <span className="pktw-text-[9px] pktw-text-[#9ca3af] pktw-italic">auto-generated</span>
                                </div>
                            </div>

                            {/* Role groups */}
                            {MISSION_ROLES.map((role) => {
                                const roleSections = roleGroups.get(role.key) ?? [];
                                if (roleSections.length === 0) return null;
                                return (
                                    <div key={role.key} className="pktw-mb-2 pktw-ml-1">
                                        <div className={`pktw-pl-3 pktw-border-l-2 ${role.bgColor.split(' ')[1] ?? 'pktw-border-gray-200'}`}>
                                            <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-py-1">
                                                <span className="pktw-text-sm">{role.icon}</span>
                                                <span className={`pktw-text-xs pktw-font-semibold ${role.color}`}>{role.label}</span>
                                                {role.required && <span className="pktw-text-[8px] pktw-text-[#9ca3af] pktw-uppercase">required</span>}
                                            </div>
                                            <div className="pktw-space-y-1.5 pktw-pb-2">
                                                {roleSections.map((sec) => (
                                                    <SectionCard
                                                        key={sec.id} sec={sec}
                                                        index={sections.indexOf(sec)} total={sections.length}
                                                        onMove={moveSection} onRemove={removePlanSection} onUpdate={updatePlanSection}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Missing roles warning */}
                            {missingRequired.length > 0 && (
                                <div className="pktw-ml-1 pktw-pl-3 pktw-border-l-2 pktw-border-red-200 pktw-py-2">
                                    <div className="pktw-flex pktw-items-center pktw-gap-1.5">
                                        <AlertTriangle className="pktw-w-3.5 pktw-h-3.5 pktw-text-red-400" />
                                        <span className="pktw-text-[10px] pktw-text-red-500">Missing: {missingRequired.map((r) => r.label).join(', ')}</span>
                                    </div>
                                </div>
                            )}

                            {/* Generate button (only before approval) */}
                            {!planApproved && (
                                <div className="pktw-mt-3 pktw-pt-3 pktw-border-t pktw-border-[#e5e7eb]">
                                    {insights.length > 0 && (
                                        <div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mb-2">
                                            {insights.map((insight, i) => (
                                                <span key={i} className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2.5 pktw-py-1 pktw-text-xs pktw-bg-[#f5f3ff] pktw-text-[#7c3aed] pktw-rounded-full pktw-border pktw-border-[#7c3aed]/20">
                                                    {insight}
                                                    <span onClick={() => useSearchSessionStore.getState().removeUserInsight(i)} className="pktw-cursor-pointer pktw-text-[#7c3aed]/50 hover:pktw-text-[#7c3aed] pktw-ml-0.5">&times;</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <input
                                        type="text" value={insightInput}
                                        onChange={(e) => setInsightInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && insightInput.trim()) { useSearchSessionStore.getState().addUserInsight(insightInput.trim()); setInsightInput(''); } }}
                                        placeholder="Add insight (Enter to add)..."
                                        className="pktw-w-full pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/50 pktw-mb-2"
                                    />
                                    <Button onClick={onApprove} className="pktw-w-full pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-text-white pktw-font-medium">
                                        <Sparkles className="pktw-w-4 pktw-h-4 pktw-mr-2" />
                                        Generate Report ({sections.length} sections)
                                    </Button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2InlinePlanReview.tsx
git commit -m "feat: add V2InlinePlanReview inline collapsible plan component"
```

---

### Task 4: Rewrite V2ProcessView

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ProcessView.tsx`

Replace the entire component to render `rounds[]` as collapsed `V2RoundBlock` + current round as expanded `V2RoundBlock` with inline plan and section progress.

- [ ] **Step 1: Rewrite `V2ProcessView.tsx`**

Replace the entire file content (after the extraction in Task 1, it should already have `timeline-helpers` imported and the extracted components removed). The new version:

```tsx
// src/ui/view/quick-search/components/V2ProcessView.tsx
import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Brain, Check } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { ToolRow, groupTimeline } from './timeline-helpers';
import { V2RoundBlock } from './V2RoundBlock';
import { V2InlinePlanReview } from './V2InlinePlanReview';

interface V2ProcessViewProps {
    onApprove?: () => void;
}

export const V2ProcessView: React.FC<V2ProcessViewProps> = ({ onApprove }) => {
    const rounds = useSearchSessionStore((s) => s.rounds);
    const timeline = useSearchSessionStore((s) => s.v2Timeline);
    const v2Steps = useSearchSessionStore((s) => s.v2Steps);
    const sections = useSearchSessionStore((s) => s.v2PlanSections);
    const query = useSearchSessionStore((s) => s.query);
    const status = useSearchSessionStore((s) => s.status);
    const sources = useSearchSessionStore((s) => s.v2Sources);
    const proposedOutline = useSearchSessionStore((s) => s.v2ProposedOutline);
    const planApproved = useSearchSessionStore((s) => s.v2PlanApproved);
    const isStreaming = status === 'streaming';
    const isCompleted = status === 'completed';
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isStreaming && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [timeline, isStreaming]);

    // Detect "generating report" phase
    const grouped = groupTimeline(timeline);
    const hasTools = v2Steps.length > 0;
    const noRunningTools = v2Steps.every((s) => s.status !== 'running');
    const lastIsText = grouped.length > 0 && grouped[grouped.length - 1].kind === 'text';
    const isGeneratingReport = isStreaming && hasTools && noRunningTools && lastIsText;

    const showInitialThinking = isStreaming && grouped.length === 0;

    return (
        <div ref={scrollRef} className="pktw-py-2 pktw-px-1">
            {/* Frozen rounds (collapsed by default) */}
            {rounds.map((round) => (
                <V2RoundBlock
                    key={round.index}
                    roundIndex={round.index}
                    query={round.query}
                    steps={round.steps}
                    timeline={round.timeline}
                    sections={round.sections}
                    sources={round.sources}
                    proposedOutline={round.proposedOutline}
                    isCurrent={false}
                    defaultExpanded={false}
                />
            ))}

            {/* Current round (expanded) */}
            <V2RoundBlock
                roundIndex={rounds.length}
                query={query}
                steps={v2Steps}
                timeline={timeline}
                sections={sections}
                sources={sources}
                proposedOutline={proposedOutline}
                isCurrent={true}
                defaultExpanded={true}
            >
                {/* Initial thinking indicator */}
                {showInitialThinking && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                            <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed]" />
                        </motion.div>
                        <span className="pktw-text-xs pktw-text-[#9ca3af]">Analyzing query...</span>
                    </motion.div>
                )}

                {/* Generating report indicator */}
                {isGeneratingReport && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1 pktw-mt-1">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                            <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed]" />
                        </motion.div>
                        <Brain className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
                        <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">Generating report...</span>
                        <span className="pktw-flex-1" />
                        <div className="pktw-w-24 pktw-h-1 pktw-bg-gray-200 pktw-rounded-full pktw-overflow-hidden">
                            <motion.div className="pktw-h-full pktw-bg-[#7c3aed]" initial={{ width: '0%' }} animate={{ width: '85%' }} transition={{ duration: 8, ease: 'easeInOut' }} />
                        </div>
                    </motion.div>
                )}

                {/* Inline plan review (after evidence plan, before/during section generation) */}
                {sections.length > 0 && onApprove && (
                    <V2InlinePlanReview onApprove={onApprove} />
                )}

                {/* Section generation progress (after plan approval) */}
                {sections.length > 0 && status !== 'plan_ready' && planApproved && (
                    <div className="pktw-mt-3 pktw-space-y-1">
                        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-1 pktw-mb-2">
                            <Brain className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
                            <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">
                                Generating sections ({sections.filter((s) => s.status === 'done').length}/{sections.length})
                            </span>
                        </div>
                        {sections.map((sec) => (
                            <div key={sec.id} className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-0.5 pktw-px-1">
                                {sec.status === 'done' ? (
                                    <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-green-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                                        <Check className="pktw-w-2.5 pktw-h-2.5 pktw-text-green-600" />
                                    </div>
                                ) : sec.status === 'generating' ? (
                                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                                        <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed]" />
                                    </motion.div>
                                ) : (
                                    <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-gray-100 pktw-shrink-0" />
                                )}
                                <span className="pktw-text-xs pktw-text-[#6b7280] pktw-truncate">{sec.title}</span>
                            </div>
                        ))}
                    </div>
                )}
            </V2RoundBlock>
        </div>
    );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2ProcessView.tsx
git commit -m "feat: rewrite V2ProcessView with collapsible round blocks"
```

---

### Task 5: Remove Plan Review Gate from V2ReportView

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx:1-10,276-278`

Remove the conditional that renders `V2PlanReview` when plan is not approved. Report view now always shows report content.

- [ ] **Step 1: Remove V2PlanReview import and gate**

In `V2ReportView.tsx`, remove the import of `V2PlanReview`:

```tsx
// REMOVE this line:
import { V2PlanReview } from './V2PlanReview';
```

Remove lines 276-278 (the plan review gate):

```tsx
// REMOVE this block:
if (sections.length > 0 && !planApproved) {
    return <V2PlanReview onApprove={onApprove ?? (() => {})} />;
}
```

Replace with an empty-state message when no content exists yet:

```tsx
// After the planApproved read (line 263), replace the removed gate with:
if (sections.length > 0 && !planApproved) {
    return (
        <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-32 pktw-text-sm pktw-text-[#9ca3af]">
            Report will appear here after plan approval in Process view.
        </div>
    );
}
```

Also, the `onApprove` prop in `V2ReportViewProps` can stay (it's passed from parent) — it just won't be used in this view anymore. No need to change the interface to avoid breaking parent code.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2ReportView.tsx
git commit -m "refactor: remove plan review gate from V2ReportView"
```

---

### Task 6: Wire onApprove to V2ProcessView

**Files:**
- Modify: `src/ui/view/quick-search/components/V2SearchResultView.tsx:55`

Pass `onApprove` to `V2ProcessView` so the inline plan review can trigger report generation.

- [ ] **Step 1: Update V2SearchResultView to pass onApprove to V2ProcessView**

In `V2SearchResultView.tsx`, change line 55:

```tsx
// BEFORE:
{activeView === 'process' && <V2ProcessView key="process" />}

// AFTER:
{activeView === 'process' && <V2ProcessView key="process" onApprove={onApprove} />}
```

- [ ] **Step 2: Remove auto-switch to report view on plan ready**

In `V2SearchResultView.tsx`, remove lines 43-47 (the `useEffect` that auto-switches to report view when plan sections arrive and plan is not approved). With plan review now in Process view, we don't want to auto-switch away:

```tsx
// REMOVE this entire useEffect:
useEffect(() => {
    if (isCompleted && hasPlanSections && !planApproved) {
        useSearchSessionStore.getState().setV2View('report');
    }
}, [isCompleted, hasPlanSections, planApproved]);
```

The `hasPlanSections` and `planApproved` state reads can also be removed if they're not used elsewhere in the component.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/V2SearchResultView.tsx
git commit -m "feat: wire onApprove to V2ProcessView, remove auto-switch to report"
```

---

### Task 7: Build, Manual Test, Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: Success, clean build with no errors

- [ ] **Step 2: Manual test checklist**

Test in Obsidian with DevTools open:

1. Fresh AI Analysis query → Process view shows Round #1 expanded with timeline
2. Plan appears inline as collapsible "Report Outline" node after evidence plan
3. Click "Generate Report" in inline plan → sections generate with per-section status
4. After completion, section nav pills visible across all tabs
5. Click Continue → Round #1 collapses, Round #2 appears expanded
6. Round #1 header shows query, duration, source/section counts
7. Click Round #1 header → expands to show its full timeline
8. Report tab shows report content (not plan review)
9. Click "Report →" link on a frozen round → switches to Report view

- [ ] **Step 3: Delete V2PlanReview.tsx (if V1 no longer references it)**

Check if `V2PlanReview` is imported anywhere other than `V2ReportView.tsx`. If not, delete it:

```bash
git rm src/ui/view/quick-search/components/V2PlanReview.tsx
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Continue Analysis & Process View redesign"
```
