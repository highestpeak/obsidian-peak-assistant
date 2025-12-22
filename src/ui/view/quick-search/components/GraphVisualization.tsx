import React from 'react';

/**
 * Simple SVG-based knowledge graph preview.
 */
import type { GraphPreview } from '@/core/storage/graph/types';

export const GraphVisualization: React.FC<{
	graph?: GraphPreview | null;
}> = ({ graph }) => {
	// Fallback to the old placeholder if no data yet.
	if (!graph || !graph.nodes?.length) {
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
						KG
					</text>
				</svg>
			</div>
		);
	}

	const nodes = graph.nodes.slice(0, 20);
	const center = { x: 100, y: 100 };
	const radius = 70;
	const positions = new Map<string, { x: number; y: number }>();
	nodes.forEach((n, idx) => {
		const angle = (2 * Math.PI * idx) / nodes.length;
		positions.set(n.id, {
			x: center.x + radius * Math.cos(angle),
			y: center.y + radius * Math.sin(angle),
		});
	});

	return (
		<div className="pktw-w-full pktw-aspect-square pktw-bg-muted pktw-rounded-md pktw-border pktw-border-border pktw-relative pktw-overflow-hidden">
			<svg width="100%" height="100%" viewBox="0 0 200 200" className="pktw-p-2">
				{/* Edges */}
				{graph.edges.slice(0, 40).map((e, idx) => {
					const from = positions.get(e.from_node_id);
					const to = positions.get(e.to_node_id);
					if (!from || !to) return null;
					return (
						<line
							key={idx}
							x1={from.x}
							y1={from.y}
							x2={to.x}
							y2={to.y}
							stroke="#d1d5db"
							strokeWidth={Math.max(1, Math.min(2.5, (e.weight ?? 1) / 2))}
							opacity="0.8"
						/>
					);
				})}

				{/* Nodes */}
				{nodes.map((n) => {
					const p = positions.get(n.id)!;
					const fill = n.type === 'document' ? '#7c3aed' : n.type === 'tag' ? '#8b5cf6' : '#a78bfa';
					return (
						<g key={n.id}>
							<circle cx={p.x} cy={p.y} r={n.type === 'document' ? 8 : 6} fill={fill} />
							<text x={p.x} y={p.y + 3} textAnchor="middle" fill="white" fontSize="6">
								{n.type === 'tag' ? '#' : ''}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
};


