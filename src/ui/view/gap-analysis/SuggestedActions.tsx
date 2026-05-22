/**
 * Top 5 potential bridge entries with action buttons.
 * Each card is extracted as SuggestedActionCard per the ~8-line rule.
 */

import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { useGapAnalysisStore } from './gapAnalysisStore';
import type { PotentialBridge } from '@/service/search/index/helper/structural/types';

const SuggestedActionCard: React.FC<{
	bridge: PotentialBridge;
}> = ({ bridge }) => (
	<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-p-3 pktw-rounded pktw-border pktw-border-pk-border">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs">
			<span className="pktw-font-medium pktw-text-pk-text-primary pktw-truncate">
				{bridge.sourceNode.label}
			</span>
			<span className="pktw-text-pk-foreground-muted">--</span>
			<span className="pktw-font-medium pktw-text-pk-text-primary pktw-truncate">
				{bridge.targetNode.label}
			</span>
		</div>
		<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">
			Similarity: {bridge.semanticSimilarity.toFixed(2)}
		</span>
		{bridge.rationale && (
			<span className="pktw-text-[10px] pktw-text-pk-foreground-muted pktw-leading-relaxed">
				{bridge.rationale}
			</span>
		)}
		<div className="pktw-flex pktw-gap-2 pktw-mt-1">
			<Button variant="outline" size="sm" className="pktw-text-[10px] pktw-h-6" style={{ cursor: 'pointer' }}>
				Add Link
			</Button>
			<Button variant="outline" size="sm" className="pktw-text-[10px] pktw-h-6" style={{ cursor: 'pointer' }}>
				Create Bridge Note
			</Button>
		</div>
	</div>
);

export const SuggestedActions: React.FC = () => {
	const holes = useGapAnalysisStore(s => s.holes);

	// Gather top 5 potential bridges across all holes
	const allBridges = holes
		.flatMap(h => h.potentialBridges)
		.sort((a, b) => b.semanticSimilarity - a.semanticSimilarity)
		.slice(0, 5);

	if (allBridges.length === 0) return null;

	return (
		<div className="pktw-mt-4">
			<span className="pktw-text-sm pktw-font-medium pktw-text-pk-text-primary pktw-mb-2 pktw-block">
				Suggested Actions
			</span>
			<div className="pktw-flex pktw-flex-col pktw-gap-2">
				{allBridges.map((bridge, i) => (
					<SuggestedActionCard key={i} bridge={bridge} />
				))}
			</div>
		</div>
	);
};
