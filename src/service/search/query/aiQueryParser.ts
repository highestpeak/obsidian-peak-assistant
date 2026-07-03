/**
 * AI Query Parser — Hyper Search NL→syntax compiler.
 *
 * Turns a free-form natural-language search phrase into Hyper Search syntax
 * that `parseQuery` already understands:
 *   - bare words become fuzzy terms
 *   - `"phrases"` become phrase matches
 *   - `-excluded` tokens become NOT filters
 *   - `tag:foo`, `ext:md`, `folder:notes` become field filters
 *
 * This is NOT AI Analysis. Hyper Search runs against the local FTS/vector
 * index in milliseconds; AI Query Parser is the thin adapter that lets a user
 * type "papers about diffusion models from last year in the /research folder"
 * instead of `"diffusion models" folder:research -old`.
 *
 * Contract:
 *   - Input: natural language string.
 *   - Output: `{ compiled, usedFallback, attempts }`. `compiled` is always a
 *     non-empty string usable by `parseQuery`. On any LLM failure the module
 *     falls back to the raw input so search flow never breaks.
 *   - Zod schema guards the LLM response shape. Retry ≤ maxAttempts before
 *     falling back.
 *   - The LLM is injected as a function so this module has zero direct
 *     dependency on providers / SDK / ProfileRegistry — easy to unit-test.
 */

import { z } from 'zod';

export const AI_QUERY_SYSTEM_PROMPT = `You compile natural-language search intents into a compact Hyper Search syntax used by an Obsidian-like local vault index. Return one JSON object and nothing else — no prose, no markdown fences.

Output shape:
{
  "compiled": "<the compiled Hyper Search query string>",
  "explanation": "<optional one-sentence rationale in the user's language>"
}

Syntax rules:
  - Bare tokens are fuzzy terms.
  - Quoted "..." expressions are phrase matches; preserve casing inside quotes.
  - Prefix a token with '-' to exclude it (never emit '-\"' or '-word word').
  - Field filters: 'tag:foo', 'ext:md', 'folder:path/segment'. Never invent fields.
  - Never emit more than 6 terms + 3 phrases + 3 filters + 3 excludes.

Bad-case constraints:
  - If the user's intent is empty or purely a filter (e.g. "just show me PDFs"),
    return only the filter (e.g. 'ext:pdf').
  - If unsure, prefer keeping the user's key nouns as fuzzy terms; do not invent
    filter fields.
`;

export const AiQueryPlanSchema = z.object({
	compiled: z.string().min(1, 'compiled query must be non-empty'),
	explanation: z.string().optional(),
});

export type AiQueryPlan = z.infer<typeof AiQueryPlanSchema>;

export interface AiQueryParseResult {
	compiled: string;
	explanation?: string;
	usedFallback: boolean;
	attempts: number;
	/** Populated only when `usedFallback === true`, so callers can surface a hint. */
	fallbackReason?: string;
}

export type AiQueryLLMInvoker = (systemPrompt: string, userPrompt: string) => Promise<string>;

export interface AiQueryParserOptions {
	/** How many LLM attempts before we fall back to the raw NL. Default: 2. */
	maxAttempts?: number;
	signal?: AbortSignal;
}

const DEFAULT_MAX_ATTEMPTS = 2;

/**
 * Compile natural language into Hyper Search syntax.
 *
 * Never throws. On every recoverable failure this returns `{ compiled: nl,
 * usedFallback: true, fallbackReason }`. The caller can log/toast the
 * fallback reason but the search flow always proceeds.
 */
export async function parseNaturalLanguageQuery(
	naturalLanguage: string,
	invoke: AiQueryLLMInvoker,
	options: AiQueryParserOptions = {},
): Promise<AiQueryParseResult> {
	const trimmed = naturalLanguage.trim();
	if (trimmed.length === 0) {
		return { compiled: '', usedFallback: true, attempts: 0, fallbackReason: 'empty input' };
	}

	const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
	let lastFailure = 'unknown';

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		if (options.signal?.aborted) {
			return { compiled: trimmed, usedFallback: true, attempts: attempt - 1, fallbackReason: 'aborted' };
		}

		let raw: string;
		try {
			raw = await invoke(AI_QUERY_SYSTEM_PROMPT, buildUserPrompt(trimmed));
		} catch (e) {
			lastFailure = e instanceof Error ? e.message : String(e);
			continue;
		}

		let parsed: unknown;
		try {
			parsed = parseLLMJson(raw);
		} catch (e) {
			lastFailure = `invalid_json: ${(e as Error).message}`;
			continue;
		}

		const schemaResult = AiQueryPlanSchema.safeParse(parsed);
		if (!schemaResult.success) {
			lastFailure = `schema_violation: ${schemaResult.error.issues.map((i) => i.message).join('; ')}`;
			continue;
		}

		const plan = schemaResult.data;
		return {
			compiled: plan.compiled.trim(),
			explanation: plan.explanation,
			usedFallback: false,
			attempts: attempt,
		};
	}

	return {
		compiled: trimmed,
		usedFallback: true,
		attempts: maxAttempts,
		fallbackReason: lastFailure,
	};
}

function buildUserPrompt(naturalLanguage: string): string {
	return `Compile this natural-language search intent into Hyper Search syntax.\n\nUser: ${naturalLanguage}`;
}

/**
 * Strip ```json fences if present, then parse. The system prompt forbids
 * markdown but models occasionally violate it.
 */
function parseLLMJson(raw: string): unknown {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced ? fenced[1].trim() : trimmed;
	return JSON.parse(candidate);
}
