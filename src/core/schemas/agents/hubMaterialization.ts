import { z } from 'zod/v3';

// Zod schemas for HubMaterializationAgent draft + critique.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 2.

export const hubDraftSchema = z.object({
	title: z.string(),
	summary: z.string(),
	coreConceptSection: z.string(),
	structureSection: z.string(),
	evolutionSection: z.string(),
	openQuestionsSection: z.string(),
	entryPointsSection: z.string(),
	referencedMemberIds: z.array(z.string()).max(60),
});

export const hubCritiqueGapSchema = z.object({
	memberId: z.string(),
	kind: z.enum(['missing-reference', 'missing-quote', 'missing-role']),
	hint: z.string(),
});

export const hubCritiqueSchema = z.object({
	retryDraft: z.boolean(),
	gaps: z.array(hubCritiqueGapSchema).max(15),
	overallCoverage: z.number().min(0).max(1),
});

export type HubDraft = z.infer<typeof hubDraftSchema>;
export type HubCritiqueGap = z.infer<typeof hubCritiqueGapSchema>;
export type HubCritique = z.infer<typeof hubCritiqueSchema>;
