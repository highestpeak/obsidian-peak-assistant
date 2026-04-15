import { z } from 'zod/v3';

export const lensNodeSchema = z.object({
	id: z.string(),
	label: z.string(),
	path: z.string(),
	role: z.enum(['root', 'hub', 'bridge', 'leaf', 'orphan']).optional(),
	group: z.string().optional(),
	createdAt: z.number().optional(),
	modifiedAt: z.number().optional(),
	level: z.number().optional(),
	parentId: z.string().optional(),
	summary: z.string().optional(),
	score: z.number().optional(),
});

export const lensEdgeSchema = z.object({
	source: z.string(),
	target: z.string(),
	kind: z.enum(['link', 'semantic', 'derives', 'temporal', 'cross-domain']),
	weight: z.number().optional(),
	label: z.string().optional(),
});

export const aiGraphDocSchema = z.object({
	nodes: z.array(lensNodeSchema),
	edges: z.array(lensEdgeSchema),
	lensHint: z.enum(['topology', 'thinking-tree', 'bridge', 'timeline']).optional(),
});

export type AiGraphDocData = z.infer<typeof aiGraphDocSchema>;
