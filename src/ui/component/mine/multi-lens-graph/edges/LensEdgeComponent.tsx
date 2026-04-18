import React, { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { LensEdge } from '../types';

const KIND_STYLES: Record<string, { stroke: string; strokeDasharray?: string; labelColor: string }> = {
	// New AI graph kinds:
	builds_on:      { stroke: '#5b8fd4', labelColor: '#3b6bb5' },
	complements:    { stroke: '#6abf6a', strokeDasharray: '4 3', labelColor: '#3d8c3d' },
	contrasts:      { stroke: '#e06080', strokeDasharray: '6 3', labelColor: '#c0405a' },
	applies:        { stroke: '#d4a84a', labelColor: '#9a7520' },
	references:     { stroke: '#585b70', labelColor: '#3e4050' },
	// Legacy kinds (keep for backward compat):
	link:           { stroke: '#7c3aed', labelColor: '#5b2cb0' },
	semantic:       { stroke: '#7a8a98', strokeDasharray: '6 4', labelColor: '#5a6a78' },
	derives:        { stroke: '#0ea5e9', labelColor: '#0880b5' },
	temporal:       { stroke: '#d48a0b', strokeDasharray: '8 4', labelColor: '#a06800' },
	'cross-domain': { stroke: '#dc2626', strokeDasharray: '4 4', labelColor: '#b01e1e' },
};

/** Truncate edge label to a short display form (first ~6 chars or first word) */
function shortLabelOf(edgeLabel?: string, kind?: string): string {
	if (edgeLabel) {
		// Use first word or first 8 chars, whichever is shorter
		const firstWord = edgeLabel.split(/[\s,，、]/)[0] ?? '';
		return firstWord.length <= 8 ? firstWord : firstWord.slice(0, 6) + '…';
	}
	return kind ?? '';
}

/** Simple hash to get a consistent integer from a string. */
function simpleHash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (h * 31 + s.charCodeAt(i)) | 0;
	}
	return h;
}

export function LensEdgeComponent(props: EdgeProps<LensEdge>) {
	const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
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
	const fullLabel = data?.edgeLabel || '';
	const shortLabel = shortLabelOf(fullLabel, data?.kind);

	// Offset label position based on edge id hash to spread labels apart
	const hash = simpleHash(id);
	const offsetY = (hash % 2 === 0 ? 1 : -1) * 12;
	const offsetX = ((hash >> 1) % 3 - 1) * 8; // -8, 0, or +8

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
			<EdgeLabelRenderer>
				{hovered && fullLabel ? (
					<div
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
							pointerEvents: 'none',
							zIndex: 10,
						}}
						className="pktw-text-[10px] pktw-text-[#374151] pktw-bg-white/95 pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-shadow-sm pktw-max-w-[180px] pktw-text-center pktw-leading-tight"
					>
						{fullLabel}
					</div>
				) : (!data?.dense && shortLabel) ? (
					<div
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${labelX + offsetX}px,${labelY + offsetY}px)`,
							pointerEvents: 'none',
							color: style.labelColor,
						}}
						className="pktw-text-[10px] pktw-font-medium pktw-bg-white/90 pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-shadow-[0_0_2px_rgba(0,0,0,0.08)]"
					>
						{shortLabel}
					</div>
				) : null}
			</EdgeLabelRenderer>
		</>
	);
}
