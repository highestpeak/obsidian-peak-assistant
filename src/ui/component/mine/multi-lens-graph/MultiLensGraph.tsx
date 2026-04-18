import React, { useCallback, useState } from 'react';
import { ReactFlow, Background, MiniMap, Controls, type NodeMouseHandler } from '@xyflow/react';
import type { LensType, LensGraphData, LensNode } from './types';
import { LensNodeComponent } from './nodes/LensNodeComponent';
import { LensEdgeComponent } from './edges/LensEdgeComponent';
import { useLensLayout } from './hooks/useLensLayout';
import { Button } from '@/ui/component/shared-ui/button';
import { Network, GitBranch, Waypoints, Clock } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

const nodeTypes = { lensNode: LensNodeComponent };
const edgeTypes = { lensEdge: LensEdgeComponent };

const LENS_TOOLTIPS: Record<LensType, string> = {
	topology: '展示文档间的语义关系和知识结构',
	bridge: '标识跨越知识领域的关键连接文档',
	timeline: '展示知识积累和思想演化的时间脉络',
	'thinking-tree': '展示文档间的思想推导和层级关系',
};

const LENS_EMPTY_MESSAGES: Record<LensType, string> = {
	topology: '当前源文件之间未发现结构关系',
	bridge: '当前源文件之间未发现跨领域桥梁连接',
	timeline: '当前源文件缺少时间信息或演化关系',
	'thinking-tree': '需要点击生成来推断思维树',
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
	/** Current loading step description */
	loadingStep?: string | null;
	/** Callback to trigger AI graph generation */
	onRequestGenerate?: () => void;
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
	loadingStep = null,
	onRequestGenerate,
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

	if (loading) {
		return (
			<div className={cn('pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-h-full pktw-gap-3 pktw-text-muted-foreground', className)}>
				<div className="pktw-animate-spin pktw-w-5 pktw-h-5 pktw-border-2 pktw-border-current pktw-border-t-transparent pktw-rounded-full" />
				<div className="pktw-text-sm">{loadingStep ?? '正在分析文档关系...'}</div>
			</div>
		);
	}

	if (!graphData && onRequestGenerate) {
		return (
			<div className={cn('pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-h-full pktw-gap-3', className)}>
				<div className="pktw-text-sm pktw-text-muted-foreground pktw-text-center pktw-max-w-[280px]">
					AI 将分析源文件内容，识别语义关系、主题聚类和思想演化链
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={onRequestGenerate}
					className="pktw-gap-1.5"
					style={{ cursor: 'pointer' }}
				>
					<Network className="pktw-w-3.5 pktw-h-3.5" />
					生成 AI 知识图谱
				</Button>
			</div>
		);
	}

	if (!graphData) {
		return null;
	}

	const tabBar = (
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
						title={LENS_TOOLTIPS[l.type]}
					>
						<l.icon className="pktw-w-3.5 pktw-h-3.5" />
						{l.label}
					</Button>
				)
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
					key={activeLens}
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					onNodeClick={handleNodeClick}
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
		</div>
	);
};
