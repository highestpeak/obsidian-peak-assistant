import type { MatchCondition } from '@/core/schemas/agents/pattern-discovery-schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeedPattern {
	template: string;
	variables: string[];
	conditions: MatchCondition;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

export const SEED_PATTERNS: SeedPattern[] = [
	{
		template: 'Summarize core insights about {documentKeywords} in my vault',
		variables: ['documentKeywords'],
		conditions: { hasActiveDocument: true },
	},
	{
		template: 'What connections exist between {recentDocuments}?',
		variables: ['recentDocuments'],
		conditions: { always: true },
	},
	{
		template: 'Overview and knowledge structure of the {currentFolder} folder',
		variables: ['currentFolder'],
		conditions: { hasActiveDocument: true },
	},
	{
		template: 'Analyze the relationship network of {activeDocumentTitle} and {outgoingLinks}',
		variables: ['activeDocumentTitle', 'outgoingLinks'],
		conditions: { hasOutgoingLinks: true },
	},
	{
		template: 'Which notes reference {activeDocumentTitle}? What themes do they share?',
		variables: ['activeDocumentTitle'],
		conditions: { hasBacklinks: true },
	},
	{
		template: 'Deep analysis of {activeDocumentTitle} with improvement suggestions',
		variables: ['activeDocumentTitle'],
		conditions: { hasActiveDocument: true },
	},
	{
		template: 'Find related notes by {documentTags} tags and compare perspectives',
		variables: ['documentTags'],
		conditions: { hasActiveDocument: true, tagMatch: [] },
	},
];

// ─── DB Record Builder ────────────────────────────────────────────────────────

export interface SeedPatternRecord {
	id: string;
	template: string;
	variables: string;
	conditions: string;
	source: string;
	confidence: number;
	usage_count: number;
	discovered_at: number;
	last_used_at: number | null;
	deprecated: number;
}

export function buildSeedRecords(): SeedPatternRecord[] {
	const now = Date.now();
	return SEED_PATTERNS.map((pattern, index) => ({
		id: `seed-${index}`,
		template: pattern.template,
		variables: JSON.stringify(pattern.variables),
		conditions: JSON.stringify(pattern.conditions),
		source: 'default',
		confidence: 1.0,
		usage_count: 0,
		discovered_at: now,
		last_used_at: null,
		deprecated: 0,
	}));
}
