import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SaveDialog } from './components/ai-analysis-modal//ResultSaveDialog';
import { V2ContinueAnalysisInput } from './components/V2ContinueAnalysisInput';
import { useSharedStore, useGraphQueuePump } from './store';
import {
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	useAIAnalysisTopicsStore,
	useAIAnalysisInteractionsStore,
	useAIAnalysisStepsStore,
	getHasCompletedContent,
	getHasGraphData,
} from './store/aiAnalysisStore';
import { useSearchSessionStore } from './store/searchSessionStore';
import { useSearchSession } from './hooks/useSearchSession';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { useAIAnalysisResult } from './hooks/useAIAnalysisResult';
import { AppContext } from '@/app/context/AppContext';
import { SynthesizeAgent } from '@/service/agents/SynthesizeAgent';
import { SearchResultView } from './components/SearchResultView';
import { SectionExtraChatModal } from './components/ai-analysis-modal/SectionExtraChatModal';
import { InlineFollowupChat } from '../../component/mine/InlineFollowupChat';
import { useContinueAnalysisFollowupChatConfig } from './hooks/useAIAnalysisPostAIInteractions';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { buildDebugInfoText } from './callbacks/copyDebugInfo';
import { V2Footer } from './components/V2Footer';
import { AISearchNavBar } from './components/AISearchNavBar';

interface AISearchTabProps {
	onClose?: () => void;
	onCancel?: () => void;
	isCancelling?: boolean;
}

/**
 * AI search tab, showing analysis summary, sources, and insights.
 */
export const AISearchTab: React.FC<AISearchTabProps> = ({ onClose, onCancel }) => {
	// --- New session store reads ---
	const sessionStatus = useSearchSessionStore((s) => s.status);
	const sessionId = useSearchSessionStore((s) => s.id);
	const hasStartedStreaming = useSearchSessionStore((s) => s.hasStartedStreaming);
	const hasAnalyzed = useSearchSessionStore((s) => s.hasAnalyzed);
	const error = useSearchSessionStore((s) => s.error);
	const restoredFromHistory = useSearchSessionStore((s) => s.restoredFromHistory);
	const restoredFromVaultPath = useSearchSessionStore((s) => s.restoredFromVaultPath);
	const autoSaveState = useSearchSessionStore((s) => s.autoSaveState);
	const titleFromStore = useSearchSessionStore((s) => s.title);
	const triggerAnalysis = useSearchSessionStore((s) => s.triggerAnalysis);
	const isV2Active = useSearchSessionStore((s) => s.v2Active);

	const isAnalyzing = sessionStatus === 'starting' || sessionStatus === 'streaming';
	const analysisCompleted = sessionStatus === 'completed';

	// --- Old stores still needed (bridge keeps them populated) ---
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
	const v2ReportChunks = useSearchSessionStore((s) => s.v2ReportChunks);
	const continueAnalysisSummary = summaryChunks?.length ? summaryChunks.join('')
		: v2ReportChunks?.length ? v2ReportChunks.join('') : '';
	const continueAnalysisConfig = useContinueAnalysisFollowupChatConfig({ summary: continueAnalysisSummary });

	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [copied, setCopied] = useState(false);
	const [showContinueAnalysis, setShowContinueAnalysis] = useState(false);
	const [showV2ContinueInput, setShowV2ContinueInput] = useState(false);
	const [continueAnalysisInitialText, setContinueAnalysisInitialText] = useState<string | undefined>(undefined);
	const contentContainerRef = useRef<HTMLDivElement>(null);
	const continueAnalysisBlockRef = useRef<HTMLDivElement>(null);

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

	// For the new step-based pipeline: scroll to the last step of a given type
	const scrollToStep = (stepType: string) => {
		const els = contentContainerRef.current?.querySelectorAll(`[data-step="${stepType}"]`);
		if (els?.length) (els[els.length - 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
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

	// Use custom hook for AI analysis (new unified hook)
	const sessionHook = useSearchSession() as ReturnType<typeof useSearchSession> & { handleApprovePlan?: () => void; handleRegenerateSection?: (id: string, prompt?: string) => void };
	const { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection } = sessionHook;

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
		useSearchSessionStore.getState().recordError('Retry analysis');
		useSearchSessionStore.getState().resetAll();
		setRetryTrigger(prev => prev + 1);
	};

	// Debug info copy handler
	const [debugCopied, setDebugCopied] = useState(false);
	const handleCopyDebugInfo = () => {
		const text = buildDebugInfoText();
		navigator.clipboard.writeText(text).then(() => {
			setDebugCopied(true);
			window.setTimeout(() => setDebugCopied(false), 1500);
		});
	};

	// Listen for continue-analysis events from ContinueAnalysisInput
	const lastUIEvent = useUIEventStore((s) => s.lastEvent);
	const incrementTriggerAnalysis = useSearchSessionStore((s) => s.incrementTriggerAnalysis);
	useEffect(() => {
		if (lastUIEvent?.type === 'continue-analysis') {
			const text = (lastUIEvent.payload as any)?.text as string | undefined;
			if (isV2Active && text?.trim()) {
				// V2: freeze current round and start continue round (append mode)
				const sessionStore = useSearchSessionStore.getState();
				sessionStore.freezeCurrentRound();
				sessionStore.startContinueRound(text.trim());
				// Set the search query for display
				useSharedStore.getState().setSearchQuery(text.trim());
				// Set continue mode flag so performAnalysis skips reset
				useSearchSessionStore.setState({ continueMode: true });
				// Trigger analysis in continue mode
				incrementTriggerAnalysis();
			} else {
				// V1: open InlineFollowupChat
				setContinueAnalysisInitialText(text);
				setShowContinueAnalysis(true);
				setTimeout(() => {
					continueAnalysisBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}, 100);
			}
		}
	}, [lastUIEvent]);

	// process analysis result ========================================================

	const { handleOpenInChat, handleCopyAll, handleAutoSave } = useAIAnalysisResult();

	// Auto-save when analysis completes (if enabled). Skip when state was restored from Recent (no duplicate save).
	const v2FullyDone = useSearchSessionStore(s =>
		!s.v2Active || (
			s.v2ReportComplete &&
			s.v2PlanSections.length > 0 &&
			s.v2PlanSections.every(sec => sec.status === 'done') &&
			!s.v2SummaryStreaming
		)
	);

	useEffect(() => {
		if (!analysisCompleted) return;
		if (!v2FullyDone) return;          // wait for V2 sections + summary to finish
		if (restoredFromHistory) return;
		const autoSaveEnabled = AppContext.getInstance().settings.search.aiAnalysisAutoSaveEnabled ?? true;
		if (!autoSaveEnabled) return;
		if (error) return;
		if (!sessionId) return;

		handleAutoSave();
	}, [analysisCompleted, v2FullyDone, restoredFromHistory, error, sessionId, handleAutoSave]);

	// Early-save: persist analysis doc as soon as plan sections appear (before approval/completion),
	// so the file exists for "Open in File" and incremental persistence kicks in.
	const v2HasPlan = useSearchSessionStore(s => s.v2PlanSections.length > 0);
	useEffect(() => {
		if (!v2HasPlan) return;
		if (restoredFromHistory) return;
		if (autoSaveState?.lastSavedPath) return;    // already saved
		const autoSaveEnabled = AppContext.getInstance().settings.search.aiAnalysisAutoSaveEnabled ?? true;
		if (!autoSaveEnabled) return;
		if (error) return;
		if (!sessionId) return;

		handleAutoSave();
	}, [v2HasPlan, restoredFromHistory, autoSaveState?.lastSavedPath, error, sessionId, handleAutoSave]);

	const handleSynthesize = useCallback(async () => {
		const store = useSearchSessionStore.getState();
		if (store.rounds.length < 2) return;

		// Freeze current round if sections exist
		if (store.v2PlanSections.some((s) => s.status === 'done')) {
			store.freezeCurrentRound();
		}

		useSearchSessionStore.setState({ status: 'starting' });
		try {
			const agent = new SynthesizeAgent();
			const result = await agent.synthesize(useSearchSessionStore.getState().rounds);
			useSearchSessionStore.getState().replaceSynthesized(result.summary, result.sections);
			useSearchSessionStore.getState().markCompleted();
		} catch (e) {
			console.error('Synthesize failed:', e);
			useSearchSessionStore.setState({ status: 'completed' });
		}
	}, []);

	// Nav bar condition: only shown for legacy old-pipeline content
	const showNavBar = !isV2Active && (getHasCompletedContent() || (hasStartedStreaming && !analysisCompleted));

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Sub navigation (below input, outside frames) */}
			{showNavBar ? (
				<AISearchNavBar
					titleDisplay={titleDisplay}
					titleFromStore={titleFromStore}
					isNewPipeline={false}
					hasNewPipelineReport={false}
					hasNewPipelineSources={false}
					isAnalyzing={isAnalyzing}
					analysisCompleted={analysisCompleted}
					hasStartedStreaming={hasStartedStreaming}
					enableDevTools={settings.enableDevTools}
					steps={steps}
					dashboardBlocks={dashboardBlocks}
					fullAnalysisFollowUp={fullAnalysisFollowUp}
					getActiveOverviewMermaid={getActiveOverviewMermaid}
					scrollToSection={scrollToSection}
					scrollToStep={scrollToStep}
					scrollToBlock={scrollToBlock}
					scrollToContinueSection={scrollToContinueSection}
					summaryRef={summaryRef}
					overviewRef={overviewRef}
					topicsRef={topicsRef}
					dashboardBlocksRef={dashboardBlocksRef}
					graphSectionRef={graphSectionRef}
					sourcesRef={sourcesRef}
					stepsRef={stepsRef}
					continueAnalysisRef={continueAnalysisRef}
				/>
			) : null}

			{/* V2 title bar — shown when analysis is completed */}
			{isV2Active && analysisCompleted && titleFromStore && (
				<div className="pktw-px-4 pktw-py-2 pktw-flex-shrink-0">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-2 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white">
						<div className="pktw-min-w-0 pktw-flex-1">
							<span className="pktw-text-sm pktw-font-semibold pktw-text-[#1a1c1e] pktw-truncate pktw-block" title={titleFromStore}>
								{titleDisplay || titleFromStore}
							</span>
							<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-truncate pktw-block">
								{useSearchSessionStore.getState().query}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Main Content - extra top/side padding for IntelligenceFrame glow to avoid clipping */}
			<div ref={contentContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-6 pktw-px-4 pktw-pb-5">
				<SearchResultView onClose={onClose} onRetry={handleRetry} onApprove={handleApprovePlan} onRegenerateSection={handleRegenerateSection} />

				{/* Continue Analysis: inline at bottom of content area (V1 only — V2 has its own input) */}
				{!isV2Active && analysisCompleted && showContinueAnalysis ? (
					<div ref={continueAnalysisBlockRef} className="pktw-mt-6 pktw-scroll-mt-4">
						<InlineFollowupChat
							{...continueAnalysisConfig}
							initialQuestion={continueAnalysisInitialText}
							autoSubmit={!!continueAnalysisInitialText}
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

			{/* Footer — V2 renders its own content, V1 renders original */}
			{isV2Active && (isAnalyzing || analysisCompleted) ? (
				<V2Footer onContinue={() => setShowV2ContinueInput(!showV2ContinueInput)} onSynthesize={handleSynthesize} showContinueAnalysis={showV2ContinueInput} onCopy={() => { handleCopyAll(); setCopied(true); window.setTimeout(() => setCopied(false), 1000); }} copied={copied} onSave={() => setShowSaveDialog(true)} onOpenInChat={() => handleOpenInChat(onClose)} />
			) : null}

			{/* V2 floating continue analysis input */}
			{showV2ContinueInput && (
				<V2ContinueAnalysisInput onClose={() => setShowV2ContinueInput(false)} />
			)}

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
