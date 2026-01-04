import React, { useState, useEffect } from 'react';
import { Sparkles, Save, FileText, TrendingUp, AlertCircle, AlertTriangle, Globe, MessageCircle, Database } from 'lucide-react';
import { GraphVisualization } from './components/GraphVisualization';
import { TagCloud } from './components/TagCloud';
import { SaveDialog } from './components/ResultSaveDialog';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Streamdown } from 'streamdown';
import { formatDuration, formatTokenCount } from '@/core/utils/format-utils';
import { mixSearchResultsBySource } from '@/core/utils/source-mixer';
import { EventBus, SelectionChangedEvent } from '@/core/eventBus';
import { CHAT_VIEW_TYPE } from '@/app/view/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { SearchResultItem, SearchResultSource } from '@/service/search/types';
import type { StreamingCallbacks } from '@/service/chat/types';
import type { GraphPreview } from '@/core/storage/graph/types';

interface AISearchTabProps {
	searchQuery: string;
	triggerAnalysis: number;
	searchClient: SearchClient | null;
	webEnabled: boolean;
	onWebEnabledChange: (enabled: boolean) => void;
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
 * Loading state component showing analysis in progress
 */
const LoadingState: React.FC = () => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-bg-violet-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<Sparkles className="pktw-w-8 pktw-h-8 pktw-text-primary pktw-animate-pulse" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2">
			Analyzing...
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d]">
			AI is processing your query and searching through your vault...
		</span>
	</div>
);

/**
 * Empty state component when waiting for analysis trigger
 */
const EmptyState: React.FC = () => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-bg-violet-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<Sparkles className="pktw-w-8 pktw-h-8 pktw-text-primary" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2">
			Ready to Analyze with AI
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4 pktw-max-w-md">
			Enter your question and click <strong>Analyze</strong> or press <strong>Enter</strong> to
			start deep knowledge retrieval. The system will automatically choose the best search
			strategy.
		</span>
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-amber-600 pktw-bg-amber-50 pktw-px-3 pktw-py-2 pktw-rounded-md">
			<AlertCircle className="pktw-w-4 pktw-h-4" />
			<span>This action will consume AI tokens</span>
		</div>
	</div>
);

/**
 * AI analysis result section component
 */
const AnalysisSection: React.FC<{ summary: string; isStreaming: boolean }> = ({ summary, isStreaming }) => (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-text-lg">AI Analysis</span>
		</div>
		<div className="pktw-space-y-3 pktw-text-sm pktw-text-[#2e3338] pktw-leading-relaxed">
			<div className="pktw-select-text" data-streamdown-root>
				{summary ? (
					<Streamdown isAnimating={isStreaming}>{summary}</Streamdown>
				) : (
					<span className="pktw-text-[#999999]">No summary available.</span>
				)}
			</div>
		</div>
	</div>
);

/**
 * Tag cloud section component
 */
const TagCloudSection: React.FC<{
	topics?: Array<{ label: string; weight: number }>;
	topicsRawText?: string;
}> = ({ topics, topicsRawText }) => {
	const showRawText = topicsRawText && (!topics || topics.length === 0);
	const scrollContainerRef = React.useRef<HTMLDivElement>(null);

	// Auto-scroll to the right when new text is added
	React.useEffect(() => {
		if (showRawText && scrollContainerRef.current) {
			const container = scrollContainerRef.current;
			// Scroll to the rightmost position
			container.scrollLeft = container.scrollWidth;
		}
	}, [topicsRawText, showRawText]);

	return (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Key Topics</span>
		</div>
			{showRawText ? (
				<div
					ref={scrollContainerRef}
					className="pktw-w-full pktw-overflow-x-auto pktw-py-2 pktw-scroll-smooth"
				>
					<div className="pktw-text-xs pktw-text-[#6c757d] pktw-font-mono pktw-whitespace-nowrap pktw-animate-pulse">
						{topicsRawText}
						<span className="pktw-inline-block pktw-w-2 pktw-h-4 pktw-bg-[#7c3aed] pktw-ml-1 pktw-animate-pulse" />
					</div>
				</div>
			) : (
				<TagCloud topics={topics} />
			)}
		<span className="pktw-text-xs pktw-text-[#999999] pktw-mt-3">
			Click any topic to search
		</span>
	</div>
);
};

/**
 * Get icon for search result source
 */
const getSourceIcon = (source?: SearchResultSource) => {
	switch (source) {
		case 'web':
			return <Globe className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#3b82f6]" />;
		case 'x':
			return <Database className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#8b5cf6]" />;
		case 'local':
		default:
			return <FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />;
	}
};

/**
 * Top sources section component showing relevant files with staggered animation
 */
const TopSourcesSection: React.FC<{
	sources: SearchResultItem[];
	onOpen: (path: string) => void;
}> = ({ sources, onOpen }) => {
	const [visibleCount, setVisibleCount] = React.useState(0);

	// Apply source mixing strategy (ensure minimum 2 items per source, then interleave)
	const mixedSources = React.useMemo(() => {
		return mixSearchResultsBySource(sources, 2);
	}, [sources]);

	React.useEffect(() => {
		if (mixedSources.length === 0) {
			setVisibleCount(0);
			return;
		}

		// Reset and animate items one by one
		setVisibleCount(0);
		let current = 0;
		const interval = setInterval(() => {
			current++;
			setVisibleCount(current);
			if (current >= mixedSources.length) {
				clearInterval(interval);
			}
		}, 100); // Show one item every 100ms

		return () => clearInterval(interval);
	}, [mixedSources.length]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Top Sources</span>
				<span className="pktw-text-xs pktw-text-[#999999]">({mixedSources.length} files)</span>
			</div>
			<div className="pktw-space-y-2">
				{mixedSources.slice(0, visibleCount).map((source, index) => (
					<div
						key={source.id || index}
						className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-2 pktw-rounded hover:pktw-bg-[#f5f5f5] pktw-cursor-pointer pktw-transition-all pktw-group"
						style={{
							opacity: 0,
							transform: 'translateY(-8px)',
							animation: `fadeInSlide 0.3s ease-out ${index * 0.1}s forwards`
						}}
						onClick={() => onOpen(source.path)}
					>
						<div
							className="pktw-w-1 pktw-h-8 pktw-bg-[#7c3aed] pktw-rounded-full"
							style={{ opacity: Math.max(0.3, Math.min(1, ((source.finalScore ?? source.score ?? 0) + 1) / 10)) }}
						/>
						{/* Source icon */}
						<div className="pktw-flex-shrink-0">
							{getSourceIcon(source.source)}
						</div>
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-text-sm pktw-text-[#2e3338] pktw-truncate group-hover:pktw-text-[#7c3aed]">
								{source.title}
							</div>
							<div className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
								{source.path}
							</div>
						</div>
						<div className="pktw-text-xs pktw-text-[#6c757d] pktw-font-medium">
							{(source.finalScore ?? source.score) ? (source.finalScore ?? source.score ?? 0).toFixed(2) : ''}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

/**
 * Knowledge graph section component
 */
const KnowledgeGraphSection: React.FC<{ graph?: GraphPreview | null }> = ({ graph }) => (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<TrendingUp className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
				Knowledge Graph
			</span>
		</div>
		<GraphVisualization graph={graph} />
		<span className="pktw-text-xs pktw-text-[#999999] pktw-mt-2 pktw-text-center">
			2-3 hop relationships
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
export const AISearchTab: React.FC<AISearchTabProps> = ({ searchQuery, triggerAnalysis, searchClient, webEnabled, onWebEnabledChange, onClose }) => {
	const [isAnalyzing, setIsAnalyzing] = useState(false);
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
	const { app, manager, viewManager } = useServiceContext();

	const performAnalysis = async () => {
		// Validate query: must have content after removing @web
		const cleanQuery = searchQuery.replace(/@web\s*/g, '').trim();
		if (!cleanQuery) {
			setError('Please enter a search query.');
			return;
		}
		if (!searchClient) {
			setError('Search service is not ready yet. Please try again.');
			return;
		}
		setIsAnalyzing(true);
		setHasStartedStreaming(false);
		setError(null);
		setSummary('');
		setIsSummaryStreaming(false);
		setTopics([]);
		setTopicsRawText('');
		setGraph(null);
		setSources([]);
		setDuration(null);

		// Setup streaming callbacks to route different stream types to appropriate handlers
		const callbacks: StreamingCallbacks = {
			onStart: (streamType) => {
				console.debug(`[AISearchTab] Stream started: ${streamType}`);
				if (streamType === 'summary') {
					setIsSummaryStreaming(true);
				}
			},
			onDelta: (streamType, delta) => {
				if (streamType === 'summary') {
					// When first summary delta arrives, switch from loading to content display
					setHasStartedStreaming(prev => {
						if (!prev) {
							return true; // First delta received
						}
						return prev;
					});
					setSummary(prev => prev + delta);
				} else if (streamType === 'topics') {
					// Accumulate raw text for topics during streaming
					setTopicsRawText(prev => prev + delta);
				}
			},
			onComplete: (streamType, content, metadata) => {
				if (streamType === 'summary') {
					setSummary(content);
					setIsSummaryStreaming(false);
					if (metadata?.estimatedTokens) {
						setUsage(prev => ({ ...prev, estimatedTokens: metadata.estimatedTokens }));
					}
				} else if (streamType === 'topics') {
					const parsedTopics = metadata?.topics as Array<{ label: string; weight: number }> | undefined;
					// Always set topics (even if empty array) to clear loading state
					setTopics(parsedTopics || []);
					setTopicsRawText(''); // Clear raw text when final topics are ready
				} else if (streamType === 'graph') {
					const graphData = metadata?.graph as GraphPreview | undefined;
					if (graphData) {
						setGraph(graphData);
					}
				} else if (streamType === 'other') {
					// Sources are available immediately after search completes
					if (metadata?.sources) {
						setSources(metadata.sources as SearchResultItem[]);
					}
					if (metadata?.duration !== undefined) {
						setDuration(metadata.duration as number);
					}
				}
			},
			onError: (streamType, err) => {
				console.error(`[AISearchTab] Stream error (${streamType}):`, err);
				setError(err instanceof Error ? err.message : 'An error occurred during analysis');
			},
		};

		try {
			const result = await searchClient.aiAnalyze({ query: searchQuery, topK: 8, webEnabled }, callbacks);
			console.debug(`[AISearchTab] AI analyze result:`, result);

			// Set final values (sources and duration are already set via callback)
			if (result.insights?.graph) {
				setGraph(result.insights.graph);
			}
			if (result.insights?.topics) {
				setTopics(result.insights.topics);
				setTopicsRawText(''); // Clear raw text if final topics are set
			}
			if (!summary && result.summary) {
			setSummary(result.summary);
			}
			setUsage(result.usage ?? {});
			// Duration is already set via callback, but ensure it's set from final result
			if (result.duration !== null && result.duration !== undefined) {
				setDuration(result.duration);
			}

			setIsAnalyzing(false);
			setHasAnalyzed(true);
			setError(null);
		} catch (err) {
			setIsAnalyzing(false);
			setHasAnalyzed(false);
			setHasStartedStreaming(false);
			const errorMessage = err instanceof Error
				? err.message
				: 'Failed to connect to AI service. Please check your network connection and try again.';
			setError(errorMessage);
		}
	};

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

	const handleOpenSource = async (path: string) => {
		try {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) {
				await app.workspace.getLeaf(false).openFile(file as any);
			}
		} catch (e) {
			console.error('Open source failed:', e);
		}
	};

	const handleOpenInChat = async () => {
		try {
			console.debug('[AISearchTab] handleOpenInChat called', {
				query: searchQuery,
				sourcesCount: sources.length,
				topicsCount: topics.length,
			});

			// Step 1: Create conversation from search analysis
			console.debug('[AISearchTab] Step 1: Creating conversation from search analysis...');
			const conversation = await manager.createConvFromSearchAIAnalysis({
				query: searchQuery,
				summary: summary,
				sources: sources,
				topics: topics.length > 0 ? topics : undefined,
			});
			console.debug('[AISearchTab] Conversation created', {
				conversationId: conversation.meta.id,
				projectId: conversation.meta.projectId ?? null,
			});

			// Step 2: Wait for conversation to be fully persisted
			console.debug('[AISearchTab] Step 2: Waiting for conversation persistence...');
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					setTimeout(() => resolve(), 50);
				});
			});
			console.debug('[AISearchTab] Conversation persistence wait completed');

			// Step 3: Activate chat view
			console.debug('[AISearchTab] Step 3: Activating chat view...');
			if (viewManager) {
				const handler = viewManager.getViewSwitchConsistentHandler();
				if (handler) {
					await handler.activateChatView();
					console.debug('[AISearchTab] Chat view activated');
				} else {
					console.warn('[AISearchTab] ViewSwitchConsistentHandler not available');
				}
			} else {
				console.warn('[AISearchTab] ViewManager not available');
			}

			// Step 4: Wait for chat view to be ready
			console.debug('[AISearchTab] Step 4: Waiting for chat view to be ready...');
			let retries = 0;
			let chatViewReady = false;
			while (retries < 20) { // Increased retries for more reliable loading
				const chatLeaves = app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
				if (chatLeaves.length > 0 && chatLeaves[0]?.view) {
					console.debug('[AISearchTab] Chat view is ready', { retries });
					chatViewReady = true;
					break;
				}
				await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay
				retries++;
			}
			if (!chatViewReady) {
				console.warn('[AISearchTab] Chat view not ready after 20 retries');
			}

			// Step 5: Wait a bit more to ensure view is fully initialized
			await new Promise(resolve => setTimeout(resolve, 200));

			// Step 6: Dispatch selection change event
			console.debug('[AISearchTab] Step 6: Dispatching SelectionChangedEvent...');
			const eventBus = EventBus.getInstance(app);
			eventBus.dispatch(new SelectionChangedEvent({
				conversationId: conversation.meta.id,
				projectId: conversation.meta.projectId ?? null,
			}));
			console.debug('[AISearchTab] SelectionChangedEvent dispatched successfully');

			// Step 7: Wait a bit more to ensure event is processed
			await new Promise(resolve => setTimeout(resolve, 100));

			// Step 8: Close the search modal
			console.debug('[AISearchTab] Step 8: Closing search modal...');
			onClose?.();
		} catch (e) {
			console.error('[AISearchTab] Open in chat failed:', e);
			setError(e instanceof Error ? e.message : 'Failed to open in chat');
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Main Content */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-3 pktw-px-4 pktw-pb-4">
				{error ? (
					<ErrorState error={error} onRetry={handleRetry} />
				) : !hasStartedStreaming && !hasAnalyzed && sources.length === 0 ? (
					isAnalyzing ? <LoadingState /> : <EmptyState />
				) : (
					// Analysis Results - Keep original order: AI Analysis first, then Top Sources
					<div className="pktw-flex pktw-flex-col pktw-gap-4">
						{/* AI Analysis section: show loading state immediately when analyzing, content when streaming */}
						{isAnalyzing || hasStartedStreaming || hasAnalyzed ? (
							!hasStartedStreaming && isAnalyzing ? (
								// Show loading state for AI Analysis while waiting for first token
								<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
									<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
										<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed] pktw-animate-pulse" />
										<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-text-lg">AI Analysis</span>
									</div>
									<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-sm pktw-text-[#6c757d]">
										<span>Analyzing...</span>
									</div>
								</div>
							) : (
								// Show content when streaming has started
								<AnalysisSection summary={summary} isStreaming={isSummaryStreaming} />
							)
						) : null}

						{/* Show topics section only if topics have started generating (raw text) or are complete */}
						{(topicsRawText || topics.length > 0) && (
							<TagCloudSection topics={topics} topicsRawText={topicsRawText} />
						)}

						{/* Show sources immediately after search completes (before AI analysis completes) */}
						{sources.length > 0 && (
							hasAnalyzed && graph ? (
						<div className="pktw-grid pktw-grid-cols-2 pktw-gap-4">
							<TopSourcesSection sources={sources} onOpen={handleOpenSource} />
							<KnowledgeGraphSection graph={graph} />
						</div>
							) : (
								<TopSourcesSection sources={sources} onOpen={handleOpenSource} />
							)
						)}
					</div>
				)}
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
								className="pktw-px-4 pktw-py-1.5 pktw-text-sm pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#f9fafb] !pktw-rounded-md pktw-flex pktw-items-center pktw-gap-2"
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


