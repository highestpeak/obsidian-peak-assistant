import React, { useMemo } from 'react';
import { ReactFlow, Background, type Node, type Edge, Position } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { GraphVizData } from '@/core/schemas/report-viz-schemas';

const GROUP_COLORS: Record<string, string> = {
    default: '#7c3aed',
    cluster0: '#7c3aed', cluster1: '#2563eb', cluster2: '#059669',
    cluster3: '#d97706', cluster4: '#dc2626', cluster5: '#db2777',
};

function getGroupColor(group?: string): string {
    if (!group) return GROUP_COLORS.default;
    return GROUP_COLORS[group] ?? GROUP_COLORS.default;
}

function layoutGraph(data: GraphVizData): { nodes: Node[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });

    for (const n of data.nodes) {
        g.setNode(n.id, { width: 140, height: 40 });
    }
    for (const e of data.edges) {
        g.setEdge(e.source, e.target);
    }

    dagre.layout(g);

    const nodes: Node[] = data.nodes.map((n) => {
        const pos = g.node(n.id);
        return {
            id: n.id,
            data: { label: n.label },
            position: { x: pos.x - 70, y: pos.y - 20 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            style: {
                background: getGroupColor(n.group),
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                width: 140,
                textAlign: 'center' as const,
            },
        };
    });

    const edges: Edge[] = data.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.source,
        target: e.target,
        label: e.label ?? '',
        style: { stroke: '#d1d5db', strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: '#6b7280' },
        type: 'smoothstep',
    }));

    return { nodes, edges };
}

export const RelationshipGraph: React.FC<{ data: GraphVizData; title: string }> = ({ data, title }) => {
    const { nodes, edges } = useMemo(() => layoutGraph(data), [data]);

    const maxY = Math.max(...nodes.map((n) => n.position.y)) + 60;
    const height = Math.min(400, Math.max(200, maxY));

    return (
        <div className="pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-mb-2 pktw-block">{title}</span>
            <div className="pktw-w-full pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden" style={{ height }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    panOnDrag={false}
                    zoomOnScroll={false}
                    preventScrolling={false}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                >
                    <Background color="#f3f4f6" gap={20} />
                </ReactFlow>
            </div>
        </div>
    );
};
