import React from 'react';
import type { ReportStep as ReportStepType } from '../../types/search-steps';
import { DashboardBlocksSection } from '../ai-analysis-sections/DashboardBlocksSection';
import { StreamdownIsolated } from '@/ui/component/mine';

export const ReportStep: React.FC<{ step: ReportStepType }> = ({ step }) => {
	const isRunning = step.status === 'running';

	if (isRunning) {
		// Phase 1: blocks generating, nothing to show yet
		if (!step.blocks.length && !step.streamingText) {
			return <span className="pktw-text-xs pktw-text-[#9ca3af] pktw-animate-pulse">Analyzing evidence…</span>;
		}

		// Phase 2: blocks arrived, summary streaming in
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-4">
				{step.streamingText ? (
					<StreamdownIsolated
						className="pktw-text-sm pktw-text-[#374151] pktw-leading-relaxed pktw-select-text pktw-prose pktw-prose-sm pktw-max-w-none"
						isAnimating={true}
					>
						{step.streamingText}
					</StreamdownIsolated>
				) : step.blocks.length > 0 ? (
					<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-animate-pulse">Writing executive summary…</span>
				) : null}
				{step.blocks.length > 0 ? (
					<div>
						<span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-mb-2 pktw-block">Analysis sections</span>
						<DashboardBlocksSection blocks={step.blocks} isStreaming={false} />
					</div>
				) : null}
			</div>
		);
	}

	// Completed: full summary as continuous prose, then blocks as details
	const hasContent = step.summary || step.blocks.length > 0;
	if (!hasContent) return null;

	const orderedBlocks = step.blockOrder.length > 0
		? step.blockOrder
			.map((id) => step.blocks.find((b) => b.id === id))
			.filter((b): b is NonNullable<typeof b> => !!b)
		: step.blocks;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4">
			{step.summary ? (
				<StreamdownIsolated
					className="pktw-text-sm pktw-text-[#374151] pktw-leading-relaxed pktw-select-text pktw-prose pktw-prose-sm pktw-max-w-none"
					isAnimating={false}
				>
					{step.summary}
				</StreamdownIsolated>
			) : null}
			{orderedBlocks.length > 0 ? (
				<div>
					{step.summary ? (
						<div className="pktw-border-t pktw-border-[#f3f4f6] pktw-pt-3 pktw-mb-2">
							<span className="pktw-text-[10px] pktw-text-[#9ca3af]">Analysis sections</span>
						</div>
					) : null}
					<DashboardBlocksSection blocks={orderedBlocks} isStreaming={false} />
				</div>
			) : null}
		</div>
	);
};
