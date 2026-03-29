import { z } from 'zod/v3';

/**
 * All Zod schemas for hub discovery maintenance and HubDoc LLM structured output (`streamObject`).
 * Keep hub-related prompts in this single module to avoid scattered schema files.
 */

// --- Whole-round discovery review ---

/** Structured output for whole-round hub discovery review (maintenance). */
export const hubDiscoverRoundReviewLlmSchema = z.object({
	coverageSufficient: z.boolean().describe('Whether selected hubs adequately cover the vault for navigation'),
	quality: z.enum(['good', 'acceptable', 'poor']).describe('Overall quality of the hub set'),
	needAnotherRound: z.boolean().describe('Whether another discovery round would likely add value'),
	confidence: z.number().min(0).max(1).describe('Confidence in this assessment'),
	summary: z.string().max(800).describe('Short English summary'),
	strengths: z.array(z.string()).max(10).describe('What works well'),
	issues: z.array(z.string()).max(10).describe('Gaps or structural problems'),
	nextDirections: z.array(z.string()).max(10).describe('Concrete directions for further discovery'),
	suggestedDiscoveryModes: z
		.array(z.enum(['folder', 'document', 'cluster', 'manual_seed']))
		.max(10)
		.describe('Which discovery modes to emphasize next'),
	targetPathPrefixes: z.array(z.string()).max(20).describe('Vault path prefixes to prioritize'),
	stopReason: z.string().max(500).describe('Why stopping or continuing'),
});

export type HubDiscoverRoundReviewLlm = z.infer<typeof hubDiscoverRoundReviewLlmSchema>;

// --- Optional batch enrichment of assembly hints (future) ---

/**
 * Structured output for optional batch LLM enrichment of hub assembly hints.
 * Discovery attaches deterministic hints; callers may merge LLM output with those fields.
 */
export const hubAssemblyHintsLlmSchema = z.object({
	hubs: z
		.array(
			z.object({
				stableKey: z.string().max(512),
				preferredChildHubNodeIds: z.array(z.string()).max(48).optional(),
				stopAtChildHub: z.boolean().optional(),
				expectedTopology: z.enum(['hierarchical', 'clustered', 'mixed']).optional(),
				deprioritizedBridgeNodeIds: z.array(z.string()).max(48).optional(),
				rationale: z.string().max(800).optional(),
			}),
		)
		.max(64),
});

export type HubAssemblyHintsLlm = z.infer<typeof hubAssemblyHintsLlmSchema>;

// --- HubDoc summary fill (materialized hub notes) ---

/** Zod schema for hub-doc-summary prompt structured output (AI SDK `streamObject`). */
export const hubDocSummaryLlmSchema = z
	.object({
		/** Concise display title for the hub (Obsidian heading + frontmatter). */
		title: z.string().max(200).optional(),
		shortSummary: z.string(),
		fullSummary: z.string(),
		coreFacts: z.array(z.string()).default([]),
		queryAnchors: z.array(z.string()).default([]),
		tagTopicDistribution: z.string(),
		timeDimension: z.string(),
		keyPatterns: z.string().optional(),
	})
	.refine((d) => d.shortSummary.trim().length > 0 || d.fullSummary.trim().length > 0, {
		message: 'At least one of shortSummary or fullSummary must be non-empty',
	});

export type HubDocSummaryLlm = z.infer<typeof hubDocSummaryLlmSchema>;
