import React from 'react';
import type { FollowupStep as FollowupStepType } from '../../types/search-steps';
import { FollowupQuestionsBlock } from '../ai-analysis-sections/FollowupQuestionsBlock';
import { useSearchSessionStore } from '../../store/searchSessionStore';

export const FollowupStep: React.FC<{ step: FollowupStepType; onClose?: () => void }> = ({ step, onClose }) => {
	const summaryStep = useSearchSessionStore((s) => s.getStep('summary'));
	const summaryText = summaryStep?.chunks.join('') ?? '';

	return (
		<FollowupQuestionsBlock
			summary={summaryText}
			onClose={onClose}
		/>
	);
};
