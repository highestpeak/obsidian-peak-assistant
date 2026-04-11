import React, { memo } from 'react';
import { StreamdownIsolated } from "@/ui/component/mine";
import { wrapMermaidCode } from "@/core/utils/mermaid-utils";

const MermaidMindFlowSectionInner: React.FC<{
	mindflowMermaid: string;
	maxHeightClassName?: string;
	containerClassName?: string;
}> = ({
	mindflowMermaid,
	maxHeightClassName,
	containerClassName,
}) => {
		const displayMermaid = wrapMermaidCode(mindflowMermaid);

		return (
			<div className={`pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-3 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-1 ${containerClassName ?? ''}`}>
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