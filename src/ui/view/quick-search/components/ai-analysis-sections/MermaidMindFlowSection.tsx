import React, { memo } from 'react';
import { StreamdownIsolated } from "@/ui/component/mine";
import { wrapMermaidCode } from "@/core/utils/mermaid-utils";
import type { MindflowProgress } from "@/service/agents/search-agent-helper/MindFlowAgent";

const MermaidMindFlowSectionInner: React.FC<{
	mindflowMermaid: string;
	mindflowProgress?: MindflowProgress | null;
	maxHeightClassName?: string;
	containerClassName?: string;
}> = ({
	mindflowMermaid,
	mindflowProgress,
	maxHeightClassName,
	containerClassName,
}) => {
		const progress = mindflowProgress;
		const displayMermaid = wrapMermaidCode(mindflowMermaid);

		return (
			<div className={`pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-2 ${containerClassName ?? ''}`}>
				<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
					<span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Mind Flow</span>
					{progress ? (
						<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-text-[10px] pktw-text-[#6b7280]">
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-wrap">
								<span>{progress.statusLabel}</span>
								<span>{progress.estimatedCompleteness}%</span>
								<span className={`pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-text-[9px] pktw-font-medium ${
									progress.decision === 'FINAL_ANSWER' ? 'pktw-bg-emerald-100 pktw-text-emerald-700' :
									progress.decision === 'REQUEST_COMPRESSION' ? 'pktw-bg-amber-100 pktw-text-amber-700' :
									'pktw-bg-blue-100 pktw-text-blue-700'
								}`}>
									{progress.decision}
								</span>
							</div>
							{progress.goalAlignment ? <div className="pktw-opacity-80">{progress.goalAlignment}</div> : null}
							{progress.critique ? <div className="pktw-opacity-70 pktw-italic">{progress.critique}</div> : null}
						</div>
					) : null}
				</div>
				<div className={`${maxHeightClassName ?? ''} pktw-overflow-y-auto`}>
					<StreamdownIsolated
						className="pktw-w-full pktw-min-w-0 pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none pktw-select-text"
						isAnimating={false}
					>
						{displayMermaid}
					</StreamdownIsolated>
				</div>
			</div>
		);
	};

/** Memoized to avoid re-renders when parent updates but props are unchanged (reduces Streamdown re-parse crash risk). */
export const MermaidMindFlowSection = memo(MermaidMindFlowSectionInner);