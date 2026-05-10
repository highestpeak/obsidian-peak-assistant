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
        category: z.enum(['topic', 'keyword', 'functional']),
        sources: z.array(z.enum(['content', 'graph', 'history'])).optional(),
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

export const correctContentSchema = z.object({
	corrections: z.array(z.object({
		original: z.string().describe('The original text containing the error'),
		corrected: z.string().describe('The corrected text'),
		type: z.enum(['factual', 'logical', 'reference', 'typo']).describe('Type of error'),
		explanation: z.string().describe('Why this is an error and what was changed'),
		severity: z.enum(['critical', 'major', 'minor']),
	})),
	summary: z.string().describe('Overall summary of issues found'),
});
export type CorrectContentResult = z.infer<typeof correctContentSchema>;

export const vaultSummarySchema = z.object({
	period: z.string().describe('The time period covered'),
	totalNotes: z.number().describe('Total notes modified in the period'),
	groups: z.array(z.object({
		topic: z.string().describe('Topic or folder grouping'),
		notes: z.array(z.object({
			title: z.string(),
			path: z.string(),
			modifiedDate: z.string(),
		})),
		summary: z.string().describe('Narrative summary of work in this group'),
	})),
	narrative: z.string().describe('Overall narrative summary of what was worked on'),
});
export type VaultSummaryResult = z.infer<typeof vaultSummarySchema>;

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

// --- Write Article (#32) ---

export const writeArticleResultSchema = z.object({
	title: z.string(),
	content: z.string().describe('Full article text with [[wikilink]] citations'),
	sources: z.array(z.object({
		path: z.string(),
		title: z.string(),
		contribution: z.string(),
	})),
	gaps: z.array(z.object({
		topic: z.string(),
		description: z.string(),
	})).optional(),
	summary: z.string(),
});
export type WriteArticleResult = z.infer<typeof writeArticleResultSchema>;

// --- Detect & File (#34) ---

export const detectAndFileResultSchema = z.object({
	contentType: z.enum(['todo', 'reference', 'quote', 'idea', 'meeting-note', 'snippet', 'bookmark']),
	confidence: z.number().min(0).max(1),
	summary: z.string(),
	suggestions: z.array(z.object({
		path: z.string(),
		title: z.string(),
		reason: z.string(),
		score: z.number().min(0).max(1),
		insertionPoint: z.string(),
		formattedText: z.string(),
	})),
	fallbackAction: z.object({
		suggestedTitle: z.string(),
		suggestedFolder: z.string(),
		formattedText: z.string(),
	}).optional(),
});
export type DetectAndFileResult = z.infer<typeof detectAndFileResultSchema>;

// --- Check Task List (#43) ---

export const checkTaskListResultSchema = z.object({
	tasks: z.array(z.object({
		text: z.string(),
		lineNumber: z.number(),
		completed: z.boolean(),
		priority: z.enum(['high', 'medium', 'low']),
		priorityReason: z.string(),
		isOverdue: z.boolean(),
		dueDate: z.string().optional(),
		blockers: z.array(z.string()),
		isStale: z.boolean(),
		staleReason: z.string().optional(),
	})),
	recommendations: z.array(z.object({
		type: z.enum(['reorder', 'break-down', 'mark-stale', 'escalate', 'remove']),
		description: z.string(),
		affectedTasks: z.array(z.number()),
		suggestedAction: z.string(),
	})),
	summary: z.object({
		total: z.number(),
		completed: z.number(),
		incomplete: z.number(),
		overdue: z.number(),
		blocked: z.number(),
		stale: z.number(),
		completionRate: z.number(),
	}),
});
export type CheckTaskListResult = z.infer<typeof checkTaskListResultSchema>;

// --- Prompt Audit (#29) ---

export const promptAuditResultSchema = z.object({
	audits: z.array(z.object({
		promptId: z.string(),
		overallScore: z.number().min(1).max(10),
		scores: z.object({
			clarity: z.number().min(1).max(10),
			specificity: z.number().min(1).max(10),
			consistency: z.number().min(1).max(10),
			variableUsage: z.number().min(1).max(10),
			outputControl: z.number().min(1).max(10),
			errorHandling: z.number().min(1).max(10),
		}),
		strengths: z.array(z.string()),
		issues: z.array(z.object({
			severity: z.enum(['high', 'medium', 'low']),
			dimension: z.string(),
			description: z.string(),
			suggestion: z.string(),
		})),
		rewriteSuggestion: z.string().optional(),
	})),
	summary: z.object({
		totalPrompts: z.number(),
		averageScore: z.number(),
		topIssues: z.array(z.string()),
		bestPracticed: z.array(z.string()),
		needsWork: z.array(z.string()),
	}),
});
export type PromptAuditResult = z.infer<typeof promptAuditResultSchema>;
