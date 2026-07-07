import React from 'react';
import { RESULT_GRAPH_COMMUNITY_WASH_COLORS } from '@/core/constant';

/**
 * Result Graph View · community wash layer (spec 2026-07-07 §Content
 * Layers point 1). Renders one soft-colored rectangle per community
 * behind all graph nodes. Purely spatial — no pointer events. Layout
 * (bounding boxes) is computed by the parent view because it holds the
 * final node positions after ReactFlow measures.
 *
 * A single-community-dominates safety: if any community contains more
 * than DOMINATION_THRESHOLD * total nodes, that wash is skipped
 * (mitigation from plan §Risks). Callers decide the skip; this view
 * just renders whatever regions it is handed.
 */
export interface CommunityRegion {
	communityId: string;
	/** Palette slot; stable across renders so the same community keeps its color. */
	colorIndex: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface CommunityBackgroundProps {
	regions: CommunityRegion[];
}

export const CommunityBackground: React.FC<CommunityBackgroundProps> = ({ regions }) => {
	if (!regions.length) return null;
	return (
		<span
			aria-hidden
			className="pktw-pointer-events-none pktw-absolute pktw-inset-0 pktw-z-0"
		>
			{regions.map((r) => {
				const bg = RESULT_GRAPH_COMMUNITY_WASH_COLORS[
					r.colorIndex % RESULT_GRAPH_COMMUNITY_WASH_COLORS.length
				];
				return (
					<span
						key={r.communityId}
						className="pktw-absolute pktw-rounded-2xl"
						style={{
							left: r.x,
							top: r.y,
							width: r.width,
							height: r.height,
							background: bg,
						}}
					/>
				);
			})}
		</span>
	);
};
