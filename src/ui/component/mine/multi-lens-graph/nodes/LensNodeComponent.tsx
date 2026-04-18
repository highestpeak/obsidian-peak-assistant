import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LensNode } from '../types';

const ROLE_COLORS: Record<string, string> = {
	root: '#7c3aed',
	hub: '#0ea5e9',
	bridge: '#f59e0b',
	leaf: '#6b7280',
	orphan: '#d1d5db',
};

const CLUSTER_PALETTE = [
	'#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7',
	'#fab387', '#94e2d5', '#f38ba8', '#74c7ec',
];

function clusterColor(clusterId?: string): string {
	if (!clusterId) return '#6b7280';
	let hash = 0;
	for (let i = 0; i < clusterId.length; i++) hash = (hash * 31 + clusterId.charCodeAt(i)) | 0;
	return CLUSTER_PALETTE[Math.abs(hash) % CLUSTER_PALETTE.length];
}

export const LensNodeComponent = memo(({ data }: NodeProps<LensNode>) => {
	const roleColor = ROLE_COLORS[data.role ?? 'leaf'] ?? ROLE_COLORS.leaf;
	const borderColor = data.clusterId ? clusterColor(data.clusterId) : roleColor;
	const importance = data.importance ?? 0.5;
	const isImportant = importance >= 0.7;
	const isHub = data.role === 'hub' || data.role === 'root';
	const isBridge = data.role === 'bridge';
	const showSummary = (data.role === 'hub' || data.role === 'bridge') && data.summary;

	return (
		<div
			className={`pktw-rounded-lg pktw-border-2 pktw-bg-white pktw-shadow-sm pktw-cursor-pointer pktw-transition-shadow hover:pktw-shadow-md pktw-whitespace-nowrap ${
				isImportant || isHub ? 'pktw-px-4 pktw-py-3' : 'pktw-px-3 pktw-py-2'
			}`}
			style={{
				borderColor: isBridge ? '#f38ba8' : borderColor,
				borderStyle: isBridge ? 'dashed' : 'solid',
				borderLeft: `3px solid ${borderColor}`,
			}}
			title={data.path}
		>
			<span className={`pktw-font-medium pktw-text-[#2e3338] ${
				isImportant || isHub ? 'pktw-text-sm' : 'pktw-text-[13px]'
			}`}>
				{data.label}
			</span>
			{showSummary && (
				<span className="pktw-block pktw-text-[10px] pktw-text-[#9ca3af] pktw-mt-0.5 pktw-max-w-[200px] pktw-truncate">
					{data.summary}
				</span>
			)}
			<Handle
				type="target"
				position={Position.Left}
				className="!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0"
			/>
			<Handle
				type="source"
				position={Position.Right}
				className="!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0"
			/>
		</div>
	);
});

LensNodeComponent.displayName = 'LensNodeComponent';
