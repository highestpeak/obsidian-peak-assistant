/**
 * Search-agent schemas — retained live exports only.
 * Pure definitions for dimensions and functional tags.
 */

// ----- Semantic Dimensions -----

/** Semantic depth axis: 15 dimension ids (6 groups: base -> causal -> practice -> evaluation -> context -> action). */
export const SEMANTIC_DIMENSION_IDS = [
	'essence_definition',
	'history_origin',
	'why_mechanism',
	'evidence_source',
	'pitfall_misconception',
	'how_method',
	'example_case',
	'options_comparison',
	'cost_risk_limit',
	'applicable_condition',
	'impact_consequence',
	'related_extension',
	'next_action',
	'trend_future',
	'tool_resource',
] as const;

/** All dimension ids (semantic 15 + topology + temporal). */
export const ALL_DIMENSION_IDS = [
	...SEMANTIC_DIMENSION_IDS,
	'inventory_mapping' as const,
	'temporal_mapping' as const,
] as const;

export type SemanticDimensionId = (typeof SEMANTIC_DIMENSION_IDS)[number];

// ----- Functional Tags -----

/** Level 1: Core functional views. */
export const FUNCTIONAL_TAG_CORE = [
	'current_state',
	'goal_intent',
	'constraint',
	'resource',
	'skill_stack',
	'past_attempt',
	'idea_candidate',
	'decision_opinion',
] as const;

/** Level 2: Optional enhancement. */
export const FUNCTIONAL_TAG_ENHANCEMENT = [
	'timeline_event',
	'external_context',
	'emotion_attitude',
	'evidence_data',
] as const;

/** Closed vocabulary for indexer + doc-tag LLM + slot recall (see {@link SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS}). */
export const FUNCTIONAL_TAG_IDS = [...FUNCTIONAL_TAG_CORE, ...FUNCTIONAL_TAG_ENHANCEMENT] as const;
export type FunctionalTagId = (typeof FUNCTIONAL_TAG_IDS)[number];

/**
 * Maps each semantic dimension to functional tag ids: union of slot-routing and doc-tag use cases (single source of truth).
 */
export const SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS: Record<SemanticDimensionId, FunctionalTagId[]> = {
	essence_definition: ['current_state', 'idea_candidate'],
	history_origin: ['timeline_event', 'external_context', 'past_attempt'],
	why_mechanism: ['goal_intent', 'constraint', 'evidence_data', 'decision_opinion'],
	evidence_source: ['evidence_data'],
	pitfall_misconception: ['constraint', 'past_attempt'],
	how_method: ['skill_stack', 'idea_candidate'],
	example_case: ['idea_candidate', 'evidence_data'],
	options_comparison: ['decision_opinion', 'idea_candidate'],
	cost_risk_limit: ['constraint', 'resource'],
	applicable_condition: ['current_state', 'external_context', 'constraint'],
	impact_consequence: ['decision_opinion', 'evidence_data', 'current_state'],
	related_extension: ['external_context', 'idea_candidate'],
	next_action: ['past_attempt', 'idea_candidate', 'resource', 'goal_intent'],
	trend_future: ['timeline_event', 'external_context'],
	tool_resource: ['resource', 'skill_stack'],
};

