/**
 * All search-agent and dashboard-update schemas in one place. Pure Zod only.
 * Re-exported by schemas/agents and schemas/dashboard for backward compatibility.
 */
import { z } from "zod/v3";
import { normalizeFilePath } from "@/core/utils/file-utils";

// ----- query classifier -----

/** Semantic depth axis: 15 dimension ids (6 groups: base → causal → practice → evaluation → context → action). */
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

/** Topology breadth axis: inventory/catalog listing. */
export const AXIS_TOPOLOGY_ID = 'inventory_mapping' as const;
/** Temporal dynamic axis: change/evolution comparison. */
export const AXIS_TEMPORAL_ID = 'temporal_mapping' as const;

/** All dimension ids (semantic 15 + topology + temporal). */
export const ALL_DIMENSION_IDS = [...SEMANTIC_DIMENSION_IDS, AXIS_TOPOLOGY_ID, AXIS_TEMPORAL_ID] as const;

const semanticDimensionIdsEnum = z.enum(SEMANTIC_DIMENSION_IDS).describe(
	`One of the 15 dimension ids, grouped as follows:

1. **Base (essence & origin)**
   - essence_definition: Core identity, definition, concept; "what it is". e.g. Define "first principle" as "decomposing from basic truths".
   - history_origin: Development, source, background; "where it came from". e.g. First principle from Aristotle, later popularized by Elon Musk.

2. **Causal (mechanism & verification)**
   - why_mechanism: Cause, mechanism, principle; "why". e.g. Information clutter reduces density due to cognitive switching cost.
   - evidence_source: Evidence, citation, supporting data; "what supports it". e.g. Cite Shannon information theory.
   - pitfall_misconception: Common pitfalls, misconceptions, traps. e.g. Mistaking that every problem needs all slots.

3. **Practice (method & example)**
   - how_method: Method, procedure, how-to; "how to do". e.g. Decompose: define first, then mechanism.
   - example_case: Examples, cases, stories; concrete illustration. e.g. Use "quantum computing" to demonstrate.

4. **Evaluation (options & cost)**
   - options_comparison: Alternatives, comparison, options; "what choices". e.g. Separate slots vs mixed.
   - cost_risk_limit: Cost, risk, limit, boundary, tradeoff. e.g. Too many slots fragments information.

5. **Context (applicability & impact)**
   - applicable_condition: Who it is for, when, scenario; "when to use". e.g. For complex decisions like AI prompt design.
   - impact_consequence: Impact, consequence, outcome; "what follows". e.g. Using slots can improve efficiency 20–40%.
   - related_extension: Related concepts, links, further reading. e.g. Link to "Chain of Thought" prompting.

6. **Action (future & resource)**
   - next_action: Next step, action suggestion; immediately actionable. e.g. Try slots on one problem.
   - trend_future: Trend, future, prediction, potential. e.g. In the AI era, slot frameworks may automate.
   - tool_resource: Tools, resources, books, software. e.g. Use Mind Maps to visualize dimensions.`
);

export type SemanticDimensionId = z.infer<typeof semanticDimensionIdsEnum>;

export type AllDimensionId = (typeof ALL_DIMENSION_IDS)[number];

/** Reusable scope for a dimension (path, tags, anchor_entity). Nullable for Azure/OpenRouter (required key, value object | null). */
const scopeConstraintSchema = z
	.object({
		path: z.string().describe('Folder or file path to lock this dimension to; use "" when none.'),
		tags: z
			.array(z.string())
			.describe(
				'Topic tags and/or functional tags for recall; use [] when none. Prefer functional tags from the provided mapping.'
			),
		anchor_entity: z
			.string()
			.describe(
				'Main subject/entity this dimension is about; use "" when none. Agent 2 uses it as a retrieval hook.'
			),
	})
	.nullable();

/** One semantic dimension target: intent + scope. */
const semanticDimensionChoiceSchema = z.object({
	id: semanticDimensionIdsEnum,
	intent_description: z
		.string()
		.min(1, 'intent_description is required.')
		.describe(
			'Concrete search task for this dimension: state what to search/retrieve in imperative form (e.g. "Search for notes that define X and list…", "Find content comparing A with B…"). Not a topic label or passive summary—must read as an actionable retrieval instruction.'
		),
	scope_constraint: scopeConstraintSchema.describe('Search scope for this dimension.'),
});

/** One topology-axis dimension (inventory_mapping): EXHAUSTIVE INVENTORY only; no teleology. */
const topologyDimensionChoiceSchema = z.object({
	intent_description: z
		.string()
		.min(1)
		.describe(
			'Only WHAT to scan and WHERE. No WHY (e.g. no "for comparison", "to evaluate"). MUST include "regardless of status or quality" and "list ALL items to ensure no omission". Forbidden: quality/success filters (successful, good, relevant, best).'
		),
	scope_constraint: scopeConstraintSchema.describe(
		'Physical boundary. Path is the most stable anchor; tags are valid as navigation/dimension. When using tags, prefer user-mentioned or vault-known names to avoid empty results.'
	),
});

/** One temporal-axis dimension (temporal_mapping): change/evolution. intent_description is enough. */
const temporalDimensionChoiceSchema = z.object({
	intent_description: z.string().min(1).describe('Goal: compare recent vs historical change/evolution.'),
	scope_constraint: scopeConstraintSchema,
});

export const USER_APPEAL_TYPES = [
	'cognitive_learning',
	'task_instrumental',
	'emotional_resonance',
	'identity_validation',
	'risk_aversion',
	'inspiration_perspective',
	'existential_meaning',
	'control_framework',
	'moral_tribal',
] as const;

export type UserAppealType = (typeof USER_APPEAL_TYPES)[number];

export const USER_APPEAL_LABELS: Record<UserAppealType, string> = {
	cognitive_learning: 'Learning / cognitive',
	task_instrumental: 'Task / instrumental',
	emotional_resonance: 'Emotional resonance',
	identity_validation: 'Identity validation',
	risk_aversion: 'Risk aversion / reassurance',
	inspiration_perspective: 'Inspiration / perspective',
	existential_meaning: 'Existential / meaning',
	control_framework: 'Control / causal framework',
	moral_tribal: 'Moral / tribal justice',
};

export const queryClassifierOutputSchema = z.object({
	/** Semantic depth axis: one or more of the 15 dimension ids. */
	semantic_dimensions: z
		.array(semanticDimensionChoiceSchema)
		.min(1)
		.describe(
			'Semantic axis. One or more dimension targets. Same id may repeat with different intent_description. Each may have scope_constraint and retrieval_orientation.'
		),
	/** Topology breadth axis: inventory/audit (full list), not semantic search. Required; use [] when point-type only. */
	topology_dimensions: z
		.array(topologyDimensionChoiceSchema)
		.min(1)
		.describe(
			'Topology axis: physical inventory of entities under path/tag. List-first, no quality filter. Empty array only if query is strictly point-type (single entity), not surface-type (collection).'
		),
	/** Temporal dynamic axis: change/evolution comparison. Required; use [] when not applicable. */
	temporal_dimensions: z
		.array(temporalDimensionChoiceSchema)
		.min(1)
		.describe(
			'Temporal axis. Zero or more temporal_mapping targets. Empty array if no change/trend/evolution intent.'
		),
});

export type QueryClassifierOutput = z.infer<typeof queryClassifierOutputSchema>;
export type SemanticDimensionChoice = z.infer<typeof semanticDimensionChoiceSchema>;
export type TopologyDimensionChoice = z.infer<typeof topologyDimensionChoiceSchema>;
export type TemporalDimensionChoice = z.infer<typeof temporalDimensionChoiceSchema>;

/** Unified dimension choice for pipeline (semantic + topology + temporal flattened). */
export const dimensionChoiceSchema = z.object({
	id: z.enum(ALL_DIMENSION_IDS),
	intent_description: z.string().min(1),
	scope_constraint: scopeConstraintSchema,
	retrieval_orientation: z.enum(['relational', 'chronological', 'statistical', 'categorical']).nullable(),
	output_format: z.enum(['list', 'tree']).nullable(),
	mustIncludeKeywords: z.array(z.string()).nullable(),
});
export type DimensionChoice = z.infer<typeof dimensionChoiceSchema>;

// ----- Combined Classify + Decompose (single LLM call) -----

/** Combined output: classify dimensions + physical search tasks in one shot. */
export const queryUnderstandingOutputSchema = z.object({
	semantic_dimensions: z
		.array(semanticDimensionChoiceSchema)
		.min(1)
		.describe(
			'Semantic axis. Select ALL applicable dimensions from the 15 semantic dimension ids. Most queries touch 3-6 dimensions. Same id may repeat with different intent_description. Each may have scope_constraint and retrieval_orientation. Be thorough — missing dimensions means missing search coverage.'
		),
	topology_dimensions: z
		.array(topologyDimensionChoiceSchema)
		.describe(
			'Topology axis: physical inventory of entities under path/tag. List-first, no quality filter. Empty array only if query is strictly point-type (single entity), not surface-type (collection).'
		),
	temporal_dimensions: z
		.array(temporalDimensionChoiceSchema)
		.describe(
			'Temporal axis. Zero or more temporal_mapping targets. Empty array if no change/trend/evolution intent.'
		),
	physical_tasks: z.array(z.object({
		unified_intent: z.string().min(1).describe('Synthesized retrieval instruction merging covered dimensions into one imperative retrieval mission.'),
		covered_dimension_ids: z.array(z.enum(ALL_DIMENSION_IDS)).min(1).describe('Logical dimension ids that this task will feed; results are mapped back to each.'),
		search_priority: z.number().int().min(0).describe('Execution order; lower = higher priority.'),
		scope_constraint: scopeConstraintSchema.describe('Merged path/tags/anchor for this task; use intersection or dominant scope of covered dimensions.'),
	})).min(1).describe('Physical search tasks: minimal non-overlapping set covering ALL dimensions above. 1-5 tasks.'),
});
export type QueryUnderstandingOutput = z.infer<typeof queryUnderstandingOutputSchema>;

// ----- Search Architect (Dimension-to-Task Collapse) -----

/** One physical search task: merged scope + unified query, covers one or more logical dimensions. */
export const physicalSearchTaskSchema = z.object({
	unified_intent: z.string().min(1).describe('Synthesized search instruction (not a keyword list): one imperative retrieval mission that merges the intent_description of all covered dimensions. Same style as dimension intent—e.g. "Search for notes that define X, compare alternatives, and state applicable conditions and trends."'),
	covered_dimension_ids: z.array(z.enum(ALL_DIMENSION_IDS)).min(1).describe('Logical dimension ids that this task will feed; results are mapped back to each.'),
	search_priority: z.number().int().min(0).describe('Execution order; lower = higher priority.'),
	scope_constraint: scopeConstraintSchema.describe('Merged path/tags/anchor for this task; use intersection or dominant scope of covered dimensions.'),
});
export type PhysicalSearchTask = z.infer<typeof physicalSearchTaskSchema>;

/** Search Architect output: collapsed physical tasks. Count is dynamic (1..N) based on overlap. */
export const searchArchitectOutputSchema = z.object({
	physical_tasks: z.array(physicalSearchTaskSchema).min(1).describe('Physical recon tasks; each runs once and results map to covered_dimension_ids.'),
});
export type SearchArchitectOutput = z.infer<typeof searchArchitectOutputSchema>;

/** Task + paths + messages + history for physical-task recon; used for debug and onReconFinish payload. messages are ModelMessage[] from RawSearchAgent. */
export type PhysicalTaskReconResult = {
	task: PhysicalSearchTask;
	paths: string[];
	/** Conversation messages from the recon loop (plan + path-submit rounds). */
	messages: unknown[];
	pathSubmitHistory: PathSubmitHistoryEntry[];
};

export const defaultClassify: QueryClassifierOutput = {
	semantic_dimensions: [
		{
			id: 'essence_definition',
			intent_description: 'Semantic axis: Focuses on the core subject, concept, or content being queried. Used for “what is/topic/content” type questions and summarization of main points or purposes.',
			scope_constraint: null,
		}
	],
	topology_dimensions: [
		{
			intent_description: 'Topological breadth axis: Determines whether the query targets a “point” (a specific entity) or a “surface” (a set or collection). If it involves collections (such as all/list/directory/relationships), the Inventory_Mapping dimension is activated to enumerate all relevant entities/paths (highest priority).',
			scope_constraint: null,
		}
	],
	temporal_dimensions: [
		{
			intent_description: 'Spatiotemporal dynamics axis: Determines if the query concerns “change/recent/evolution/comparison/trend”. If so, the Delta_Comparison dimension is activated to focus on differences, versions, or historical shifts.',
			scope_constraint: null,
		}
	],
};

// ----- RawSearch (Recon / Evidence) -----

/** Battlefield assessment for RawSearch report. Kept short to avoid long path-submit output. */
export const battlefieldAssessmentSchema = z.object({
	search_density: z.enum(['High', 'Medium', 'Low']).nullable(),
	match_quality: z.enum(['Exact', 'Fuzzy', 'None']).nullable(),
	suggestion: z.string().max(400).nullable().describe('Short hint for evidence phase; ~50 words max'),
});

/** Input for submit_recon_paths: incremental path list; merged into final report when request_submit_report triggers report generation. */
export const submitReconPathsSchema = z.object({
	paths: z.array(z.string()).describe('Full set of in-scope, relevant paths from that tool result (no sample/subset). Prefer one call; if splitting, use large batches (e.g. 100-200).'),
});
export type SubmitReconPathsInput = z.infer<typeof submitReconPathsSchema>;

/** Report from Recon Agent: tactical summary + leads + assessment. Produced by path-submit step to guide subsequent search. */
export const rawSearchReportSchema = z.object({
	tactical_summary: z.string().max(2000).describe('Short summary or compact manifest; max 300 words. Prefer signal over length.'),
	discovered_leads: z.array(z.string()).describe('Paths or entity names for deeper evidence collection. No fixed maximum; include all relevant items for this dimension; prefer comprehensive coverage.'),
	battlefield_assessment: battlefieldAssessmentSchema.nullable(),
});
export type RawSearchReport = z.infer<typeof rawSearchReportSchema> & { search_history_summary?: string };

/** LLM describes how to acquire paths: expand these folder prefixes (code will list all files under them). */
export const leadStrategySchema = z.object({
	must_expand_prefixes: z.array(z.string()).describe('Folder path prefixes to expand to full file list (e.g. "kb2-learn-prd/B-2-创意和想法管理/A-All Ideas/"). Code will list every file under each prefix.'),
	include_path_regex: z.array(z.string()).nullable().describe('Optional: include only paths matching any of these regexes (applied to vault paths). Use null when not needed.'),
	exclude_path_regex: z.array(z.string()).nullable().describe('Optional: exclude paths matching any of these regexes. Use null when not needed.'),
	max_expand_results: z.number().min(1).max(10000).nullable().describe('Cap total paths from expansion (default 5000). Use null for default.'),
});

/** LLM describes a scoped search to run; code will execute and collect result paths. */
export const searchPlanItemSchema = z.object({
	scope_path: z.string().describe('Folder path to search within (e.g. "kb2-learn-prd/B-2-创意和想法管理/").'),
	query: z.string().describe('Search query (keywords or semantic description).'),
	search_mode: z.enum(['fulltext', 'vector', 'hybrid']).nullable().describe('Search mode. Use null for default fulltext.'),
	top_k: z.number().min(1).max(200).nullable().describe('Max results. Use null for default 80.'),
});

/** Path-submit step: LLM outputs strategy + small leads; code resolves to full path list. */
export const pathSubmitOutputSchema = z.object({
	tactical_summary: z.string().max(2000).describe('Short summary or compact inventory from this round; max 300 words.'),
	battlefield_assessment: battlefieldAssessmentSchema.nullable(),
	lead_strategy: leadStrategySchema.nullable().describe('How to acquire paths by expanding folders and/or filtering vault paths by regex. Use null when not needed.'),
	search_plan: z.array(searchPlanItemSchema).nullable().describe('Scoped searches to run; code will execute each and collect result paths. Use null when not needed.'),
	discovered_leads: z.array(z.string()).max(20).nullable().describe('At most 20 scattered .md file paths only. Do not list images, excalidraw, or paths under must_expand_prefixes (those are auto-expanded). Use null when not needed.'),
	/** When true, recon loop ends after this round; system will generate the final report. Set from battlefield + coverage assessment. */
	should_submit_report: z.boolean().describe('True when coverage is complete, round budget is reached, or further exploration adds no new leads; false to continue next round.'),
});
export type PathSubmitHistoryEntry = {
	lead_strategy?: PathSubmitOutput['lead_strategy'];
	search_plan?: PathSubmitOutput['search_plan'];
	resolved_count?: number
};
export type PathSubmitOutput = z.infer<typeof pathSubmitOutputSchema>;
export type RawSearchReportWithDimension = { dimension: AllDimensionId; } & RawSearchReport;

/** Single fact with quote (for EvidencePack). */
export const evidenceFactSchema = z.object({
	claim: z.string().describe('One-sentence claim from the source'),
	quote: z.string().describe('Exact quote supporting the claim'),
	confidence: z.enum(['high', 'medium', 'low']).nullable(),
});

/** One evidence pack: one source, summary + facts + snippet. */
export const evidencePackSchema = z.object({
	origin: z.object({
		tool: z.string().describe('Tool that produced this source (e.g. content_reader, local_search)'),
		path_or_url: z.string().describe('File path or URL of the source'),
	}),
	summary: z.string().nullable().describe('Short summary of this pack'),
	facts: z.array(evidenceFactSchema).describe('1–5 facts with claim+quote'),
	snippet: z.object({ type: z.enum(['extract', 'condensed']), content: z.string() }).nullable().describe('Key excerpt from source'),
});
export type EvidencePack = z.infer<typeof evidencePackSchema>;

export const submitEvidencePackInputSchema = z.object({
	packs: z.array(evidencePackSchema).min(1).max(12).describe('3–8 evidence packs; each with origin, facts, optional snippet'),
});

/** Input for mark_task_completed: only taskId. */
export const markTaskCompletedInputSchema = z.object({
	taskId: z.string().describe('ID of the task that is now completed'),
});

export const consolidatedTaskSchema = z.object({
	path: z.string(),
	relevant_dimension_ids: z.array(
		/** Consolidator: one path, which dimensions need it, synthesized focus, priority. taskId assigned by runner. */
		z.object({
			id: z.enum(ALL_DIMENSION_IDS),
			intent: z.string().describe('From original dimension intent_description or merged extraction intent'),
		})
	),
	extraction_focus: z.string().describe('Synthesized focus for Evidence Agent for this file'),
	priority: z.enum(['Crucial', 'Secondary']).describe('Crucial if 3+ dimensions need it; Secondary or drop if marginal'),
	task_load: z.enum(['high', 'medium', 'low']).nullable().describe('For grouping and concurrency'),
});
export type ConsolidatedTask = z.infer<typeof consolidatedTaskSchema>;

export type ConsolidatedTaskWithId = ConsolidatedTask & { taskId: string };

export const consolidatorOutputSchema = z.object({
	consolidated_tasks: z.array(consolidatedTaskSchema),
	global_recon_insight: z.string().describe('up to 500 words summary of current recon state'),
});
export type ConsolidatorOutput = z.infer<typeof consolidatorOutputSchema>;

/** Per-group output from Group Context Refinement LLM (topic + focus for Evidence Agent). */
export const groupContextItemSchema = z.object({
	topic_anchor: z.string().describe('Unified theme for this group of files'),
	group_focus: z.string().describe('Instruction for Evidence Agent: what to compare and dig for when reading these files'),
});
export type GroupContextItem = z.infer<typeof groupContextItemSchema>;

/** Input for set_group_context tool: one group's topic_anchor and group_focus (group_index 0-based). */
export const setGroupContextInputSchema = z.object({
	group_index: z.number().int().min(0).describe('0-based index of the group'),
	topic_anchor: z.string().describe('Unified theme for this group of files'),
	group_focus: z.string().describe('Instruction for Evidence Agent: what to compare and dig for'),
});
export type SetGroupContextInput = z.infer<typeof setGroupContextInputSchema>;

export const groupContextRefinementOutputSchema = z.object({
	groups: z.array(groupContextItemSchema).describe('One item per input group, same order'),
});
export type GroupContextRefinementOutput = z.infer<typeof groupContextRefinementOutputSchema>;

/** Full evidence group: tasks + scheduler-generated context (topic_anchor, group_focus) for Evidence Agent. sharedContext is markdown rendered from programmatic stats (folders, tags, intra-group graph). */
export interface EvidenceTaskGroup {
	groupId: string;
	topic_anchor: string;
	group_focus: string;
	tasks: ConsolidatedTaskWithId[];
	/** Rendered markdown from weavePathsToContext (folders, top tags, mermaid graph); set per-group or from recon weaved context. */
	sharedContext?: string;
	clustering_reason?: string;
}

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

// ----- follow-up questions -----
/** Schema for streamObject in FollowUpQuestionAgent. */
export const suggestedFollowUpQuestionsSchema = z.object({
	questions: z.array(z.string()).describe("Follow-up questions the user might ask next"),
});
export type SuggestedFollowUpQuestions = z.infer<typeof suggestedFollowUpQuestionsSchema>;

// ----- overview logic model (Phase 1 for weaveEvidence2MermaidOverview) -----
const OVERVIEW_NODE_KINDS = ['nucleus', 'decision', 'fact', 'heuristic'] as const;
const OVERVIEW_EDGE_RELATIONS = ['cause', 'prerequisite', 'conflict', 'feedback', 'correlate', 'synergy'] as const;
const OVERVIEW_NODES_MIN = 6;
const OVERVIEW_NODES_MAX = 12;

const overviewLogicModelNucleusSchema = z.object({
	nodeIndex: z.number().int().min(0).describe('Index of the nucleus node in the nodes array (0-based); Mermaid phase will assign id N1, N2, ... by order'),
	statement: z.string().describe('Core tension or central claim'),
	hiddenOpposition: z.string().nullable().describe('Implicit opposite (e.g. cost vs benefit)'),
});

const overviewLogicModelNodeSchema = z.object({
	label: z.string().max(60).describe('Short display label'),
	kind: z.enum(OVERVIEW_NODE_KINDS),
	importance: z.number().min(0).max(10),
	confidence: z.enum(['high', 'medium', 'low']),
	sourceRefs: z.array(z.string()).describe('Fact refs e.g. F1, F2 or source ids'),
	clusterId: z.string().nullable(),
});

const overviewLogicModelEdgeSchema = z.object({
	fromIndex: z.number().int().min(0),
	toIndex: z.number().int().min(0),
	relation: z.enum(OVERVIEW_EDGE_RELATIONS),
	label: z.string().max(40),
	rationaleFactRefs: z.array(z.string()).nullable(),
});

const overviewLogicModelClusterSchema = z.object({
	id: z.string(),
	title: z.string().max(30),
	nodeIndices: z.array(z.number().int().min(0)),
});

const overviewLogicModelTimelineSchema = z.object({
	phases: z.array(z.object({
		phaseId: z.string(),
		label: z.string(),
		nodeIndices: z.array(z.number().int().min(0)),
	})).nullable(),
}).nullable();

export const overviewLogicModelSchema = z.object({
	nucleus: overviewLogicModelNucleusSchema,
	nodes: z.array(overviewLogicModelNodeSchema).min(OVERVIEW_NODES_MIN).max(OVERVIEW_NODES_MAX),
	edges: z.array(overviewLogicModelEdgeSchema),
	clusters: z.array(overviewLogicModelClusterSchema).nullable(),
	timeline: overviewLogicModelTimelineSchema,
}).superRefine((data, ctx) => {
	const hasConflictOrFeedback = data.edges.some(e => e.relation === 'conflict' || e.relation === 'feedback');
	if (!hasConflictOrFeedback) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'At least one edge must have relation "conflict" or "feedback". Rescan evidence for tensions or loops.',
		});
	}
	const n = data.nodes.length;
	if (data.nucleus.nodeIndex >= n) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `nucleus.nodeIndex ${data.nucleus.nodeIndex} must be < nodes.length (${n}).`,
		});
	}
	for (const e of data.edges) {
		if (e.fromIndex >= n || e.toIndex >= n) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Edge fromIndex ${e.fromIndex} toIndex ${e.toIndex} must be < nodes.length (${n}).`,
			});
			break;
		}
	}
	for (const c of data.clusters ?? []) {
		for (const i of c.nodeIndices) {
			if (i >= n) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Cluster ${c.id} nodeIndex ${i} must be < nodes.length (${n}).`,
				});
				break;
			}
		}
	}
});

export type OverviewLogicModel = z.infer<typeof overviewLogicModelSchema>;

// ----- review blocks -----
export const needMoreDashboardBlocksInputSchema = z.object({
	reason: z.string().describe("The reason why we need more dashboard blocks."),
});

// ----- dashboard update plan -----
const TOPICS_PLAN_MAX = 50;
const BLOCK_PLAN_MAX = 12;

/** Plan schema for dashboard update (topicsPlan + blockPlan). Used by DashboardUpdateAgent type inference. */
export const dashboardUpdatePlanSchema = z.object({
	topicsPlan: z
		.array(z.string())
		.max(TOPICS_PLAN_MAX)
		.nullable()
		.describe("5-50 short topic instructions; avoid exhaustive lists"),
	blockPlan: z
		.array(z.string())
		.max(BLOCK_PLAN_MAX)
		.nullable()
		.describe("3-12 block instructions"),
	note: z.string().nullable(),
});

export const submitTopicsPlanInputSchema = z
	.object({
		plan: z
			.array(z.string())
			.max(8)
			.describe("5–8 topic instructions; theme synthesis, not isolated topics."),
	})
	.describe("Each plan describes a topic to be created or updated.");

export const submitBlocksPlanInputSchema = z
	.object({
		plan: z
			.array(z.string())
			.describe(
				"Block instructions. Each string MUST reference Confirmed Facts by index (e.g. 'Based on Fact #3 and #5') and, when the block needs vault content, include the data source path or a clear lookup hint so the Blocks agent can call_search_agent."
			),
	})
	.describe("Submit the blocks update plan with evidence binding and optional source paths.");

// ----- report plan (ReportPlanAgent) -----

/** Ordered phase IDs for section-by-section report planning. Single source of truth. */
export const REPORT_PLAN_PHASE_IDS = [
	"intent_insight",
	"summary_spec",
	"overview_mermaid",
	"topics",
	"body_intent_insight",
	"body_scqa",
	"body_methodology",
	"body_insight_pillar",
	"body_recommendations_roadmap",
	"body_risks_dependencies",
	"body_next_actions",
	"body_followup_questions",
	"appendices",
	"actions_todo_list",
	"actions_followup_questions",
] as const;

export type ReportPlanPhaseId = (typeof REPORT_PLAN_PHASE_IDS)[number];

/** Body phases (subset of REPORT_PLAN_PHASE_IDS) that produce BodyBlockSpec[]. Single source of truth. */
export const REPORT_PLAN_BODY_PHASE_IDS: readonly ReportPlanPhaseId[] = REPORT_PLAN_PHASE_IDS.filter(
	(id): id is ReportPlanPhaseId => id.startsWith('body_')
);

/** Re-exported from search-agent-prompts.ts (single source of truth for prompt template strings). */
export { REPORT_PLAN_PHASE_REQUIREMENTS } from './search-agent-prompts';

/** Input for submit_phase_and_get_next_to_plan tool. */
export const submitReportPhaseInputSchema = z.object({
	phaseId: z
		.string()
		.describe(
			"Current section phase id (chapter). Same phase can be submitted multiple times for multiple pages; use status to control when to advance."
		),
	planMarkdown: z
		.string()
		.min(1)
		.describe(
			"Plan for this page/slide of the section: purpose, output shape, evidence binding, word/structural constraints, citation format. One page per call."
		),
	dependencies: z
		.array(z.string())
		.nullable()
		.describe("BlockIds, Fact #N, or SourceIDs this section depends on."),
	status: z
		.enum(["draft", "final"])
		.nullable()
		.default("final")
		.describe(
			"Use 'draft' to submit another page for the same phase (you receive the same phaseId again). Use 'final' when this phase has no more pages (you receive the next phase)."
		),
});

export type SubmitReportPhaseInput = z.infer<typeof submitReportPhaseInputSchema>;

/** Tool return: next section to plan or done. When status was "draft", nextPhaseId is the same phase (more pages). */
export interface SubmitReportPhaseOutput {
	nextPhaseId: string | null;
	nextRequirementsMarkdown: string;
	done: boolean;
}

/** Spec for one body block in the report plan. */
export const bodyBlockSpecSchema = z.object({
	blockId: z.string().describe("Stable id for this block (no colons); used for (#block-<id>) anchors."),
	title: z.string().describe("Block display title."),
	role: z.string().describe("Role: e.g. SCQA, methodology, pillar, recommendations, risks, next_actions, followup_questions."),
	paragraphSkeleton: z.string().nullable().describe("SCQA or narrative skeleton; bullet/paragraph structure."),
	evidenceBinding: z.string().nullable().describe("Fact #N, [[path]], or SourceID binding rules."),
	chartOrTableShape: z.string().nullable().describe("Table headers or mermaid diagram type + node/label hints."),
	risksUncertaintyHint: z.string().nullable().describe("Gaps, assumptions, or uncertainty to surface."),
	wordTarget: z.number().nullable().describe("Target word count (e.g. 300-500)."),
});

export type BodyBlockSpec = z.infer<typeof bodyBlockSpecSchema>;

/** Spec for one appendix block. */
export const appendicesBlockSpecSchema = z.object({
	blockId: z.string(),
	title: z.string(),
	role: z.string().describe("e.g. data_tables, sensitivity_analysis, methodology_deep_dive, glossary, references."),
	contentHint: z.string().nullable().describe("What to include; surprise-high markers if applicable."),
});

export type AppendicesBlockSpec = z.infer<typeof appendicesBlockSpecSchema>;

/** Full report plan produced by ReportPlanAgent. */
export const reportPlanSchema = z.object({
	intentInsight: z.string().nullable().describe("One paragraph: user subtext, assumed context, success criteria, confidence."),
	summarySpec: z
		.string()
		.nullable()
		.describe("Constraints: ~1000 words, answer-first, key recommendations, 3-5 rationale bullets, so-what impact, block anchors."),
	overviewMermaidSpec: z
		.string()
		.nullable()
		.describe("Top 10 core nodes; diagram type; node naming and citation rules."),
	topicsSpec: z.string().nullable().describe("3-6 MECE pillars; one conclusion + why + block refs per pillar."),
	bodyBlocksSpec: z.array(bodyBlockSpecSchema).nullable().default([]),
	appendicesBlocksSpec: z.array(appendicesBlockSpecSchema).nullable().default([]),
	actionItemsSpec: z.string().nullable().describe("TODO list rules from evidence next_action / implicitly suggested."),
	followupQuestionsSpec: z.string().nullable().describe("High-value follow-up rules: fill gaps, blind spots, alternatives."),
	sourcesViewsSpec: z.string().nullable().describe("List / graph / evidence cards generation; reuse SourcesSection where possible."),
});

export type ReportPlan = z.infer<typeof reportPlanSchema>;

// ----- visual blueprint (VisualBlueprintAgent) -----

/** Task type driving chart choice: compare, trend, composition, etc. */
export const visualTaskTypeSchema = z.enum([
	'compare', 'trend', 'composition', 'distribution', 'relationship',
	'hierarchy', 'process', 'roadmap', 'table', 'network', 'other',
]);
export type VisualTaskType = z.infer<typeof visualTaskTypeSchema>;

/** Mermaid diagram type for prescription. */
export const mermaidDiagramTypeSchema = z.enum([
	'flowchart', 'mindmap', 'timeline', 'gantt', 'quadrantChart', 'pie', 'xyChart', 'treemap', 'other',
]);
export type MermaidDiagramType = z.infer<typeof mermaidDiagramTypeSchema>;

/** Single visual prescription: diagram type, reason, mapping, and execution hint. */
export const visualDiagramPrescriptionSchema = z.object({
	diagramType: mermaidDiagramTypeSchema.describe('Mermaid diagram type.'),
	reason: z.string().nullable().describe('Why this chart; guideline reference.'),
	dataMapping: z.string().nullable().describe('X/category, Y/size, or axis mapping.'),
	mermaidDirectiveCard: z.string().nullable().describe('Short instruction for section agent: syntax + constraints.'),
});

export type VisualDiagramPrescription = z.infer<typeof visualDiagramPrescriptionSchema>;

/** Audience precision: scan = high-level, analyst = detail. */
export const audiencePrecisionSchema = z.enum(['scan', 'analyst']);
export type AudiencePrecision = z.infer<typeof audiencePrecisionSchema>;

/** Data type for the block content. */
export const visualDataTypeSchema = z.enum(['qualitative', 'quantitative', 'mixed']);
export type VisualDataType = z.infer<typeof visualDataTypeSchema>;

/** One block's visual prescription from Visual Architect. */
export const visualPrescriptionSchema = z.object({
	blockId: z.string().describe('Stable block id from report plan.'),
	title: z.string().describe('Block display title.'),
	audiencePrecision: audiencePrecisionSchema.nullable().describe('Who consumes: scan or analyst.'),
	dataType: visualDataTypeSchema.nullable().describe('Qualitative, quantitative, or mixed.'),
	needVisual: z.boolean().describe('Whether this block should include a diagram.'),
	primary: visualDiagramPrescriptionSchema.nullable().describe('Main diagram prescription.'),
	secondary: visualDiagramPrescriptionSchema.nullable().describe('Optional second diagram.'),
	warnings: z.array(z.string()).nullable().describe('e.g. avoid pie, prefer bar; qualitative → mindmap.'),
});

export type VisualPrescription = z.infer<typeof visualPrescriptionSchema>;

/** Full visual blueprint produced by VisualBlueprintAgent. */
export const reportVisualBlueprintSchema = z.object({
	blocks: z.array(visualPrescriptionSchema).default([]).describe('Per-block prescriptions.'),
	globalStyleNotes: z.string().nullable().describe('Global diversity/consistency notes.'),
});

export type ReportVisualBlueprint = z.infer<typeof reportVisualBlueprintSchema>;

/** Input for submit_prescription_and_get_next tool. */
export const submitPrescriptionInputSchema = z.object({
	blockId: z.string().describe('Current block id.'),
	title: z.string().nullable().describe('Block title.'),
	prescriptionMarkdown: z.string().nullable().describe('Human-readable prescription.'),
	prescription: visualPrescriptionSchema.nullable().describe('Structured prescription.'),
	status: z.enum(['draft', 'final']).nullable().default('final').describe('final = done with this block, advance to next.'),
});

export type SubmitPrescriptionInput = z.infer<typeof submitPrescriptionInputSchema>;

/** Tool return: next block to prescribe or done. */
export interface SubmitPrescriptionOutput {
	nextBlockId: string | null;
	nextRequirementsMarkdown: string;
	done: boolean;
}

// ----- dashboard update tools -----
/** Placeholder string for empty/untitled fields. Used in schemas only. */
export const DEFAULT_PLACEHOLDER = "Untitled";

/** Message used in superRefine when item has no meaningful content. */
export const NO_MEANINGFUL_CONTENT_MESSAGE = "has no meaningful content, discarding";

/** Normalizes tool arg: LLM may send { input: string } instead of a plain string. */
export const overviewMermaidInputSchema = z.preprocess(
	(val) =>
		typeof val === "object" &&
			val !== null &&
			"input" in val &&
			typeof (val as { input: unknown }).input === "string"
			? (val as { input: string }).input
			: val,
	z
		.string()
		.describe(
			"Raw Mermaid diagram code (e.g. flowchart TD\\n  A[label] --> B[label])"
		)
);

/** Source-score pair schema for batch update. */
export const updateSourceScoresInputSchema = z.object({
	scores: z
		.array(
			z.object({
				sourceId: z.string().describe("Source id or path to match"),
				score: z
					.number()
					.min(0)
					.max(100)
					.describe("Relevance score 0-100; 0 for low relevance"),
			})
		)
		.describe("Source-score pairs to batch update"),
});

/**
 * Dashboard block content schemas by render engine. Pure Zod; no mermaid/vault deps.
 */
export const DASHBOARD_BLOCK_CONTENT_SCHEMAS = {
	MARKDOWN: z.object({
		renderEngine: z.literal("MARKDOWN"),
		markdown: z
			.string()
			.min(1, "Markdown content is required for MARKDOWN engine"),
	}),
	MERMAID: z.object({
		renderEngine: z.literal("MERMAID"),
		mermaidCode: z
			.string()
			.min(1, "Mermaid code is required for MERMAID engine"),
	}),
	TILE: z.object({
		renderEngine: z.literal("TILE"),
		items: z
			.array(
				z.object({
					id: z
						.string()
						.default(
							() =>
								`item:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
						),
					title: z.string().default(DEFAULT_PLACEHOLDER),
					description: z.string().nullable(),
					icon: z.string().nullable(),
					color: z.string().nullable(),
				})
			)
			.min(1, "Items are required for TILE engine")
			.describe(
				'Items of the block. It will be displayed in the UI. eg: "item1", "item2", etc.'
			),
	}),
	ACTION_GROUP: z.object({
		renderEngine: z.literal("ACTION_GROUP"),
		items: z
			.array(
				z.object({
					id: z
						.string()
						.default(
							() =>
								`item:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
						),
					title: z.string().default(DEFAULT_PLACEHOLDER),
					description: z.string().nullable(),
					icon: z.string().nullable(),
					color: z.string().nullable(),
				})
			)
			.min(1, "Items are required for ACTION_GROUP engine")
			.describe(
				"Action items: next steps, experiments, or TODOs. Same shape as TILE items."
			),
	}),
} as const;

export const BlockContentSchema = z.discriminatedUnion("renderEngine", [
	DASHBOARD_BLOCK_CONTENT_SCHEMAS.MARKDOWN,
	DASHBOARD_BLOCK_CONTENT_SCHEMAS.MERMAID,
	DASHBOARD_BLOCK_CONTENT_SCHEMAS.TILE,
	DASHBOARD_BLOCK_CONTENT_SCHEMAS.ACTION_GROUP,
]);

// ----- update-result item schemas (used by DashboardUpdateToolBuilder) -----

export const topicItemSchema = z
	.preprocess(
		(raw: unknown) => {
			if (!raw || typeof raw !== "object") return raw;
			const o = raw as Record<string, unknown>;
			const label = o.label ?? o.name ?? o.title;
			return { ...o, label: label ? String(label).trim() : undefined };
		},
		z
			.object({
				label: z.string().default(DEFAULT_PLACEHOLDER),
				weight: z
					.number()
					.min(0)
					.max(1)
					.nullable()
					.describe(
						"How important this topic is. eg: 0.5, 0.75, 1.0"
					),
				suggestQuestions: z
					.array(z.string())
					.nullable()
					.describe(
						"Suggested questions to ask about this topic. " +
						"Please provide at least 3 questions. at most 5 questions. Each question should be a single sentence no more than 10 words." +
						'eg: "What is the main idea of the topic?"'
					),
			})
			.superRefine((data, ctx) => {
				if (
					(!data.label || data.label === DEFAULT_PLACEHOLDER) &&
					data.weight === undefined
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: NO_MEANINGFUL_CONTENT_MESSAGE,
					});
				}
			})
	);

export const DEFAULT_NODE_TYPE = "cosmo";
const FILE_NODE_TYPE = new Set(["file", "document", "doc"]);
const OTHER_NODE_TYPE = new Set([
	DEFAULT_NODE_TYPE,
	"concept",
	"tag",
	"topic",
]);
const RECOMMENDED_TYPES = new Set([
	...Array.from(OTHER_NODE_TYPE),
	...Array.from(FILE_NODE_TYPE),
]);

function humanizeNodeLabel(raw: string): string {
	if (!raw || typeof raw !== "string") return raw;
	let s = raw.trim();
	if (!s) return s;
	if (s.toLowerCase().startsWith("node_")) s = s.slice(5).trim();
	s = s
		.replace(/[_\u2013\u2014-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return s || raw;
}

function looksLikeFilePath(path: string): boolean {
	if (!path || typeof path !== "string") return false;
	const p = path.trim();
	return p.includes("/") || /\.(md|markdown)$/i.test(p);
}

function stripTypedPrefixForDisplay(text: string): string {
	if (!text || typeof text !== "string") return text;
	const s = text.trim();
	const lower = s.toLowerCase();
	const prefixes = [
		"file:",
		"concept:",
		"tag:",
		"topic:",
		"cosmo:",
		"node:",
		"document:",
	];
	for (const p of prefixes) {
		if (lower.startsWith(p)) {
			return s
				.slice(p.length)
				.replace(/^-+|\s+/g, " ")
				.trim() || s;
		}
	}
	return s;
}

const normalizeSpecialKey = (raw: unknown): string => {
	const text = String(raw ?? "").trim().toLowerCase();
	return text
		.replace(/[_\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
};
const toNormalizedCosmoNodeId = (type: string, idOrPath: string): string =>
	`${type}:${normalizeSpecialKey(idOrPath)}`;
const isPlaceholder = (s: string) =>
	!s ||
	s.trim() === "" ||
	s === DEFAULT_PLACEHOLDER ||
	s === "Untitled";

export const graphNodeItemSchema = z
	.preprocess(
		(raw: unknown) => {
			if (!raw || typeof raw !== "object") return raw;
			const o = raw as Record<string, unknown>;
			const type = o.type ?? o.nodeType;
			const label = o.label ?? o.nodeName ?? o.title;
			return {
				...o,
				type: type ? String(type).trim() : undefined,
				label: label ? String(label).trim() : undefined,
			};
		},
		z.object({
			id: z.string().nullable(),
			type: z
				.string()
				.default(DEFAULT_NODE_TYPE)
				.describe(
					`Type of the node. Recommended: ${Array.from(RECOMMENDED_TYPES).join(", ")}. You can also use custom types if appropriate.`
				),
			label: z
				.string()
				.default(DEFAULT_PLACEHOLDER)
				.describe(
					"The label of the node. It will be displayed in the graph."
				),
			path: z
				.string()
				.nullable()
				.describe(
					`${FILE_NODE_TYPE.size > 0 ? Array.from(FILE_NODE_TYPE).join(", ") : "document"} nodes must have a valid path.`
				),
			attributes: z
				.record(z.any())
				.default(() => ({}))
				.describe(
					"Attributes of the node. It will be used to store the node's metadata. User can see this via a hover tooltip."
				),
		})
	)
	.transform((data) => {
		const d = data as Record<string, unknown>;
		if (
			d.path &&
			!isPlaceholder(String(d.path)) &&
			looksLikeFilePath(d.path as string)
		) {
			d.type = "file";
		}
		if (FILE_NODE_TYPE.has(d.type as string)) {
			if (
				!d.path ||
				isPlaceholder(String(d.path ?? ""))
			) {
				const attrsPath = (d?.attributes as Record<string, unknown>)?.path;
				const derivedPath =
					attrsPath && !isPlaceholder(String(attrsPath))
						? attrsPath
						: (() => {
							const rawId = String(d.id ?? "").trim();
							if (rawId.startsWith("file:")) {
								const pathFromId = rawId
									.slice("file:".length)
									.replace(/^\/+/, "")
									.trim();
								if (pathFromId && !isPlaceholder(pathFromId))
									return pathFromId;
							}
							return null;
						})();
				if (derivedPath) d.path = derivedPath;
			}
		}
		if (isPlaceholder(String(d.label ?? ""))) {
			const normalizedPath = normalizeFilePath(
				(d.path as string) ?? ""
			);
			const basename =
				normalizedPath.split("/").filter(Boolean).pop() ?? normalizedPath;
			const displayName =
				basename.replace(/\.(md|markdown)$/i, "") || basename;
			d.label = displayName;
		}
		if (
			d.label &&
			d.label !== DEFAULT_PLACEHOLDER &&
			d.label !== "Untitled"
		) {
			d.label = humanizeNodeLabel(d.label as string);
		}
		const findFileNodeType = Array.from(FILE_NODE_TYPE).find(
			(type) => d.id && String(d.id).startsWith(type + ":")
		);
		if (findFileNodeType) {
			d.id = toNormalizedCosmoNodeId(
				"file",
				String(d.id).slice(findFileNodeType.length + 1)
			);
		} else {
			const findOtherNodeType = Array.from(OTHER_NODE_TYPE).find(
				(type) => d.id && String(d.id).startsWith(type + ":")
			);
			if (findOtherNodeType) {
				d.id = toNormalizedCosmoNodeId(
					findOtherNodeType,
					String(d.id).slice(findOtherNodeType.length + 1)
				);
			}
		}
		const fallbackId = toNormalizedCosmoNodeId(
			FILE_NODE_TYPE.has(d.type as string) ? "file" : (d.type as string),
			d.path
				? normalizeFilePath(d.path as string)
				: (d.label as string)
		);
		if (!d.id || d.id === DEFAULT_PLACEHOLDER) d.id = fallbackId;
		let displayTitle = stripTypedPrefixForDisplay(
			String(d.label ?? d.id ?? "")
		);
		if (
			FILE_NODE_TYPE.has(d.type as string) &&
			displayTitle &&
			(displayTitle.includes("/") ||
				/\.(md|markdown)$/i.test(displayTitle))
		) {
			const base =
				displayTitle.split("/").filter(Boolean).pop() ?? displayTitle;
			displayTitle = base.replace(/\.(md|markdown)$/i, "") || base;
		}
		d.title = displayTitle || d.label || d.id;
		return d;
	})
	.superRefine((data, ctx) => {
		const type = data.type as string;
		if (FILE_NODE_TYPE.has(type)) {
			if (
				!data.path ||
				isPlaceholder(String(data.path ?? ""))
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Document/file nodes must have a valid path.",
					path: ["path"],
				});
				return;
			}
		} else if (type === "concept" || type === "tag") {
			if (
				data.path === DEFAULT_PLACEHOLDER ||
				data.path === "Untitled"
			)
				(data as Record<string, unknown>).path = undefined;
			const rawLabel = String(data.label || "").trim();
			if (isPlaceholder(rawLabel)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"Concept/tag nodes must have a non-empty label or title (not Untitled).",
					path: ["label"],
				});
				return;
			}
		}
		if (
			data.label === DEFAULT_PLACEHOLDER &&
			(!data.path || data.path === DEFAULT_PLACEHOLDER) &&
			(!data.attributes || Object.keys(data.attributes).length === 0)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: NO_MEANINGFUL_CONTENT_MESSAGE,
			});
		}
	});

export const graphEdgeItemSchema = z.preprocess(
	(raw: unknown) => {
		if (!raw || typeof raw !== "object") return raw;
		const o = raw as Record<string, unknown>;
		const source =
			o.source ?? o.sourceId ?? o.startNode ?? o.from_node_id;
		const target = o.target ?? o.targetId ?? o.endNode ?? o.to_node_id;
		return {
			...o,
			source: source ? String(source).trim() : undefined,
			target: target ? String(target).trim() : undefined,
		};
	},
	z
		.object({
			id: z
				.string()
				.default(
					() =>
						`edge:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
				),
			source: z
				.string()
				.nullable()
				.describe("The source node id or path."),
			target: z
				.string()
				.nullable()
				.describe("The target node id or path."),
			type: z
				.string()
				.default("link")
				.describe(
					"The type of the edge. Recommended: physical_link, semantic_link, inspire, brainstorm, etc."
				),
			label: z
				.string()
				.default("")
				.describe(
					"The label of the edge. It will be displayed in the graph."
				),
			attributes: z
				.record(z.any())
				.default(() => ({}))
				.describe(
					"Attributes of the edge. It will be used to store the edge's metadata. User can see this via a hover tooltip."
				),
		})
		.refine((data) => data.source && data.target, {
			message: "source and target are required",
			path: ["source"],
		})
);

export const sourceItemSchema = z
	.object({
		id: z
			.string()
			.default(
				() =>
					`src:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
			),
		title: z.string().default(DEFAULT_PLACEHOLDER),
		path: z
			.string()
			.default(DEFAULT_PLACEHOLDER)
			.describe(
				"The path of the source. It will be used to open the source in the file explorer."
			),
		reasoning: z
			.string()
			.default(DEFAULT_PLACEHOLDER)
			.describe(
				"Why it was selected or rejected. Please provide a detailed explanation. but no more than 100 words."
			),
		badges: z
			.array(z.string())
			.default(() => [])
			.describe(
				'Badges of the source. It will be used to display the source in the UI. eg: "important", "relevant", "interesting", etc. but please use your imagination to create more badges.'
			),
		score: z.preprocess(
			(val: unknown) => {
				if (typeof val === "number")
					return { average: val, physical: val, semantic: val };
				if (val && typeof val === "object") {
					const o = val as {
						physical?: number;
						semantic?: number;
						average?: number;
					};
					const avg = o.average ?? 0;
					return {
						physical: o.physical ?? avg,
						semantic: o.semantic ?? avg,
						average: avg,
					};
				}
				return val;
			},
			z
				.object({
					physical: z.number().min(0).max(100).nullable(),
					semantic: z.number().min(0).max(100).nullable(),
					average: z.number().min(0).max(100).nullable(),
				})
				.nullable()
		),
	})
	.superRefine((data, ctx) => {
		if (
			data.title === DEFAULT_PLACEHOLDER &&
			(!data.path || data.path === DEFAULT_PLACEHOLDER) &&
			(!data.reasoning || data.reasoning === DEFAULT_PLACEHOLDER) &&
			(!data.badges || data.badges.length === 0)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: NO_MEANINGFUL_CONTENT_MESSAGE,
			});
		}
	});

export const dashboardBlockItemSchema = z.preprocess(
	(raw: unknown) => {
		if (!raw || typeof raw !== "object") return raw;
		const o = raw as Record<string, unknown>;
		const title =
			o.title != null ? String(o.title).trim() : undefined;
		let engine = String(o.renderEngine ?? "MARKDOWN").toUpperCase();
		let markdown =
			o.markdown != null ? String(o.markdown).trim() : "";
		const summary =
			o.summary != null ? String(o.summary).trim() : "";
		const topics = Array.isArray(o.topics) ? o.topics : [];
		if (engine === "MARKDOWN" && !markdown) {
			if (summary) markdown = summary;
			if (topics.length > 0) {
				const bulletLines = topics.map((t: unknown) => {
					const tObj = t as Record<string, unknown>;
					const label = tObj?.label ?? tObj?.name ?? tObj?.title ?? String(t);
					return `- ${typeof label === "string" ? label : String(label)}`;
				});
				markdown = markdown
					? `${markdown}\n\n${bulletLines.join("\n")}`
					: bulletLines.join("\n");
			}
			if (!markdown && title) markdown = title;
			if (!markdown) markdown = "Content not yet generated.";
		}
		return {
			...o,
			title: title ?? undefined,
			renderEngine: engine,
			markdown: markdown || undefined,
		};
	},
	z.intersection(
		z.object({
			id: z
				.string()
				.default(
					() =>
						`block:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
				),
			title: z
				.string()
				.nullable()
				.describe("The title of the block. It will be displayed."),
			weight: z
				.number()
				.min(0)
				.max(10)
				.nullable()
				.describe(
					"Used for grid layout. 0-10; 1-3 small, 4-6 medium, 7-10 full-width."
				),
		}),
		BlockContentSchema
	)
);
