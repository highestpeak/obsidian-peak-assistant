import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { DecomposeStep as DecomposeStepType, DecomposeTaskInfo } from '../../types/search-steps';
import { DimensionChip } from './classify/DimensionChip';
import { RECON_TOOL_LABELS } from '@/core/constant';

const TaskRow: React.FC<{ task: DecomposeTaskInfo; index: number }> = ({ task, index }) => {
	const [expanded, setExpanded] = useState(false);
	const dimCount = task.coveredDimensionIds?.length ?? 0;

	return (
		<div>
			<div
				className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-cursor-pointer pktw-select-none pktw-py-0.5 pktw-rounded hover:pktw-bg-[#f9fafb] pktw-transition-colors"
				onClick={() => setExpanded((v) => !v)}
			>
				{expanded
					? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-mt-0.5 pktw-shrink-0" />
					: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-mt-0.5 pktw-shrink-0" />
				}
				<span className="pktw-text-[10px] pktw-text-[#7c3aed] pktw-font-mono pktw-shrink-0 pktw-mt-0.5">T{index + 1}</span>
				<span className="pktw-text-xs pktw-text-[#374151] pktw-leading-relaxed pktw-flex-1 pktw-line-clamp-1">{task.description}</span>
				{dimCount > 0 ? (
					<span className="pktw-text-[9px] pktw-text-[#9ca3af] pktw-font-mono pktw-shrink-0 pktw-mt-0.5">[{dimCount}d]</span>
				) : null}
			</div>
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="pktw-overflow-hidden"
					>
						<TaskDetail task={task} />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

const TaskDetail: React.FC<{ task: DecomposeTaskInfo }> = ({ task }) => (
	<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-pl-7 pktw-pb-1.5">
		{task.targetAreas.length > 0 ? (
			<span className="pktw-text-[11px] pktw-text-[#6b7280]">
				<span className="pktw-text-[#9ca3af]">Target: </span>
				{task.targetAreas.map((a, i) => (
					<span key={i} className="pktw-font-mono">
						{i > 0 ? ', ' : ''}{a.split('/').slice(-2).join('/')}
					</span>
				))}
			</span>
		) : null}
		{task.toolHints.length > 0 ? (
			<span className="pktw-flex pktw-flex-wrap pktw-gap-1">
				{task.toolHints.map((hint) => (
					<span key={hint} className="pktw-text-[9px] pktw-px-1 pktw-py-px pktw-rounded pktw-bg-[#f3f4f6] pktw-text-[#6b7280]">
						{RECON_TOOL_LABELS[hint] ?? hint}
					</span>
				))}
			</span>
		) : null}
		{task.coveredDimensionIds?.length > 0 ? (
			<span className="pktw-flex pktw-flex-wrap pktw-gap-1">
				{task.coveredDimensionIds.map((dimId) => (
					<DimensionChip key={dimId} dim={{ id: dimId, axis: 'semantic', scope_constraint: null }} />
				))}
			</span>
		) : null}
	</div>
);

export const DecomposeStep: React.FC<{ step: DecomposeStepType }> = ({ step }) => {
	if (!step.dimensionCount && !step.taskCount) {
		return (
			<span className="pktw-text-xs pktw-text-[#9ca3af]">Decomposing query…</span>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
			<span className="pktw-text-xs pktw-text-[#374151]">
				<span className="pktw-font-semibold pktw-text-[#7c3aed]">{step.dimensionCount}</span>
				<span className="pktw-text-[#6b7280]"> dimension{step.dimensionCount !== 1 ? 's' : ''} → </span>
				<span className="pktw-font-semibold pktw-text-[#7c3aed]">{step.taskCount}</span>
				<span className="pktw-text-[#6b7280]"> task{step.taskCount !== 1 ? 's' : ''}</span>
			</span>
			{step.taskDescriptions.length > 0 ? (
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
					{step.taskDescriptions.map((task, i) => (
						<motion.div
							key={task.id}
							initial={{ opacity: 0, x: -4 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.15, delay: i * 0.05 }}
						>
							<TaskRow task={task} index={i} />
						</motion.div>
					))}
				</div>
			) : null}
		</div>
	);
};
