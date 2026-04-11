import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ClassifyStep as ClassifyStepType, ClassifyDimension } from '../../types/search-steps';
import { DimensionChip } from './classify/DimensionChip';
import { getDimensionAxis } from './shared/dimensionColors';

type AxisKey = 'semantic' | 'topology' | 'temporal';

const AXIS_LABELS: Record<AxisKey, string> = {
	semantic: 'Semantic',
	topology: 'Topology',
	temporal: 'Temporal',
};

function groupByAxis(dims: ClassifyDimension[]): Record<AxisKey, ClassifyDimension[]> {
	const groups: Record<AxisKey, ClassifyDimension[]> = { semantic: [], topology: [], temporal: [] };
	const seen = new Set<string>();
	for (const dim of dims) {
		if (seen.has(dim.id)) continue;
		seen.add(dim.id);
		const axis = dim.axis ?? getDimensionAxis(dim.id);
		groups[axis].push(dim);
	}
	return groups;
}

const AxisGroup: React.FC<{ axis: AxisKey; dims: ClassifyDimension[]; startIdx: number }> = ({ axis, dims, startIdx }) => {
	const [showReasons, setShowReasons] = useState(false);
	let idx = startIdx;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
			<div className="pktw-flex pktw-items-start pktw-gap-1.5">
				<span className="pktw-text-[9px] pktw-text-[#9ca3af] pktw-w-14 pktw-shrink-0 pktw-mt-1 pktw-font-medium">{AXIS_LABELS[axis]}</span>
				<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-flex-1">
					{dims.map((dim) => (
						<motion.div
							key={`${dim.id}-${idx++}`}
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.15, delay: (idx - 1) * 0.04 }}
						>
							<DimensionChip dim={dim} />
						</motion.div>
					))}
				</div>
				{dims.some(d => d.intent_description) ? (
					<span
						className="pktw-cursor-pointer pktw-shrink-0 pktw-mt-1"
						onClick={() => setShowReasons(v => !v)}
					>
						{showReasons
							? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
							: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
						}
					</span>
				) : null}
			</div>
			{showReasons && (
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-pl-16">
					{dims.filter(d => d.intent_description).map((dim, i) => (
						<span key={i} className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-leading-relaxed">
							{dim.intent_description}
						</span>
					))}
				</div>
			)}
		</div>
	);
};

export const ClassifyStep: React.FC<{ step: ClassifyStepType }> = ({ step }) => {
	if (!step.dimensions.length) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-1">
				<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-animate-pulse">
					Analyzing your question across 15 knowledge dimensions…
				</span>
				<span className="pktw-text-[10px] pktw-text-[#d1d5db]">
					Loading vault context, folder structure, and initial search leads
				</span>
			</div>
		);
	}

	const groups = groupByAxis(step.dimensions);
	const axes = (['semantic', 'topology', 'temporal'] as AxisKey[]).filter(a => groups[a].length > 0);
	let globalIdx = 0;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
			{axes.map((axis) => {
				const startIdx = globalIdx;
				globalIdx += groups[axis].length;
				return <AxisGroup key={axis} axis={axis} dims={groups[axis]} startIdx={startIdx} />;
			})}
		</div>
	);
};
