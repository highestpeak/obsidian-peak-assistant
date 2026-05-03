import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SaveDialog } from './components/ai-analysis-modal//ResultSaveDialog';
import { V2ContinueAnalysisInput } from './components/V2ContinueAnalysisInput';
import { useSharedStore, useGraphQueuePump } from './store';
import {
	useAIAnalysisTopicsStore,
	useAIAnalysisInteractionsStore,
} from './store/aiAnalysisStore';
import { useSearchSessionStore } from './store/searchSessionStore';
import { useSearchSession } from './hooks/useSearchSession';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { useAIAnalysisResult } from './hooks/useAIAnalysisResult';
import { AppContext } from '@/app/context/AppContext';
import { SynthesizeAgent } from '@/service/agents/SynthesizeAgent';
import { SearchResultView } from './components/SearchResultView';
import { SectionExtraChatModal } from './components/ai-analysis-modal/SectionExtraChatModal';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { buildDebugInfoText } from './callbacks/copyDebugInfo';
import { V2Footer } from './components/V2Footer';
import { useAIGraphStore } from './store/aiGraphStore';
import { buildAiGraphMarkdown } from '@/core/storage/vault/search-docs/AiGraphDoc';
import { ensureFolder } from '@/core/utils/vault-utils';
import { Notice } from 'obsidian';

interface AISearchTabProps {
	onClose?: () => void;
	onCancel?: () => void;
	isCancelling?: boolean;
}

/**
 * AI search tab, showing analysis summary, sources, and insights.
 */
export const AISearchTab: React.FC<AISearchTabProps> = ({ onClose, onCancel }) => {
	// --- Session store reads ---
	const sessionStatus = useSearchSessionStore((s) => s.status);
	const sessionId = useSearchSessionStore((s) => s.id);
	const error = useSearchSessionStore((s) => s.error);
	const restoredFromHistory = useSearchSessionStore((s) => s.restoredFromHistory);
	const restoredFromVaultPath = useSearchSessionStore((s) => s.restoredFromVaultPath);
	const autoSaveState = useSearchSessionStore((s) => s.autoSaveState);
	const titleFromStore = useSearchSessionStore((s) => s.title);
	const triggerAnalysis = useSearchSessionStore((s) => s.triggerAnalysis);
	const isAnalyzing = sessionStatus === 'starting' || sessionStatus === 'streaming';
	const analysisCompleted = sessionStatus === 'completed';

	// --- Topic/interaction stores (for modals) ---
	const topicAnalyzeResults = useAIAnalysisTopicsStore((s) => s.topicAnalyzeResults);
	const topicInspectResults = useAIAnalysisTopicsStore((s) => s.topicInspectResults);
	const topicGraphResults = useAIAnalysisTopicsStore((s) => s.topicGraphResults);
	const topicModalOpen = useAIAnalysisTopicsStore((s) => s.topicModalOpen);
	const setTopicModalOpen = useAIAnalysisTopicsStore((s) => s.setTopicModalOpen);
	const topicAnalyzeStreaming = useAIAnalysisTopicsStore((s) => s.topicAnalyzeStreaming);
	const topicGraphLoading = useAIAnalysisTopicsStore((s) => s.topicGraphLoading);
	const topicInspectLoading = useAIAnalysisTopicsStore((s) => s.topicInspectLoading);

	const contextChatModal = useAIAnalysisInteractionsStore((s) => s.contextChatModal);
	const setContextChatModal = useAIAnalysisInteractionsStore((s) => s.setContextChatModal);

	const titleDisplay = useTypewriterEffect({
		text: titleFromStore ?? '',
		enabled: !!(titleFromStore?.trim()) && !restoredFromHistory,
	});

	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [copied, setCopied] = useState(false);
	const [showV2ContinueInput, setShowV2ContinueInput] = useState(false);
	const contentContainerRef = useRef<HTMLDivElement>(null);

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
			if (text?.trim()) {
				// Freeze current round and start continue round (append mode)
				const sessionStore = useSearchSessionStore.getState();
				sessionStore.freezeCurrentRound();
				sessionStore.startContinueRound(text.trim());
				// Set the search query for display
				useSharedStore.getState().setSearchQuery(text.trim());
				// Set continue mode flag so performAnalysis skips reset
				useSearchSessionStore.setState({ continueMode: true });
				// Trigger analysis in continue mode
				incrementTriggerAnalysis();
			}
		}
	}, [lastUIEvent]);

	// process analysis result ========================================================

	const { handleOpenInChat, handleCopyAll, handleAutoSave } = useAIAnalysisResult();

	// NOTE: Full-save at completion is handled by useSearchSession.ts (milestone-based persistence).
	// No React effect needed — persistence fires directly after markCompleted().

	// Early-save: persist analysis doc as soon as plan sections appear (before approval/completion),
	// so the file exists for "Open in File" button.
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

	const handleSaveGraph = useCallback(async () => {
		const { graphData, activeLens, query: graphQuery } = useAIGraphStore.getState();
		if (!graphData) {
			new Notice('No graph data to save');
			return;
		}
		const ctx = AppContext.getInstance();
		const app = ctx.app;
		const saveFolder = ctx.settings.search.aiAnalysisAutoSaveFolder?.trim() || 'AI-Analysis';
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const querySlug = (searchQuery || graphQuery || 'graph').replace(/[/\\:*?"<>|]/g, '').trim().slice(0, 40);
		const fileName = `Graph-${querySlug}-${timestamp}`;
		const filePath = `${saveFolder}/${fileName}.md`;

		const summary = graphData.nodes.length + ' nodes, ' + graphData.edges.length + ' edges';
		const content = buildAiGraphMarkdown({
			query: searchQuery || graphQuery || '',
			created: new Date().toISOString(),
			summary,
			graphData,
			lensHint: activeLens,
		});

		try {
			await ensureFolder(saveFolder);
			await app.vault.create(filePath, content);
			new Notice(`Graph saved: ${fileName}.md`);
		} catch (e) {
			new Notice(`Failed to save graph: ${e instanceof Error ? e.message : String(e)}`);
		}
	}, [searchQuery]);

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

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Title bar — shown when analysis is completed */}
			{analysisCompleted && titleFromStore && (
				<div className="pktw-px-4 pktw-py-2 pktw-flex-shrink-0">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-2 pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-background">
						<div className="pktw-min-w-0 pktw-flex-1">
							<span className="pktw-text-sm pktw-font-semibold pktw-text-[#1a1c1e] pktw-truncate pktw-block" title={titleFromStore}>
								{titleDisplay || titleFromStore}
							</span>
							<span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-truncate pktw-block">
								{useSearchSessionStore.getState().query}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Main Content - extra top/side padding for IntelligenceFrame glow to avoid clipping */}
			<div ref={contentContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-6 pktw-px-4 pktw-pb-5">
				<SearchResultView onClose={onClose} onRetry={handleRetry} onApprove={handleApprovePlan} onRegenerateSection={handleRegenerateSection} />
			</div>

			{/* Footer */}
			{(isAnalyzing || analysisCompleted) ? (
				<V2Footer onContinue={() => setShowV2ContinueInput(!showV2ContinueInput)} onSynthesize={handleSynthesize} showContinueAnalysis={showV2ContinueInput} onCopy={() => { handleCopyAll(); setCopied(true); window.setTimeout(() => setCopied(false), 1000); }} copied={copied} onSave={() => setShowSaveDialog(true)} onSaveGraph={handleSaveGraph} onOpenInChat={() => handleOpenInChat(onClose)} />
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
							? { question: topicAnalyzeStreaming.question, answerSoFar: topicAnalyzeStreaming.text }
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
