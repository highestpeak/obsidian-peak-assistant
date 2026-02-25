import { z } from "zod/v3";

export const searchMemoryStoreInputSchema = z.object({
	query: z.string().describe("Search query (keyword or phrase)"),
	maxChars: z.number().min(100).max(8000).optional().describe("Max chars to return (default 4000)"),
});

export const getAnalysisMessageCountInputSchema = z.object({});

export const getAnalysisMessageByIndexInputSchema = z.object({
	index: z
		.number()
		.int()
		.min(0)
		.describe("0-based index of the message (0 = first message, count-1 = last)"),
});

/** Factory so describe() can show default maxChars without closing over options. */
export function makeGetThoughtHistoryInputSchema(defaultMaxChars: number) {
	return z.object({
		maxChars: z
			.number()
			.int()
			.min(1000)
			.max(20000)
			.optional()
			.describe(`Max chars to return (default ${defaultMaxChars})`),
	});
}
