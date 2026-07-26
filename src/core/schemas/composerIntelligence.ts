/**
 * Peak Composer — Intelligence Sidecar Zod schemas (WP9, additive).
 *
 * Mirrors the TS interfaces in `src/service/composer/intelligence/*`. Only files
 * under `src/core/schemas/` import `zod/v3`. These validate the SuggestionFinding
 * identity (§5.4) and the §12.7 telemetry event envelope where they cross a
 * projection / persistence boundary.
 */

import { z } from 'zod/v3';

export const SuggestionFindingStateSchema = z.enum(['active', 'dismissed', 'consumed', 'stale']);

/**
 * Finding-scoped target union — includes the `selection` kind (findings can
 * anchor to a selection range), which the older WP2 `ComposerTargetSchema`
 * predates. Kept local so this additive schema doesn't reshape the frozen one.
 */
export const FindingTargetSchema = z.union([
	z.object({ kind: z.literal('document'), documentId: z.string() }),
	z.object({ kind: z.literal('block'), blockId: z.string() }),
	z.object({ kind: z.literal('unit'), blockId: z.string(), unitId: z.string() }),
	z.object({
		kind: z.literal('selection'),
		blockId: z.string(),
		unitId: z.string().optional(),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
	}),
]);

export const SuggestionFindingSchema = z.object({
	findingId: z.string(),
	fingerprint: z.string(),
	evidenceRevision: z.string(),
	target: FindingTargetSchema,
	state: SuggestionFindingStateSchema,
	reason: z.string(),
	capabilityId: z.string().optional(),
});
export type SuggestionFindingDto = z.infer<typeof SuggestionFindingSchema>;

export const IntelligenceMetricDimensionSchema = z.enum([
	'relevance',
	'outcome',
	'control',
	'interruption',
	'dedup',
	'efficiency',
	'reliability',
	'performance',
	'trust',
	'learning',
]);

export const IntelligenceTelemetryEventSchema = z.object({
	dimension: IntelligenceMetricDimensionSchema,
	event: z.string(),
	fields: z.record(z.union([z.number(), z.string(), z.boolean()])),
	kind: z.enum(['ai', 'deterministic']).optional(),
});
export type IntelligenceTelemetryEventDto = z.infer<typeof IntelligenceTelemetryEventSchema>;
