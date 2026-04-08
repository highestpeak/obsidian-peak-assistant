import React from 'react';
import type { GenericStep as GenericStepType } from '../../types/search-steps';

export const GenericStep: React.FC<{ step: GenericStepType }> = ({ step }) => {
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1">
			{step.title ? (
				<span className="pktw-text-xs pktw-font-semibold pktw-text-[#374151]">{step.title}</span>
			) : null}
			{step.description ? (
				<span className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed">{step.description}</span>
			) : null}
		</div>
	);
};
