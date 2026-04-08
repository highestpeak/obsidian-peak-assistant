import React from 'react';
import type { SummaryStep as SummaryStepType } from '../../types/search-steps';
import { SummaryContent } from '../ai-analysis-sections/SummarySection';
import { IntelligenceFrame } from '@/ui/component/mine/IntelligenceFrame';

interface SummaryStepProps {
	step: SummaryStepType;
	startedAtMs: number | null;
	durationMs: number | null;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}

export const SummaryStep: React.FC<SummaryStepProps> = ({
	step,
	startedAtMs,
	durationMs,
	onOpenWikilink,
}) => {
	if (!step.chunks.length) return null;

	const isActive = step.status === 'running' && step.streaming;

	return (
		<IntelligenceFrame isActive={isActive}>
			<SummaryContent
				startedAtMs={startedAtMs ?? undefined}
				finalDurationMs={durationMs}
				onOpenWikilink={onOpenWikilink}
			/>
		</IntelligenceFrame>
	);
};
