import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SaveDialog } from './components/ai-analysis-modal//ResultSaveDialog';
import { useSharedStore, useGraphQueuePump } from './store';
import { useSearchSessionStore } from './store/searchSessionStore';
import { useSearchSession } from './hooks/useSearchSession';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { useAIAnalysisResult } from './hooks/useAIAnalysisResult';
import { useQuickSearchHost } from './hooks/useQuickSearchHost';
import { SearchResultView } from './components/SearchResultView';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { V2Footer } from './components/V2Footer';
import { useAIGraphStore } from './store/aiGraphStore';
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
	const host = useQuickSearchHost();
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

	const titleDisplay = useTypewriterEffect({
		text: titleFromStore ?? '',
		enabled: !!(titleFromStore?.trim()) && !restoredFromHistory,
	});

	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const contentContainerRef = useRef<HTMLDivElement>(null);

	// Graph queue pump: process tool events so graph populates; must run even when graph panel is hidden
	useGraphQueuePump();

	// hooks for AI analysis ========================================================

	// Use custom hook for AI analysis (new unified hook)
	const sessionHook = useSearchSession();
	const { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection, handleAskSection } = sessionHook;

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

	const { handleOpenInChat, handleAutoSave } = useAIAnalysisResult();

	// NOTE: Full-save at completion is handled by useSearchSession.ts (milestone-based persistence).
	// No React effect needed — persistence fires directly after markCompleted().

	// Early-save: persist analysis doc as soon as plan sections appear (before approval/completion),
	// so the file exists for "Open in File" button.
	const v2HasPlan = useSearchSessionStore(s => s.v2PlanSections.length > 0);
	useEffect(() => {
		if (!v2HasPlan) return;
		if (restoredFromHistory) return;
		if (autoSaveState?.lastSavedPath) return;    // already saved
		if (!host.autoSaveEnabled) return;
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
		const saveFolder = host.autoSaveFolder || 'AI-Analysis';
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const querySlug = (searchQuery || graphQuery || 'graph').replace(/[/\\:*?"<>|]/g, '').trim().slice(0, 40);
		const fileName = `Graph-${querySlug}-${timestamp}`;
		const summary = graphData.nodes.length + ' nodes, ' + graphData.edges.length + ' edges';

		try {
			await host.saveGraphToVault({
				folderPath: saveFolder,
				fileName,
				query: searchQuery || graphQuery || '',
				summary,
				graphData,
				lensHint: activeLens,
			});
			new Notice(`Graph saved: ${fileName}.md`);
		} catch (e) {
			new Notice(`Failed to save graph: ${e instanceof Error ? e.message : String(e)}`);
		}
	}, [searchQuery, host]);

	const handleSynthesize = useCallback(async () => {
		const store = useSearchSessionStore.getState();
		if (store.rounds.length < 2) return;

		// Freeze current round if sections exist
		if (store.v2PlanSections.some((s) => s.status === 'done')) {
			store.freezeCurrentRound();
		}

		useSearchSessionStore.setState({ status: 'starting' });
		try {
			const agent = host.createSynthesizeAgent();
			const result = await agent.synthesize(useSearchSessionStore.getState().rounds);
			useSearchSessionStore.getState().replaceSynthesized(result.summary, result.sections);
			useSearchSessionStore.getState().markCompleted();
		} catch (e) {
			console.error('Synthesize failed:', e);
			useSearchSessionStore.setState({ status: 'completed' });
		}
	}, [host]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Title bar — shown when analysis is completed */}
			{analysisCompleted && titleFromStore && (
				<div className="pktw-px-4 pktw-py-2 pktw-flex-shrink-0">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-2 pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-background">
						<div className="pktw-min-w-0 pktw-flex-1">
							<span className="pktw-text-sm pktw-font-semibold pktw-text-pk-text-primary pktw-truncate pktw-block" title={titleFromStore}>
								{titleDisplay || titleFromStore}
							</span>
							<span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-truncate pktw-block">
								{useSearchSessionStore.getState().query}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Main content — compact top inset keeps section headers attached to the workspace. */}
			<div ref={contentContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-2 pktw-px-4 pktw-pb-4">
				<SearchResultView
					onClose={onClose}
					onRetry={handleRetry}
					onApprove={handleApprovePlan}
					onRegenerateSection={handleRegenerateSection}
					onAskSection={handleAskSection}
				/>
			</div>

			{/* Footer */}
			{(isAnalyzing || analysisCompleted || sessionStatus === 'plan_ready') ? (
				<V2Footer
					onContinue={() => {
						useSearchSessionStore.getState().setV2View('report');
						useUIEventStore.getState().publish('focus-report-followup', {});
					}}
					onSynthesize={handleSynthesize}
					onSave={() => setShowSaveDialog(true)}
					onSaveGraph={handleSaveGraph}
					onOpenInChat={() => handleOpenInChat(onClose)}
				/>
			) : null}

			{/* Save dialog */}
			{showSaveDialog && (
				<SaveDialog onClose={() => setShowSaveDialog(false)} />
			)}
		</div>
	);
};
