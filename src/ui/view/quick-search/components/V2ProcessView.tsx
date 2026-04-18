import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Brain } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { V2RoundBlock } from './V2RoundBlock';
import { V2InlinePlanReview } from './V2InlinePlanReview';

export const V2ProcessView: React.FC<{ onApprove?: () => void }> = ({ onApprove }) => {
    const rounds = useSearchSessionStore((s) => s.rounds);
    const timeline = useSearchSessionStore((s) => s.v2Timeline);
    const v2Steps = useSearchSessionStore((s) => s.v2Steps);
    const sections = useSearchSessionStore((s) => s.v2PlanSections);
    const query = useSearchSessionStore((s) => s.query);
    const status = useSearchSessionStore((s) => s.status);
    const sources = useSearchSessionStore((s) => s.v2Sources);
    const proposedOutline = useSearchSessionStore((s) => s.v2ProposedOutline);
    const planApproved = useSearchSessionStore((s) => s.v2PlanApproved);
    const usage = useSearchSessionStore((s) => s.usage);
    const duration = useSearchSessionStore((s) => s.duration);
    const restoredFromHistory = useSearchSessionStore((s) => s.restoredFromHistory);

    const isStreaming = status === 'streaming';
    const isRestoredEmpty = restoredFromHistory && v2Steps.length === 0 && timeline.length === 0 && rounds.length === 0;
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when streaming
    useEffect(() => {
        if (isStreaming && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [timeline, isStreaming]);

    // Detect states for current round indicators
    const hasTools = v2Steps.length > 0;
    const noRunningTools = v2Steps.every((s) => s.status !== 'running');
    const showInitialThinking = isStreaming && v2Steps.length === 0 && timeline.length === 0;

    // Generating report: tools exist, none running, last grouped item is text
    const lastTimelineItem = timeline.length > 0 ? timeline[timeline.length - 1] : null;
    const isGeneratingReport = isStreaming && hasTools && noRunningTools && lastTimelineItem?.kind === 'text';

    const currentRoundIndex = rounds.length;

    if (isRestoredEmpty) {
        return (
            <div className="pktw-flex pktw-items-center pktw-justify-center pktw-py-12 pktw-text-sm pktw-text-[#9ca3af]">
                Process log not available for this analysis
            </div>
        );
    }

    return (
        <div ref={scrollRef} className="pktw-py-2 pktw-px-1">
            {/* Frozen rounds */}
            {rounds.map((round) => (
                <V2RoundBlock
                    key={round.index}
                    roundIndex={round.index}
                    query={round.query}
                    steps={round.steps}
                    timeline={round.timeline}
                    sections={round.sections}
                    sources={{ length: round.sources.length }}
                    proposedOutline={round.proposedOutline}
                    usage={round.usage}
                    duration={round.duration}
                    isCurrent={false}
                    defaultExpanded={false}
                />
            ))}

            {/* Current round */}
            <V2RoundBlock
                roundIndex={currentRoundIndex}
                query={query}
                steps={v2Steps}
                timeline={timeline}
                sections={sections}
                sources={{ length: sources.length }}
                proposedOutline={proposedOutline}
                usage={usage}
                duration={duration}
                isCurrent={true}
                defaultExpanded={true}
            >
                {/* Initial thinking indicator */}
                {showInitialThinking && (
                    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1">
                        <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                            <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed] pktw-animate-spin" />
                        </div>
                        <span className="pktw-text-xs pktw-text-[#9ca3af]">Analyzing query...</span>
                    </div>
                )}

                {/* Generating report indicator */}
                {isGeneratingReport && (
                    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1 pktw-mt-1">
                        <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                            <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed] pktw-animate-spin" />
                        </div>
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
                    </div>
                )}

                {/* Inline plan review */}
                {sections.length > 0 && onApprove && (
                    <V2InlinePlanReview onApprove={onApprove} />
                )}

                {/* Section generation progress */}
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
                                    <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                                        <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed] pktw-animate-spin" />
                                    </div>
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
