import React from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { AIAnalysisPreStreamingState } from './ai-analysis-state/AIAnalysisPreStreamingState';
import { AIAnalysisErrorState } from './ai-analysis-state/AIAnalysisErrorState';
import { RecentAIAnalysis } from './ai-analysis-sections/RecentAIAnalysis';
import { V2SearchResultView } from './V2SearchResultView';

export interface SearchResultViewProps {
	onClose?: () => void;
	onRetry?: () => void;
	onApprove?: () => void;
	onRegenerateSection?: (id: string, prompt?: string) => void;
}

export const SearchResultView: React.FC<SearchResultViewProps> = ({ onClose, onRetry, onApprove, onRegenerateSection }) => {
	const error = useSearchSessionStore((s) => s.error);
	const isV2Active = useSearchSessionStore((s) => s.v2Active);
	const isStreaming = useSearchSessionStore((s) => s.status === 'streaming');

	if (error) {
		return (
			<AIAnalysisErrorState
				error={error}
				onRetry={onRetry ?? (() => {})}
			/>
		);
	}

	if (isV2Active) {
		return <V2SearchResultView onClose={onClose} onRetry={onRetry} onApprove={onApprove} onRegenerateSection={onRegenerateSection} />;
	}

	// Idle: no V2 active, no error
	return (
		<>
			<AIAnalysisPreStreamingState />
			{!isStreaming && <RecentAIAnalysis onClose={onClose} />}
		</>
	);
};
