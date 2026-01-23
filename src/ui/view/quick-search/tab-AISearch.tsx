import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, Save, AlertTriangle, MessageCircle } from 'lucide-react';
import { SaveDialog } from './components/ResultSaveDialog';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import { TagCloudSection } from './components/TagCloudSection';
import { TopSourcesSection } from './components/TopSourcesSection';
import { KnowledgeGraphSection } from './components/KnowledgeGraphSection';
import { StreamingDisplayMethods, StreamingStepsDisplay, SummaryContent } from './components/StepsDisplay';
import { IncrementalContent } from './components/IncrementalContent';
import { SuggestionsCard } from './components/SuggestionsCard';
import { Button } from '@/ui/component/shared-ui/button';
import { AnimatedSparkles } from '@/ui/component/mine';
import { formatDuration, formatTokenCount } from '@/core/utils/format-utils';
import { useSharedStore, useAIAnalysisStore } from './store';
import { useOpenInChat } from './hooks/useOpenInChat';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { useAIAnalysis } from './hooks/useAIAnalysis';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import { cn } from '@/ui/react/lib/utils';
import { useSubscribeUIEvent } from '@/ui/store/uiEventStore';
import { AIAnalysisStepType } from './store/aiAnalysisStore';

interface AISearchTabProps {
	onClose?: () => void;
	onCancel?: () => void;
	isCancelling?: boolean;
}

/**
 * Error state component for AI search failures
 */
const ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-red-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<AlertTriangle className="pktw-w-10 pktw-h-10 pktw-text-red-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2 pktw-text-lg">
			Oops! Something went wrong
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4 pktw-max-w-md">
			{error}
		</span>
		<Button
			onClick={onRetry}
			className="pktw-px-4 pktw-py-2 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] !pktw-rounded-md"
		>
			Try Again
		</Button>
	</div>
);

/**
 * Combined state component for AI search - shows loading or ready state
 */
const AISearchState: React.FC<{
	isAnalyzing: boolean;
	isSummaryStreaming: boolean;
}> = ({ isAnalyzing, isSummaryStreaming }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<AnimatedSparkles isAnimating={isAnalyzing || isSummaryStreaming} />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2">
			{isAnalyzing || isSummaryStreaming ? 'Analyzing...' : 'Ready to Analyze with AI'}
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4 pktw-max-w-md">
			{isAnalyzing || isSummaryStreaming
				? 'AI is processing your query and searching through your vault...'
				: ''
			}
		</span>
	</div>
);

/**
 * Footer hints section for AI search tab
 */
const AISearchFooterHints: React.FC<{ hasAnalyzed: boolean }> = ({ hasAnalyzed }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="Esc" description="to close" prefix="Press" />
		<KeyboardShortcut
			keys="Enter"
			description="to analyze"
			prefix="Press"
			warning={!hasAnalyzed ? "• Will consume AI tokens" : undefined}
			className="pktw-flex pktw-items-center pktw-gap-1"
		/>
	</div>
);

/**
 * AI search tab, showing analysis summary, sources, and insights.
 */
export const AISearchTab: React.FC<AISearchTabProps> = ({ onClose, onCancel }) => {
	const { searchQuery } = useSharedStore();
	const {
		triggerAnalysis,
		isAnalyzing,
		webEnabled,
		analyzingBeforeFirstToken,
		hasStartedStreaming,
		hasAnalyzed,
		analysisCompleted,
		error,
		currentStep,
		steps,
		stepTrigger,
		isSummaryStreaming,
		summaryChunks,
		graph,
		insightCards,
		suggestions,
		topics,
		sources,
		usage,
		duration,
		recordError,
		resetAnalysisState,
	} = useAIAnalysisStore();
	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [retryTrigger, setRetryTrigger] = useState(0);

	// Memoize summary text calculation to avoid unnecessary joins on every render
	const summary = useMemo(() => summaryChunks.join(''), [summaryChunks]);

	// Determine if we should show the pre-streaming analysis state (centered AI search state)
	const showPreStreamingState = !error
	    // not usefull information to show pre-streaming state
		&& (!isAnalyzing || (analyzingBeforeFirstToken && !hasStartedStreaming))
		// finished analysis, no need to show pre-streaming state
		&& (!analysisCompleted);

	const hasGraphData = graph && graph.nodes.length > 0;

	// Convert AISearchSource[] to SearchResultItem[]
	// todo no code review processed. we should review this later.
	const convertSourcesToSearchResultItems = (aiSources: typeof sources): SearchResultItem[] => {
		return aiSources.map(source => ({
			id: source.id,
			type: 'markdown' as const, // Use markdown as default type
			title: source.title,
			path: source.path,
			lastModified: Date.now(), // Default timestamp since AISearchSource doesn't have this
			content: source.reasoning,
			score: source.score.average,
			source: 'local' as const,
			badges: source.badges,
		}));
	};

	// Convert AISearchGraph to GraphPreview
	// todo no code review processed. we should review this later.
	const convertGraphToGraphPreview = (aiGraph: typeof graph): GraphPreview | null => {
		if (!aiGraph) return null;
		return {
			nodes: aiGraph.nodes.map(node => ({
				id: node.id,
				label: node.title || node.id,
				type: (node.type as any) || 'document', // Cast to valid GraphNodeType or use default
			})),
			edges: aiGraph.edges.map(edge => ({
				from_node_id: edge.source,
				to_node_id: edge.target,
				weight: edge.attributes.weight || 1,
			})),
		};
	};

	// Use custom hook for AI analysis
	const { performAnalysis, cancel } = useAIAnalysis();

	// Only trigger analysis when triggerAnalysis changes AND analysis is not completed
	// Do NOT trigger on searchQuery changes to avoid wasting resources
	// analysisCompleted flag prevents re-triggering when switching tabs
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
		resetAnalysisState();
		setRetryTrigger(prev => prev + 1);
	};

	// Use custom hook for opening in chat
	const handleOpenInChat = useOpenInChat(
		searchQuery,
		summary,
		convertSourcesToSearchResultItems(sources),
		topics,
		recordError,
		onClose
	);

	const [streamingDisplayMethods, setStreamingDisplayMethods] = useState<StreamingDisplayMethods | null>(null);
	const [summaryDisplayMethods, setSummaryDisplayMethods] = useState<StreamingDisplayMethods | null>(null);

	// Handle streaming events for steps and summary
	useSubscribeUIEvent(null, (eventType, payload) => {
		if (eventType === 'summary-delta') {
			summaryDisplayMethods?.appendText(payload.text);
		} else {
			// Handle step events (all step types)
			streamingDisplayMethods?.appendText(payload.text);
		}
	});

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Main Content */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-3 pktw-px-4 pktw-pb-4">
				{error ? (<ErrorState error={error} onRetry={handleRetry} />) : null}

				{/* Analysis Before First Token - Center AISearchState */}
				{showPreStreamingState ? (
					<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-h-full">
						<AISearchState isAnalyzing={isAnalyzing && !analysisCompleted} isSummaryStreaming={isSummaryStreaming} />
					</div>
				) : null}

				{/* Streaming Started - Two Column Layout */}
				{hasStartedStreaming && !analysisCompleted ? (
					<div className="pktw-flex pktw-gap-4 pktw-h-full">
						{/* Left Panel - 30% width */}
						<div className={cn(
							"pktw-flex pktw-flex-col pktw-gap-4 pktw-min-h-0",
							!hasGraphData ? "pktw-w-[100%]" : "pktw-w-[40%]"
						)}>
							{/* Streaming Steps Display - Shows all steps in a continuous scrolling area */}
							<StreamingStepsDisplay
								steps={steps}
								currentStep={currentStep}
								stepTrigger={stepTrigger}
								registerCurrentStepRender={setStreamingDisplayMethods}
							/>

							{/* Summary section when streaming */}
							{isSummaryStreaming && (
								<SummaryContent
									summary={summary}
									registerSummaryRender={setSummaryDisplayMethods}
								/>
							)}

							{/* Incremental Content - Scrollable area */}
							<div className="pktw-flex-1 pktw-overflow-y-auto">
								<IncrementalContent
									insightCards={insightCards}
									topics={topics}
									sources={sources}
								/>
							</div>
						</div>

						{/* Right Panel - 70% width */}
						{hasGraphData ? <div className="pktw-w-[60%] pktw-flex pktw-flex-col pktw-gap-4 pktw-max-h-96">
							{/* Graph Section - Takes most space */}
							<div className="pktw-flex-1">
								{hasGraphData ? (
									<KnowledgeGraphSection graph={convertGraphToGraphPreview(graph)} />
								) : (
									<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-h-full pktw-flex pktw-items-center pktw-justify-center">
										<span className="pktw-text-[#6c757d]">Knowledge graph will appear here...</span>
									</div>
								)}
							</div>

							{/* Suggestions - Small fixed height area */}
							<div className="pktw-h-48">
								{suggestions.length > 0 ? (
									<SuggestionsCard suggestions={suggestions} />
								) : (
									<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-h-full pktw-flex pktw-items-center pktw-justify-center">
										<span className="pktw-text-[#6c757d]">Suggestions will appear here...</span>
									</div>
								)}
							</div>
						</div> : null}
					</div>
				) : null}

				{/* Analysis Completed - Vertical Layout Transition */}
				{analysisCompleted ? (
					<div className="pktw-flex pktw-flex-col pktw-gap-4">
						{/* Summary */}
						{summary && (
							<SummaryContent
								summary={summary}
								registerSummaryRender={setSummaryDisplayMethods}
							/>
						)}

						{/* Topics */}
						{topics.length > 0 && (
							<TagCloudSection topics={topics} />
						)}

						{/* Insight Cards */}
						{insightCards.length > 0 && (
							<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
								<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
									<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Insights</span>
								</div>
								<div className="pktw-grid pktw-grid-cols-1 pktw-md:grid-cols-2 pktw-gap-4">
									{insightCards.map((card) => (
										<div key={card.id} className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-p-4 pktw-shadow-sm">
											<div className="pktw-flex pktw-items-start pktw-gap-3">
												<div className="pktw-w-10 pktw-h-10 pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0" style={{ backgroundColor: card.color + '20' }}>
													<span className="pktw-text-base">{card.icon}</span>
												</div>
												<div className="pktw-flex-1">
													<div className="pktw-font-medium pktw-text-[#2e3338] pktw-mb-2">
														{card.title}
													</div>
													<div className="pktw-text-[#6c757d] pktw-text-sm pktw-leading-relaxed">
														{card.description}
													</div>
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Graph */}
						{hasGraphData && (
							<KnowledgeGraphSection graph={convertGraphToGraphPreview(graph)} />
						)}

						{/* Bottom Two Column Layout - Sources and Suggestions */}
						<div className="pktw-grid pktw-grid-cols-2 pktw-gap-4">
							{/* Sources */}
							{sources.length > 0 && (
								<TopSourcesSection
									sources={convertSourcesToSearchResultItems(sources)}
									onOpen={createOpenSourceCallback(onClose)}
									skipAnimation={true}
								/>
							)}

							{/* Suggestions */}
							{suggestions.length > 0 && (
								<SuggestionsCard suggestions={suggestions} />
							)}
						</div>
					</div>
				) : null}
			</div>

			{/* Footer */}
			<div className="pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0">
				<AISearchFooterHints hasAnalyzed={hasAnalyzed} />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{hasAnalyzed && (
						<>
							{duration !== null && (
								<div className="pktw-text-xs pktw-text-[#999999]">
									Time: <strong className="pktw-text-[#2e3338]">{formatDuration(duration)}</strong>
								</div>
							)}
							{usage && (
								<div className="pktw-text-xs pktw-text-[#999999] pktw-flex pktw-items-center pktw-gap-1">
									<Sparkles className="pktw-w-3 pktw-h-3" />
									<span>
										Used: <strong className="pktw-text-[#2e3338]">~{formatTokenCount(usage.totalTokens ?? 0)} tokens</strong>
									</span>
								</div>
							)}
							<Button
								onClick={() => setShowSaveDialog(true)}
								size="sm"
								variant="outline"
								className="pktw-px-4 pktw-py-1.5 pktw-text-sm pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] !pktw-rounded-md pktw-flex pktw-items-center pktw-gap-2"
							>
								<span>Save to File</span>
								<Save className="pktw-w-3.5 pktw-h-3.5" />
							</Button>
							<Button
								onClick={handleOpenInChat}
								size="sm"
								className="pktw-px-4 pktw-py-1.5 pktw-text-sm pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] !pktw-rounded-md pktw-flex pktw-items-center pktw-gap-2"
							>
								<span>Open in Chat</span>
								<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />
							</Button>
						</>
					)}
				</div>
			</div>

			{/* Save Dialog */}
			{showSaveDialog && (
				<SaveDialog
					onClose={() => setShowSaveDialog(false)}
					query={searchQuery}
					webEnabled={webEnabled}
					result={{
						summary,
						sources: convertSourcesToSearchResultItems(sources),
						insights: hasGraphData ? { graph: convertGraphToGraphPreview(graph)! } : undefined,
						usage: usage ? { estimatedTokens: usage.totalTokens } : undefined,
					}}
				/>
			)}
		</div>
	);
};


