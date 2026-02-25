import { z } from "zod/v3";

/** Factory: schema description includes agent name; no closure over heavy deps. */
export function makeCallAgentToolInputSchema(agentName: string) {
	return z
		.object({
			prompt: z.string().optional().describe(`The prompt for the ${agentName} agent`),
			query: z.string().optional().describe("Alternative to prompt; same meaning"),
		})
		.refine((d) => !!(d.prompt ?? d.query), { message: "Either prompt or query is required" });
}

export const updateDimensionToolInputSchema = z
	.object({
		text: z.string().optional().describe("Describe what to add or remove"),
		prompt: z.string().optional().describe("Same as text"),
	})
	.refine((d) => !!(d?.text ?? d?.prompt), { message: "text or prompt is required" });
