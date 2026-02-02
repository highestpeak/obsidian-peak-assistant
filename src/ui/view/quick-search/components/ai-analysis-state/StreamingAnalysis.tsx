import { StreamingDisplayMethods } from "../ai-analysis-sections/StepsDisplay";
import { SummaryContent } from "../ai-analysis-sections/SummarySection";
import { IntelligenceFrame } from "../../../../component/mine/IntelligenceFrame";
import { useAIAnalysisStore } from "../../store/aiAnalysisStore";
import { StreamingStepsDisplay } from "../ai-analysis-sections/StepsDisplay";
import React from "react";
import { KnowledgeGraphSection } from "../ai-analysis-sections/KnowledgeGraphSection";
import { IncrementalContent } from "../IncrementalContent";
import { DashboardBlocksSection } from "../ai-analysis-sections/DashboardBlocksSection";
import { cn } from "@/ui/react/lib/utils";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";

export const StreamingAnalysis: React.FC<{
	onClose?: () => void,
	setStreamingDisplayMethods: (methods: StreamingDisplayMethods) => void
}> = ({ onClose, setStreamingDisplayMethods }) => {
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
	} = useAIAnalysisStore();

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
					<StreamingStepsDisplay
						steps={steps}
						currentStep={currentStep}
						stepTrigger={stepTrigger}
						registerCurrentStepRender={setStreamingDisplayMethods}
						startedAtMs={analysisStartedAtMs}
						isRunning={isAnalyzing && !analysisCompleted}
						finalDurationMs={analysisCompleted ? duration : null}
					/>
				</div>
			</IntelligenceFrame>

			{/* Other areas should NOT be inside the frame */}
			<div className="pktw-flex pktw-gap-4 pktw-flex-1 pktw-min-h-0">
				{/* Left Panel */}
				<div className={cn(
					"pktw-flex pktw-flex-col pktw-gap-4 pktw-min-h-0",
					!getHasGraphData() ? "pktw-w-[100%]" : "pktw-w-[40%]"
				)}>
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

				{/* Right Panel */}
				{getHasGraphData() ? (
					<div className="pktw-w-[60%] pktw-flex pktw-flex-col pktw-gap-4 pktw-max-h-96">
						<div className="pktw-flex-1">
							<KnowledgeGraphSection
								// While streaming, keep Concepts/Tags below the graph.
								// After completion (CompletedAnalysis view), the side panel is shown on the right.
								onClose={onClose}
							/>
						</div>

					</div>
				) : null}
			</div>
		</div>
	);
};