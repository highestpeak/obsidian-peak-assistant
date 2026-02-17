import { SummaryContent } from "../ai-analysis-sections/SummarySection";
import { IntelligenceFrame } from "../../../../component/mine/IntelligenceFrame";
import { useAIAnalysisStore } from "../../store/aiAnalysisStore";
import { useGraphAnimationStore } from "../../store";
import { StreamingStepsDisplay } from "../ai-analysis-sections/StepsDisplay";
import React from "react";
import { KnowledgeGraphSection } from "../ai-analysis-sections/KnowledgeGraphSection";
import { IncrementalContent } from "../IncrementalContent";
import { DashboardBlocksSection } from "../ai-analysis-sections/DashboardBlocksSection";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";

export const StreamingAnalysis: React.FC<{
	onClose?: () => void;
	stepsRef?: React.RefObject<HTMLDivElement | null>;
}> = ({ onClose, stepsRef }) => {
	const {
		isAnalyzing,
		isSummaryStreaming,
		hasStartedStreaming,
		steps,
		currentStep,
		stepTrigger,
		analysisStartedAtMs,
		analysisCompleted,
		duration,
		dashboardBlocks,
		topics,
		sources,
		getHasGraphData,
		runAnalysisMode,
	} = useAIAnalysisStore();
	const { queue, mode } = useGraphAnimationStore();

	const isSimpleMode = runAnalysisMode === 'simple';
	const showGraphPanel = !isSimpleMode && (getHasGraphData() || queue.length > 0 || mode !== 'idle');

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-h-full">
			{/* Frame should only wrap: Summary + Steps */}
			<IntelligenceFrame
				isActive={isAnalyzing || isSummaryStreaming || hasStartedStreaming}
				className="pktw-mb-1"
			>
				<div className="pktw-flex pktw-flex-col pktw-gap-4">
					{isSummaryStreaming ? (
						<SummaryContent
							startedAtMs={analysisStartedAtMs}
							finalDurationMs={analysisCompleted ? duration : null}
							onOpenWikilink={onClose ? createOpenSourceCallback(onClose) : undefined}
						/>
					) : null}
					<div ref={stepsRef} className="pktw-scroll-mt-24">
						<StreamingStepsDisplay
							steps={steps}
							currentStep={currentStep}
							stepTrigger={stepTrigger}
							startedAtMs={analysisStartedAtMs}
							isRunning={isAnalyzing && !analysisCompleted}
							finalDurationMs={analysisCompleted ? duration : null}
						/>
					</div>
				</div>
			</IntelligenceFrame>

			{/* Other areas should NOT be inside the frame */}
			<div className={`pktw-flex pktw-gap-4 pktw-flex-1 pktw-min-h-0 ${showGraphPanel ? '' : ''}`}>
				{/* Left Panel */}
				<div className={`pktw-flex pktw-flex-col pktw-gap-4 pktw-min-h-0 ${showGraphPanel ? 'pktw-w-[40%]' : 'pktw-flex-1'}`}>
					<div className="pktw-flex-1 pktw-overflow-y-auto">
						<IncrementalContent
							dashboardBlocks={dashboardBlocks ?? []}
							topics={topics}
							sources={sources}
						/>
						{(dashboardBlocks?.length ?? 0) > 0 ? (
							<div className="pktw-mt-4">
								<DashboardBlocksSection blocks={dashboardBlocks ?? []} isStreaming={!analysisCompleted} />
							</div>
						) : null}
					</div>
				</div>

				{/* Right Panel: Only show when graph tools are used or graph has data (non-simple mode) */}
				{showGraphPanel ? (
					<div className="pktw-w-[60%] pktw-flex pktw-flex-col pktw-gap-4 pktw-max-h-96">
						<div className="pktw-flex-1">
							<KnowledgeGraphSection onClose={onClose} />
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
};