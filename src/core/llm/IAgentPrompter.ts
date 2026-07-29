// T11J B1: Wider LLM port for service-side agents (search synthesis,
// AI graph, intuition helper, copilot agents). Agents typically combine
// `queryText` with `renderPrompt`, and some need `queryStream` /
// `queryStructured`. Kept distinct from `IDocSummarizer` (which stays a
// single-method surface for core document loaders).

import type { PromptId, PromptVariables } from '@/core/types/prompt';
import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import type { UsageFeature } from '@/core/types/usage';

export interface AgentPrompterQueryOpts {
	systemPrompt?: string;
	signal?: AbortSignal;
	usageFeature?: UsageFeature;
	usageAction?: string;
	usageSessionId?: string;
	usageCallback?: (usage: LLMUsage) => void;
	/** Optional per-run model override within the active provider profile. */
	modelId?: string;
}

/**
 * Narrow agent-facing surface of the AIServiceManager. Agents take this
 * port via constructor or operation arg; the app layer passes the live
 * AIServiceManager instance, which `implements IAgentPrompter` via
 * subset-of-class satisfaction (no explicit `implements` keyword needed
 * — every method on this port already exists on the class).
 */
export interface IAgentPrompter {
	queryText(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: AgentPrompterQueryOpts,
	): Promise<string>;

	queryStream(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: AgentPrompterQueryOpts,
	): AsyncGenerator<LLMStreamEvent, void, unknown>;

	queryStructured<T>(
		promptOrText: string,
		variables?: Record<string, unknown>,
		schema?: unknown,
		opts?: AgentPrompterQueryOpts,
	): Promise<T>;

	renderPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
	): Promise<string>;
}
