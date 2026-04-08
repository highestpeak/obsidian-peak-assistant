import React from 'react';
import type { GraphStep as GraphStepType } from '../../types/search-steps';
import { MermaidMindFlowSection } from '../ai-analysis-sections/MermaidMindFlowSection';

export const GraphStep: React.FC<{ step: GraphStepType }> = ({ step }) => {
	if (!step.mindflowMermaid) return null;

	return (
		<MermaidMindFlowSection
			mindflowMermaid={step.mindflowMermaid}
		/>
	);
};
