import React, { useMemo } from 'react';
import type { SourcesStep as SourcesStepType } from '../../types/search-steps';
import { TopSourcesSection } from '../ai-analysis-sections/SourcesSection';
import { convertSourcesToSearchResultItems } from '../../hooks/useAIAnalysisResult';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { useSearchSessionStore } from '../../store/searchSessionStore';

interface SourcesStepProps {
	step: SourcesStepType;
	onClose?: () => void;
}

export const SourcesStep: React.FC<SourcesStepProps> = ({ step, onClose }) => {
	const graphStep = useSearchSessionStore((s) => s.getStep('graph'));

	const hasSources = step.sources.length > 0;
	const hasEvidence = Object.keys(step.evidenceIndex).length > 0;

	if (!hasSources && !hasEvidence) return null;

	// Deduplicate sources by path
	const dedupedSources = useMemo(() => {
		const seen = new Set<string>();
		return step.sources.filter((src) => {
			if (seen.has(src.path)) return false;
			seen.add(src.path);
			return true;
		});
	}, [step.sources]);

	const searchResultItems = useMemo(
		() => convertSourcesToSearchResultItems(dedupedSources),
		[dedupedSources]
	);

	const graphData = graphStep?.graphData ?? null;

	const handleOpen = createOpenSourceCallback(onClose);

	return (
		<TopSourcesSection
			sources={searchResultItems}
			onOpen={handleOpen}
			evidenceIndex={step.evidenceIndex}
			graph={graphData}
		/>
	);
};
