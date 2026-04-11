/**
 * Adaptive query routing: classify query complexity to choose pipeline depth.
 *
 * - simple: Direct search + light summary (skip classify/decompose)
 * - medium: Classify + search + summarize (skip decompose, lighter recon)
 * - complex: Full pipeline (classify → decompose → recon → plan → report)
 *
 * Heuristic-based — no LLM call.
 * Routing patterns loaded from templates/config/search-query-routing.json at runtime.
 * Falls back to SEARCH_QUERY_ROUTING in constant.ts if template not available.
 */

import { SEARCH_QUERY_ROUTING } from '@/core/constant';

export type QueryComplexity = 'simple' | 'medium' | 'complex';

let cachedConfig: typeof SEARCH_QUERY_ROUTING | null = null;

/** Load routing config from template JSON, compile regex patterns. Cache after first load. */
function getRoutingConfig(): typeof SEARCH_QUERY_ROUTING {
	if (cachedConfig) return cachedConfig;

	try {
		// Attempt to load from template config file at runtime
		const { AppContext } = require('@/app/context/AppContext');
		const ctx = AppContext.getInstance();
		const templateManager = ctx?.templateManager;
		if (templateManager) {
			const raw = templateManager.loadRaw?.('config/search-query-routing.json');
			if (raw) {
				const json = JSON.parse(raw);
				cachedConfig = {
					simplePatterns: (json.simplePatterns ?? []).map((p: string) => new RegExp(p, 'i')),
					complexPatterns: (json.complexPatterns ?? []).map((p: string) => new RegExp(p, 'i')),
					simpleMaxWords: json.simpleMaxWords ?? SEARCH_QUERY_ROUTING.simpleMaxWords,
					simpleMaxChars: json.simpleMaxChars ?? SEARCH_QUERY_ROUTING.simpleMaxChars,
					mediumMaxWords: json.mediumMaxWords ?? SEARCH_QUERY_ROUTING.mediumMaxWords,
					mediumMaxChars: json.mediumMaxChars ?? SEARCH_QUERY_ROUTING.mediumMaxChars,
				};
				return cachedConfig;
			}
		}
	} catch {
		// Template loading not available — use compiled defaults
	}

	cachedConfig = SEARCH_QUERY_ROUTING;
	return cachedConfig;
}

/**
 * Classify query complexity using configurable heuristics.
 * Config priority: templates/config/search-query-routing.json > SEARCH_QUERY_ROUTING (constant.ts).
 */
export function classifyQueryComplexity(query: string): QueryComplexity {
	const config = getRoutingConfig();
	const wordCount = query.trim().split(/\s+/).length;
	const charCount = query.length;

	if (wordCount <= config.simpleMaxWords && charCount <= config.simpleMaxChars) return 'simple';
	if (config.simplePatterns.some((p) => p.test(query))) return 'simple';
	if (config.complexPatterns.some((p) => p.test(query))) return 'complex';
	if (wordCount <= config.mediumMaxWords && charCount <= config.mediumMaxChars) return 'medium';

	return 'complex';
}
