import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, MiniMap, Controls, applyNodeChanges, type NodeMouseHandler, type ReactFlowInstance, type NodeChange } from '@xyflow/react';
import type { LensType, LensGraphData, LensNode } from './types';
import { LensNodeComponent } from './nodes/LensNodeComponent';
import { SwimlaneNode } from './nodes/SwimlaneNode';
import { TimelineAxisNode } from './nodes/TimelineAxisNode';
import { LensEdgeComponent } from './edges/LensEdgeComponent';
import { useLensLayout } from './hooks/useLensLayout';
import { Button } from '@/ui/component/shared-ui/button';
import { Network, GitBranch, Waypoints, Clock, CheckCircle2, Loader2, Maximize2 } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

const nodeTypes = { lensNode: LensNodeComponent, swimlane: SwimlaneNode, timelineAxis: TimelineAxisNode };
const edgeTypes = { lensEdge: LensEdgeComponent };

const LENS_TOOLTIPS: Record<LensType, string> = {
	topology: 'Semantic relations and knowledge structure between documents',
	bridge: 'Key documents bridging across knowledge domains',
	timeline: 'Knowledge accumulation and idea evolution over time',
	'thinking-tree': 'Thought derivation and hierarchical relations between documents',
};

const LENS_EMPTY_MESSAGES: Record<LensType, string> = {
	topology: 'No structural relations found among current sources',
	bridge: 'No cross-domain bridge connections found among current sources',
	timeline: 'Current sources lack temporal or evolutionary relations',
	'thinking-tree': 'Click generate to infer the thinking tree',
};

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
	/** When true, show loading with step text */
	loading?: boolean;
	/** Current loading step descriptions */
	loadingSteps?: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done'; detail?: string }>;
	/** Callback to trigger AI graph generation */
	onRequestGenerate?: () => void;
	/** Callback to open graph in fullscreen pane */
	onExpand?: () => void;
}

export const MultiLensGraph: React.FC<MultiLensGraphProps> = ({
	graphData,
	defaultLens = 'topology',
	onNodeClick,
	onLensChange,
	className = '',
	showControls = true,
	showMiniMap = false,
	loading = false,
	loadingSteps,
	onRequestGenerate,
	onExpand,
}) => {
	const [activeLens, setActiveLens] = useState<LensType>(defaultLens);
	const { nodes: layoutNodes, edges } = useLensLayout(graphData, activeLens);
	const [nodes, setNodes] = useState(layoutNodes);
	const availableLenses = graphData?.availableLenses ?? ['topology'];
	const rfInstance = useRef<ReactFlowInstance | null>(null);

	// Sync layout-computed nodes into state when layout changes (lens switch, data change)
	useEffect(() => {
		setNodes(layoutNodes);
	}, [layoutNodes]);

	const onNodesChange = useCallback((changes: NodeChange[]) => {
		setNodes((nds) => applyNodeChanges(changes, nds) as typeof nds);
	}, []);

	useEffect(() => {
		const id = setTimeout(() => rfInstance.current?.fitView({ padding: 0.15 }), 50);
		return () => clearTimeout(id);
	}, [activeLens]);

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

	if (loading) {
		return (
			<div className={cn('pktw-flex pktw-flex-col pktw-h-full pktw-py-2 pktw-px-1', className)}>
				{loadingSteps && loadingSteps.length > 0 ? (
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						{loadingSteps.map((s) => (
							<div key={s.id} className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1 pktw-px-1">
								{s.status === 'done' ? (
									<CheckCircle2 className="pktw-w-4 pktw-h-4 pktw-text-green-500 pktw-shrink-0" />
								) : s.status === 'running' ? (
									<Loader2 className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed] pktw-animate-spin pktw-shrink-0" />
								) : (
									<div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-border pktw-border-[#d1d5db] pktw-shrink-0" />
								)}
								<span className={cn('pktw-text-xs', s.status === 'done' ? 'pktw-text-[#6b7280]' : 'pktw-text-[#2e3338]')}>
									{s.label}
								</span>
								{s.detail && (
									<span className="pktw-text-[11px] pktw-text-[#9ca3af] pktw-truncate pktw-flex-1 pktw-min-w-0">
										{s.detail}
									</span>
								)}
							</div>
						))}
					</div>
				) : (
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1">
						<Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin pktw-text-[#7c3aed]" />
						<span className="pktw-text-xs pktw-text-muted-foreground">Analyzing document relations...</span>
					</div>
				)}
			</div>
		);
	}

	if (!graphData && onRequestGenerate) {
		return (
			<div className={cn('pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-h-full pktw-gap-4', className)}>
				<div className="pktw-text-sm pktw-text-[#9ca3af] pktw-text-center pktw-max-w-[280px] pktw-leading-relaxed">
					AI analyzes source content to identify semantic relations, topic clusters, and idea evolution chains
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={onRequestGenerate}
					className="pktw-gap-1.5 pktw-border pktw-border-[#7c3aed]/30 pktw-bg-transparent pktw-text-[#7c3aed] hover:pktw-bg-[#7c3aed]/10 hover:pktw-border-[#7c3aed]/50 hover:pktw-text-[#7c3aed]"
					style={{ cursor: 'pointer' }}
				>
					<Network className="pktw-w-3.5 pktw-h-3.5" />
					Generate Knowledge Graph
				</Button>
			</div>
		);
	}

	if (!graphData) {
		return null;
	}

	const tabBar = (
		<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-p-1 pktw-border-b pktw-border-[#e5e7eb] pktw-bg-[#f9fafb] pktw-rounded-t-lg">
			{LENS_CONFIG.filter((l) => availableLenses.includes(l.type)).map(
				(l) => (
					<Button
						key={l.type}
						variant={activeLens === l.type ? 'secondary' : 'ghost'}
						size="sm"
						onClick={() => handleLensSwitch(l.type)}
						className="pktw-gap-1 pktw-text-xs"
						style={{ cursor: 'pointer' }}
						title={LENS_TOOLTIPS[l.type]}
					>
						<l.icon className="pktw-w-3.5 pktw-h-3.5" />
						{l.label}
					</Button>
				)
			)}
			{onExpand && (
				<>
					<div className="pktw-flex-1" />
					<Button variant="ghost" size="sm" onClick={onExpand} title="View fullscreen in new window" style={{ cursor: 'pointer' }}>
						<Maximize2 className="pktw-w-3.5 pktw-h-3.5" />
					</Button>
				</>
			)}
		</div>
	);

	if (nodes.length === 0) {
		return (
			<div className={cn('pktw-flex pktw-flex-col', className)}>
				{tabBar}
				<div className="pktw-flex pktw-items-center pktw-justify-center pktw-flex-1 pktw-min-h-[200px] pktw-text-muted-foreground">
					<span className="pktw-text-sm">{LENS_EMPTY_MESSAGES[activeLens]}</span>
				</div>
			</div>
		);
	}

	return (
		<div className={cn('pktw-flex pktw-flex-col', className)}>
			{tabBar}
			<div className="pktw-flex-1 pktw-min-h-[200px]">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					onNodeClick={handleNodeClick}
					onInit={(instance) => { rfInstance.current = instance; }}
					fitView
					fitViewOptions={{ padding: 0.15 }}
					proOptions={{ hideAttribution: true }}
					minZoom={0.3}
					maxZoom={3}
				>
					<Background color="#f3f4f6" gap={20} />
					{showControls && <Controls />}
					{showMiniMap && <MiniMap />}
				</ReactFlow>
			</div>
			{graphData?.insights?.[activeLens === 'bridge' ? 'bridges' : activeLens as 'topology' | 'timeline'] && (
				<div className="pktw-px-4 pktw-py-3 pktw-mb-2 pktw-mx-3 pktw-text-[13px] pktw-leading-relaxed pktw-text-[#4b5563] pktw-border pktw-border-[#e5e7eb] pktw-bg-[#f9fafb] pktw-rounded-lg">
					{graphData.insights[activeLens === 'bridge' ? 'bridges' : activeLens as 'topology' | 'timeline']}
				</div>
			)}
		</div>
	);
};
