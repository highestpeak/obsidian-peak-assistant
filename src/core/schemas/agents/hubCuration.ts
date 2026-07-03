import { z } from 'zod/v3';

// Zod schemas for HubCuratorAgent structured submit.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 2.

export const hubCurationScopeSchema = z.object({
	communityIds: z.array(z.string()).max(3),
	memberNodeIds: z.array(z.string()).max(60),
});

export const hubCurationDecisionSchema = z.object({
	nodeId: z.string(),
	hubPath: z.string(),
	action: z.enum(['create', 'keep', 'merge', 'retire']),
	scope: hubCurationScopeSchema,
	reason: z.string(),
	mergeSourceHubs: z.array(z.string()).optional(),
});

export const hubCurationCoverageSchema = z.object({
	totalMembers: z.number(),
	coveredMembers: z.number(),
	uncoveredHighValue: z.array(z.string()).max(20),
});

export const hubCurationSubmitSchema = z.object({
	hubs: z.array(hubCurationDecisionSchema).max(30),
	coverage: hubCurationCoverageSchema,
	confidence: z.number().min(0).max(1),
	should_stop: z.boolean(),
});

export type HubCurationScope = z.infer<typeof hubCurationScopeSchema>;
export type HubCurationDecision = z.infer<typeof hubCurationDecisionSchema>;
export type HubCurationCoverage = z.infer<typeof hubCurationCoverageSchema>;
export type HubCurationSubmit = z.infer<typeof hubCurationSubmitSchema>;
