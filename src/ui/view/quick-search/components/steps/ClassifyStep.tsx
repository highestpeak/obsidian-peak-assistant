import React from 'react';
import { motion } from 'framer-motion';
import type { ClassifyStep as ClassifyStepType } from '../../types/search-steps';

const DIMENSION_COLORS: Record<string, string> = {
	inventory_mapping: 'pktw-bg-green-100 pktw-text-green-700 pktw-border-green-200',
	temporal_mapping: 'pktw-bg-amber-100 pktw-text-amber-700 pktw-border-amber-200',
};

function getDimensionColor(id: string): string {
	if (DIMENSION_COLORS[id]) return DIMENSION_COLORS[id];
	// All semantic dimension IDs get blue
	return 'pktw-bg-blue-50 pktw-text-blue-700 pktw-border-blue-200';
}

function getDimensionLabel(dim: { id: string; intent_description?: string }): string {
	if (dim.id && dim.id !== '') return dim.id.replace(/_/g, ' ');
	if (dim.intent_description) return dim.intent_description.slice(0, 30);
	return '?';
}

export const ClassifyStep: React.FC<{ step: ClassifyStepType }> = ({ step }) => {
	if (!step.dimensions.length) {
		return (
			<span className="pktw-text-xs pktw-text-[#9ca3af]">Classifying query dimensions…</span>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
			{step.dimensions.map((dim, idx) => (
				<motion.div
					key={`${dim.id}-${idx}`}
					initial={{ opacity: 0, x: -4 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.15, delay: idx * 0.04 }}
					className="pktw-flex pktw-items-start pktw-gap-2"
				>
					<span className={`pktw-inline-flex pktw-items-center pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-border pktw-text-[10px] pktw-font-medium pktw-shrink-0 ${getDimensionColor(dim.id)}`}>
						{getDimensionLabel(dim)}
					</span>
					{dim.intent_description ? (
						<span className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed">{dim.intent_description}</span>
					) : null}
				</motion.div>
			))}
		</div>
	);
};
