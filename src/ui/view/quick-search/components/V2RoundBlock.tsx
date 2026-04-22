import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { ToolRow, BatchRow, ThinkingRow, groupTimeline } from './timeline-helpers';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2TimelineItem, V2ToolStep } from '../types/search-steps';
import type { V2Section } from '../store/searchSessionStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface V2RoundBlockProps {
	roundIndex: number;
	query: string;
	steps: V2ToolStep[];
	timeline: V2TimelineItem[];
	sections: V2Section[];
	sources: { length: number };
	proposedOutline: string | null;
	isCurrent: boolean;
	defaultExpanded: boolean;
	usage?: { inputTokens: number; outputTokens: number } | null;
	duration?: number | null;
	children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Duration helper
// ---------------------------------------------------------------------------

function formatDuration(steps: V2ToolStep[]): string | null {
	if (steps.length === 0) return null;
	const start = steps[0].startedAt;
	const last = steps[steps.length - 1];
	const end = last.endedAt ?? last.startedAt;
	const ms = end - start;
	if (ms < 1000) return '<1s';
	return `${Math.round(ms / 1000)}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const V2RoundBlock: React.FC<V2RoundBlockProps> = ({
	roundIndex,
	query,
	steps,
	timeline,
	sections,
	sources,
	proposedOutline: _proposedOutline,
	isCurrent,
	defaultExpanded,
	usage,
	duration: roundDuration,
	children,
}) => {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const setV2View = useSearchSessionStore((s) => s.setV2View);

	const duration = roundDuration != null ? `${Math.round(roundDuration / 1000)}s` : formatDuration(steps);
	const tokenStr = usage ? `${((usage.inputTokens + usage.outputTokens) / 1000).toFixed(1)}k` : null;
	const hasSections = sections.length > 0;

	const borderClass = isCurrent
		? 'pktw-border-[#7c3aed]/30 pktw-bg-pk-background'
		: 'pktw-border-pk-border pktw-bg-[#fafafa]';

	// Group timeline for rendering (memoized to avoid recomputing for frozen rounds)
	const grouped = useMemo(() => groupTimeline(timeline), [timeline]);

	return (
		<div className={`pktw-border pktw-rounded-lg pktw-mb-2 pktw-overflow-hidden ${borderClass}`}>
			{/* Header — always visible */}
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-cursor-pointer pktw-select-none hover:pktw-bg-black/[0.02] pktw-transition-colors"
				onClick={() => setExpanded((prev) => !prev)}
			>
				{/* Chevron */}
				<motion.div
					animate={{ rotate: expanded ? 90 : 0 }}
					transition={{ duration: 0.15 }}
					className="pktw-shrink-0"
				>
					<ChevronRight className="pktw-w-4 pktw-h-4 pktw-text-pk-foreground-muted" />
				</motion.div>

				{/* Round number */}
				<span className="pktw-text-xs pktw-font-semibold pktw-text-pk-accent pktw-shrink-0">
					#{roundIndex + 1}
				</span>

				{/* Query text (truncated) */}
				<span className="pktw-text-xs pktw-text-[#2e3338] pktw-truncate pktw-flex-1 pktw-min-w-0">
					{query}
				</span>

				{/* Stats */}
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-shrink-0">
					{duration && (
						<span className="pktw-text-[10px] pktw-text-pk-foreground-muted pktw-font-mono pktw-tabular-nums">
							{duration}
						</span>
					)}
					{sources.length > 0 && (
						<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">
							{sources.length} src
						</span>
					)}
					{hasSections && (
						<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">
							{sections.length} sec
						</span>
					)}
					{tokenStr && (
						<span className="pktw-text-[10px] pktw-text-pk-foreground-muted pktw-font-mono">
							{tokenStr}
						</span>
					)}
				</div>

				{/* Report link for frozen rounds with sections */}
				{!isCurrent && hasSections && (
					<span
						className="pktw-flex pktw-items-center pktw-gap-0.5 pktw-text-[10px] pktw-text-pk-accent pktw-font-medium pktw-cursor-pointer hover:pktw-underline pktw-shrink-0"
						onClick={(e) => {
							e.stopPropagation();
							setV2View('report');
						}}
					>
						Report
						<ExternalLink className="pktw-w-3 pktw-h-3" />
					</span>
				)}
			</div>

			{/* Expandable body */}
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: 'easeInOut' }}
						className="pktw-overflow-hidden"
					>
						<div className="pktw-px-3 pktw-pb-2 pktw-pt-0">
							{/* Timeline rows */}
							{grouped.map((item, idx) => {
								if (item.kind === 'text') {
									return <ThinkingRow key={`text-${idx}`} text={item.text} />;
								}
								if (item.kind === 'batch') {
									return <BatchRow key={`batch-${idx}`} steps={item.steps} />;
								}
								return <ToolRow key={item.step.id} step={item.step} />;
							})}

							{/* Children slot (plan review, section progress, etc.) */}
							{children}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};
