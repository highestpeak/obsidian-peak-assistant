/**
 * ContinueAnalysisAgent — handles follow-up analysis rounds by injecting
 * previous round context into a VaultSearchAgent (harness-native) session
 * with a custom system prompt.
 *
 * Design: thin wrapper over VaultSearchAgent. Renders continue-specific
 * prompts and passes them as `systemPromptOverride` + `contextPrefix`. The
 * agent then explores the vault for NEW evidence via the harness `runAgentLoop`
 * and calls `vault_submit_plan`, producing the same event stream as the
 * initial analysis.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/core/types/prompt';
import { VaultSearchAgent } from './VaultSearchAgent';

/**
 * Context from all previous analysis rounds, passed to the continue agent
 * so it can avoid repetition and focus on new evidence.
 */
export interface ContinueContext {
    originalQuery: string;
    rounds: {
        query: string;
        summary: string;
        sections: { title: string; content: string }[];
        annotations: { sectionTitle: string; selectedText?: string; comment: string; type: string }[];
    }[];
    sources: { path: string; relevance?: string }[];
    graphSummary: {
        nodeCount: number;
        keyRelationships: string[];
    } | null;
    followUpQuery: string;
}

export interface ContinueAnalysisAgentOptions {
    app: AppHandle;
    pluginId: string;
    searchClient: SearchClient;
    aiServiceManager: AIServiceManager;
}

export class ContinueAnalysisAgent {
    constructor(private readonly options: ContinueAnalysisAgentOptions) {}

    /**
     * Run a follow-up analysis round. Yields the same LLMStreamEvent types
     * as VaultSearchAgent.startSession() so that routeEvent can process
     * the output identically.
     */
    async *startSession(context: ContinueContext): AsyncGenerator<LLMStreamEvent> {
        const { app, pluginId, searchClient, aiServiceManager } = this.options;

        // 1. Render the continue-specific system prompt.
        let systemPrompt: string;
        try {
            systemPrompt = await aiServiceManager.renderPrompt(
                PromptId.AiAnalysisContinueSystem,
                null,
            );
        } catch (err) {
            console.error('[ContinueAnalysisAgent] failed to render system prompt', err);
            yield {
                type: 'error',
                error: err as Error,
                triggerName: 'search-ai-agent',
            } as LLMStreamEvent;
            return;
        }

        // 2. Render the continue user prompt (previous round context).
        let contextPrefix: string;
        try {
            contextPrefix = await aiServiceManager.renderPrompt(
                PromptId.AiAnalysisContinue,
                {
                    originalQuery: context.originalQuery,
                    rounds: context.rounds,
                    sources: context.sources,
                    graphSummary: context.graphSummary,
                    followUpQuery: context.followUpQuery,
                },
            );
        } catch (err) {
            console.error('[ContinueAnalysisAgent] failed to render context prompt', err);
            yield {
                type: 'error',
                error: err as Error,
                triggerName: 'search-ai-agent',
            } as LLMStreamEvent;
            return;
        }

        // 3. Delegate to the harness-native VaultSearchAgent with overrides.
        const agent = new VaultSearchAgent(app, pluginId, searchClient, aiServiceManager, {
            systemPromptOverride: systemPrompt,
            contextPrefix,
        });

        yield* agent.startSession(context.followUpQuery);
    }
}
