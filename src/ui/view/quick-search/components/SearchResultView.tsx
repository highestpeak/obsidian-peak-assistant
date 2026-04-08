import React from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { StepList } from './StepList';
import { AIAnalysisPreStreamingState } from './ai-analysis-state/AIAnalysisPreStreamingState';
import { AIAnalysisErrorState } from './ai-analysis-state/AIAnalysisErrorState';
import { RecentAIAnalysis } from './ai-analysis-sections/RecentAIAnalysis';
import { createOpenSourceCallback } from '../callbacks/open-source-file';

export interface SearchResultViewProps {
	onClose?: () => void;
	onRetry?: () => void;
}

export const SearchResultView: React.FC<SearchResultViewProps> = ({ onClose, onRetry }) => {
	const error = useSearchSessionStore((s) => s.error);
	const steps = useSearchSessionStore((s) => s.steps);
	const startedAt = useSearchSessionStore((s) => s.startedAt);
	const duration = useSearchSessionStore((s) => s.duration);

	const handleOpenWikilink = createOpenSourceCallback(onClose);

	// Error state
	if (error) {
		return (
			<AIAnalysisErrorState
				error={error}
				onRetry={onRetry ?? (() => {})}
			/>
		);
	}

	// Idle state: no steps yet, no error
	if (steps.length === 0) {
		return (
			<>
				<AIAnalysisPreStreamingState />
				<RecentAIAnalysis onClose={onClose} />
			</>
		);
	}

	// Steps available
	return (
		<StepList
			steps={steps}
			onClose={onClose}
			startedAtMs={startedAt}
			durationMs={duration}
			onOpenWikilink={handleOpenWikilink}
		/>
	);
};
