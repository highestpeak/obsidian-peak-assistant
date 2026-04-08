import React from 'react';
import type { ReportStep as ReportStepType } from '../../types/search-steps';
import { DashboardBlocksSection } from '../ai-analysis-sections/DashboardBlocksSection';

export const ReportStep: React.FC<{ step: ReportStepType }> = ({ step }) => {
	const isRunning = step.status === 'running';

	if (!step.blocks.length) {
		if (isRunning) {
			return (
				<span className="pktw-text-xs pktw-text-[#6b7280]">Generating report blocks…</span>
			);
		}
		return null;
	}

	// Render blocks in declared order (blockOrder) when available
	const orderedBlocks = step.blockOrder.length > 0
		? step.blockOrder
			.map((id) => step.blocks.find((b) => b.id === id))
			.filter((b): b is NonNullable<typeof b> => !!b)
		: step.blocks;

	const isStreaming = isRunning && step.completedBlocks.length < step.blocks.length;

	return (
		<DashboardBlocksSection
			blocks={orderedBlocks}
			isStreaming={isStreaming}
		/>
	);
};
