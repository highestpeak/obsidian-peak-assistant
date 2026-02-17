import { AISearchGraph } from "@/service/agents/AISearchAgent";
import { UIPreviewGraph } from "@/ui/component/mine/graph-viz/GraphVisualization";

export function convertGraphToGraphPreview(aiGraph: AISearchGraph | null): UIPreviewGraph | null {
    if (aiGraph === null || aiGraph === undefined) return null;
    return {
        nodes: aiGraph.nodes.map(node => ({
            id: node.id,
            label: node.title || node.id,
            type: node.type || 'document',
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
            weight: edge.attributes.weight || 1,
            attributes: {
                ...edge.attributes,
            },
        })),
    };
};