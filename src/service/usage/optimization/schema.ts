import { z } from 'zod';

/**
 * Zod schema for the LLM-returned Recommendation set. Mirrors `Recommendation`
 * in `./types.ts` but enforces the closed enums + bounded numeric ranges so
 * stray model output can't poison the dashboard.
 */
export const RecommendationActionSchema = z.object({
	kind: z.enum([
		'route_to_cheaper_model',
		'lower_compact_threshold',
		'review_no_outcome',
		'silence_low_cost_pip',
		'set_budget',
	]),
	params: z.record(z.string(), z.unknown()).optional(),
});

export const RecommendationDetailSchema = z.object({
	label: z.string().min(1).max(40),
	value: z.string().min(1).max(80),
});

export const RecommendationEvidenceRowSchema = z.object({
	startedIso: z.string().min(1),
	goal: z.string().min(1).max(200),
	model: z.string().min(1).max(80),
	costUsd: z.number().min(0),
	usageLogId: z.number().int().optional(),
});

export const RecommendationSchema = z.object({
	id: z.string().min(1).max(64),
	title: z.string().min(1).max(160),
	sub: z.string().min(1).max(400),
	impact: z.enum(['high', 'medium', 'low', 'investigate']),
	estMonthlySavingUsd: z.number().min(0),
	detail: z.array(RecommendationDetailSchema).max(8).optional(),
	evidence: z.array(RecommendationEvidenceRowSchema).max(8).optional(),
	action: RecommendationActionSchema,
});

export const RecommendationsResponseSchema = z.object({
	recommendations: z.array(RecommendationSchema).max(6),
});

export type ValidatedRecommendation = z.infer<typeof RecommendationSchema>;
