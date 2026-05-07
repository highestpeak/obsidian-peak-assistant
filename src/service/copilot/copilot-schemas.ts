import { z } from 'zod';

export const reviewResultSchema = z.object({
  overall: z.string(),
  sections: z.array(z.object({
    title: z.string(),
    severity: z.enum(['info', 'warning', 'error']),
    feedback: z.string(),
    suggestion: z.string(),
  })),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const linkSuggestionsSchema = z.object({
  links: z.array(z.object({
    target: z.string(),
    context: z.string(),
    reason: z.string(),
    type: z.enum(['outgoing', 'incoming']),
  })),
});

export type LinkSuggestions = z.infer<typeof linkSuggestionsSchema>;

export const splitPlanSchema = z.object({
  reason: z.string(),
  splits: z.array(z.object({
    newTitle: z.string(),
    headings: z.array(z.string()),
    lineRange: z.tuple([z.number(), z.number()]),
    summary: z.string(),
    excerpt: z.string(),
  })),
});

export type SplitPlan = z.infer<typeof splitPlanSchema>;

export const tagSuggestionsSchema = z.object({
    suggestions: z.array(z.object({
        tag: z.string(),
        confidence: z.number(),
        reason: z.string(),
        source: z.enum(['content', 'graph', 'history']),
    })),
    summary: z.string(),
});

export type TagSuggestions = z.infer<typeof tagSuggestionsSchema>;

// --- New Copilot Schemas ---

export const extractConceptsSchema = z.object({
	concepts: z.array(z.object({
		term: z.string().describe('The concept or term'),
		definition: z.string().describe('Concise definition'),
		category: z.string().optional().describe('Optional category like "methodology", "theory", "tool"'),
	})),
});
export type ExtractConcepts = z.infer<typeof extractConceptsSchema>;

export const knowledgeGapsSchema = z.object({
	gaps: z.array(z.object({
		topic: z.string().describe('The missing topic'),
		description: z.string().describe('Why this gap matters'),
		suggestedTitle: z.string().describe('Suggested note title'),
		priority: z.enum(['high', 'medium', 'low']),
	})),
});
export type KnowledgeGaps = z.infer<typeof knowledgeGapsSchema>;

export const vaultHealthSchema = z.object({
	orphans: z.array(z.object({
		path: z.string(),
		title: z.string(),
		lastModified: z.string(),
	})),
	duplicates: z.array(z.object({
		paths: z.array(z.string()),
		reason: z.string(),
	})),
	stale: z.array(z.object({
		path: z.string(),
		title: z.string(),
		daysSinceModified: z.number(),
	})),
	inconsistentTags: z.array(z.object({
		tag: z.string(),
		variants: z.array(z.string()),
	})),
});
export type VaultHealth = z.infer<typeof vaultHealthSchema>;

export const addEvidenceSchema = z.object({
	evidence: z.array(z.object({
		sourceTitle: z.string(),
		sourcePath: z.string(),
		quote: z.string().describe('Relevant quote from the source'),
		insertText: z.string().describe('Formatted text to insert'),
		relevance: z.number().min(0).max(1),
	})),
});
export type AddEvidence = z.infer<typeof addEvidenceSchema>;
