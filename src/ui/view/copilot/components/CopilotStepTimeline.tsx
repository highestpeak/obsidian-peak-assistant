import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { ToolRow, BatchRow, groupTimeline } from '@/ui/view/quick-search/components/timeline-helpers';
import type { V2ToolStep, V2TimelineItem } from '@/ui/view/quick-search/types/search-steps';

interface CopilotStepTimelineProps {
	steps: V2ToolStep[];
	/** When true, show collapsed summary instead of full list */
	collapsed?: boolean;
}

export const CopilotStepTimeline: React.FC<CopilotStepTimelineProps> = ({ steps, collapsed: initialCollapsed }) => {
	const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);

	if (steps.length === 0) return null;

	const allDone = steps.every(s => s.status === 'done');
	const totalDuration = allDone && steps.length > 0
		? ((steps[steps.length - 1].endedAt ?? Date.now()) - steps[0].startedAt) / 1000
		: null;

	// Build timeline items from steps for groupTimeline
	const timeline: V2TimelineItem[] = steps.map(s => ({ kind: 'tool' as const, step: s }));
	const grouped = groupTimeline(timeline);

	if (collapsed) {
		return (
			<button
				onClick={() => setCollapsed(false)}
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-2 pktw-w-full pktw-text-left pktw-bg-transparent pktw-border pktw-border-border pktw-rounded-md hover:pktw-bg-muted/50 pktw-transition-colors pktw-cursor-pointer"
			>
				<div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-green-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
					<Check className="pktw-w-2.5 pktw-h-2.5 pktw-text-green-600" />
				</div>
				<span className="pktw-text-xs pktw-text-muted-foreground">
					{steps.length} steps completed
				</span>
				<span className="pktw-flex-1" />
				{totalDuration !== null && (
					<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-font-mono pktw-tabular-nums">
						{totalDuration.toFixed(1)}s
					</span>
				)}
				<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
			</button>
		);
	}

	return (
		<div className="pktw-border pktw-border-border pktw-rounded-md pktw-overflow-hidden">
			{allDone && (
				<button
					onClick={() => setCollapsed(true)}
					className="pktw-flex pktw-items-center pktw-gap-1 pktw-py-1 pktw-px-2 pktw-w-full pktw-text-left pktw-bg-transparent pktw-border-b pktw-border-border hover:pktw-bg-muted/50 pktw-transition-colors pktw-cursor-pointer"
				>
					<ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
					<span className="pktw-text-[10px] pktw-text-muted-foreground">collapse</span>
				</button>
			)}
			<div className="pktw-py-1">
				{grouped.map((item, i) => {
					if (item.kind === 'batch') return <BatchRow key={i} steps={item.steps} />;
					if (item.kind === 'tool') return <ToolRow key={item.step.id} step={item.step} />;
					return null; // text items not rendered in copilot timeline
				})}
			</div>
		</div>
	);
};
