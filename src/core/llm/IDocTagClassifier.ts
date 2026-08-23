// T11J A3: Separate port for the TagService doc-tag classification path.
// TagService needs the `queryStructured` JSON-typed surface, which is a
// different shape from `queryText`; we keep it on its own port so
// `IDocSummarizer` remains a one-method surface.

import type { UsageFeature } from '@/core/types/usage';
import type { SingleTurnGenerationTraceEvent } from '@/core/llm/SingleTurnGenerationTrace';

export interface DocTagClassifierQueryOpts {
	systemPrompt?: string;
	signal?: AbortSignal;
	usageFeature?: UsageFeature;
	usageAction?: string;
	usageSessionId?: string;
	usageCallback?: (usage: import('@/core/providers/types').LLMUsage) => void;
	maxOutputTokens?: number;
	/** Disable duplicate schema text when the selected prompt already contains the compact output contract. */
	includeSchemaInPrompt?: boolean;
	traceCallback?: (event: SingleTurnGenerationTraceEvent) => void;
	/** Explicit one-run binding. Callers must not mutate a global role to select it. */
	profileId?: string;
	modelId?: string;
}

export interface IDocTagClassifier {
	queryStructured<T>(
		promptOrText: string,
		variables?: Record<string, unknown>,
		schema?: unknown,
		opts?: DocTagClassifierQueryOpts,
	): Promise<T>;
}
