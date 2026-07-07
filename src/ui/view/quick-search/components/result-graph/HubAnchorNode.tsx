import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

/**
 * Result Graph View · hub anchor node (spec 2026-07-07 §Content Layers
 * point 3). Distinctly larger than a result-doc node, uses the
 * accent-soft surface so it visually orbits above result nodes without
 * competing with the selected-node accent.
 */
export interface HubAnchorNodeData extends Record<string, unknown> {
	title: string;
	constituentCount: number;
	selected?: boolean;
}

export type HubAnchorNodeType = Node<HubAnchorNodeData, 'hubAnchor'>;

const HANDLE_CLASS = '!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0';

export const HubAnchorNode = memo(({ data }: NodeProps<HubAnchorNodeType>) => {
	const selectedClass = data.selected
		? 'pktw-ring-2 pktw-ring-pk-accent pktw-ring-offset-2 pktw-ring-offset-pk-surface'
		: '';
	return (
		<div
			className={`pktw-rounded-full pktw-px-4 pktw-py-2 pktw-min-w-[120px] pktw-max-w-[220px] pktw-cursor-pointer pktw-transition-shadow pktw-shadow-sm hover:pktw-shadow-md pktw-flex pktw-flex-col pktw-items-center pktw-text-center ${selectedClass}`}
			style={{
				background: 'var(--pk-accent-soft)',
				border: '2px solid var(--pk-accent)',
				color: 'var(--pk-accent-text)',
			}}
			title={data.title}
		>
			<span className="pktw-text-[13px] pktw-font-semibold pktw-truncate pktw-w-full">
				{data.title}
			</span>
			<span className="pktw-text-[10px] pktw-opacity-80">
				{data.constituentCount} constituents
			</span>
			<Handle type="target" position={Position.Left} id="target-left" className={HANDLE_CLASS} />
			<Handle type="target" position={Position.Top} id="target-top" className={HANDLE_CLASS} />
			<Handle type="target" position={Position.Right} id="target-right" className={HANDLE_CLASS} />
			<Handle type="target" position={Position.Bottom} id="target-bottom" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Left} id="source-left" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Top} id="source-top" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Right} id="source-right" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Bottom} id="source-bottom" className={HANDLE_CLASS} />
		</div>
	);
});

HubAnchorNode.displayName = 'HubAnchorNode';
