import React, { useState, useEffect } from 'react';
import { Sparkles, Save, AlertTriangle, MessageCircle } from 'lucide-react';
import { SaveDialog } from './components/ResultSaveDialog';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import { AnalysisSection } from './components/AnalysisSection';
import { TagCloudSection } from './components/TagCloudSection';
import { TopSourcesSection } from './components/TopSourcesSection';
import { KnowledgeGraphSection } from './components/KnowledgeGraphSection';
import { Button } from '@/ui/component/shared-ui/button';
import { AnimatedSparkles } from '@/ui/component/mine';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { formatDuration, formatTokenCount } from '@/core/utils/format-utils';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import { useSharedStore, useAIAnalysisStore } from './store';
import { useOpenInChat } from './hooks/useOpenInChat';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { useAIAnalysis } from './hooks/useAIAnalysis';

interface AISearchTabProps {
	onClose?: () => void;
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
export const AISearchTab: React.FC<AISearchTabProps> = ({ onClose }) => {
	const { searchQuery, setSearchQuery } = useSharedStore();
	const { triggerAnalysis, webEnabled, updateWebFromQuery } = useAIAnalysisStore();
	const [isAnalyzing, setIsAnalyzing] = useState(false);

	// Detect @web@ trigger in search query (don't remove from display, just enable web mode)
	useEffect(() => {
		updateWebFromQuery(searchQuery);
	}, [searchQuery, updateWebFromQuery]);

	const [hasAnalyzed, setHasAnalyzed] = useState(false);
	const [hasStartedStreaming, setHasStartedStreaming] = useState(false);
	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [retryTrigger, setRetryTrigger] = useState(0);
	const [summary, setSummary] = useState('');
	const [isSummaryStreaming, setIsSummaryStreaming] = useState(false);
	const [sources, setSources] = useState<SearchResultItem[]>([]);
	const [graph, setGraph] = useState<GraphPreview | null>(null);
	const [topics, setTopics] = useState<Array<{ label: string; weight: number }>>([]);
	const [topicsRawText, setTopicsRawText] = useState('');
	const [usage, setUsage] = useState<{ estimatedTokens?: number }>({});
	const [duration, setDuration] = useState<number | null>(null);
	const { app, manager, viewManager, searchClient } = useServiceContext();

	// Use custom hook for AI analysis
	const performAnalysis = useAIAnalysis(
		setIsAnalyzing,
		setHasStartedStreaming,
		setHasAnalyzed,
		setError,
		setSummary,
		setIsSummaryStreaming,
		setTopics,
		setTopicsRawText,
		setGraph,
		setSources,
		setDuration,
		setUsage
	);

	// Only trigger analysis when triggerAnalysis changes (user explicitly clicks Analyze or presses Enter)
	// Do NOT trigger on searchQuery changes to avoid wasting resources
	useEffect(() => {
		if (triggerAnalysis > 0 && searchQuery.trim()) {
			performAnalysis();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [triggerAnalysis]); // Only depend on triggerAnalysis, not searchQuery

	// Retry also only triggers on retryTrigger change
	useEffect(() => {
		if (retryTrigger > 0 && searchQuery.trim()) {
			performAnalysis();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [retryTrigger]); // Only depend on retryTrigger, not searchQuery

	const handleRetry = () => {
		setError(null);
		setHasAnalyzed(false);
		setRetryTrigger(prev => prev + 1);
	};

	// Use custom hook for opening in chat
	const handleOpenInChat = useOpenInChat(
		app,
		manager,
		viewManager,
		searchQuery,
		summary,
		sources,
		topics,
		setError,
		onClose
	);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Main Content */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-3 pktw-px-4 pktw-pb-4">
				{error ? (<ErrorState error={error} onRetry={handleRetry} />) : null}

				{isAnalyzing || !hasStartedStreaming && !hasAnalyzed ? (
					// Ready state - show selected text references and ready state
					<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-mb-4">
						<AISearchState isAnalyzing={isAnalyzing} isSummaryStreaming={isSummaryStreaming} />
					</div>
				) : null}


				{/* Analysis Results - Keep original order: AI Analysis first, then Top Sources */}
				<div className="pktw-flex pktw-flex-col pktw-gap-4">
					{/* AI Analysis section: show loading state immediately when analyzing, content when streaming */}
					{hasStartedStreaming || hasAnalyzed ? (
						// Show content when streaming has started
						<AnalysisSection summary={summary} isStreaming={isSummaryStreaming} />
					) : null}

					{/* Show topics section only if topics have started generating (raw text) or are complete */}
					{(topicsRawText || topics.length > 0) && (
						<TagCloudSection topics={topics} topicsRawText={topicsRawText} />
					)}

					{/* Show sources immediately after search completes (before AI analysis completes) */}
					{sources.length > 0 ? (
						hasAnalyzed && graph ? (
							<div className="pktw-grid pktw-grid-cols-2 pktw-gap-4">
								<TopSourcesSection sources={sources} onOpen={createOpenSourceCallback(onClose)} />
								<KnowledgeGraphSection graph={graph} />
							</div>
						) : (
							<TopSourcesSection sources={sources} onOpen={createOpenSourceCallback(onClose)} />
						)
					) : null}
				</div>
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
							{usage.estimatedTokens && (
								<div className="pktw-text-xs pktw-text-[#999999] pktw-flex pktw-items-center pktw-gap-1">
									<Sparkles className="pktw-w-3 pktw-h-3" />
									<span>
										Used: <strong className="pktw-text-[#2e3338]">~{formatTokenCount(usage.estimatedTokens)} tokens</strong>
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
						sources,
						insights: graph ? { graph } : undefined,
						usage,
					}}
				/>
			)}
		</div>
	);
};


