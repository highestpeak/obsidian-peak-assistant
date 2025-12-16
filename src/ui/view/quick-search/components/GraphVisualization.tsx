import React from 'react';

/**
 * Simple SVG-based knowledge graph preview.
 */
export const GraphVisualization: React.FC = () => {
	return (
		<div className="pktw-w-full pktw-aspect-square pktw-bg-muted pktw-rounded-md pktw-border pktw-border-border pktw-relative pktw-overflow-hidden">
			<svg width="100%" height="100%" viewBox="0 0 200 200" className="pktw-p-2">
				{/* Edges */}
				<line x1="100" y1="100" x2="60" y2="50" stroke="#d1d5db" strokeWidth="1.5" />
				<line x1="100" y1="100" x2="140" y2="50" stroke="#d1d5db" strokeWidth="1.5" />
				<line x1="100" y1="100" x2="50" y2="140" stroke="#d1d5db" strokeWidth="1.5" />
				<line x1="100" y1="100" x2="150" y2="140" stroke="#d1d5db" strokeWidth="1.5" />
				<line x1="60" y1="50" x2="140" y2="50" stroke="#e5e7eb" strokeWidth="1" />
				<line x1="50" y1="140" x2="150" y2="140" stroke="#e5e7eb" strokeWidth="1" />

				{/* Central Node */}
				<circle cx="100" cy="100" r="16" fill="#7c3aed" />
				<text x="100" y="105" textAnchor="middle" fill="white" fontSize="10" fontWeight="600">
					ML
				</text>

				{/* Connected Nodes */}
				<circle cx="60" cy="50" r="12" fill="#8b5cf6" />
				<text x="60" y="54" textAnchor="middle" fill="white" fontSize="8">
					DL
				</text>

				<circle cx="140" cy="50" r="12" fill="#8b5cf6" />
				<text x="140" y="54" textAnchor="middle" fill="white" fontSize="8">
					NN
				</text>

				<circle cx="50" cy="140" r="12" fill="#a78bfa" />
				<text x="50" y="144" textAnchor="middle" fill="white" fontSize="8">
					AI
				</text>

				<circle cx="150" cy="140" r="12" fill="#a78bfa" />
				<text x="150" y="144" textAnchor="middle" fill="white" fontSize="7">
					Data
				</text>

				{/* Peripheral Nodes */}
				<circle cx="30" cy="100" r="8" fill="#c4b5fd" opacity="0.8" />
				<circle cx="170" cy="100" r="8" fill="#c4b5fd" opacity="0.8" />
				<circle cx="100" cy="30" r="8" fill="#c4b5fd" opacity="0.8" />
				<circle cx="100" cy="170" r="8" fill="#c4b5fd" opacity="0.8" />

				<line x1="100" y1="100" x2="30" y2="100" stroke="#e5e7eb" strokeWidth="1" opacity="0.5" />
				<line x1="100" y1="100" x2="170" y2="100" stroke="#e5e7eb" strokeWidth="1" opacity="0.5" />
				<line x1="100" y1="100" x2="100" y2="30" stroke="#e5e7eb" strokeWidth="1" opacity="0.5" />
				<line x1="100" y1="100" x2="100" y2="170" stroke="#e5e7eb" strokeWidth="1" opacity="0.5" />
			</svg>
		</div>
	);
};


