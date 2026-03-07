import { z } from "zod/v3";

export const searchMemoryStoreInputSchema = z.object({
	query: z.string().describe("Search query (keyword or phrase)"),
	maxChars: z.number().min(100).max(8000).optional().describe("Max chars to return (default 4000)"),
});

export const getAnalysisMessageCountInputSchema = z.object({});

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
