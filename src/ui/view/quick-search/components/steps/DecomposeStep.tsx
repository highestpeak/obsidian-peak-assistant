import React from 'react';
import { motion } from 'framer-motion';
import type { DecomposeStep as DecomposeStepType } from '../../types/search-steps';

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
				<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-pl-1">
					{step.taskDescriptions.map((task, i) => (
						<motion.div
							key={task.id}
							initial={{ opacity: 0, x: -4 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.15, delay: i * 0.05 }}
							className="pktw-flex pktw-items-start pktw-gap-1.5"
						>
							<span className="pktw-text-[10px] pktw-text-[#7c3aed] pktw-font-mono pktw-shrink-0 pktw-mt-0.5">T{i + 1}</span>
							<span className="pktw-text-xs pktw-text-[#374151] pktw-leading-relaxed">{task.description}</span>
							{task.targetAreas.length > 0 ? (
								<span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-shrink-0 pktw-font-mono" title={task.targetAreas.join(', ')}>
									📁 {task.targetAreas[0].split('/').slice(-2).join('/')}
								</span>
							) : null}
						</motion.div>
					))}
				</div>
			) : null}
		</div>
	);
};
