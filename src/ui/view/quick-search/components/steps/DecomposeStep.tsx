import React from 'react';
import type { DecomposeStep as DecomposeStepType } from '../../types/search-steps';

export const DecomposeStep: React.FC<{ step: DecomposeStepType }> = ({ step }) => {
	if (!step.dimensionCount && !step.taskCount) {
		return (
			<span className="pktw-text-xs pktw-text-[#6b7280]">Decomposing query…</span>
		);
	}

	return (
		<span className="pktw-text-xs pktw-text-[#374151]">
			<span className="pktw-font-semibold pktw-text-[#7c3aed]">{step.dimensionCount}</span>
			<span className="pktw-text-[#6b7280]"> dimension{step.dimensionCount !== 1 ? 's' : ''} → </span>
			<span className="pktw-font-semibold pktw-text-[#7c3aed]">{step.taskCount}</span>
			<span className="pktw-text-[#6b7280]"> task{step.taskCount !== 1 ? 's' : ''}</span>
		</span>
	);
};
