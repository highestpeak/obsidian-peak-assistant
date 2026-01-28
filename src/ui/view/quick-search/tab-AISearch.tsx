import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, Save, AlertTriangle, MessageCircle, Copy, Lightbulb, Search, Link2, FileQuestion, Zap, TrendingUp, Brain, Target, AlertCircle, History } from 'lucide-react';
import { SaveDialog } from './components/ResultSaveDialog';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import { TagCloudSection } from './components/TagCloudSection';
import { TopSourcesSection } from './components/TopSourcesSection';
import { KnowledgeGraphSection } from './components/KnowledgeGraphSection';
import { StreamingDisplayMethods, StreamingStepsDisplay, SummaryContent } from './components/StepsDisplay';
import { IncrementalContent } from './components/IncrementalContent';
import { SuggestionsCard } from './components/SuggestionsCard';
import { IntelligenceFrame, AnalysisTimer } from './components/IntelligenceFrame';
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
import { AISearchGraph, AISearchSource } from '@/service/agents/AISearchAgent';
import { AnimatePresence, motion } from 'framer-motion';
import { buildMermaidBlock } from '@/ui/view/quick-search/callbacks/save-ai-analyze-to-md';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { saveAiAnalyzeResultToMarkdown } from '@/ui/view/quick-search/callbacks/save-ai-analyze-to-md';

interface AISearchTabProps {
	onClose?: () => void;
	onCancel?: () => void;
	isCancelling?: boolean;
}

/**
 * Error state component for AI search failures
 */
const ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => {
	const [copied, setCopied] = useState(false);
	const [expanded, setExpanded] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(error);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy error:', err);
		}
	};

	return (
		<div className="pktw-w-full pktw-bg-red-50 pktw-border pktw-border-red-200 pktw-rounded-lg pktw-p-3 pktw-mb-2">
			<div className="pktw-flex pktw-items-start pktw-gap-2">
				<div className="pktw-mt-0.5 pktw-flex pktw-items-center pktw-justify-center pktw-w-7 pktw-h-7 pktw-rounded pktw-bg-white/70 pktw-border pktw-border-red-200">
					<AlertTriangle className="pktw-w-4 pktw-h-4 pktw-text-red-500" />
				</div>
				<div className="pktw-flex-1 pktw-min-w-0">
					<div className="pktw-flex pktw-items-center pktw-gap-2">
						<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-text-sm">
							Oops! Something went wrong
						</span>
						<Button
							onClick={() => setExpanded(v => !v)}
							variant="ghost"
							size="sm"
							className="pktw-h-7 pktw-px-2 pktw-text-xs"
						>
							{expanded ? 'Hide details' : 'Show details'}
						</Button>
						<div className="pktw-flex-1" />
						<Button
							onClick={handleCopy}
							variant="ghost"
							size="sm"
							className="pktw-shrink-0 pktw-p-1 pktw-h-7 pktw-w-7"
							title={copied ? 'Copied!' : 'Copy error'}
						>
							<Copy className={`pktw-w-3.5 pktw-h-3.5 ${copied ? 'pktw-text-green-600' : 'pktw-text-[#6c757d]'}`} />
						</Button>
						<Button
							onClick={onRetry}
							className="pktw-h-7 pktw-px-3 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] !pktw-rounded-md pktw-text-xs"
						>
							Try Again
						</Button>
					</div>
					<div className="pktw-text-xs pktw-text-[#6c757d] pktw-mt-1 pktw-line-clamp-2">
						{error}
					</div>
					{expanded ? (
						<pre className="pktw-mt-2 pktw-text-[11px] pktw-leading-relaxed pktw-bg-white/70 pktw-border pktw-border-red-200 pktw-rounded pktw-p-2 pktw-max-h-40 pktw-overflow-auto pktw-whitespace-pre-wrap pktw-break-words">
							{error}
						</pre>
					) : null}
				</div>
			</div>
		</div>
	);
};

/**
 * Combined state component for AI search - shows loading or ready state
 */
const AISearchState: React.FC<{
	isAnalyzing: boolean;
	isSummaryStreaming: boolean;
	startedAtMs?: number | null;
}> = ({ isAnalyzing, isSummaryStreaming, startedAtMs }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<AnimatedSparkles isAnimating={isAnalyzing || isSummaryStreaming} />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2">
			{isAnalyzing || isSummaryStreaming ? 'Analyzing...' : 'Ready to Analyze with AI'}
		</span>
		{startedAtMs && (isAnalyzing || isSummaryStreaming) ? (
			<div className="pktw-mb-2">
				<AnalysisTimer startedAtMs={startedAtMs} isRunning={true} />
			</div>
		) : null}
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

interface InsightCard {
	id: string;
	title: string;
	description: string;
	color: string;
}

const InsightCard: React.FC<{ card: InsightCard }> = ({ card }) => {
	return (
		<div
			className="pktw-bg-white pktw-rounded-lg pktw-overflow-hidden pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/30 pktw-transition-colors pktw-flex"
		>
			{/* Left colored accent bar */}
			<div
				className="pktw-w-1 pktw-flex-shrink-0"
				style={{ backgroundColor: card.color || '#7c3aed' }}
			/>
			<div className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-flex-1">
				{/* Content */}
				<div className="pktw-flex-1 pktw-min-w-0">
					<div className="pktw-font-medium pktw-text-[#2e3338] pktw-text-sm pktw-mb-1 pktw-line-clamp-1">
						{card.title}
					</div>
					<div className="pktw-text-[#6c757d] pktw-text-xs pktw-leading-relaxed pktw-line-clamp-3">
						{card.description}
					</div>
				</div>
			</div>
		</div>
	);
};

// Convert AISearchGraph to GraphPreview
// todo no code review processed. we should review this later.
const convertGraphToGraphPreview = (aiGraph: AISearchGraph | null): GraphPreview | null => {
	if (aiGraph === null || aiGraph === undefined) return null;
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

// Convert AISearchSource[] to SearchResultItem[] with extended fields for TopSourcesSection
const convertSourcesToSearchResultItems = (aiSources: AISearchSource[]): SearchResultItem[] => {
	return aiSources.map(source => ({
		id: source.id,
		type: 'markdown' as const,
		title: source.title,
		path: source.path,
		lastModified: Date.now(),
		content: source.reasoning, // Used for reasoning display
		score: source.score.average,
		source: 'local' as const,
		badges: source.badges,
		scoreDetail: {
			physical: source.score.physical,
			semantic: source.score.semantic,
			average: source.score.average
		}
	}));
};

const checkIfGraphHaveData = (graph: AISearchGraph | null): boolean => {
	return graph !== null && graph !== undefined && graph.nodes.length > 0;
};

const StreamingAnalysis: React.FC<{ 
	onClose?: () => void,
	setStreamingDisplayMethods: (methods: StreamingDisplayMethods) => void
 }> = ({ onClose, setStreamingDisplayMethods }) => {
	const {
		isAnalyzing,
		isSummaryStreaming,
		hasStartedStreaming,
		steps,
		currentStep,
		stepTrigger,
		analysisStartedAtMs,
		analysisCompleted,
		graph,
		duration,
		summaryChunks,
		insightCards,
		topics,
		sources,
		suggestions,
	} = useAIAnalysisStore();

	const hasGraphData = checkIfGraphHaveData(graph);

	// Memoize summary text calculation to avoid unnecessary joins on every render
	const summary = useMemo(() => {
		console.debug('[AISearchTab][StreamingAnalysis] summary concat runned', summaryChunks.length);
		return summaryChunks.join('');
	}, [summaryChunks]);

	return (
		<IntelligenceFrame
			isActive={isAnalyzing || isSummaryStreaming || hasStartedStreaming}
			className="pktw-mb-2"
		>
			<div className="pktw-flex pktw-gap-4 pktw-h-full pktw-p-3">
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
						startedAtMs={analysisStartedAtMs}
						isRunning={isAnalyzing && !analysisCompleted}
						finalDurationMs={analysisCompleted ? duration : null}
					/>

					{/* Summary section when streaming */}
					{isSummaryStreaming && (
						<SummaryContent
							summary={summary}
							startedAtMs={analysisStartedAtMs}
							isRunning={isAnalyzing && !analysisCompleted}
							finalDurationMs={analysisCompleted ? duration : null}
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
							<KnowledgeGraphSection graph={convertGraphToGraphPreview(graph)} analysisCompleted={analysisCompleted} />
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
		</IntelligenceFrame>
	);
};

const CompletedAnalysis: React.FC<{
	onClose?: () => void,
}> = ({ onClose }) => {

	const {
		summaryChunks,
		analysisStartedAtMs,
		duration,
		topics,
		insightCards,
		graph,
		sources,
		suggestions,
	} = useAIAnalysisStore();

	// Memoize summary text calculation to avoid unnecessary joins on every render
	const summary = useMemo(() => {
		console.debug('[AISearchTab][CompletedAnalysis] summary concat runned', summaryChunks.length);
		return summaryChunks.join('');
	}, [summaryChunks]);

	const hasGraphData = checkIfGraphHaveData(graph);

	// Defensive dedupe for completed view (tool/agent may still emit duplicates).
	const dedupedTopics = useMemo(() => {
		const seen = new Set<string>();
		return topics.filter((t) => {
			const key = String((t as any)?.label ?? '').trim().toLowerCase();
			if (!key) return false;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}, [topics]);

	const dedupedInsightCards = useMemo(() => {
		const seen = new Set<string>();
		return insightCards.filter((c: any) => {
			const id = String(c?.id ?? '').trim();
			const title = String(c?.title ?? '').trim().toLowerCase();
			const desc = String(c?.description ?? c?.content ?? '').trim().toLowerCase();
			const key = id ? `id:${id}` : `text:${title}\n${desc}`;
			if (!key.trim()) return false;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}, [insightCards]);

	const dedupedSources = useMemo(() => {
		const seen = new Set<string>();
		return sources.filter((s: any) => {
			const path = String(s?.path ?? '').trim();
			const id = String(s?.id ?? '').trim();
			const key = path ? `path:${path}` : (id ? `id:${id}` : '');
			if (!key) return false;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}, [sources]);

	// Section refs for quick navigation (smooth scroll within the tab container).
	const summaryRef = useRef<HTMLDivElement>(null);
	const topicsRef = useRef<HTMLDivElement>(null);
	const insightsRef = useRef<HTMLDivElement>(null);
	const graphSectionRef = useRef<HTMLDivElement>(null);
	const sourcesRef = useRef<HTMLDivElement>(null);
	const suggestionsRef = useRef<HTMLDivElement>(null);

	const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
		ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	return (
		<IntelligenceFrame isActive={false} className="pktw-mb-2">
			<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-p-3">
				{/* Sticky quick navigation */}
				<div className="pktw-sticky pktw-top-0 pktw-z-10 pktw-pt-1 pktw-bg-white/80 pktw-backdrop-blur-md">
					<div className="pktw-flex pktw-flex-wrap pktw-gap-2 pktw-p-2 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white">
						<Button size="sm" variant="outline" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(summaryRef)}>Summary</Button>
						<Button size="sm" variant="outline" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(topicsRef)}>Topics</Button>
						<Button size="sm" variant="outline" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(insightsRef)}>Insights</Button>
						<Button size="sm" variant="outline" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(graphSectionRef)}>Graph</Button>
						<Button size="sm" variant="outline" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(sourcesRef)}>Sources</Button>
						<Button size="sm" variant="outline" className="pktw-h-7 pktw-px-2 pktw-text-xs" onClick={() => scrollToSection(suggestionsRef)}>Suggestions</Button>
					</div>
				</div>

				{/* Summary */}
				{summary && (
					<div ref={summaryRef} className="pktw-scroll-mt-24">
						<SummaryContent
							summary={summary}
							startedAtMs={analysisStartedAtMs}
							isRunning={false}
							finalDurationMs={duration}
						/>
					</div>
				)}

				{/* Topics */}
				{dedupedTopics.length > 0 && (
					<div ref={topicsRef} className="pktw-scroll-mt-24">
						<TagCloudSection topics={dedupedTopics} />
					</div>
				)}

				{/* Insight Cards - Redesigned with colored accent */}
				{dedupedInsightCards.length > 0 && (
					<div ref={insightsRef} className="pktw-scroll-mt-24 pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
						<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
							<Lightbulb className="pktw-w-4 pktw-h-4 pktw-text-[#f59e0b]" />
							<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Insights</span>
							<span className="pktw-text-xs pktw-text-[#999999]">({dedupedInsightCards.length})</span>
						</div>
						<div className="pktw-grid pktw-grid-cols-1 pktw-md:grid-cols-2 pktw-gap-3">
							{dedupedInsightCards.map((card: InsightCard) => (
								<InsightCard key={card.id} card={card} />
							))}
						</div>
					</div>
				)}

				{/* Graph */}
				{hasGraphData && (
					<div ref={graphSectionRef} className="pktw-scroll-mt-24">
						<KnowledgeGraphSection graph={convertGraphToGraphPreview(graph)} analysisCompleted={true} />
					</div>
				)}

				{/* Bottom Layout - Full width sections */}
				<div className="pktw-flex pktw-flex-col pktw-gap-4">
					{/* Sources (full width) */}
					{dedupedSources.length > 0 && (
						<div ref={sourcesRef} className="pktw-scroll-mt-24">
							<TopSourcesSection
								sources={convertSourcesToSearchResultItems(dedupedSources)}
								onOpen={createOpenSourceCallback(onClose)}
								skipAnimation={true}
							/>
						</div>
					)}

					{/* Suggestions (full width) */}
					{suggestions.length > 0 && (
						<div ref={suggestionsRef} className="pktw-scroll-mt-24">
							<SuggestionsCard suggestions={suggestions} />
						</div>
					)}
				</div>
			</div>
		</IntelligenceFrame>
	);
};

/**
 * AI search tab, showing analysis summary, sources, and insights.
 */
export const AISearchTab: React.FC<AISearchTabProps> = ({ onClose, onCancel }) => {
	const { searchQuery } = useSharedStore();
	const { app, plugin } = useServiceContext();
	const {
		triggerAnalysis,
		isAnalyzing,
		webEnabled,
		analyzingBeforeFirstToken,
		hasStartedStreaming,
		hasAnalyzed,
		analysisCompleted,
		error,
		isSummaryStreaming,
		analysisStartedAtMs,
		graph,
		topics,
		sources,
		usage,
		duration,
		summaryChunks,
		recordError,
		resetAnalysisState,
	} = useAIAnalysisStore();
	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [retryTrigger, setRetryTrigger] = useState(0);
	const [copiedAll, setCopiedAll] = useState(false);
	const [recentHistory, setRecentHistory] = useState(() => plugin.settings.search.aiAnalysisRecentHistory ?? []);

	const autoSaveEnabled = plugin.settings.search.aiAnalysisAutoSaveEnabled ?? true;
	const autoSaveFolder = plugin.settings.search.aiAnalysisAutoSaveFolder ?? 'Analysis/AI Searches';
	const historyLimit = plugin.settings.search.aiAnalysisHistoryLimit ?? 5;
	const lastAutoSaveKeyRef = useRef<string>('');

	// Determine if we should show the pre-streaming analysis state (centered AI search state)
	const showPreStreamingState = !error
		// not usefull information to show pre-streaming state
		&& (!isAnalyzing || (analyzingBeforeFirstToken && !hasStartedStreaming))
		// finished analysis, no need to show pre-streaming state
		&& (!analysisCompleted);

	const hasGraphData = checkIfGraphHaveData(graph);

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

	// Memoize summary text calculation to avoid unnecessary joins on every render
	const summary = useMemo(() => {
		console.debug('[AISearchTab][CompletedAnalysis] summary concat runned', summaryChunks.length);
		return summaryChunks.join('');
	}, [summaryChunks]);

	// Auto-save when analysis completes (if enabled).
	useEffect(() => {
		if (!analysisCompleted) return;
		if (!autoSaveEnabled) return;
		if (error) return;
		if (!summary.trim()) return;

		// Guard to avoid double-saving on rerenders.
		const saveKey = `${analysisStartedAtMs ?? ''}::${summary.length}::${sources.length}::${topics.length}`;
		if (lastAutoSaveKeyRef.current === saveKey) return;
		lastAutoSaveKeyRef.current = saveKey;

		const doSave = async () => {
			try {
				const today = new Date().toISOString().slice(0, 10);
				const fileName = `AI Analysis - ${searchQuery.slice(0, 48) || 'Query'} - ${today}`;
				const graphPreview = hasGraphData ? convertGraphToGraphPreview(graph) : undefined;

				const saved = await saveAiAnalyzeResultToMarkdown(app, {
					folderPath: autoSaveFolder,
					fileName,
					query: searchQuery,
					result: {
						summary,
						sources: convertSourcesToSearchResultItems(sources),
						insights: {
							topics,
							...(graphPreview ? { graph: graphPreview } : {}),
						},
						usage: usage ? { estimatedTokens: usage.totalTokens ?? 0 } : undefined,
					},
					webEnabled,
				});

				const entry = { path: saved.path, query: searchQuery, createdAt: new Date().toISOString() };
				const next = [entry, ...(plugin.settings.search.aiAnalysisRecentHistory ?? [])]
					.filter((e, idx, arr) => arr.findIndex(x => x.path === e.path) === idx)
					.slice(0, historyLimit);
				plugin.settings.search.aiAnalysisRecentHistory = next;
				await plugin.saveSettings();
				setRecentHistory(next);
			} catch (e) {
				console.warn('[AISearchTab] auto-save failed:', e);
			}
		};

		void doSave();
	}, [
		analysisCompleted,
		autoSaveEnabled,
		error,
		summary,
		analysisStartedAtMs,
		sources,
		topics,
		searchQuery,
		app,
		autoSaveFolder,
		historyLimit,
		plugin,
		usage,
		hasGraphData,
		graph,
		webEnabled,
	]);

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

	// Handle streaming events for steps and summary
	useSubscribeUIEvent(null, (eventType, payload) => {
		// Only append actual text deltas to the incremental renderer.
		// Tool events may publish payloads without a `text` field.
		const text = typeof payload?.text === 'string' ? payload.text : '';
		if (!text) return;

		// Handle step events (all step types)
		streamingDisplayMethods?.appendText(text);
	});

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Main Content */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-3 pktw-px-4 pktw-pb-4">
				{error ? (<ErrorState error={error} onRetry={handleRetry} />) : null}

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
							{recentHistory.length > 0 ? (
								<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
									<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
										<History className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
										<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Recent AI Analysis</span>
										<span className="pktw-text-xs pktw-text-[#999999]">({Math.min(recentHistory.length, historyLimit)})</span>
									</div>
									<div className="pktw-space-y-2">
										{recentHistory.slice(0, historyLimit).map((item) => (
											<button
												key={item.path}
												type="button"
												className="pktw-w-full pktw-text-left pktw-p-3 pktw-rounded-md pktw-bg-white pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/30 pktw-transition-colors"
												onClick={() => createOpenSourceCallback(onClose)(item.path)}
												title={item.path}
											>
												<div className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-line-clamp-1">
													{item.query || '(empty query)'}
												</div>
												<div className="pktw-text-[11px] pktw-text-[#9ca3af] pktw-mt-1 pktw-flex pktw-gap-2">
													<span>{new Date(item.createdAt).toLocaleString()}</span>
													<span className="pktw-truncate">{item.path}</span>
												</div>
											</button>
										))}
									</div>
									{!autoSaveEnabled ? (
										<div className="pktw-mt-3 pktw-text-xs pktw-text-[#9ca3af]">
											Auto-save is disabled. Turn it on in Settings, or use “Save to File” after analysis.
										</div>
									) : null}
								</div>
							) : null}

							<AISearchState
								isAnalyzing={isAnalyzing && !analysisCompleted}
								isSummaryStreaming={isSummaryStreaming}
								startedAtMs={analysisStartedAtMs}
							/>
						</motion.div>
					) : null}

					{/* Streaming Started - Two Column Layout */}
					{hasStartedStreaming && !analysisCompleted ? (
						<motion.div
							key="stream"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.25 }}
						>
							<StreamingAnalysis
								onClose={onClose}
								setStreamingDisplayMethods={setStreamingDisplayMethods}
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
							<CompletedAnalysis
								onClose={onClose}
							/>
						</motion.div>
					) : null}
				</AnimatePresence>
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
								onClick={async () => {
									try {
										const graphPreview = hasGraphData ? convertGraphToGraphPreview(graph) : null;
										const md: string[] = [];
										md.push('# AI Analysis');
										md.push('');
										md.push(summary || '(empty)');
										md.push('');
										if (topics?.length) {
											md.push('## Key Topics');
											for (const t of topics) md.push(`- ${t.label}`);
											md.push('');
										}
										if ((useAIAnalysisStore.getState().insightCards ?? []).length) {
											md.push('## Insights');
											for (const c of useAIAnalysisStore.getState().insightCards) {
												md.push(`- **${c.title}**: ${c.description}`);
											}
											md.push('');
										}
										if ((useAIAnalysisStore.getState().suggestions ?? []).length) {
											md.push('## Suggestions');
											for (const s of useAIAnalysisStore.getState().suggestions) {
												md.push(`- **${s.title}**: ${s.description}`);
											}
											md.push('');
										}
										if (sources?.length) {
											md.push('## Sources');
											for (const s of convertSourcesToSearchResultItems(sources)) {
												const score = s.scoreDetail?.average ?? s.finalScore ?? s.score;
												md.push(`- \`${s.path}\`${score != null ? ` (score: ${Number(score).toFixed(2)})` : ''}`);
											}
											md.push('');
										}
										if (graphPreview) {
											md.push('## Knowledge Graph (Mermaid)');
											md.push(buildMermaidBlock(graphPreview));
											md.push('');
										}
										md.push('## Query');
										md.push(searchQuery);
										md.push('');

										await navigator.clipboard.writeText(md.join('\n'));
										setCopiedAll(true);
										setTimeout(() => setCopiedAll(false), 1200);
									} catch (e) {
										console.warn('[AISearchTab] copy all failed:', e);
									}
								}}
								size="sm"
								variant="outline"
								className="pktw-px-4 pktw-py-1.5 pktw-text-sm pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#f3f4f6] !pktw-rounded-md pktw-flex pktw-items-center pktw-gap-2"
								title="Copy summary + topics + insights + sources + mermaid"
							>
								<span>{copiedAll ? 'Copied!' : 'Copy All'}</span>
								<Copy className="pktw-w-3.5 pktw-h-3.5" />
							</Button>
							<div className="pktw-flex pktw-flex-col pktw-items-stretch pktw-gap-1">
								<Button
									onClick={() => setShowSaveDialog(true)}
									size="sm"
									variant="outline"
									className="pktw-px-4 pktw-py-1.5 pktw-text-sm pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] !pktw-rounded-md pktw-flex pktw-items-center pktw-gap-2"
								>
									<span>Save to File</span>
									<Save className="pktw-w-3.5 pktw-h-3.5" />
								</Button>
								{!autoSaveEnabled ? (
									<span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-text-center">
										Auto-save is off
									</span>
								) : null}
							</div>
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
						insights: {
							topics: topics,
							...(hasGraphData ? { graph: convertGraphToGraphPreview(graph)! } : {}),
						},
						usage: usage ? { estimatedTokens: usage.totalTokens } : undefined,
					}}
				/>
			)}
		</div>
	);
};


