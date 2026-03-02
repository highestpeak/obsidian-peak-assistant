import { z } from "zod/v3";

/** Normalize raw tool input: only "prompt" is exposed to LLM; query/reasoning_before_call mapped in preprocess. */
function normalizeCallAgentInput(raw: unknown): Record<string, unknown> {
	if (raw == null || typeof raw !== "object") return raw as Record<string, unknown>;
	const o = raw as Record<string, unknown>;
	const prompt = typeof o.prompt === "string"
		? o.prompt.trim()
		: typeof o.query === "string" ? o.query.trim() : "";
	const reasoning_before_call = typeof o.reasoning_before_call === "string" ? o.reasoning_before_call.trim() : "";
	return { prompt, reasoning_before_call };
}

export interface MakeCallAgentToolInputSchemaOptions {
	/** When set, reject prompts that match any of these patterns. Caller defines and passes from outside (e.g. vault-search forbid dialogue). */
	forbidDialoguePatterns?: RegExp[];
	/** Error message shown when prompt matches forbidDialoguePatterns. Caller passes from outside. */
	forbidDialogueMessage?: string;
}

/**
 * Schema for call_*_agent tools. Only "prompt" is exposed; preprocess maps query -> prompt and keeps reasoning_before_call.
 * Caller passes options.forbidDialoguePatterns (and optional message) from outside to apply custom prompt rules.
 */
export function makeCallAgentToolInputSchema(
	_agentName: string,
	options?: MakeCallAgentToolInputSchemaOptions
) {
	const base = z.object({
		prompt: z.string().min(1, "prompt is required.").describe("Query or prompt for this agent call"),
		reasoning_before_call: z.string().optional().default("").describe("Why this call is needed; will be recorded to Chain"),
	});

	const patterns = options?.forbidDialoguePatterns;
	const hasForbid = Array.isArray(patterns) && patterns.length > 0;
	const message = options?.forbidDialogueMessage ?? "Prompt rejected by caller-defined rules. Fix and re-run.";

	const schema = hasForbid
		? base.refine(
			(data) => !patterns!.some((p) => p.test(data.prompt)),
			{ message }
		)
		: base;

	return z.preprocess(normalizeCallAgentInput, schema);
}
