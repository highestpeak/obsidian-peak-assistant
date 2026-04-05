import { z } from 'zod/v3';

/**
 * Zod schemas for {@link KnowledgeIntuitionAgent}.
 * Kept minimal (plain strings, small array caps, no .describe) so providers with strict
 * structured-output limits (e.g. Google AI Studio) do not reject the JSON schema.
 * entryPoints allows up to 24 items; target count scales ~linearly with folders scanned (see prompts).
 */

export const intuitionPartitionSchema = z.object({
	label: z.string(),
	purpose: z.string(),
	/** 1–2 vault-relative folder prefixes to start browsing this area. */
	entryPaths: z.array(z.string()).max(2),
});

export const intuitionEntitySchema = z.object({
	name: z.string(),
	description: z.string(),
	location: z.string(),
	whyItMatters: z.string(),
});

/** Intent → concrete start paths for human navigation (replaces flat queryStrengths). */
export const intuitionEntryPointSchema = z.object({
	intent: z.string(),
	startPaths: z.array(z.string()).max(2),
	whatYouWillFind: z.string(),
});

export const intuitionTopologySchema = z.object({
	from: z.string(),
	to: z.string(),
	relation: z.string(),
});

/** Structured submit after each plan + tools iteration. */
export const knowledgeIntuitionSubmitSchema = z.object({
	findingsSummary: z.string(),
	theme: z.string().optional(),
	partitions: z.array(intuitionPartitionSchema).max(6),
	coreEntities: z.array(intuitionEntitySchema).max(8),
	topology: z.array(intuitionTopologySchema).max(8),
	evolution: z.string(),
	entryPoints: z.array(intuitionEntryPointSchema).max(24),
	openQuestions: z.array(z.string()).max(6).optional(),
	should_stop: z.boolean(),
});

export type IntuitionPartition = z.infer<typeof intuitionPartitionSchema>;
export type IntuitionEntity = z.infer<typeof intuitionEntitySchema>;
export type IntuitionTopology = z.infer<typeof intuitionTopologySchema>;
export type IntuitionEntryPoint = z.infer<typeof intuitionEntryPointSchema>;
export type KnowledgeIntuitionSubmit = z.infer<typeof knowledgeIntuitionSubmitSchema>;
