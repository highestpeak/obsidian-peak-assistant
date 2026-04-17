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

export const LensNodeComponent = memo(({ data }: NodeProps<LensNode>) => {
	const color = ROLE_COLORS[data.role ?? 'leaf'] ?? ROLE_COLORS.leaf;
	const isHub = data.role === 'hub' || data.role === 'root';
	const isBridge = data.role === 'bridge';

	return (
		<div
			className={`pktw-rounded-lg pktw-border-2 pktw-bg-white pktw-shadow-sm pktw-cursor-pointer pktw-transition-shadow hover:pktw-shadow-md pktw-whitespace-nowrap ${
				isHub ? 'pktw-px-4 pktw-py-3' : 'pktw-px-3 pktw-py-2'
			}`}
			style={{
				borderColor: color,
				borderStyle: isBridge ? 'dashed' : 'solid',
			}}
			title={data.path}
		>
			<span className={`pktw-font-medium pktw-text-[#2e3338] ${
				isHub ? 'pktw-text-sm' : 'pktw-text-xs'
			}`}>
				{data.label}
			</span>
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
