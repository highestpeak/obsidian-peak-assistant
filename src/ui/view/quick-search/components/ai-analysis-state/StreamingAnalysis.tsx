import { SummaryContent } from "../ai-analysis-sections/SummarySection";
import { IntelligenceFrame } from "../../../../component/mine/IntelligenceFrame";
import { useAIAnalysisStore } from "../../store/aiAnalysisStore";
import { useGraphAnimationStore } from "../../store";
import { StreamingStepsDisplay } from "../ai-analysis-sections/StepsDisplay";
import React from "react";
import { KnowledgeGraphSection } from "../ai-analysis-sections/KnowledgeGraphSection";
import { IncrementalContent } from "../IncrementalContent";
import { DashboardBlocksSection } from "../ai-analysis-sections/DashboardBlocksSection";
import { TopSourcesSection } from "../ai-analysis-sections/SourcesSection";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";
import { convertSourcesToSearchResultItems } from "../../hooks/useAIAnalysisResult";

export type StreamingAnalysisSectionRefs = {
	summaryRef?: React.RefObject<HTMLDivElement>;
	topicsRef?: React.RefObject<HTMLDivElement>;
	dashboardBlocksRef?: React.RefObject<HTMLDivElement>;
	graphSectionRef?: React.RefObject<HTMLDivElement>;
	sourcesRef?: React.RefObject<HTMLDivElement>;
};

export const StreamingAnalysis: React.FC<{
	onClose?: () => void;
	stepsRef?: React.RefObject<HTMLDivElement>;
	sectionRefs?: StreamingAnalysisSectionRefs;
}> = ({ onClose, stepsRef, sectionRefs }) => {
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

	const isSimpleMode = runAnalysisMode === 'docSimple' || runAnalysisMode === 'vaultSimple';
	const showGraphPanel = !isSimpleMode && (getHasGraphData() || queue.length > 0 || mode !== 'idle');

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-h-full">
			{/* Frame should only wrap: Summary + Steps */}
			<IntelligenceFrame
				isActive={isAnalyzing || isSummaryStreaming || hasStartedStreaming}
				className="pktw-mb-1"
			>
				<div className="pktw-flex pktw-flex-col pktw-gap-4">
					{/* Show summary for: normal summary streaming OR docSimple (thought agent text streams into summary) */}
					{isSummaryStreaming ? (
						<div ref={sectionRefs?.summaryRef} className="pktw-scroll-mt-4">
							<SummaryContent
								startedAtMs={analysisStartedAtMs}
								finalDurationMs={analysisCompleted ? duration : null}
								onOpenWikilink={onClose ? createOpenSourceCallback(onClose) : undefined}
							/>
						</div>
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

			{/* Two-column: height grows with content (max 360px) to avoid large blank area at start. */}
			<div className="pktw-flex pktw-gap-4 pktw-min-h-0 pktw-max-h-[360px] pktw-overflow-hidden pktw-shrink-0">
				{/* Left: change log (topics/sources/blocks diff) only */}
				<div className={`pktw-flex pktw-flex-col pktw-gap-4 pktw-min-h-0 pktw-overflow-hidden ${showGraphPanel ? 'pktw-w-[40%]' : 'pktw-flex-1'}`}>
					<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-space-y-4">
						<IncrementalContent
							dashboardBlocks={dashboardBlocks ?? []}
							topics={topics}
							sources={sources}
							topicsRef={sectionRefs?.topicsRef}
							sourcesRef={sectionRefs?.sourcesRef}
						/>
						{(sources?.length ?? 0) > 0 ? (
							<div ref={sectionRefs?.sourcesRef} className="pktw-scroll-mt-4">
								<TopSourcesSection
									sources={convertSourcesToSearchResultItems(sources ?? [])}
									onOpen={onClose ? createOpenSourceCallback(onClose) : (s) => { }}
									skipAnimation={!analysisCompleted}
								/>
							</div>
						) : null}
					</div>
				</div>

				{/* Right: graph with configurable height (no outer max-h cap) */}
				{showGraphPanel ? (
					<div ref={sectionRefs?.graphSectionRef} className="pktw-w-[60%] pktw-flex pktw-flex-col pktw-min-h-0 pktw-overflow-hidden">
						<KnowledgeGraphSection
							onClose={onClose}
							maxHeightClassName="pktw-min-h-[160px] pktw-max-h-[50vh]"
							containerClassName="pktw-flex-1 pktw-min-h-0"
						/>
					</div>
				) : null}
			</div>

			{/* Full-width Blocks below two columns (same layout as Completed) */}
			{(dashboardBlocks?.length ?? 0) > 0 ? (
				<div ref={sectionRefs?.dashboardBlocksRef} className="pktw-mt-4 pktw-scroll-mt-4 pktw-w-full">
					<DashboardBlocksSection blocks={dashboardBlocks ?? []} isStreaming={!analysisCompleted} />
				</div>
			) : null}
		</div>
	);
};