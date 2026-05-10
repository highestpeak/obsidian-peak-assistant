/**
 * Sidebar showing details for a selected structural hole.
 * Includes community info, gap score, type badge, bridges, and actions.
 */

import React from 'react';
import { useGapAnalysisStore } from './gapAnalysisStore';
import { Button } from '@/ui/component/shared-ui/button';

const GapTypeBadge: React.FC<{ type: string }> = ({ type }) => (
	<span className="pktw-rounded pktw-text-xs pktw-px-2 pktw-py-0.5 pktw-bg-pk-surface-subtle pktw-text-pk-foreground-muted">
		{type.replace(/_/g, ' ')}
	</span>
);

const ScoreIndicator: React.FC<{ score: number }> = ({ score }) => {
	const filled = Math.round(score * 5);
	return (
		<span className="pktw-text-xs pktw-tracking-wider">
			{Array.from({ length: 5 }, (_, i) => (i < filled ? '\u25CF' : '\u25CB')).join('')}
		</span>
	);
};

export const GapDetailsSidebar: React.FC = () => {
	const selectedHoleId = useGapAnalysisStore(s => s.selectedHoleId);
	const holes = useGapAnalysisStore(s => s.holes);
	const selectHole = useGapAnalysisStore(s => s.selectHole);
	const dismissHole = useGapAnalysisStore(s => s.dismissHole);
	const markHoleAddressed = useGapAnalysisStore(s => s.markHoleAddressed);

	if (!selectedHoleId) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-p-4">
				<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338]">
					Structural Holes
				</span>
				{holes.length === 0 ? (
					<span className="pktw-text-xs pktw-text-pk-foreground-muted">
						No structural holes detected. Run analysis to compute.
					</span>
				) : (
					holes.map(hole => (
						<HoleListItem key={hole.id} hole={hole} onSelect={selectHole} />
					))
				)}
			</div>
		);
	}

	const hole = holes.find(h => h.id === selectedHoleId);
	if (!hole) return null;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-p-4 pktw-overflow-y-auto">
			<Button variant="ghost" size="sm" onClick={() => selectHole(null)} className="pktw-self-start pktw-text-xs" style={{ cursor: 'pointer' }}>
				Back to list
			</Button>

			<div className="pktw-flex pktw-flex-col pktw-gap-1">
				<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338]">
					{hole.communityA.label}
				</span>
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">
					{hole.communityA.memberCount} notes
					{hole.communityA.dominantTopics.length > 0 && ` -- ${hole.communityA.dominantTopics.join(', ')}`}
				</span>
			</div>

			<span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-text-center">---</span>

			<div className="pktw-flex pktw-flex-col pktw-gap-1">
				<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338]">
					{hole.communityB.label}
				</span>
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">
					{hole.communityB.memberCount} notes
					{hole.communityB.dominantTopics.length > 0 && ` -- ${hole.communityB.dominantTopics.join(', ')}`}
				</span>
			</div>

			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-2">
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">Score:</span>
				<span className="pktw-text-xs pktw-font-medium">{hole.gapScore.toFixed(2)}</span>
				<ScoreIndicator score={hole.gapScore} />
			</div>

			<div className="pktw-flex pktw-items-center pktw-gap-2">
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">Type:</span>
				<GapTypeBadge type={hole.gapType} />
			</div>

			{hole.explanation && (
				<div className="pktw-text-xs pktw-text-pk-foreground-muted pktw-bg-pk-surface-subtle pktw-rounded pktw-p-2">
					{hole.explanation}
				</div>
			)}

			{hole.existingBridges.length > 0 && (
				<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-mt-2">
					<span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">
						Existing Bridges ({hole.existingBridges.length})
					</span>
					{hole.existingBridges.map(b => (
						<div key={b.path} className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs">
							<span className="pktw-truncate">{b.label}</span>
							<span className={`pktw-rounded pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] ${
								b.fragility === 'critical' ? 'pktw-bg-red-100 pktw-text-red-700' :
								b.fragility === 'moderate' ? 'pktw-bg-amber-100 pktw-text-amber-700' :
								'pktw-bg-green-100 pktw-text-green-700'
							}`}>
								{b.fragility}
							</span>
						</div>
					))}
				</div>
			)}

			{hole.potentialBridges.length > 0 && (
				<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-mt-2">
					<span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">
						Suggested Bridges
					</span>
					{hole.potentialBridges.map((pb, i) => (
						<div key={i} className="pktw-text-xs pktw-text-pk-foreground-muted">
							{pb.sourceNode.label} -- {pb.targetNode.label}
							<span className="pktw-ml-1 pktw-text-[10px]">
								(sim: {pb.semanticSimilarity.toFixed(2)})
							</span>
						</div>
					))}
				</div>
			)}

			<div className="pktw-flex pktw-gap-2 pktw-mt-4">
				<Button variant="outline" size="sm" onClick={() => dismissHole(hole.id)} style={{ cursor: 'pointer' }}>
					Dismiss
				</Button>
				<Button variant="outline" size="sm" onClick={() => markHoleAddressed(hole.id)} style={{ cursor: 'pointer' }}>
					Mark Addressed
				</Button>
			</div>
		</div>
	);
};

const HoleListItem: React.FC<{
	hole: { id: string; communityA: { label: string }; communityB: { label: string }; gapScore: number; gapType: string };
	onSelect: (id: string) => void;
}> = ({ hole, onSelect }) => (
	<div
		className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-2 pktw-rounded pktw-border pktw-border-pk-border hover:pktw-bg-pk-surface-subtle pktw-cursor-pointer"
		onClick={() => onSelect(hole.id)}
	>
		<span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">
			{hole.communityA.label} -- {hole.communityB.label}
		</span>
		<div className="pktw-flex pktw-items-center pktw-gap-2">
			<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">
				Score: {hole.gapScore.toFixed(2)}
			</span>
			<GapTypeBadge type={hole.gapType} />
		</div>
	</div>
);
