import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { LensEdge } from '../types';

const KIND_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
	link: { stroke: '#7c3aed' },
	semantic: { stroke: '#94a3b8', strokeDasharray: '6 4' },
	derives: { stroke: '#0ea5e9' },
	temporal: { stroke: '#f59e0b', strokeDasharray: '8 4' },
	'cross-domain': { stroke: '#dc2626', strokeDasharray: '4 4' },
};

export function LensEdgeComponent(props: EdgeProps<LensEdge>) {
	const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
	const [edgePath] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});
	const style = KIND_STYLES[data?.kind ?? 'link'] ?? KIND_STYLES.link;

	return (
		<BaseEdge
			path={edgePath}
			style={{ ...style, strokeWidth: Math.max(1.5, (data?.weight ?? 0.5) * 3) }}
		/>
	);
}
