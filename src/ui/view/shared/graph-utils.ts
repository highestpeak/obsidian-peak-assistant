import { GraphNodeType } from '@/core/po/graph.po';
import { AISearchGraph } from "@/service/agents/AISearchAgent";
import { UIPreviewGraph } from "@/ui/component/mine/graph-viz/GraphVisualization";

export function convertGraphToGraphPreview(aiGraph: AISearchGraph | null): UIPreviewGraph | null {
    if (aiGraph === null || aiGraph === undefined) return null;
    return {
        nodes: aiGraph.nodes.map(node => ({
            id: node.id,
            label: node.title || node.id,
            type: node.type || GraphNodeType.Document,
            badges: typeof node.attributes?.roleHint === 'string' ? [String(node.attributes.roleHint)] : [],
            attributes: {
                ...node.attributes,
                path: node.path,
            },
        })),
        edges: aiGraph.edges.map(edge => ({
            id: edge.id,
            from_node_id: edge.source,
            to_node_id: edge.target,
            kind: edge.type,
            weight: Number(edge.attributes.hubEdgeWeight ?? edge.attributes.weight ?? 1) || 1,
            attributes: {
                ...edge.attributes,
            },
        })),
    };
};