import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Save, MessageCircle, Copy, MessageSquare, ChevronDown, Maximize2, Check, ExternalLink } from 'lucide-react';
import { SaveDialog } from './components/ai-analysis-modal//ResultSaveDialog';
import { KeyboardShortcut } from '../../component/mine/KeyboardShortcut';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { formatDuration, formatTokenCount } from '@/core/utils/format-utils';
import { useSharedStore, useGraphQueuePump } from './store';
import {
	useAIAnalysisRuntimeStore,
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	useAIAnalysisTopicsStore,
	useAIAnalysisInteractionsStore,
	useAIAnalysisStepsStore,
	resetAIAnalysisAll,
	getHasGraphData,
	getHasCompletedContent,
	getHasSummarySection,
	getHasTopicsSection,
	getHasDashboardBlocksSection,
	getHasSourcesSection,
} from './store/aiAnalysisStore';
import { useAIAnalysis } from './hooks/useAIAnalysis';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { AnimatePresence, motion } from 'framer-motion';
import { RecentAIAnalysis } from './components/ai-analysis-sections/RecentAIAnalysis';
import { useAIAnalysisResult } from './hooks/useAIAnalysisResult';
import { AppContext } from '@/app/context/AppContext';
import { StreamingAnalysis } from './components/ai-analysis-state/StreamingAnalysis';
import { CompletedAIAnalysis } from './components/ai-analysis-state/CompletedAIAnalysis';
import { AIAnalysisErrorState } from './components/ai-analysis-state/AIAnalysisErrorState';
import { AIAnalysisPreStreamingState } from './components/ai-analysis-state/AIAnalysisPreStreamingState';
import { SectionExtraChatModal } from './components/ai-analysis-modal/SectionExtraChatModal';
import { InlineFollowupChat } from '../../component/mine/InlineFollowupChat';
import { useContinueAnalysisFollowupChatConfig } from './hooks/useAIAnalysisPostAIInteractions';
import { createOpenSourceCallback } from './callbacks/open-source-file';

interface AISearchTabProps {
	onClose?: () => void;
	onCancel?: () => void;
	isCancelling?: boolean;
}

/**
 * Footer hints section for AI search tab
 */
const AISearchFooterHints: React.FC<{}> = ({ }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="Esc" description="to close" prefix="Press" />
		<KeyboardShortcut keys="Enter" description="to analyze" prefix="Press" />
		<KeyboardShortcut warning="• Will consume AI tokens" />
	</div>
);

/**
 * AI search tab, showing analysis summary, sources, and insights.
 */
export const AISearchTab: React.FC<AISearchTabProps> = ({ onClose, onCancel }) => {
	const triggerAnalysis = useAIAnalysisRuntimeStore((s) => s.triggerAnalysis);
	const isAnalyzing = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
	const analysisRunId = useAIAnalysisRuntimeStore((s) => s.analysisRunId);
	const analyzingBeforeFirstToken = useAIAnalysisRuntimeStore((s) => s.analyzingBeforeFirstToken);
	const hasStartedStreaming = useAIAnalysisRuntimeStore((s) => s.hasStartedStreaming);
	const hasAnalyzed = useAIAnalysisRuntimeStore((s) => s.hasAnalyzed);
	const analysisCompleted = useAIAnalysisRuntimeStore((s) => s.analysisCompleted);
	const error = useAIAnalysisRuntimeStore((s) => s.error);
	const usage = useAIAnalysisRuntimeStore((s) => s.usage);
	const duration = useAIAnalysisRuntimeStore((s) => s.duration);
	const recordError = useAIAnalysisRuntimeStore((s) => s.recordError);
	const restoredFromHistory = useAIAnalysisRuntimeStore((s) => s.restoredFromHistory);
	const restoredFromVaultPath = useAIAnalysisRuntimeStore((s) => s.restoredFromVaultPath);
	const autoSaveState = useAIAnalysisRuntimeStore((s) => s.autoSaveState);
	const titleFromStore = useAIAnalysisRuntimeStore((s) => s.title);

	const summaryChunks = useAIAnalysisSummaryStore((s) => s.summaryChunks);

	const dashboardBlocks = useAIAnalysisResultStore((s) => s.dashboardBlocks);
	const getActiveOverviewMermaid = useAIAnalysisResultStore((s) => s.getActiveOverviewMermaid);

	const topicAnalyzeResults = useAIAnalysisTopicsStore((s) => s.topicAnalyzeResults);
	const topicInspectResults = useAIAnalysisTopicsStore((s) => s.topicInspectResults);
	const topicGraphResults = useAIAnalysisTopicsStore((s) => s.topicGraphResults);
	const topicModalOpen = useAIAnalysisTopicsStore((s) => s.topicModalOpen);
	const setTopicModalOpen = useAIAnalysisTopicsStore((s) => s.setTopicModalOpen);
	const topicAnalyzeStreaming = useAIAnalysisTopicsStore((s) => s.topicAnalyzeStreaming);
	const topicGraphLoading = useAIAnalysisTopicsStore((s) => s.topicGraphLoading);
	const topicInspectLoading = useAIAnalysisTopicsStore((s) => s.topicInspectLoading);

	const setFullAnalysisFollowUp = useAIAnalysisInteractionsStore((s) => s.setFullAnalysisFollowUp);
	const setFollowUpStreaming = useAIAnalysisInteractionsStore((s) => s.setFollowUpStreaming);
	const fullAnalysisFollowUp = useAIAnalysisInteractionsStore((s) => s.fullAnalysisFollowUp);
	const contextChatModal = useAIAnalysisInteractionsStore((s) => s.contextChatModal);
	const setContextChatModal = useAIAnalysisInteractionsStore((s) => s.setContextChatModal);

	const steps = useAIAnalysisStepsStore((s) => s.steps);
	const titleDisplay = useTypewriterEffect({
		text: titleFromStore ?? '',
		enabled: !!(titleFromStore?.trim()) && !restoredFromHistory,
	});
	const settings = AppContext.getInstance().settings;
	const continueAnalysisSummary = summaryChunks?.length ? summaryChunks.join('') : '';
	const continueAnalysisConfig = useContinueAnalysisFollowupChatConfig({ summary: continueAnalysisSummary });

	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [copied, setCopied] = useState(false);
	const [showContinueAnalysis, setShowContinueAnalysis] = useState(false);
	const contentContainerRef = useRef<HTMLDivElement>(null);
	const continueAnalysisBlockRef = useRef<HTMLDivElement>(null);

	// Pre-streaming state only when not yet analyzing; once analyzing, show StreamingAnalysis so StepDisplay is mounted before first ui-step
	const showPreStreamingState = !error && !isAnalyzing && !analysisCompleted;

	/** Path to open "saved analysis file" (from history restore or last auto-save). */
	const openAnalysisPath = restoredFromVaultPath ?? autoSaveState?.lastSavedPath ?? null;

	// track refs for quick navigation ========================================================

	// Section refs for quick navigation (scroll within the AI tab content container).
	const summaryRef = useRef<HTMLDivElement>(null);
	const overviewRef = useRef<HTMLDivElement>(null);
	const topicsRef = useRef<HTMLDivElement>(null);
	const dashboardBlocksRef = useRef<HTMLDivElement>(null);
	const graphSectionRef = useRef<HTMLDivElement>(null);
	const sourcesRef = useRef<HTMLDivElement>(null);
	const continueAnalysisRef = useRef<HTMLDivElement>(null);
	const stepsRef = useRef<HTMLDivElement>(null);

	const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
		ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const scrollToBlock = (blockId: string) => {
		document.getElementById(`block-${blockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const scrollToContinueSection = (index: number) => {
		document.getElementById(`continue-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	// Graph queue pump: process tool events so graph populates; must run even when graph panel is hidden
	useGraphQueuePump();

	// hooks for AI analysis ========================================================

	// Use custom hook for AI analysis
	const { performAnalysis, cancel } = useAIAnalysis();

	// Only trigger analysis when triggerAnalysis changes AND analysis is not completed
	// Do NOT trigger on searchQuery changes to avoid wasting resources
	// analysisCompleted flag prevents re-triggering when switching tabs
	const { searchQuery } = useSharedStore();
	const lastProcessedTriggerRef = useRef(0);
	useEffect(() => {
		if (triggerAnalysis > lastProcessedTriggerRef.current && searchQuery.trim() && !analysisCompleted) {
			lastProcessedTriggerRef.current = triggerAnalysis;
			performAnalysis();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [triggerAnalysis, analysisCompleted]); // Include analysisCompleted in deps

	// Retry also only triggers on retryTrigger change and analysis is not completed
	// analysisCompleted flag prevents re-triggering when switching tabs
	const [retryTrigger, setRetryTrigger] = useState(0);
	const lastProcessedRetryRef = useRef(0);
	useEffect(() => {
		if (retryTrigger > lastProcessedRetryRef.current && searchQuery.trim()) {
			lastProcessedRetryRef.current = retryTrigger;
			performAnalysis();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [retryTrigger]); // No need to include analysisCompleted for retry, as retry should always work

	const handleRetry = () => {
		recordError('Retry analysis');
		resetAIAnalysisAll();
		setRetryTrigger(prev => prev + 1);
	};

	// process analysis result ========================================================

	const { handleOpenInChat, handleCopyAll, handleAutoSave } = useAIAnalysisResult();

	// Auto-save when analysis completes (if enabled). Skip when state was restored from Recent (no duplicate save).
	useEffect(() => {
		if (!analysisCompleted) return;
		if (restoredFromHistory) return;
		const autoSaveEnabled = AppContext.getInstance().settings.search.aiAnalysisAutoSaveEnabled ?? true;
		if (!autoSaveEnabled) return;
		if (error) return;
		if (!analysisRunId) return;

		handleAutoSave();
	}, [analysisCompleted, restoredFromHistory, error, analysisRunId, handleAutoSave]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Sub navigation (below input, outside frames) */}
			{(getHasCompletedContent() || (hasStartedStreaming && !analysisCompleted)) ? (
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
							{settings.enableDevTools && ((steps?.length ?? 0) > 0 || (hasStartedStreaming && !analysisCompleted)) ? (
								<Button size="sm" variant="ghost" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(stepsRef)}>Steps</Button>
							) : null}
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
																	{label.slice(0, 48)}{label.length > 48 ? '…' : ''}
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
															{label.slice(0, 48)}{label.length > 48 ? '…' : ''}
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
			) : null}

			{/* Main Content - extra top/side padding for IntelligenceFrame glow to avoid clipping */}
			<div ref={contentContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-6 pktw-px-4 pktw-pb-5">
				{error ? (
					<>
						<AIAnalysisErrorState error={error} onRetry={handleRetry} />
						<p className="pktw-text-xs pktw-text-[#6b7280] pktw-mt-2 pktw-mb-1">
							You can still save this analysis using &quot;Save to File&quot; in the footer.
						</p>
					</>
				) : null}

				<AnimatePresence mode="wait" initial={false}>
					{/* Analysis Before First Token - Center AISearchState */}
					{showPreStreamingState ? (
						<motion.div
							key="pre"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.25 }}
							className="pktw-flex pktw-flex-col pktw-gap-4 pktw-h-full"
						>
							<AIAnalysisPreStreamingState />

							<RecentAIAnalysis onClose={onClose} />
						</motion.div>
					) : null}

					{/* Mount as soon as analyzing so StepDisplay can receive first ui-step (MindFlow "Planning...") */}
					{(isAnalyzing || hasStartedStreaming) && !analysisCompleted ? (
						<motion.div
							key="stream"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.25 }}
						>
							<StreamingAnalysis
								onClose={onClose}
								stepsRef={stepsRef}
								sectionRefs={{
									summaryRef,
									overviewRef,
									topicsRef,
									dashboardBlocksRef,
									graphSectionRef,
									sourcesRef,
								}}
							/>
						</motion.div>
					) : null}

					{/* Analysis Completed - Vertical Layout Transition */}
					{analysisCompleted ? (
						<motion.div
							key="done"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.25 }}
						>
							<CompletedAIAnalysis
								onClose={onClose}
								onOpenWikilink={onClose ? createOpenSourceCallback(onClose) : undefined}
								sectionRefs={{
									summaryRef,
									overviewRef,
									topicsRef,
									dashboardBlocksRef,
									graphSectionRef,
									sourcesRef,
									continueAnalysisRef,
									stepsRef,
								}}
							/>
						</motion.div>
					) : null}
				</AnimatePresence>

				{/* Continue Analysis: inline at bottom of content area */}
				{analysisCompleted && showContinueAnalysis ? (
					<div ref={continueAnalysisBlockRef} className="pktw-mt-6 pktw-scroll-mt-4">
						<InlineFollowupChat
							{...continueAnalysisConfig}
							outputPlace="parent"
							onStreamingReplace={(text, ctx) => setFollowUpStreaming(ctx?.question ? { question: ctx.question, content: text ?? '' } : null)}
							onApply={(answer, mode, question) => {
								setFollowUpStreaming(null);
								setFullAnalysisFollowUp(question ?? 'Continue', answer, mode);
							}}
						/>
					</div>
				) : null}
			</div>

			{/* Footer */}
			<div className="pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0">
				{!hasAnalyzed && !isAnalyzing ? <AISearchFooterHints /> : null}
				{hasAnalyzed ? <div className="pktw-flex pktw-items-center pktw-gap-3">
					{duration !== null && (
						<div className="pktw-text-xs pktw-text-[#999999]">
							<strong className="pktw-text-[#2e3338]">Cost: {formatDuration(duration)}</strong>
						</div>
					)}
					{usage && (
						<div className="pktw-text-xs pktw-text-[#999999] pktw-flex pktw-items-center pktw-gap-1">
							<Sparkles className="pktw-w-3 pktw-h-3" />
							<strong className="pktw-text-[#2e3338]">~{formatTokenCount(usage.totalTokens ?? 0)} tokens</strong>
						</div>
					)}
				</div> : null}
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{analysisCompleted && !isAnalyzing && (
						<>
							{/* Copy + Save: icon-only, no border; Copy shows Check for 1s after click then back to Copy */}
							<div className="pktw-flex pktw-items-center pktw-gap-1">
								<Button
									onClick={() => {
										handleCopyAll();
										setCopied(true);
										window.setTimeout(() => setCopied(false), 1000);
									}}
									size="sm"
									variant="ghost"
									className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
									title={copied ? 'Copied' : 'Copy All'}
								>
									{copied ? <Check className="pktw-w-3.5 pktw-h-3.5" /> : <Copy className="pktw-w-3.5 pktw-h-3.5" />}
								</Button>
								<Button
									onClick={() => setShowSaveDialog(true)}
									size="sm"
									variant="ghost"
									className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
									title="Save to File"
								>
									<Save className="pktw-w-3.5 pktw-h-3.5" />
								</Button>
								{openAnalysisPath ? (
									<Button
										onClick={() => void createOpenSourceCallback(onClose)(openAnalysisPath)}
										size="sm"
										variant="ghost"
										className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
										title="Open saved analysis file in document"
									>
										<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />
									</Button>
								) : null}
							</div>
							<Button
								onClick={() => {
									const next = !showContinueAnalysis;
									setShowContinueAnalysis(next);
									if (next) {
										setTimeout(() => {
											continueAnalysisBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
										}, 100);
									}
								}}
								size="sm"
								variant="outline"
								className={`pktw-px-4 pktw-py-1.5 pktw-gap-2 ${showContinueAnalysis ? 'pktw-bg-[#6d28d9]/10 pktw-border-[#6d28d9]/30' : 'pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9]'}`}
								title={showContinueAnalysis ? 'Hide Continue Analysis' : 'Continue analysis with follow-up questions'}
							>
								<MessageSquare className="pktw-w-3.5 pktw-h-3.5" />
								<span>Continue Analysis</span>
							</Button>
							<HoverCard openDelay={150} closeDelay={300}>
								<HoverCardTrigger asChild>
									<Button
										size="sm"
										className="pktw-px-4 pktw-py-1.5 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] pktw-gap-2"
										title="Open in chat or full analysis view"
									>
										<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />
										<span>Open in Chat</span>
										<ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-opacity-80" />
									</Button>
								</HoverCardTrigger>
								<HoverCardContent align="end" side="bottom" sideOffset={4} className="pktw-w-[200px] pktw-p-1 pktw-z-[10000]">
									<Button
										variant="ghost"
										style={{ cursor: 'pointer' }}
										className="pktw-shadow-none pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-text-left pktw-cursor-pointer"
										onClick={() => handleOpenInChat(onClose)}
									>
										<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />
										<span>Open in Chat</span>
									</Button>
									<Button
										variant="ghost"
										style={{ cursor: 'pointer' }}
										className="pktw-shadow-none pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-text-left pktw-cursor-pointer"
										title="Open this analysis in the main view for a larger view"
										onClick={() => {
											// TODO: open this analysis in main view (full analysis view)
										}}
									>
										<Maximize2 className="pktw-w-3.5 pktw-h-3.5" />
										<span>Full analysis view</span>
									</Button>
								</HoverCardContent>
							</HoverCard>
						</>
					)}
				</div>
			</div>

			{/* Save dialog */}
			{showSaveDialog && (
				<SaveDialog onClose={() => setShowSaveDialog(false)} />
			)}
			{/* Context follow-up modal (Graph/Blocks/Sources) – same TopicModal with converted messages */}
			{contextChatModal != null && (
				<SectionExtraChatModal
					title={contextChatModal.title}
					streaming={
						contextChatModal.streamingQuestion && contextChatModal.streamingText
							? { question: contextChatModal.streamingQuestion, answerSoFar: contextChatModal.streamingText }
							: null
					}
					activeQuestion={contextChatModal.activeQuestion}
					analyzeResults={contextChatModal.messages}
					isInspectLoading={false}
					inspectItems={[]}
					isGraphLoading={false}
					graph={null}
					onClose={() => setContextChatModal(null)}
				/>
			)}
			{/* Topic expansion modal */}
			{topicModalOpen != null && (
				<SectionExtraChatModal
					title={`Topic: ${topicModalOpen}`}
					streaming={
						topicAnalyzeStreaming?.topic === topicModalOpen
							? { question: topicAnalyzeStreaming.question, answerSoFar: topicAnalyzeStreaming.chunks.join('') }
							: null
					}
					analyzeResults={topicAnalyzeResults?.[topicModalOpen] ?? []}
					isInspectLoading={topicInspectLoading === topicModalOpen}
					inspectItems={topicInspectResults?.[topicModalOpen] ?? []}
					isGraphLoading={topicGraphLoading === topicModalOpen}
					graph={topicGraphResults?.[topicModalOpen] ?? null}
					onClose={() => setTopicModalOpen(null)}
				/>
			)}
		</div>
	);
};
