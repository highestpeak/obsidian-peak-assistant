import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LensNode } from '../types';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/ui/component/shared-ui/tooltip';

const ROLE_COLORS: Record<string, string> = {
	root: '#7c3aed',
	hub: '#0ea5e9',
	bridge: '#f59e0b',
	leaf: '#6b7280',
	orphan: '#d1d5db',
};

export const LensNodeComponent = memo(({ data }: NodeProps<LensNode>) => {
	const color = ROLE_COLORS[data.role ?? 'leaf'] ?? ROLE_COLORS.leaf;
	const fileName = data.path.split('/').pop() ?? data.label;

	return (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>
					<div
						className="pktw-rounded-lg pktw-border pktw-px-3 pktw-py-2 pktw-bg-white pktw-shadow-sm pktw-cursor-pointer pktw-max-w-[200px] pktw-transition-shadow hover:pktw-shadow-md"
						style={{ borderColor: color, borderLeftWidth: 3 }}
					>
						<span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338] pktw-truncate pktw-block">
							{data.label || fileName}
						</span>
						{data.role && (
							<span
								className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider"
								style={{ color }}
							>
								{data.role}
							</span>
						)}
						<Handle
							type="target"
							position={Position.Top}
							className="!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0"
						/>
						<Handle
							type="source"
							position={Position.Bottom}
							className="!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0"
						/>
					</div>
				</TooltipTrigger>
				{data.summary && (
					<TooltipContent
						side="right"
						className="pktw-max-w-[280px] pktw-text-xs"
					>
						<span className="pktw-text-[10px] pktw-text-[#6b7280] pktw-block pktw-mb-1">
							{data.path}
						</span>
						{data.summary}
					</TooltipContent>
				)}
			</Tooltip>
		</TooltipProvider>
	);
});

LensNodeComponent.displayName = 'LensNodeComponent';
