/**
 * Wiring glue between `aiQueryParser` (pure module) and the plugin runtime.
 *
 * `parseNaturalLanguageQuery` takes an injected LLM invoker. Production code
 * paths (SearchClient) need to synthesize that invoker from the currently
 * active fast-role profile. Keeping the wiring in its own file lets tests
 * exercise the parser without pulling ProfileRegistry / vercelGenerateText,
 * and lets SearchClient stay ignorant of AI SDK internals.
 */

import type { SearchSettings } from '@/core/config/settingsTypes';
import type { AiQueryLLMInvoker, AiQueryParseResult } from './aiQueryParser';
import { parseNaturalLanguageQuery } from './aiQueryParser';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { vercelGenerateText } from '@/core/providers/vercel';

/**
 * Build the default LLM invoker used at runtime. Prefers the active fast-role
 * binding (Agent Fast). Returns null when no profile is available so the
 * caller can decide whether to fall back to the raw query.
 */
export function createDefaultAiQueryInvoker(): AiQueryLLMInvoker | null {
	const fast = ProfileRegistry.getInstance().getActiveAgentFastConfig();
	if (!fast) return null;
	return async (systemPrompt, userPrompt) => {
		const { text } = await vercelGenerateText(fast.profile, fast.modelId, [
			{ role: 'system', content: [{ type: 'text', text: systemPrompt }] },
			{ role: 'user', content: [{ type: 'text', text: userPrompt }] },
		]);
		return text;
	};
}

/**
 * Compile a natural-language search query into Hyper Search syntax when the
 * setting is enabled and a fast-role profile is available; otherwise return
 * the raw input unchanged. Never throws — search flow always proceeds.
 *
 * Split from `SearchClient.search` so it can be unit-tested with a stubbed
 * invoker.
 */
export async function maybeCompileWithAiParser(
	rawQuery: string,
	settings: SearchSettings,
	invokerFactory: () => AiQueryLLMInvoker | null = createDefaultAiQueryInvoker,
): Promise<AiQueryParseResult> {
	if (!settings.useAiQueryParser || rawQuery.trim().length === 0) {
		return {
			compiled: rawQuery,
			usedFallback: false,
			attempts: 0,
		};
	}
	const invoker = invokerFactory();
	if (!invoker) {
		return {
			compiled: rawQuery,
			usedFallback: true,
			attempts: 0,
			fallbackReason: 'no fast-role profile configured',
		};
	}
	return parseNaturalLanguageQuery(rawQuery, invoker);
}
