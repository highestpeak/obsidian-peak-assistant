/**
 * ReactFlow canvas for community visualization.
 * Nodes sized by betweenness, colored by community.
 * Gap arcs rendered as dashed edges.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, applyNodeChanges } from '@xyflow/react';
import type { NodeChange } from '@xyflow/react';
import { LensNodeComponent } from '@/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent';
import { LensEdgeComponent } from '@/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent';
import { computeGapAnalysisLayout } from '@/ui/component/mine/multi-lens-graph/layouts/gap-analysis-layout';
import type { LensGraphData, LensNodeData } from '@/ui/component/mine/multi-lens-graph/types';
import { useGapAnalysisStore } from './gapAnalysisStore';

const nodeTypes = { lensNode: LensNodeComponent };
const edgeTypes = { lensEdge: LensEdgeComponent };

export const CommunityMap: React.FC = () => {
	const communities = useGapAnalysisStore(s => s.communities);
	const holes = useGapAnalysisStore(s => s.holes);
	const bridges = useGapAnalysisStore(s => s.bridges);
	const selectHole = useGapAnalysisStore(s => s.selectHole);

	const layoutResult = useMemo(() => {
		if (communities.length === 0) {
			return { nodes: [], edges: [] };
		}

		// Build a synthetic LensGraphData from communities/holes
		const graphNodes: LensNodeData[] = [];
		for (const com of communities) {
			for (const topNode of com.topNodes) {
				graphNodes.push({
					label: topNode.label,
					path: topNode.path,
					role: 'leaf',
					communityId: com.id,
					betweenness: topNode.betweenness,
				});
			}
		}

		const graphData: LensGraphData = {
			nodes: graphNodes,
			edges: [],
			availableLenses: ['gap-analysis'],
			communityMetrics: communities.map(c => ({
				id: c.id,
				label: c.label,
				memberCount: c.memberCount,
				color: '',
			})),
			gaps: holes.map(h => ({
				id: h.id,
				communityA: h.communityA.id,
				communityB: h.communityB.id,
				score: h.gapScore,
				suggestedBridges: h.potentialBridges.length,
				gapType: h.gapType,
			})),
			bridges: bridges.map(b => ({
				node_path: b.path,
				connects: [b.communityId, ''],
				explanation: `BC: ${b.betweenness.toFixed(3)}`,
			})),
		};

		return computeGapAnalysisLayout(graphData);
	}, [communities, holes, bridges]);

	const [nodes, setNodes] = useState(layoutResult.nodes);
	useEffect(() => setNodes(layoutResult.nodes), [layoutResult.nodes]);
	const onNodesChange = useCallback((changes: NodeChange[]) => {
		setNodes((nds) => applyNodeChanges(changes, nds) as typeof nds);
	}, []);

	if (nodes.length === 0) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-sm pktw-text-pk-foreground-muted">
				No community data. Run structural analysis first.
			</div>
		);
	}

	return (
		<ReactFlow
			nodes={nodes}
			edges={layoutResult.edges}
			onNodesChange={onNodesChange}
			nodeTypes={nodeTypes}
			edgeTypes={edgeTypes}
			fitView
			fitViewOptions={{ padding: 0.15 }}
			proOptions={{ hideAttribution: true }}
			minZoom={0.3}
			maxZoom={3}
		>
			<Background color="var(--pk-surface-sunken)" gap={20} />
			<Controls />
		</ReactFlow>
	);
};
