import { z } from "zod/v3";

export const SorterOption = z.enum([
	"result_rank_desc",
	"result_rank_asc",
	"created_desc",
	"created_asc",
	"modified_desc",
	"modified_asc",
	"total_links_count_desc",
	"total_links_count_asc",
	"backlinks_count_desc",
	"backlinks_count_asc",
	"outlinks_count_desc",
	"outlinks_count_asc",
]);

export const TIME_WITHIN_VALUES = [
	"today",
	"yesterday",
	"this_week",
	"this_month",
	"last_3_months",
	"this_year",
] as const;

export const TimeWithinEnum = z.enum(TIME_WITHIN_VALUES);

const TIME_WITHIN_NORMALIZE: Record<string, (typeof TIME_WITHIN_VALUES)[number]> = {
	last_3_years: "this_year",
	last_2_years: "this_year",
	last_year: "this_year",
	last_6_months: "last_3_months",
	last_month: "this_month",
	last_week: "this_week",
	recent: "this_month",
};

export function normalizeTimeWithin(
	val: unknown
): (typeof TIME_WITHIN_VALUES)[number] | undefined {
	if (val == null) return undefined;
	const s = String(val).trim().toLowerCase();
	if (TIME_WITHIN_VALUES.includes(s as (typeof TIME_WITHIN_VALUES)[number]))
		return s as (typeof TIME_WITHIN_VALUES)[number];
	return TIME_WITHIN_NORMALIZE[s] ?? "this_year";
}

export const FilterOption = z.object({
	// tag_category_boolean_expression: z
	// 	.string()
	// 	.nullable()
	// 	.describe(
	// 		"Complex boolean expression for filtering. Use only tag:value, category:value, AND, OR, NOT, and parentheses. " +
	// 			"Each value must be a single word (no spaces, no special characters). " +
	// 			"Example: tag:javascript AND category:programming or (tag:react OR tag:vue) AND category:frontend."
	// 	),
	type: z
		.enum(["note", "folder", "file", "all"])
		.nullable()
		.default("all")
		.describe(
			"note (markdown only), file (attachments), folder, or all (everything). Default is 'all'."
		),
	path: z.string().nullable().describe("Regex or prefix for file paths"),
	modified_within: z.preprocess((val) => normalizeTimeWithin(val), TimeWithinEnum.nullable()),
	created_within: z.preprocess((val) => normalizeTimeWithin(val), TimeWithinEnum.nullable()),
});

export const SemanticFilter = z.object({
	query: z
		.string()
		.describe(
			"A descriptive phrase of the concept you're looking for. Example: 'advanced machine learning optimization' (don't use single keywords)."
		),
	topK: z
		.number()
		.min(1)
		.max(50)
		.default(20)
		.describe("Number of top similar nodes to keep"),
});

export const ResponseFormat = z.object({
	response_format: z
		.enum(["structured", "markdown", "hybrid"])
		.default("hybrid")
		.describe(
			"Choose 'markdown' if you need to reason about relationships, summarize content, or present findings. " +
				"Choose 'structured' if you are performing multi-step operations for programmatic piping (e.g., getting IDs for another tool)." +
				"Choose 'hybrid' if you need to get both data and context. But avoid this as it may cause context overflow(especially for graph_traversal)."
		),
});

export const BaseLimit = z.object({
	limit: z
		.number()
		.min(1)
		.max(100)
		.nullable()
		.default(20)
		.describe(
			"Maximum number of results(each step inner also. not so strictly.)"
		),
});

export const SemanticOptions = z.object({
	include_semantic_paths: z
		.boolean()
		.nullable()
		.default(true)
		.describe(
			"Include document semantic connection paths (vector-similar neighbors). Prefer true for richer discovery; set false only when you need physical links only."
		),
	semantic_filter: SemanticFilter.nullable().describe(
		"Semantic pruning/relevance filtering. The conceptual anchor for filtering. " +
			"Instead of 'AI', use 'Large language model architecture and training' to ensure vector relevance."
	),
});

// ----- tool input schemas (used by search-graph-inspector service) -----

export const inspectNoteContextInputSchema = z
	.object({
		note_path: z.string(),
	})
	.merge(BaseLimit)
	.extend({
		grep_pattern: z
			.string()
			.nullable()
			.describe(
				"Grep-like path filter. If set, only keep neighbor document nodes whose vault path matches this pattern (regex, case-insensitive; falls back to substring when regex is invalid)."
			),
		include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
		response_format: ResponseFormat.shape.response_format.default("structured"),
	});

export const graphTraversalInputSchema = z
	.object({
		start_note_path: z.string(),
		hops: z
			.number()
			.min(1)
			.max(3)
			.default(1)
			.describe(
				"3 hops is usually enough to cover a vast knowledge cluster. start with 1-2 hops. Only escalate to 3 hops if the results are too sparse."
			),
	})
	.merge(SemanticOptions)
	.extend({
		grep_pattern: z
			.string()
			.nullable()
			.describe(
				"Grep-like path filter. If set, traversal prunes document nodes whose vault path does NOT match this pattern (regex, case-insensitive; falls back to substring when regex is invalid). Start node is always kept."
			),
		filters: FilterOption.nullable().describe(
			"Only filter document nodes in each level."
		),
		sorter: SorterOption.nullable().describe("Only sort document nodes in each level."),
		response_format: ResponseFormat.shape.response_format.default("structured"),
		limit: z
			.number()
			.min(1)
			.max(100)
			.nullable()
			.default(15)
			.describe(
				"Maximum number of results. do not set too large as it may cause context overflow."
			),
	});

export const hubLocalGraphInputSchema = z
	.object({
		center_note_path: z.string().describe("Vault-relative note path used as hub center."),
		max_depth: z
			.number()
			.min(1)
			.max(6)
			.nullable()
			.default(4)
			.describe(
				"Maximum local expansion depth for the hub neighborhood. Start with 2-4 and only increase when the graph is too sparse."
			),
	})
	.extend({
		response_format: ResponseFormat.shape.response_format.default("structured"),
	});

export const findPathInputSchema = z
	.object({
		start_note_path: z.string(),
		end_note_path: z.string(),
	})
	.merge(BaseLimit)
	.extend({
		filters: FilterOption.nullable().describe(
			"Filter nodes in the path. May cost much more time and resources. As the graph algorithm is time-consuming."
		),
		include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
		response_format: ResponseFormat.shape.response_format.default("structured"),
	});

export const findKeyNodesInputSchema = z
	.object({})
	.merge(BaseLimit)
	.extend({
		filters: FilterOption.nullable(),
		sorter: SorterOption.nullable().default("backlinks_count_desc"),
		semantic_filter: SemanticOptions.shape.semantic_filter.nullable(),
		response_format: ResponseFormat.shape.response_format.default("markdown"),
	});

export const findOrphansInputSchema = z.object({}).extend({
	limit: z
		.number()
		.min(1)
		.max(1000)
		.nullable()
		.default(50)
		.describe("Maximum number of results."),
	filters: FilterOption.nullable(),
	sorter: SorterOption.nullable(),
	response_format: ResponseFormat.shape.response_format.default("markdown"),
});

export const searchByDimensionsInputSchema = z
	.object({
		boolean_expression: z
			.string()
			.describe(
				"Complex boolean expression for filtering. Use only tag:value, functional:value, AND, OR, NOT, and parentheses. " +
					"Each value must be a single word (no spaces, no special characters). " +
					"Example: tag:javascript AND functional:programming or (tag:react OR tag:vue) AND functional:frontend. " +
					"If no results are found, try relaxing the boolean constraints or switching to OR logic."
			),
	})
	.merge(BaseLimit)
	.extend({
		filters: FilterOption.omit({ 
			// tag_category_boolean_expression: true
		 }).nullable(),
		sorter: SorterOption.nullable(),
		response_format: ResponseFormat.shape.response_format.default("structured"),
	});

export const exploreFolderInputSchema = z
	.object({
		folderPath: z
			.string()
			.default("/")
			.describe(
				"Folder path to inspect (relative to vault root, use '/' for root)"
			),
		recursive: z.boolean().default(true),
		max_depth: z
			.number()
			.min(1)
			.max(3)
			.nullable()
			.default(2)
			.describe(
				"Only active when recursive: true. Use max_depth: 1 for quick navigation, use max_depth: 3 only for deep structure mapping."
			),
	})
	.merge(BaseLimit)
	.extend({
		limit: z
			.number()
			.min(1)
			.max(100)
			.nullable()
			.default(50)
			.describe("Per-folder item cap; use ≥50 for inventory/full-list breadth."),
		filters: FilterOption.nullable(),
		sorter: SorterOption.nullable(),
		response_format: ResponseFormat.shape.response_format.default("markdown"),
	});

export const grepFileTreeInputSchema = z.object({
	pattern: z.string().min(1).describe("Search pattern (substring or regex) to match against vault file paths. Use to find anchor paths or folder names quickly."),
	limit: z.number().min(1).max(500).nullable().default(200).describe("Max number of matching paths to return (default 200)."),
});

export const recentChangesWholeVaultInputSchema = z
	.object({})
	.merge(BaseLimit)
	.extend({
		filters: FilterOption.nullable(),
		sorter: SorterOption.nullable(),
		response_format: ResponseFormat.shape.response_format.default("markdown"),
	});

export const localSearchWholeVaultInputSchema = z
	.object({
		query: z.string().describe("The query to search for"),
		searchMode: z
			.enum(["fulltext", "vector", "hybrid"])
			.nullable()
			.default("fulltext")
			.describe(
				"Search mode: 'fulltext' (text only), 'vector' (embedding-based), or 'hybrid' (combine both)."
			),
		scopeMode: z
			.enum(["vault", "inFile", "inFolder", "limitIdsSet"])
			.nullable()
			.default("vault")
			.describe(
				"Scope of search: 'vault' (entire vault), 'inFile' (current file), 'inFolder' (a folder and its subnotes), or 'limitIdsSet' (specific note ids set)."
			),
		current_file_path: z
			.string()
			.nullable()
			.nullable()
			.describe(
				"Current file path (if any). Used for inFile mode and directory boost."
			),
		folder_path: z
			.string()
			.nullable()
			.nullable()
			.describe("Folder path (if inFolder mode)."),
		limit_ids_set: z
			.array(z.string())
			.nullable()
			.describe(
				"Set of note/document ids to limit search within (if limitIdsSet mode)."
			),
		limit: z
			.number()
			.min(1)
			.max(100)
			.nullable()
			.default(20)
			.describe(
				"Maximum number of results. Use 15-25 for broader coverage; 8-12 for fast narrow search."
			),
	})
	.extend({
		filters: FilterOption.nullable(),
		sorter: SorterOption.nullable(),
		response_format: ResponseFormat.shape.response_format.default("structured"),
	});
