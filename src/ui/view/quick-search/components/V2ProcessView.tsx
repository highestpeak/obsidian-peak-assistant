import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Brain, GitBranch, Sparkles } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { ToolRow, BatchRow, ThinkingRow, groupTimeline } from './timeline-helpers';

/** Report Evolution timeline — shows completed analysis summary */
const ReportEvolution: React.FC = () => {
    const outline = useSearchSessionStore((s) => s.v2ProposedOutline);
    const sources = useSearchSessionStore((s) => s.v2Sources);
    const duration = useSearchSessionStore((s) => s.duration);
    const usage = useSearchSessionStore((s) => s.usage);
    const isCompleted = useSearchSessionStore((s) => s.status === 'completed');

    if (!isCompleted || !outline) return null;

    // Derive stats from report
    const wordCount = outline.split(/\s+/).length;
    const sectionCount = (outline.match(/^##\s/gm) ?? []).length;
    const durationStr = duration ? `${(duration / 1000).toFixed(0)}s` : '';
    const tokenStr = usage ? `${((usage.inputTokens + usage.outputTokens) / 1000).toFixed(1)}k tokens` : '';

    return (
        <div className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-xl pktw-p-4 pktw-mb-3 pktw-cursor-pointer hover:pktw-border-[#7c3aed]/30 pktw-transition-all" onClick={() => useSearchSessionStore.getState().setV2View('report')}>
            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-4">
                <GitBranch className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
                <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Report Evolution</span>
            </div>

            <div className="pktw-relative">
                {/* Timeline line */}
                <div className="pktw-absolute pktw-left-5 pktw-top-0 pktw-bottom-0 pktw-w-0.5 pktw-bg-gray-200" />

                {/* Current report entry */}
                <div className="pktw-relative pktw-flex pktw-gap-3">
                    <div className="pktw-flex-none pktw-w-10 pktw-h-10 pktw-rounded-full pktw-bg-gradient-to-br pktw-from-[#7c3aed] pktw-to-[#6d28d9] pktw-border-4 pktw-border-white pktw-flex pktw-items-center pktw-justify-center pktw-relative pktw-z-10 pktw-shadow-md">
                        <Sparkles className="pktw-w-4 pktw-h-4 pktw-text-white" />
                    </div>
                    <div className="pktw-flex-1 pktw-pt-1.5">
                        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
                            <span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338]">Final Report</span>
                            <span className="pktw-px-2 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-bg-green-100 pktw-text-green-700 pktw-rounded-full">Current</span>
                            {durationStr && <span className="pktw-text-xs pktw-text-[#9ca3af] pktw-tabular-nums">{durationStr}</span>}
                        </div>
                        <span className="pktw-text-xs pktw-text-[#6b7280] pktw-block pktw-mb-1">
                            Comprehensive synthesis with {sources.length} sources analyzed.
                        </span>
                        <span className="pktw-text-xs pktw-text-[#9ca3af]">
                            {sectionCount} sections · {wordCount.toLocaleString()} words{tokenStr ? ` · ${tokenStr}` : ''}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const V2ProcessView: React.FC = () => {
    const timeline = useSearchSessionStore((s) => s.v2Timeline);
    const v2Steps = useSearchSessionStore((s) => s.v2Steps);
    const isStreaming = useSearchSessionStore((s) => s.status === 'streaming');
    const isCompleted = useSearchSessionStore((s) => s.status === 'completed');
    const sections = useSearchSessionStore((s) => s.v2PlanSections);
    const status = useSearchSessionStore((s) => s.status);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isStreaming && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [timeline, isStreaming]);

    const grouped = timeline.length > 0 ? groupTimeline(timeline) : [];

    // Detect "generating report" phase: tools exist, none running, last item is text
    const hasTools = v2Steps.length > 0;
    const noRunningTools = v2Steps.every((s) => s.status !== 'running');
    const lastIsText = grouped.length > 0 && grouped[grouped.length - 1].kind === 'text';
    const isGeneratingReport = isStreaming && hasTools && noRunningTools && lastIsText;

    // Show initial thinking indicator when streaming but no tool actions yet
    const showInitialThinking = isStreaming && grouped.length === 0;

    return (
        <div ref={scrollRef} className="pktw-py-2 pktw-px-1">
            {/* Report Evolution — shown after completion */}
            {isCompleted && <ReportEvolution />}

            {showInitialThinking && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1"
                >
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"
                    >
                        <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed]" />
                    </motion.div>
                    <span className="pktw-text-xs pktw-text-[#9ca3af]">Analyzing query...</span>
                </motion.div>
            )}
            <AnimatePresence initial={false}>
                {grouped.map((item, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.3) }}
                    >
                        {item.kind === 'text' && <ThinkingRow text={item.text} />}
                        {item.kind === 'tool' && <ToolRow step={item.step} />}
                        {item.kind === 'batch' && <BatchRow steps={item.steps} />}
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Generating report indicator */}
            {isGeneratingReport && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1 pktw-mt-1"
                >
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"
                    >
                        <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed]" />
                    </motion.div>
                    <Brain className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
                    <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">Generating report...</span>
                    <span className="pktw-flex-1" />
                    <div className="pktw-w-24 pktw-h-1 pktw-bg-gray-200 pktw-rounded-full pktw-overflow-hidden">
                        <motion.div
                            className="pktw-h-full pktw-bg-[#7c3aed]"
                            initial={{ width: '0%' }}
                            animate={{ width: '85%' }}
                            transition={{ duration: 8, ease: 'easeInOut' }}
                        />
                    </div>
                </motion.div>
            )}

            {/* Section generation progress */}
            {sections.length > 0 && status !== 'plan_ready' && (
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
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                    className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"
                                >
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

            {/* Continue analysis moved to floating V2ContinueAnalysisInput (footer button) */}
        </div>
    );
};
