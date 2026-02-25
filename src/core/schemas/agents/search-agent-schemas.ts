/**
 * All search-agent and dashboard-update schemas in one place. Pure Zod only.
 * Re-exported by schemas/agents and schemas/dashboard for backward compatibility.
 */
import { z } from "zod/v3";
import { normalizeFilePath } from "@/core/utils/file-utils";

// ----- follow-up questions -----
/** Schema for streamObject in FollowUpQuestionAgent. */
export const suggestedFollowUpQuestionsSchema = z.object({
	questions: z.array(z.string()).describe("Follow-up questions the user might ask next"),
});
export type SuggestedFollowUpQuestions = z.infer<typeof suggestedFollowUpQuestionsSchema>;

// ----- mindflow -----
export const mindflowMermaidInputSchema = z.object({
	code: z.string().describe("Mermaid flowchart TD code"),
});
export const mindflowTraceInputSchema = z.object({
	text: z.string().describe("Trace text"),
});
export const mindflowProgressInputSchema = z.object({
	estimatedCompleteness: z.number().min(0).max(100).describe("0-100"),
	statusLabel: z
		.string()
		.describe('e.g. "Deepening hidden clues", "Cross-checking evidence"'),
	goalAlignment: z.string().optional().describe("Sub-questions + verified paths"),
	critique: z.string().optional().describe("Self-correction: what went wrong, how to fix"),
	decision: z.enum(["continue", "stop"]).describe("Whether to continue or stop"),
});

// ----- review blocks -----
export const needMoreDashboardBlocksInputSchema = z.object({
	reason: z.string().describe("The reason why we need more dashboard blocks."),
});

// ----- raw search -----
export const submitEvidencePackInputSchema = z.object({
	summary: z.string().optional().describe("Short summary of evidence gathered"),
	candidateNotes: z.array(z.any()).optional().describe("Candidate notes (paths or note refs)"),
	newContextNodes: z.array(z.any()).optional().describe("New context nodes for query evolution"),
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
	.object({ plan: z.array(z.string()) })
	.describe("Each plan describes a topic to be created or updated.");

export const submitBlocksPlanInputSchema = z
	.object({ plan: z.array(z.string()) })
	.describe("Each plan describes a block to be created or updated.");

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
