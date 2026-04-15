import { SummaryContent } from "../ai-analysis-sections/SummarySection";
import { IntelligenceFrame } from "../../../../component/mine/IntelligenceFrame";
import {
	useAIAnalysisRuntimeStore,
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
} from "../../store/aiAnalysisStore";
import { StreamingStepsDisplay } from "../ai-analysis-sections/StepsDisplay";
import { HitlInlineInput } from "../ai-analysis-sections/HitlInlineInput";
import React, { useMemo } from "react";
import { MermaidMindFlowSection } from "@/ui/view/quick-search/components/ai-analysis-sections/MermaidMindFlowSection";
import { TopicSection } from "../ai-analysis-sections/TopicSection";
import { DashboardBlocksSection } from "../ai-analysis-sections/DashboardBlocksSection";
import { TopSourcesSection } from "../ai-analysis-sections/SourcesSection";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";
import { convertSourcesToSearchResultItems } from "../../hooks/useAIAnalysisResult";
import { StreamdownIsolated } from "@/ui/component/mine";

export type StreamingAnalysisSectionRefs = {
	summaryRef?: React.RefObject<HTMLDivElement>;
	overviewRef?: React.RefObject<HTMLDivElement>;
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
	const isAnalyzing = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
	const analysisStartedAtMs = useAIAnalysisRuntimeStore((s) => s.analysisStartedAtMs);
	const analysisCompleted = useAIAnalysisRuntimeStore((s) => s.analysisCompleted);
	const duration = useAIAnalysisRuntimeStore((s) => s.duration);
	const dashboardUpdatedLine = useAIAnalysisRuntimeStore((s) => s.dashboardUpdatedLine);
	const runAnalysisMode = useAIAnalysisRuntimeStore((s) => s.runAnalysisMode);
	const hasStartedStreaming = useAIAnalysisRuntimeStore((s) => s.hasStartedStreaming);

	const isSummaryStreaming = useAIAnalysisSummaryStore((s) => s.isSummaryStreaming);

	const dashboardBlocks = useAIAnalysisResultStore((s) => s.dashboardBlocks);
	const topics = useAIAnalysisResultStore((s) => s.topics);
	const sources = useAIAnalysisResultStore((s) => s.sources);
	const evidenceIndex = useAIAnalysisResultStore((s) => s.evidenceIndex);
	const graph = useAIAnalysisResultStore((s) => s.graph);
	const overviewMermaidVersions = useAIAnalysisResultStore((s) => s.overviewMermaidVersions);
	const overviewMermaidActiveIndex = useAIAnalysisResultStore((s) => s.overviewMermaidActiveIndex);
	const mindflowMermaid = useAIAnalysisResultStore((s) => s.mindflowMermaid);

	const hitlState = useAIAnalysisRuntimeStore((s) => s.hitlState);
	const isSimpleMode = false; // All remaining modes are full-featured
	const showMindFlow = !isSimpleMode && (mindflowMermaid ?? '').trim().length > 0;
	const displayOverview = (overviewMermaidVersions ?? [])[overviewMermaidActiveIndex ?? 0] ?? '';

	const dedupedTopics = useMemo(() => {
		const seen = new Set<string>();
		return (topics ?? []).filter((t: any) => {
			const key = String(t?.label ?? '').trim().toLowerCase();
			if (!key) return false;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}, [topics]);
	const dedupedSources = useMemo(() => {
		const seen = new Set<string>();
		return (sources ?? []).filter((s: any) => {
			const path = String(s?.path ?? '').trim();
			const id = String(s?.id ?? '').trim();
			const key = path ? `path:${path}` : (id ? `id:${id}` : '');
			if (!key) return false;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}, [sources]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-h-full">
			{/* Frame should only wrap: Summary + Steps */}
			<IntelligenceFrame
				isActive={isAnalyzing || isSummaryStreaming || hasStartedStreaming}
				className="pktw-mb-1"
			>
				<div className="pktw-flex pktw-flex-col pktw-gap-4">
					{/* Show summary for: normal summary streaming */}
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
							startedAtMs={analysisStartedAtMs}
							isRunning={isAnalyzing && !analysisCompleted}
							finalDurationMs={analysisCompleted ? duration : null}
						/>
						{hitlState?.isPaused && (
							<HitlInlineInput
								pauseId={hitlState.pauseId}
								phase={hitlState.phase}
								snapshot={hitlState.snapshot}
							/>
						)}
					</div>
				</div>
			</IntelligenceFrame>

			{/* Overview (Mermaid) – streamed via ui-signal when submit_overview_mermaid tool result arrives */}
			{!isSimpleMode && displayOverview?.trim() ? (
				<div ref={sectionRefs?.overviewRef} className="pktw-scroll-mt-4">
					<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-2">
						<span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Overview</span>
						<StreamdownIsolated
							className="pktw-w-full pktw-min-w-0 pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none pktw-select-text"
							isAnimating={false}
						>
							{displayOverview}
						</StreamdownIsolated>
					</div>
				</div>
			) : null}

			{showMindFlow ? (
				<div ref={sectionRefs?.graphSectionRef} className="pktw-w-full pktw-flex pktw-flex-col pktw-min-h-0 pktw-overflow-hidden">
					<MermaidMindFlowSection
						mindflowMermaid={mindflowMermaid}
						maxHeightClassName="pktw-min-h-[160px]"
						containerClassName="pktw-flex-1 pktw-min-h-0"
					/>
				</div>
			) : null}

			{/* Dashboard Updated line (from DashboardUpdateAgent, latest only) */}
			{!isSimpleMode && (dashboardUpdatedLine ?? '').trim() ? (
				<div className="pktw-text-xs pktw-text-[#6b7280] pktw-py-1">
					{dashboardUpdatedLine}
				</div>
			) : null}

			{/* Topics (same style as Completed) */}
			{!isSimpleMode && dedupedTopics.length > 0 ? (
				<div ref={sectionRefs?.topicsRef} className="pktw-scroll-mt-4">
					<TopicSection topics={dedupedTopics} onClose={onClose} />
				</div>
			) : null}

			{/* Dashboard Blocks (consulting order: after Topics, before Sources) */}
			{(dashboardBlocks?.length ?? 0) > 0 ? (
				<div ref={sectionRefs?.dashboardBlocksRef} className="pktw-mt-4 pktw-scroll-mt-4 pktw-w-full">
					<DashboardBlocksSection blocks={dashboardBlocks ?? []} isStreaming={!analysisCompleted} />
				</div>
			) : null}

			{/* Sources (consulting order: last); show when sources or evidence index has data */}
			{dedupedSources.length > 0 || Object.keys(evidenceIndex).some((p) => ((evidenceIndex[p]?.summaries?.length ?? 0) + (evidenceIndex[p]?.facts?.length ?? 0)) > 0) ? (
				<div ref={sectionRefs?.sourcesRef} className="pktw-scroll-mt-4">
					<TopSourcesSection
						sources={convertSourcesToSearchResultItems(dedupedSources)}
						onOpen={onClose ? createOpenSourceCallback(onClose) : () => {}}
						skipAnimation={!analysisCompleted}
						evidenceIndex={evidenceIndex}
						graph={graph}
					/>
				</div>
			) : null}
		</div>
	);
};