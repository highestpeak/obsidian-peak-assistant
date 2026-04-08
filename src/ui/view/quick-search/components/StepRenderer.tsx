import React from 'react';
import type { SearchStep } from '../types/search-steps';
import { GenericStep } from './steps/GenericStep';
import { ClassifyStep } from './steps/ClassifyStep';
import { DecomposeStep } from './steps/DecomposeStep';
import { ReconStep } from './steps/ReconStep';
import { PlanStep } from './steps/PlanStep';
import { ReportStep } from './steps/ReportStep';
import { SummaryStep } from './steps/SummaryStep';
import { SourcesStep } from './steps/SourcesStep';
import { GraphStep } from './steps/GraphStep';
import { FollowupStep } from './steps/FollowupStep';

interface StepRendererProps {
	step: SearchStep;
	onClose?: () => void;
	startedAtMs: number | null;
	durationMs: number | null;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}

export const StepRenderer: React.FC<StepRendererProps> = ({
	step,
	onClose,
	startedAtMs,
	durationMs,
	onOpenWikilink,
}) => {
	switch (step.type) {
		case 'generic':
			return <GenericStep step={step} />;
		case 'classify':
			return <ClassifyStep step={step} />;
		case 'decompose':
			return <DecomposeStep step={step} />;
		case 'recon':
			return <ReconStep step={step} />;
		case 'plan':
			return <PlanStep step={step} />;
		case 'report':
			return <ReportStep step={step} />;
		case 'summary':
			return (
				<SummaryStep
					step={step}
					startedAtMs={startedAtMs}
					durationMs={durationMs}
					onOpenWikilink={onOpenWikilink}
				/>
			);
		case 'sources':
			return <SourcesStep step={step} onClose={onClose} />;
		case 'graph':
			return <GraphStep step={step} />;
		case 'followup':
			return <FollowupStep step={step} onClose={onClose} />;
		default: {
			const _exhaustive: never = step;
			console.warn('[StepRenderer] Unknown step type:', (_exhaustive as SearchStep).type);
			return null;
		}
	}
};
