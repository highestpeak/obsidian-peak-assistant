import { z } from 'zod';

export const GraphNodeSchema = z.object({
	path: z.string(),
	label: z.string(),
	role: z.enum(['hub', 'bridge', 'leaf']),
	cluster_id: z.string(),
	summary: z.string(),
	importance: z.number().min(0).max(1),
	created_at: z.number().optional(),
});

export const GraphEdgeSchema = z.object({
	source: z.string(),
	target: z.string(),
	kind: z.enum(['builds_on', 'contrasts', 'complements', 'applies', 'references']),
	label: z.string(),
	weight: z.number().min(0).max(1),
});

export const GraphClusterSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
});

export const GraphBridgeSchema = z.object({
	node_path: z.string(),
	connects: z.tuple([z.string(), z.string()]),
	explanation: z.string(),
});

export const EvolutionChainSchema = z.object({
	chain: z.array(z.string()),
	theme: z.string(),
});

export const GraphOutputSchema = z.object({
	nodes: z.array(GraphNodeSchema),
	edges: z.array(GraphEdgeSchema),
	clusters: z.array(GraphClusterSchema),
	bridges: z.array(GraphBridgeSchema),
	evolution_chains: z.array(EvolutionChainSchema),
});

export type GraphOutput = z.infer<typeof GraphOutputSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphCluster = z.infer<typeof GraphClusterSchema>;
export type GraphBridge = z.infer<typeof GraphBridgeSchema>;
export type EvolutionChain = z.infer<typeof EvolutionChainSchema>;
