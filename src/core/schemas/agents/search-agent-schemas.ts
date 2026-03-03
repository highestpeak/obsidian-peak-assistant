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

/** Reusable scope for a dimension (path, tags, anchor_entity). */
const scopeConstraintSchema = z
	.object({
		path: z.string().optional().describe('Folder or file path to lock this dimension to.'),
		tags: z
			.array(z.string())
			.optional()
			.describe(
				'Topic tags (what content is about) and/or functional tags (what role in answering). Prefer functional tags from the provided mapping for semantic main recall; topic tags as optional recall booster when query is vague.'
			),
		anchor_entity: z
			.string()
			.optional()
			.describe(
				'Main subject/entity that this dimension is about. Agent 2 uses it as a retrieval hook.'
			),
	})
	.optional();

/** One semantic dimension target: intent + scope + retrieval orientation. */
const semanticDimensionChoiceSchema = z.object({
	id: semanticDimensionIdsEnum,
	intent_description: z
		.string()
		.min(1, 'intent_description is required.')
		.describe(
			'Concrete search goal for this dimension in human language (what to look for in this dimension).'
		),
	scope_constraint: scopeConstraintSchema.describe('Search scope for this dimension.'),
	retrieval_orientation: z
		.enum(['relational', 'chronological', 'statistical', 'categorical'])
		.optional()
		.describe(
			'Retrieval tendency: relational (links/paths), chronological (recent/history), statistical (data), categorical (definitions/tags).'
		),
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
	user_persona_config: z
		.object({
			appeal: z.enum(USER_APPEAL_TYPES as unknown as [string, ...string[]]).optional().describe('User appeal type.'),
			detail_level: z.enum(['concise', 'comprehensive', 'technical']).optional().default('comprehensive').describe('Output detail level.'),
		})
		.optional()
		.describe('Global preference for summary style only.'),
	is_cross_domain: z
		.boolean()
		.describe(
			'When true, Agent 2 may break out of scope_constraint to correlate across the whole vault.'
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
	retrieval_orientation: z.enum(['relational', 'chronological', 'statistical', 'categorical']).optional(),
	output_format: z.enum(['list', 'tree']).optional(),
	mustIncludeKeywords: z.array(z.string()).optional(),
});
export type DimensionChoice = z.infer<typeof dimensionChoiceSchema>;

export const defaultClassify: QueryClassifierOutput = {
	semantic_dimensions: [
		{
			id: 'essence_definition',
			intent_description: 'Semantic axis: Focuses on the core subject, concept, or content being queried. Used for “what is/topic/content” type questions and summarization of main points or purposes.'
		}
	],
	topology_dimensions: [
		{
			intent_description: 'Topological breadth axis: Determines whether the query targets a "point" (a specific entity) or a "surface" (a set or collection). If it involves collections (such as all/list/directory/relationships), the Inventory_Mapping dimension is activated to enumerate all relevant entities/paths (highest priority).'
		}
	],
	temporal_dimensions: [
		{
			intent_description: 'Spatiotemporal dynamics axis: Determines if the query concerns "change/recent/evolution/comparison/trend". If so, the Delta_Comparison dimension is activated to focus on differences, versions, or historical shifts.'
		}
	],
	user_persona_config: {
		appeal: 'cognitive_learning',
		detail_level: 'comprehensive',
	},
	is_cross_domain: false,
};

// ----- RawSearch (Recon / Evidence) -----

/** Battlefield assessment for RawSearch report. */
export const battlefieldAssessmentSchema = z.object({
	search_density: z.enum(['High', 'Medium', 'Low']).optional(),
	match_quality: z.enum(['Exact', 'Fuzzy', 'None']).optional(),
	suggestion: z.string().optional().describe('e.g. try visa-related tags or widen scope'),
});

/** Report from Recon Agent: tactical summary + leads + assessment. */
export const rawSearchReportSchema = z.object({
	tactical_summary: z.string().max(3500).describe('Up to 500 words: descriptive summary or preliminary inventory list; for topology use manifest style (list items with one-line intro each)'),
	discovered_leads: z.array(z.string()).describe('Paths, file names, or entity names for deeper evidence collection (10–30 preferred)'),
	battlefield_assessment: battlefieldAssessmentSchema.optional(),
});
export type RawSearchReport = z.infer<typeof rawSearchReportSchema>;
export type RawSearchReportWithDimension = { dimension: AllDimensionId; } & RawSearchReport;

/** Single fact with quote (for EvidencePack). */
export const evidenceFactSchema = z.object({
	claim: z.string().describe('One-sentence claim from the source'),
	quote: z.string().describe('Exact quote supporting the claim'),
	confidence: z.enum(['high', 'medium', 'low']).optional(),
});

/** One evidence pack: one source, summary + facts + snippet. */
export const evidencePackSchema = z.object({
	origin: z.object({
		tool: z.string().describe('Tool that produced this source (e.g. content_reader, local_search)'),
		path_or_url: z.string().describe('File path or URL of the source'),
	}),
	summary: z.string().optional().describe('Short summary of this pack'),
	facts: z.array(evidenceFactSchema).describe('1–5 facts with claim+quote'),
	snippet: z.object({ type: z.enum(['extract', 'condensed']), content: z.string() }).optional().describe('Key excerpt from source'),
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
	task_load: z.enum(['high', 'medium', 'low']).optional().describe('For grouping and concurrency'),
});
export type ConsolidatedTask = z.infer<typeof consolidatedTaskSchema>;

export type ConsolidatedTaskWithId = ConsolidatedTask & { taskId: string };

export const consolidatorOutputSchema = z.object({
	consolidated_tasks: z.array(consolidatedTaskSchema),
	global_recon_insight: z.string().describe('One-sentence summary of current recon state'),
});
export type ConsolidatorOutput = z.infer<typeof consolidatorOutputSchema>;

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

/**
 * todo currently we didn't generate these tags. so just define them here and no use it.
 */
export const FUNCTIONAL_TAG_IDS = [...FUNCTIONAL_TAG_CORE, ...FUNCTIONAL_TAG_ENHANCEMENT] as const;
export type FunctionalTagId = (typeof FUNCTIONAL_TAG_IDS)[number];

/** Maps each of the 15 dimension ids to functional tag ids used for recall/slot targeting. */
export const SEARCH_CLASSIFY_TO_FUNCTIONAL_TAGS: Record<SemanticDimensionId, FunctionalTagId[]> = {
	essence_definition: ['current_state'],
	history_origin: ['timeline_event', 'external_context'],
	why_mechanism: ['goal_intent', 'constraint'],
	evidence_source: ['evidence_data'],
	pitfall_misconception: ['constraint'],
	how_method: ['skill_stack', 'idea_candidate'],
	example_case: ['idea_candidate', 'evidence_data'],
	options_comparison: ['decision_opinion', 'idea_candidate'],
	cost_risk_limit: ['constraint'],
	applicable_condition: ['current_state', 'external_context'],
	impact_consequence: ['decision_opinion', 'evidence_data'],
	related_extension: ['external_context', 'idea_candidate'],
	next_action: ['past_attempt', 'idea_candidate', 'resource'],
	trend_future: ['timeline_event', 'external_context'],
	tool_resource: ['resource'],
};

// ----- follow-up questions -----
/** Schema for streamObject in FollowUpQuestionAgent. */
export const suggestedFollowUpQuestionsSchema = z.object({
	questions: z.array(z.string()).describe("Follow-up questions the user might ask next"),
});
export type SuggestedFollowUpQuestions = z.infer<typeof suggestedFollowUpQuestionsSchema>;

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
		.optional()
		.describe("5-50 short topic instructions; avoid exhaustive lists"),
	blockPlan: z
		.array(z.string())
		.max(BLOCK_PLAN_MAX)
		.optional()
		.describe("3-12 block instructions"),
	note: z.string().optional(),
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
					description: z.string().optional(),
					icon: z.string().optional(),
					color: z.string().optional(),
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
					description: z.string().optional(),
					icon: z.string().optional(),
					color: z.string().optional(),
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
					.optional()
					.describe(
						"How important this topic is. eg: 0.5, 0.75, 1.0"
					),
				suggestQuestions: z
					.array(z.string())
					.optional()
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

const DEFAULT_NODE_TYPE = "cosmo";
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
			id: z.string().optional(),
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
				.optional()
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
				.optional()
				.describe("The source node id or path."),
			target: z
				.string()
				.optional()
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
					physical: z.number().min(0).max(100).optional(),
					semantic: z.number().min(0).max(100).optional(),
					average: z.number().min(0).max(100).optional(),
				})
				.optional()
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
				.optional()
				.describe("The title of the block. It will be displayed."),
			weight: z
				.number()
				.min(0)
				.max(10)
				.optional()
				.describe(
					"Used for grid layout. 0-10; 1-3 small, 4-6 medium, 7-10 full-width."
				),
		}),
		BlockContentSchema
	)
);
