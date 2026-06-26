// T11J A3: Narrow LLM port for document loaders + rerank. Only the
// single-shot `queryText` surface is exposed; widening this port (adding
// `queryStream`, `renderPrompt`, etc.) is forbidden — agent-style
// dependencies should declare their own port instead.

import type { UsageFeature } from '@/core/types/usage';

export interface DocSummarizerQueryOpts {
	systemPrompt?: string;
	signal?: AbortSignal;
	usageFeature?: UsageFeature;
	usageAction?: string;
	usageSessionId?: string;
}

/**
 * Single-method port that the AIServiceManager satisfies via
 * `implements IDocSummarizer`. Loaders accept this instead of the full
 * `AIServiceManager` class so `src/core/**` no longer needs to import
 * `@/service/chat/service-manager`.
 */
export interface IDocSummarizer {
	queryText(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: DocSummarizerQueryOpts,
	): Promise<string>;
}
