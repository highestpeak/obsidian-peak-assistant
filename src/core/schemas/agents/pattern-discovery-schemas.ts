import { z } from 'zod';

// ─── Context Variable Names ───────────────────────────────────────────────────

export const CONTEXT_VARIABLE_NAMES = [
	'activeDocumentTitle',
	'activeDocumentPath',
	'currentFolder',
	'documentTags',
	'vaultName',
	'documentKeywords',
	'firstHeading',
	'frontmatterProperties',
	'documentType',
	'outgoingLinks',
	'backlinks',
	'linkContext',
	'recentDocuments',
	'recentFolders',
	'documentAge',
] as const;

export type ContextVariableName = (typeof CONTEXT_VARIABLE_NAMES)[number];

// ─── Condition Names ──────────────────────────────────────────────────────────

export const CONDITION_NAMES = [
	'hasActiveDocument',
	'folderMatch',
	'tagMatch',
	'hasOutgoingLinks',
	'hasBacklinks',
	'propertyMatch',
	'keywordMatch',
	'always',
] as const;

export type ConditionName = (typeof CONDITION_NAMES)[number];

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const MatchConditionSchema = z.object({
	hasActiveDocument: z.boolean().optional(),
	folderMatch: z.string().optional(),
	tagMatch: z.array(z.string()).optional(),
	hasOutgoingLinks: z.boolean().optional(),
	hasBacklinks: z.boolean().optional(),
	propertyMatch: z
		.object({
			key: z.string(),
			value: z.string().optional(),
		})
		.optional(),
	keywordMatch: z.array(z.string()).optional(),
	always: z.boolean().optional(),
});

export const DiscoveredPatternSchema = z.object({
	template: z.string(),
	variables: z.array(z.string()),
	conditions: MatchConditionSchema,
	confidence: z.number().min(0).max(1),
	reasoning: z.string(),
});

export const PatternDiscoveryOutputSchema = z.object({
	newPatterns: z.array(DiscoveredPatternSchema),
	deprecateIds: z.array(z.string()),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type MatchCondition = z.infer<typeof MatchConditionSchema>;
export type DiscoveredPattern = z.infer<typeof DiscoveredPatternSchema>;
export type PatternDiscoveryOutput = z.infer<typeof PatternDiscoveryOutputSchema>;
