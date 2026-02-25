import { z } from "zod/v3";

/** Input schema for local web search tool (e.g. Playwright). Pure schema only. */
export const localWebSearchInputSchema = z.object({
	query: z.string().describe("The search query"),
	limit: z
		.number()
		.int()
		.positive()
		.max(50, "Maximum number of results is 50")
		.default(10)
		.describe("Maximum number of results to return")
		.optional(),
});

/** Input schema for Perplexity web search tool. Pure schema only. */
export const perplexityWebSearchInputSchema = z.object({
	query: z.string().describe("The search query"),
});
