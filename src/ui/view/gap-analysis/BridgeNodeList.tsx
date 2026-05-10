/**
 * Table-style list of top bridge nodes.
 * Uses div grid layout (no <table>), shadcn Button for interactions.
 */

import React from 'react';
import { useGapAnalysisStore } from './gapAnalysisStore';

export const BridgeNodeList: React.FC = () => {
	const bridges = useGapAnalysisStore(s => s.bridges);

	if (bridges.length === 0) return null;

	return (
		<div className="pktw-mt-4">
			<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-mb-2 pktw-block">
				Top Bridge Nodes
			</span>
			<div className="pktw-grid pktw-grid-cols-[1fr_80px_80px_120px] pktw-gap-1 pktw-text-xs">
				<span className="pktw-text-pk-foreground-muted pktw-font-medium pktw-px-2 pktw-py-1">Note</span>
				<span className="pktw-text-pk-foreground-muted pktw-font-medium pktw-px-2 pktw-py-1">BC</span>
				<span className="pktw-text-pk-foreground-muted pktw-font-medium pktw-px-2 pktw-py-1">Constraint</span>
				<span className="pktw-text-pk-foreground-muted pktw-font-medium pktw-px-2 pktw-py-1">Community</span>
				{bridges.map(b => (
					<React.Fragment key={b.nodeId}>
						<span
							className="pktw-px-2 pktw-py-1 pktw-text-[#2e3338] pktw-truncate pktw-cursor-pointer hover:pktw-text-pk-accent"
							title={b.path}
						>
							{b.label}
						</span>
						<span className="pktw-px-2 pktw-py-1 pktw-text-pk-foreground-muted pktw-tabular-nums">
							{b.betweenness.toFixed(3)}
						</span>
						<span className="pktw-px-2 pktw-py-1 pktw-text-pk-foreground-muted pktw-tabular-nums">
							{b.constraint.toFixed(3)}
						</span>
						<span className="pktw-px-2 pktw-py-1 pktw-text-pk-foreground-muted">
							{b.communityId}
						</span>
					</React.Fragment>
				))}
			</div>
		</div>
	);
};
