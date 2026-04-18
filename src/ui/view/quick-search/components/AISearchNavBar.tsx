import { SLICE_CAPS } from '@/core/constant';
import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import {
	getHasGraphData,
	getHasSummarySection,
	getHasTopicsSection,
	getHasDashboardBlocksSection,
	getHasSourcesSection,
} from '../store/aiAnalysisStore';

interface AISearchNavBarProps {
	titleDisplay: string;
	titleFromStore: string | null;
	isNewPipeline: boolean;
	hasNewPipelineReport: boolean;
	hasNewPipelineSources: boolean;
	isAnalyzing: boolean;
	analysisCompleted: boolean;
	hasStartedStreaming: boolean;
	enableDevTools?: boolean;
	steps: any[] | null;
	dashboardBlocks: Array<{ id: string; title?: string }> | null;
	fullAnalysisFollowUp: Array<{ title?: string; content: string }> | null;
	getActiveOverviewMermaid: (() => string | null) | null;
	scrollToSection: (ref: React.RefObject<HTMLDivElement>) => void;
	scrollToStep: (stepType: string) => void;
	scrollToBlock: (blockId: string) => void;
	scrollToContinueSection: (index: number) => void;
	summaryRef: React.RefObject<HTMLDivElement>;
	overviewRef: React.RefObject<HTMLDivElement>;
	topicsRef: React.RefObject<HTMLDivElement>;
	dashboardBlocksRef: React.RefObject<HTMLDivElement>;
	graphSectionRef: React.RefObject<HTMLDivElement>;
	sourcesRef: React.RefObject<HTMLDivElement>;
	stepsRef: React.RefObject<HTMLDivElement>;
	continueAnalysisRef: React.RefObject<HTMLDivElement>;
}

export const AISearchNavBar: React.FC<AISearchNavBarProps> = ({
	titleDisplay,
	titleFromStore,
	isNewPipeline,
	hasNewPipelineReport,
	hasNewPipelineSources,
	isAnalyzing,
	analysisCompleted,
	hasStartedStreaming,
	enableDevTools,
	steps,
	dashboardBlocks,
	fullAnalysisFollowUp,
	getActiveOverviewMermaid,
	scrollToSection,
	scrollToStep,
	scrollToBlock,
	scrollToContinueSection,
	summaryRef,
	overviewRef,
	topicsRef,
	dashboardBlocksRef,
	graphSectionRef,
	sourcesRef,
	stepsRef,
	continueAnalysisRef,
}) => (
	<div className="pktw-flex-shrink-0 pktw-px-4">
		<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-p-2 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white">
			{/* Title on the left (typewriter when just completed, plain when restored from history) */}
			<div className="pktw-min-w-0 pktw-flex-1 pktw-pr-2">
				{titleDisplay ? (
					<span className="pktw-text-sm pktw-font-semibold pktw-text-[#1a1c1e] pktw-truncate pktw-block" title={titleFromStore ?? undefined}>
						{titleDisplay}
					</span>
				) : null}
			</div>
			{/* Nav buttons on the right */}
			<div className="pktw-flex pktw-flex-shrink-0 pktw-flex-wrap pktw-gap-2">
				{isNewPipeline ? (
					<>
						{hasNewPipelineReport ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToStep('report')}>Summary</Button>
						) : null}
						{hasNewPipelineSources ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToStep('sources')}>Sources</Button>
						) : null}
						{enableDevTools ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToStep('classify')}>Steps</Button>
						) : null}
					</>
				) : (
					<>
						{getHasSummarySection() ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(summaryRef)}>Summary</Button>
						) : null}
						{getActiveOverviewMermaid?.()?.trim() ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(overviewRef)}>Overview</Button>
						) : null}
						{getHasTopicsSection() ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(topicsRef)}>Topics</Button>
						) : null}
						{getHasGraphData() ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(graphSectionRef)}>Graph</Button>
						) : null}
						{getHasSourcesSection() ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(sourcesRef)}>Sources</Button>
						) : null}
						{enableDevTools && ((steps?.length ?? 0) > 0 || (hasStartedStreaming && !analysisCompleted)) ? (
							<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(stepsRef)}>Steps</Button>
						) : null}
					</>
				)}
				{getHasDashboardBlocksSection() ? (
					(dashboardBlocks?.length ?? 0) > 1 ? (
						<HoverCard openDelay={150} closeDelay={100}>
							<HoverCardTrigger asChild>
								<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(dashboardBlocksRef)}>Blocks</Button>
							</HoverCardTrigger>
							<HoverCardContent side="bottom" align="start" className="pktw-w-auto pktw-min-w-[160px] pktw-py-1 pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
								<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
									{(dashboardBlocks ?? []).map((b) => {
										const raw = b.title || 'Block';
										const label = raw.replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim() || 'Block';
										return (
											<Button
												key={b.id}
												variant="ghost"
												style={{ cursor: 'pointer' }}
												className="pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-rounded pktw-truncate pktw-flex pktw-justify-start"
												onClick={() => scrollToBlock(b.id)}
											>
												{label}
											</Button>
										);
									})}
									{(fullAnalysisFollowUp?.length ?? 0) > 0 ? (
										<>
											<div className="pktw-border-t pktw-border-[#e5e7eb] pktw-mt-1 pktw-pt-2" />
											{(fullAnalysisFollowUp ?? []).map((s, i) => {
												const raw = s.title || 'Continue';
												const label = raw.replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
												return (
													<Button
														key={i}
														variant="ghost"
														style={{ cursor: 'pointer' }}
														className="pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-rounded pktw-truncate pktw-flex pktw-justify-start"
														onClick={() => scrollToContinueSection(i)}
													>
														{label.slice(0, SLICE_CAPS.ui.tabSearchLabel)}{label.length > SLICE_CAPS.ui.tabSearchLabel ? '\u2026' : ''}
													</Button>
												);
											})}
										</>
									) : null}
								</div>
							</HoverCardContent>
						</HoverCard>
					) : (
						<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(dashboardBlocksRef)}>Blocks</Button>
					)
				) : null}
				{(fullAnalysisFollowUp?.length ?? 0) > 0 ? (
					(fullAnalysisFollowUp?.length ?? 0) > 1 ? (
						<HoverCard openDelay={150} closeDelay={100}>
							<HoverCardTrigger asChild>
								<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(continueAnalysisRef)}>Continue</Button>
							</HoverCardTrigger>
							<HoverCardContent side="bottom" align="start" className="pktw-w-auto pktw-min-w-[180px] pktw-py-1 pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
								<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
									{(fullAnalysisFollowUp ?? []).map((s, i) => {
										const raw = s.title || 'Continue';
										const label = raw.replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
										return (
											<Button
												key={i}
												variant="ghost"
												style={{ cursor: 'pointer' }}
												className="pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-rounded pktw-truncate pktw-flex pktw-justify-start"
												onClick={() => scrollToContinueSection(i)}
											>
												{label.slice(0, SLICE_CAPS.ui.tabSearchLabel)}{label.length > SLICE_CAPS.ui.tabSearchLabel ? '\u2026' : ''}
											</Button>
										);
									})}
								</div>
							</HoverCardContent>
						</HoverCard>
					) : (
						<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToContinueSection(0)}>Continue</Button>
					)
				) : null}
			</div>
		</div>
	</div>
);
