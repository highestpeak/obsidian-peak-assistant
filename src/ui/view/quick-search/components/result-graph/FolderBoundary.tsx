import React from 'react';
import { RESULT_GRAPH_FOLDER_BOUNDARY_COLORS } from '@/core/constant';

/**
 * Result Graph View · folder-boundary layer (spec 2026-07-07 §Content
 * Layers point 2). Dashed border per top-level folder segment; only
 * rendered when the parent view enables it via `graphOverlayFolder`.
 */
export interface FolderBoundaryRegion {
	folder: string;
	colorIndex: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface FolderBoundaryProps {
	regions: FolderBoundaryRegion[];
}

export const FolderBoundary: React.FC<FolderBoundaryProps> = ({ regions }) => {
	if (!regions.length) return null;
	return (
		<span
			aria-hidden
			className="pktw-pointer-events-none pktw-absolute pktw-inset-0 pktw-z-0"
		>
			{regions.map((r) => {
				const color = RESULT_GRAPH_FOLDER_BOUNDARY_COLORS[
					r.colorIndex % RESULT_GRAPH_FOLDER_BOUNDARY_COLORS.length
				];
				return (
					<span
						key={r.folder}
						className="pktw-absolute pktw-rounded-2xl"
						style={{
							left: r.x,
							top: r.y,
							width: r.width,
							height: r.height,
							border: `1px dashed ${color}`,
						}}
					/>
				);
			})}
		</span>
	);
};
