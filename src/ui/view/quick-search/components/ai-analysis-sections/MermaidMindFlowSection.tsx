import React, { useMemo, memo, useDeferredValue } from 'react';
import { StreamdownIsolated } from "@/ui/component/mine";
import { normalizeMermaidForDisplay, wrapMermaidCode } from "@/core/utils/mermaid-utils";
import type { MindflowProgress } from "@/service/agents/search-agent-helper/MindFlowAgent";
import { getMindflowNodeLabelsFromMermaid } from "@/service/agents/search-agent-helper/mindflow/getMindflowLabelsFromMermaid";

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
		console.log('MermaidMindFlowSection render')
		// Defer heavy work: use deferred value so normalization runs in a later tick (avoids blocking main thread)
		// const activeLabels = useMemo(() => getMindflowNodeLabelsFromMermaid(deferredMermaid), [deferredMermaid]);
		// const statusText = activeLabels.length > 0 ? activeLabels.join(' · ') : null;
		const progress = mindflowProgress;

		// const deferredMermaid = useDeferredValue(mindflowMermaid ?? '');
		// const displayMermaid = useMemo(
		// 	() => normalizeMermaidForDisplay(deferredMermaid),
		// 	[deferredMermaid]
		// );
		const displayMermaid = wrapMermaidCode(mindflowMermaid);
		// const displayMermaid = mindflowMermaid;

		return (
			<div className={`pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-2 ${containerClassName ?? ''}`}>
				<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
					<span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Mind Flow</span>
					{/* {statusText ? (
					<>
						<style dangerouslySetInnerHTML={{
							__html: `
								@keyframes mindflow-scan {
									25% { background-position: calc(1*100%/3) 0; }
									50% { background-position: calc(2*100%/3) 0; }
									75% { background-position: calc(3*100%/3) 0; }
									100% { background-position: calc(4*100%/3) 0; }
								}
							`
						}} />
						<span
							className="pktw-text-[10px] pktw-leading-tight pktw-max-w-full pktw-truncate"
							style={{
								color: 'transparent',
								background: 'linear-gradient(90deg, #3b82f6 33%, #10b981 0 66%, #8b5cf6 0) 0 0/400% 100%',
								backgroundClip: 'text',
								WebkitBackgroundClip: 'text',
								animation: 'mindflow-scan 5s infinite cubic-bezier(0.3, 1, 0, 1)',
							}}
							title={statusText}
						>
							{statusText}
						</span>
					</>
				) : null} */}
					{progress ? (
						<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-text-[10px] pktw-text-[#6b7280]">
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-wrap">
								<span>{progress.statusLabel}</span>
								<span>{progress.estimatedCompleteness}%</span>
								<span className={`pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-text-[9px] pktw-font-medium ${progress.decision === 'stop' ? 'pktw-bg-emerald-100 pktw-text-emerald-700' : 'pktw-bg-blue-100 pktw-text-blue-700'}`}>
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