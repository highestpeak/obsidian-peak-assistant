import { AnalysisTimer } from "../../../../component/mine/IntelligenceFrame";
import React, { useCallback } from "react";
import { AnimatedSparkles } from "@/ui/component/mine";
import { useSearchSessionStore } from "../../store/searchSessionStore";
import { PRESET_LABELS } from "../../SearchModal";

export const AIAnalysisPreStreamingState: React.FC = () => {
    const isAnalyzing = useSearchSessionStore((s) => s.status === 'starting' || s.status === 'streaming');
    const analysisCompleted = useSearchSessionStore((s) => s.status === 'completed');
    const analysisStartedAtMs = useSearchSessionStore((s) => s.startedAt);
    const analysisMode = useSearchSessionStore((s) => s.analysisMode);
    const isSummaryStreaming = useSearchSessionStore((s) => s.v2SummaryStreaming);

    const checkIfAnalyzing = useCallback(() => {
        return isAnalyzing && !analysisCompleted;
    }, [isAnalyzing, analysisCompleted]);

    // Idle state is now handled by the landing page in AITabContent
    if (!checkIfAnalyzing() && !isSummaryStreaming) return null;

    return (
        <div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
            <div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
                <AnimatedSparkles isAnimating={checkIfAnalyzing() || isSummaryStreaming} />
            </div>
            <span className="pktw-font-semibold pktw-text-pk-text-primary pktw-mb-2">
                {checkIfAnalyzing() || isSummaryStreaming ? 'Analyzing...' : 'Ready to Analyze with AI'}
            </span>
            {!(checkIfAnalyzing() || isSummaryStreaming) && analysisMode ? (
                <span className="pktw-text-pk-foreground-muted pktw-font-semibold pktw-mb-1">
                    {PRESET_LABELS[analysisMode].full}
                </span>
            ) : null}
            {analysisStartedAtMs && (checkIfAnalyzing() || isSummaryStreaming) ? (
                <div className="pktw-mb-2">
                    <AnalysisTimer startedAtMs={analysisStartedAtMs} isRunning={true} />
                </div>
            ) : null}
            <span className="pktw-text-sm pktw-text-pk-text-secondary pktw-mb-4 pktw-max-w-md">
                {checkIfAnalyzing() || isSummaryStreaming
                    ? 'AI is processing your query and searching through your vault...'
                    : ''
                }
            </span>
        </div>
    )
};