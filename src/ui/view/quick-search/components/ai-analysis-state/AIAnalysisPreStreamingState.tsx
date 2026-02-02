import { AnalysisTimer } from "../../../../component/mine/IntelligenceFrame";
import React, { useCallback } from "react";
import { AnimatedSparkles } from "@/ui/component/mine";
import { useAIAnalysisStore } from "../../store";

/**
 * Combined state component for AI search - shows loading or ready state
 */
export const AIAnalysisPreStreamingState: React.FC = () => {
    const {
        isAnalyzing,
        analysisCompleted,
        isSummaryStreaming,
        analysisStartedAtMs,
    } = useAIAnalysisStore();

    const checkIfAnalyzing = useCallback(() => {
        return isAnalyzing && !analysisCompleted;
    }, [isAnalyzing, analysisCompleted]);

    return (
        <div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
            <div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
                <AnimatedSparkles isAnimating={checkIfAnalyzing() || isSummaryStreaming} />
            </div>
            <span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2">
                {checkIfAnalyzing() || isSummaryStreaming ? 'Analyzing...' : 'Ready to Analyze with AI'}
            </span>
            {analysisStartedAtMs && (checkIfAnalyzing() || isSummaryStreaming) ? (
                <div className="pktw-mb-2">
                    <AnalysisTimer startedAtMs={analysisStartedAtMs} isRunning={true} />
                </div>
            ) : null}
            <span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4 pktw-max-w-md">
                {checkIfAnalyzing() || isSummaryStreaming
                    ? 'AI is processing your query and searching through your vault...'
                    : ''
                }
            </span>
        </div>
    )
};