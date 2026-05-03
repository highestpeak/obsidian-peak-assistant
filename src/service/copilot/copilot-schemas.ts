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
