import React, { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { LensEdge } from '../types';

const KIND_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
	// New AI graph kinds:
	builds_on:      { stroke: '#89b4fa' },
	complements:    { stroke: '#a6e3a1', strokeDasharray: '4 3' },
	contrasts:      { stroke: '#f38ba8', strokeDasharray: '6 3' },
	applies:        { stroke: '#f9e2af' },
	references:     { stroke: '#585b70' },
	// Legacy kinds (keep for backward compat):
	link:           { stroke: '#7c3aed' },
	semantic:       { stroke: '#94a3b8', strokeDasharray: '6 4' },
	derives:        { stroke: '#0ea5e9' },
	temporal:       { stroke: '#f59e0b', strokeDasharray: '8 4' },
	'cross-domain': { stroke: '#dc2626', strokeDasharray: '4 4' },
};

const KIND_LABELS: Record<string, string> = {
	builds_on: 'builds on',
	complements: 'complements',
	contrasts: 'contrasts',
	applies: 'applies',
	references: 'references',
	link: 'link',
	semantic: 'semantic',
	derives: 'derives',
	temporal: 'temporal',
	'cross-domain': 'cross',
};

export function LensEdgeComponent(props: EdgeProps<LensEdge>) {
	const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
	const [hovered, setHovered] = useState(false);
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});
	const style = KIND_STYLES[data?.kind ?? 'link'] ?? KIND_STYLES.link;
	const label = data?.edgeLabel || KIND_LABELS[data?.kind ?? 'link'] || '';

	return (
		<>
			<BaseEdge
				path={edgePath}
				style={{ ...style, strokeWidth: Math.max(1.5, (data?.weight ?? 0.5) * 3) }}
			/>
			{/* Invisible wider hit area for hover detection */}
			<path
				d={edgePath}
				fill="none"
				stroke="transparent"
				strokeWidth={12}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
			/>
			{hovered && label && (
				<EdgeLabelRenderer>
					<div
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
							pointerEvents: 'none',
						}}
						className="pktw-text-[9px] pktw-text-[#9ca3af] pktw-bg-white/80 pktw-px-1 pktw-rounded"
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
