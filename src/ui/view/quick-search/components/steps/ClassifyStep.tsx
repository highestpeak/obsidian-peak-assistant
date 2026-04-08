import React from 'react';
import { motion } from 'framer-motion';
import type { ClassifyStep as ClassifyStepType } from '../../types/search-steps';

function getDimensionColor(id: string): string {
	if (id === 'semantic') return 'pktw-bg-blue-100 pktw-text-blue-700 pktw-border-blue-200';
	if (id === 'topology') return 'pktw-bg-green-100 pktw-text-green-700 pktw-border-green-200';
	if (id === 'temporal') return 'pktw-bg-amber-100 pktw-text-amber-700 pktw-border-amber-200';
	return 'pktw-bg-gray-100 pktw-text-gray-700 pktw-border-gray-200';
}

export const ClassifyStep: React.FC<{ step: ClassifyStepType }> = ({ step }) => {
	if (!step.dimensions.length) {
		return (
			<span className="pktw-text-xs pktw-text-[#6b7280]">Classifying query dimensions…</span>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
			{step.dimensions.map((dim, idx) => (
				<motion.span
					key={dim.id}
					initial={{ opacity: 0, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.2, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
					className={`pktw-inline-flex pktw-items-center pktw-px-2 pktw-py-0.5 pktw-rounded pktw-border pktw-text-xs pktw-font-medium ${getDimensionColor(dim.id)}`}
					title={dim.intent_description}
				>
					{dim.id}
				</motion.span>
			))}
		</div>
	);
};
