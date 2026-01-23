import React from 'react';
import { Sparkles } from 'lucide-react';
import { TagCloud } from './TagCloud';

/**
 * Tag cloud section component
 */
export const TagCloudSection: React.FC<{
	topics?: Array<{ label: string; weight: number }>;
}> = ({ topics }) => {
	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Key Topics</span>
			</div>
			<TagCloud topics={topics} />
			<span className="pktw-text-xs pktw-text-[#999999] pktw-mt-3">
				Click any topic to search
			</span>
		</div>
	);
};