import React, { useRef, useEffect } from 'react';
import { Loader2, Brain, Bug } from 'lucide-react';
import { useDebugTraceCopy } from '@/ui/hooks/useDebugTraceCopy';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { V2RoundBlock } from './V2RoundBlock';
import { V2InlinePlanReview } from './V2InlinePlanReview';
import { V2ActivitySummary } from './V2ActivitySummary';

const ActivityDebugTraceButton: React.FC = () => {
    const { debugTracePort } = useServiceContext();
    const copyDebugTrace = useDebugTraceCopy();
    if (!debugTracePort?.isEnabled()) return null;
    return (
        <div className="pktw-flex pktw-justify-end pktw-px-1 pktw-pb-1">
            <Button
                variant="ghost"
                size="sm"
                geometry="toolbar"
                className="pktw-gap-1.5 pktw-text-xs pktw-text-pk-foreground-faint"
                title="Copy analyze activity debug trace"
                aria-label="Copy analyze activity debug trace"
                onClick={() => {
                    const recent = debugTracePort.listRecent(5);
                    const analyzeRun = recent.find((run) => run.surface === 'analyze');
                    void copyDebugTrace(analyzeRun?.runId);
                }}
            >
                <Bug className="pktw-w-4 pktw-h-4" />
                Copy activity trace
            </Button>
        </div>
    );
};

export const V2ProcessView: React.FC<{ onApprove?: () => void }> = ({ onApprove }) => {
    const rounds = useSearchSessionStore((s) => s.rounds);
    const timeline = useSearchSessionStore((s) => s.v2Timeline);
    const v2Steps = useSearchSessionStore((s) => s.v2Steps);
    const sections = useSearchSessionStore((s) => s.v2PlanSections);
    const query = useSearchSessionStore((s) => s.query);
    const status = useSearchSessionStore((s) => s.status);
    const sources = useSearchSessionStore((s) => s.v2Sources);
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

    const isWaitingForPlan = isStreaming && hasTools && noRunningTools && sections.length === 0;

    const currentRoundIndex = rounds.length;

    if (isRestoredEmpty) {
        return (
            <div className="pktw-flex pktw-items-center pktw-justify-center pktw-py-12 pktw-text-sm pktw-text-pk-foreground-muted">
                Process log not available for this analysis
            </div>
        );
    }

    return (
        <div ref={scrollRef} className="pktw-py-2 pktw-px-1">
            <ActivityDebugTraceButton />
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
                usage={usage}
                duration={duration}
                isCurrent={true}
                defaultExpanded={true}
            >
                <V2ActivitySummary
                    steps={v2Steps}
                    sections={sections}
                    sources={sources}
                    duration={duration}
                    running={isStreaming}
                />

                {/* Initial thinking indicator */}
                {showInitialThinking && (
                    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1">
                        <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-pk-accent-tint pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                            <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-pk-accent pktw-animate-spin" />
                        </div>
                        <span className="pktw-text-xs pktw-text-pk-foreground-muted">Analyzing query...</span>
                    </div>
                )}

                {/* Waiting for plan/report (tools done, text not started yet) */}
                {isWaitingForPlan && (
                    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1 pktw-mt-1">
                        <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-pk-accent-tint pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                            <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-pk-accent pktw-animate-spin" />
                        </div>
                        <Brain className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />
                        <span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-primary">Preparing analysis plan...</span>
                    </div>
                )}

                {/* Inline plan review */}
                {sections.length > 0 && onApprove && (
                    <V2InlinePlanReview onApprove={onApprove} />
                )}
            </V2RoundBlock>
        </div>
    );
};
