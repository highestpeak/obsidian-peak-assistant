import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import type { ClassifyDimension } from '../../../types/search-steps';
import { getDimensionAxis, getDimensionColors, formatDimensionLabel } from '../shared/dimensionColors';

export const DimensionChip: React.FC<{ dim: ClassifyDimension }> = ({ dim }) => {
	const axis = dim.axis ?? getDimensionAxis(dim.id);
	const colors = getDimensionColors(axis);

	const isSemantic = axis === 'semantic';

	// Semantic: short label; topology/temporal: full intent_description or fallback
	const label = isSemantic
		? formatDimensionLabel(dim.id)
		: (dim.intent_description || formatDimensionLabel(dim.id));

	// Semantic: show tooltip if intent_description present
	// Topology/temporal: only show tooltip if scope_constraint present
	const hasScope = !!(dim.scope_constraint?.path || dim.scope_constraint?.anchor_entity);
	const hasTooltip = isSemantic ? !!dim.intent_description : hasScope;

	const chip = (
		<span className={`pktw-inline-flex pktw-items-center pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-border pktw-text-[10px] pktw-leading-snug pktw-cursor-default pktw-whitespace-normal pktw-break-words ${colors.bg} ${colors.text} ${colors.border}`}>
			{label}
		</span>
	);

	if (!hasTooltip) return chip;

	return (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>{chip}</TooltipTrigger>
				<TooltipContent side="bottom" className="pktw-max-w-[320px] pktw-space-y-1">
					{isSemantic ? (
						<>
							{dim.intent_description ? (
								<span className="pktw-block pktw-text-[10px] pktw-text-[#9ca3af] pktw-font-medium">
									{dim.intent_description.split('\n')[0]}
								</span>
							) : null}
							{dim.scope_constraint?.path ? (
								<span className="pktw-block pktw-text-[10px] pktw-text-[#9ca3af] pktw-font-mono pktw-truncate">
									Scope: {dim.scope_constraint.path}
								</span>
							) : null}
							{dim.scope_constraint?.anchor_entity ? (
								<span className="pktw-block pktw-text-[10px] pktw-text-[#9ca3af]">
									Focus: {dim.scope_constraint.anchor_entity}
								</span>
							) : null}
						</>
					) : (
						<>
							{dim.scope_constraint?.path ? (
								<span className="pktw-block pktw-text-[10px] pktw-text-[#9ca3af] pktw-font-mono pktw-truncate">
									Scope: {dim.scope_constraint.path}
								</span>
							) : null}
							{dim.scope_constraint?.anchor_entity ? (
								<span className="pktw-block pktw-text-[10px] pktw-text-[#9ca3af]">
									Focus: {dim.scope_constraint.anchor_entity}
								</span>
							) : null}
						</>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
