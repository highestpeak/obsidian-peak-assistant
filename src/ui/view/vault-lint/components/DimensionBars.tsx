import React from 'react';
import type { LintDimension } from '@/service/lint/types';
import { scoreColorClass } from '@/service/lint/HealthScoreEngine';

const DIMENSION_LABELS: Record<LintDimension, string> = {
	structural: 'Structural',
	content: 'Content',
	temporal: 'Temporal',
	semantic: 'Semantic',
	tags: 'Tags',
};

interface DimensionBarsProps {
	scores: Record<LintDimension, number>;
	onClickDimension?: (dim: LintDimension) => void;
}

export const DimensionBars: React.FC<DimensionBarsProps> = ({ scores, onClickDimension }) => (
	<div className="pktw-grid pktw-grid-cols-2 pktw-gap-x-4 pktw-gap-y-2">
		{(Object.keys(DIMENSION_LABELS) as LintDimension[]).map(dim => {
			const score = scores[dim];
			const colorClass = scoreColorClass(score);
			return (
				<div key={dim} className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer"
					onClick={() => onClickDimension?.(dim)}>
					<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-w-20 pktw-shrink-0">
						{DIMENSION_LABELS[dim]}
					</span>
					<div className="pktw-flex-1 pktw-h-1.5 pktw-rounded-full pktw-bg-muted">
						<div className={`pktw-h-full pktw-rounded-full ${colorClass.replace('text', 'bg')}`}
							style={{ width: `${score}%` }} />
					</div>
					<span className={`pktw-text-[11px] pktw-font-semibold pktw-w-6 pktw-text-right ${colorClass}`}>
						{score}
					</span>
				</div>
			);
		})}
	</div>
);
