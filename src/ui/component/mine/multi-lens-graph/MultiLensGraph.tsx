import React, { useCallback, useState } from 'react';
import { ReactFlow, Background, MiniMap, Controls, type NodeMouseHandler } from '@xyflow/react';
import type { LensType, LensGraphData, LensNode } from './types';
import { LensNodeComponent } from './nodes/LensNodeComponent';
import { LensEdgeComponent } from './edges/LensEdgeComponent';
import { useLensLayout } from './hooks/useLensLayout';
import { Button } from '@/ui/component/shared-ui/button';
import { Network, GitBranch, Waypoints, Clock } from 'lucide-react';

const nodeTypes = { lensNode: LensNodeComponent };
const edgeTypes = { lensEdge: LensEdgeComponent };

const LENS_CONFIG: Array<{
	type: LensType;
	icon: React.FC<{ className?: string }>;
	label: string;
}> = [
	{ type: 'topology', icon: Network, label: 'Topology' },
	{ type: 'thinking-tree', icon: GitBranch, label: 'Thinking Tree' },
	{ type: 'bridge', icon: Waypoints, label: 'Bridges' },
	{ type: 'timeline', icon: Clock, label: 'Timeline' },
];

interface MultiLensGraphProps {
	graphData: LensGraphData | null;
	defaultLens?: LensType;
	onNodeClick?: (path: string) => void;
	onLensChange?: (lens: LensType) => void;
	className?: string;
	showControls?: boolean;
	showMiniMap?: boolean;
}

export const MultiLensGraph: React.FC<MultiLensGraphProps> = ({
	graphData,
	defaultLens = 'topology',
	onNodeClick,
	onLensChange,
	className = '',
	showControls = true,
	showMiniMap = false,
}) => {
	const [activeLens, setActiveLens] = useState<LensType>(defaultLens);
	const { nodes, edges } = useLensLayout(graphData, activeLens);
	const availableLenses = graphData?.availableLenses ?? ['topology'];

	const handleLensSwitch = useCallback(
		(lens: LensType) => {
			setActiveLens(lens);
			onLensChange?.(lens);
		},
		[onLensChange]
	);

	const handleNodeClick: NodeMouseHandler<LensNode> = useCallback(
		(_event, node) => {
			const path = node.data?.path;
			if (path && onNodeClick) onNodeClick(path);
		},
		[onNodeClick]
	);

	if (!graphData || nodes.length === 0) {
		return (
			<div
				className={`pktw-flex pktw-items-center pktw-justify-center pktw-text-[#6b7280] pktw-text-sm ${className}`}
			>
				<span className="pktw-text-sm">No graph data</span>
			</div>
		);
	}

	return (
		<div className={`pktw-flex pktw-flex-col ${className}`}>
			<div className="pktw-flex pktw-gap-1 pktw-p-1 pktw-border-b pktw-border-[#e5e7eb] pktw-bg-[#f9fafb] pktw-rounded-t-lg">
				{LENS_CONFIG.filter((l) => availableLenses.includes(l.type)).map(
					(l) => (
						<Button
							key={l.type}
							variant={activeLens === l.type ? 'secondary' : 'ghost'}
							size="sm"
							onClick={() => handleLensSwitch(l.type)}
							className="pktw-gap-1 pktw-text-xs"
							style={{ cursor: 'pointer' }}
						>
							<l.icon className="pktw-w-3.5 pktw-h-3.5" />
							{l.label}
						</Button>
					)
				)}
			</div>
			<div className="pktw-flex-1 pktw-min-h-[200px]">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					onNodeClick={handleNodeClick}
					fitView
					fitViewOptions={{ padding: 0.2 }}
					proOptions={{ hideAttribution: true }}
					minZoom={0.2}
					maxZoom={2}
				>
					<Background color="#f3f4f6" gap={20} />
					{showControls && <Controls />}
					{showMiniMap && <MiniMap />}
				</ReactFlow>
			</div>
		</div>
	);
};
