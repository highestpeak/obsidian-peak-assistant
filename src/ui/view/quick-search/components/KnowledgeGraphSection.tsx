import React from 'react';
import { TrendingUp } from 'lucide-react';
import { GraphVisualization } from '../../../component/mine/GraphVisualization';
import type { GraphPreview } from '@/core/storage/graph/types';

/**
 * Knowledge graph section component
 */
export const KnowledgeGraphSection: React.FC<{ graph?: GraphPreview | null }> = ({ graph }) => (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<TrendingUp className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
				Knowledge Graph
			</span>
		</div>
		<GraphVisualization graph={graph} />
		<span className="pktw-text-xs pktw-text-[#999999] pktw-mt-2 pktw-text-center">
			2-3 hop relationships
		</span>
	</div>
);