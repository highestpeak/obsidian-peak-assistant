import { z } from "zod/v3";

/** Params for mode description (injected at runtime to avoid capturing AppContext). */
export interface ContentReaderSchemaParams {
	shortSummaryLength: number;
	fullSummaryLength: number;
}

export function makeContentReaderInputSchema(params: ContentReaderSchemaParams) {
	const { shortSummaryLength, fullSummaryLength } = params;
	return z
		.object({
			path: z.string().describe("path related to vault root."),
			mode: z
				.enum(["fullContent", "shortSummary", "fullSummary", "range", "grep", "meta"])
				.default("shortSummary")
				.describe(
					`reading mode: prefer 'shortSummary', 'grep', or 'range'; 'fullContent' only for small files (see size limit), ` +
						`'shortSummary' get short summary, len <${shortSummaryLength} ` +
						`'fullSummary' get full summary, len <${fullSummaryLength} ` +
						`'range' get specific lines (1-based, inclusive), ` +
						`'grep' search within a single file and return matched lines`
				),
			lineRange: z
				.object({
					start: z.number().describe("The start line (1-based). Must be positive.").int().positive(),
					end: z.number().describe("The end line (1-based). Must be positive and >= start.").int().positive(),
				})
				.refine(
					(obj) => typeof obj.start === "number" && typeof obj.end === "number" && obj.end >= obj.start,
					{ message: "end must be greater than or equal to start" }
				)
				.optional()
				.describe("the range of lines of parsed document content to read."),
			query: z
				.string()
				.optional()
				.describe(
					"Search query used by grep mode. Treated as RegExp by default; falls back to literal match if invalid."
				),
			case_sensitive: z.boolean().optional().default(true).describe("Case sensitive search for grep mode. Default true."),
			max_matches: z
				.number()
				.int()
				.min(1)
				.max(50)
				.optional()
				.default(50)
				.describe("Maximum number of matches for grep mode (hard cap 50)."),
		})
		.superRefine((data, ctx) => {
			if (data.mode === "range") {
				if (!data.lineRange) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lineRange"], message: "lineRange is required when mode is 'range'" });
				}
			}
			if (data.mode === "grep") {
				if (!data.query || !data.query.trim()) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["query"], message: "query is required when mode is 'grep'" });
				}
			}
		});
}
