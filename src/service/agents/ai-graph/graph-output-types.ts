import { z } from 'zod';

export const GraphEvidenceSchema = z.object({
	source_path: z.string(),
	quote: z.string().min(1),
});

export const GraphNodeSchema = z.object({
	path: z.string(),
	label: z.string(),
	role: z.enum(['hub', 'bridge', 'leaf']),
	cluster_id: z.string(),
	summary: z.string(),
	importance: z.number().min(0).max(1),
	created_at: z.number().optional(),
	artifact_kind: z.enum([
		'vault-document',
		'web-resource',
		'concept',
		'person',
		'organization',
		'place',
		'event',
		'work',
		'product',
		'claim',
		'process',
		'dataset',
		'custom',
	]).optional(),
	canonical_ref: z.string().optional(),
	aliases: z.array(z.string()).optional(),
	evidence: z.array(GraphEvidenceSchema).optional(),
});

export const GraphEdgeSchema = z.object({
	source: z.string(),
	target: z.string(),
	kind: z.enum(['builds_on', 'contrasts', 'complements', 'applies', 'references']),
	label: z.string(),
	weight: z.number().min(0).max(1),
	predicate: z.string().optional(),
	family: z.enum([
		'semantic',
		'taxonomic',
		'causal',
		'evidence',
		'temporal',
		'attribution',
		'structural',
		'custom',
	]).optional(),
	directed: z.boolean().optional(),
	qualifiers: z.array(z.object({
		key: z.string(),
		value: z.union([z.string(), z.number(), z.boolean()]),
	})).optional(),
	evidence: z.array(GraphEvidenceSchema).optional(),
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

export const GraphInsightsSchema = z.object({
	topology: z.string(),
	bridges: z.string(),
	timeline: z.string(),
});

export const GraphOutputSchema = z.object({
	nodes: z.array(GraphNodeSchema),
	edges: z.array(GraphEdgeSchema),
	clusters: z.array(GraphClusterSchema),
	bridges: z.array(GraphBridgeSchema),
	evolution_chains: z.array(EvolutionChainSchema),
	insights: GraphInsightsSchema.optional(),
});

export type GraphOutput = z.infer<typeof GraphOutputSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphCluster = z.infer<typeof GraphClusterSchema>;
export type GraphBridge = z.infer<typeof GraphBridgeSchema>;
export type EvolutionChain = z.infer<typeof EvolutionChainSchema>;
