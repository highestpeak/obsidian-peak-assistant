import { useCallback, useState } from 'react';
import type { SearchResultItem } from '@/service/search/types';
import type { StreamingCallbacks } from '@/service/chat/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import { getCleanQuery } from '../store/aiAnalysisStore';
import { useSharedStore, useAIAnalysisStore } from '@/ui/view/quick-search/store';
import { useServiceContext } from '@/ui/context/ServiceContext';

export function useAIAnalysis(
	setIsAnalyzing: (analyzing: boolean) => void,
	setHasStartedStreaming: (streaming: boolean) => void,
	setHasAnalyzed: (analyzed: boolean) => void,
	setError: (error: string | null) => void,
	setSummary: (summary: string) => void,
	setIsSummaryStreaming: (streaming: boolean) => void,
	setTopics: (topics: Array<{ label: string; weight: number }>) => void,
	setTopicsRawText: (text: string) => void,
	setGraph: (graph: GraphPreview | null) => void,
	setSources: (sources: SearchResultItem[]) => void,
	setDuration: (duration: number | null) => void,
	setUsage: (usage: any) => void
) {
	const { searchQuery } = useSharedStore();
	const { searchClient } = useServiceContext();
	const { webEnabled } = useAIAnalysisStore();

	// Track streaming summary locally to avoid callback typing issues
	const [streamingSummary, setStreamingSummary] = useState('');
	const [streamingTopicsText, setStreamingTopicsText] = useState('');

	const performAnalysis = useCallback(async () => {

		// Validate query: must have content after removing @web@ and references
		const cleanQuery = getCleanQuery(searchQuery);
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
		setHasAnalyzed(false);
		setError(null);
		setSummary('');
		setIsSummaryStreaming(false);
		setTopics([]);
		setTopicsRawText('');
		setGraph(null);
		setSources([]);
		setDuration(null);
		setStreamingSummary('');
		setStreamingTopicsText('');

		// Setup streaming callbacks to route different stream types to appropriate handlers
		const callbacks: StreamingCallbacks = {
			onStart: (streamType) => {
				console.debug(`[AISearchTab] Stream started: ${streamType}`);
				if (streamType === 'summary') {
					setIsSummaryStreaming(true);
				}
			},
			onDelta: (streamType, delta) => {
				console.debug(`[AISearchTab] Stream delta: ${streamType}`, delta);
				if (streamType === 'summary') {
					// When first summary delta arrives, switch from loading to content display
					setHasStartedStreaming(true);
					setStreamingSummary(prev => {
						const newSummary = prev + delta;
						setSummary(newSummary);
						return newSummary;
					});
				} else if (streamType === 'topics') {
					// Accumulate raw text for topics during streaming
					setStreamingTopicsText(prev => {
						const newText = prev + delta;
						setTopicsRawText(newText);
						return newText;
					});
				}
			},
			onComplete: (streamType, content, metadata) => {
				console.debug(`[AISearchTab] Stream complete: ${streamType}`, content, '|', metadata);
				if (streamType === 'summary') {
					setSummary(content);
					setStreamingSummary('');
					setIsSummaryStreaming(false);
					if (metadata?.estimatedTokens) {
						setUsage({ estimatedTokens: metadata.estimatedTokens });
					}
				} else if (streamType === 'topics') {
					const parsedTopics = metadata?.topics as Array<{ label: string; weight: number }> | undefined;
					// Always set topics (even if empty array) to clear loading state
					setTopics(parsedTopics || []);
					setTopicsRawText(''); // Clear raw text when final topics are ready
					setStreamingTopicsText('');
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
			if (result.summary) {
				setSummary(result.summary);
			}
			setUsage(result.usage ?? {});
			// Duration is already set via callback, but ensure it's set from final result
			if (result.duration !== null && result.duration !== undefined) {
				setDuration(result.duration);
			}

			setHasAnalyzed(true);
			setError(null);
		} catch (err) {
			setHasAnalyzed(false);
			const errorMessage = err instanceof Error
				? err.message
				: 'Failed to connect to AI service. Please check your network connection and try again.';
			setError(errorMessage);
		} finally {
			setIsAnalyzing(false);
			setHasStartedStreaming(false);
			setStreamingSummary('');
			setStreamingTopicsText('');
		}
	}, [
		searchQuery,
		webEnabled,
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
	]);

	return performAnalysis;
}