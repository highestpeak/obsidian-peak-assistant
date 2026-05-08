import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ReactFlow,
	Background,
	applyNodeChanges,
	type Node,
	type Edge,
	type NodeChange,
	type NodeMouseHandler,
} from '@xyflow/react';
import type { UIPreviewGraph } from './types';
import { GraphNodeType } from '@/core/po/graph.po';

type SearchNode = Node<{ label: string; type: string; badges?: string[]; path?: string }>;
type SearchEdge = Edge;

/** Map node type → color */
function nodeColor(type: string): string {
	switch (type) {
		case GraphNodeType.Document: return '#6366f1';
		case GraphNodeType.TopicTag: return '#10b981';
		case GraphNodeType.FunctionalTag: return '#f59e0b';
		case GraphNodeType.KeywordTag: return '#8b5cf6';
		default: return '#64748b';
	}
}

/** Simple force-directed initial layout using deterministic positions. */
function layoutNodes(graph: UIPreviewGraph): { nodes: SearchNode[]; edges: SearchEdge[] } {
	const count = graph.nodes.length;
	const cx = 300, cy = 200;
	const radius = Math.max(80, Math.min(250, count * 18));

	const nodes: SearchNode[] = graph.nodes.map((n, i) => {
		const angle = (2 * Math.PI * i) / Math.max(count, 1);
		return {
			id: n.id,
			type: 'default',
			position: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) },
			data: {
				label: n.type === GraphNodeType.TopicTag ? `#${n.label}` : n.label,
				type: n.type,
				badges: n.badges,
				path: n.attributes?.path as string | undefined,
			},
			style: {
				background: nodeColor(n.type),
				color: '#fff',
				borderRadius: 6,
				padding: '4px 10px',
				fontSize: 11,
				border: 'none',
				maxWidth: 160,
				whiteSpace: 'nowrap' as const,
				overflow: 'hidden',
				textOverflow: 'ellipsis',
			},
		};
	});

	const edges: SearchEdge[] = graph.edges.map((e, i) => ({
		id: e.id ?? `e-${i}`,
		source: e.from_node_id,
		target: e.to_node_id,
		animated: false,
		style: { stroke: '#94a3b8', strokeWidth: Math.min(2, (e.weight ?? 1) * 0.8) },
	}));

	return { nodes, edges };
}

interface SearchGraphProps {
	graph: UIPreviewGraph;
	onNodeClick?: (path: string) => void;
	className?: string;
}

export const SearchGraph: React.FC<SearchGraphProps> = ({ graph, onNodeClick, className }) => {
	const { nodes: initialNodes, edges } = useMemo(() => layoutNodes(graph), [graph]);
	const [nodes, setNodes] = useState<SearchNode[]>(initialNodes);

	useEffect(() => {
		setNodes(layoutNodes(graph).nodes);
	}, [graph]);

	const onNodesChange = useCallback(
		(changes: NodeChange<SearchNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
		[],
	);

	const handleNodeClick: NodeMouseHandler<SearchNode> = useCallback(
		(_event, node) => {
			const path = node.data.path;
			if (path && onNodeClick) onNodeClick(path);
		},
		[onNodeClick],
	);

	return (
		<div className={className} style={{ width: '100%', height: '100%' }}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onNodeClick={handleNodeClick}
				fitView
				proOptions={{ hideAttribution: true }}
				minZoom={0.3}
				maxZoom={2}
			>
				<Background gap={16} size={0.5} />
			</ReactFlow>
		</div>
	);
};
