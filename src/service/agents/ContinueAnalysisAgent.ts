/**
 * ContinueAnalysisAgent — handles follow-up analysis rounds by injecting
 * previous round context into a VaultSearchAgentSDK session with a custom
 * system prompt.
 *
 * Design: thin wrapper over VaultSearchAgentSDK. Renders continue-specific
 * prompts and passes them as systemPromptOverride + contextPrefix. The SDK
 * agent then explores the vault for NEW evidence and calls vault_submit_plan,
 * producing the same event stream as the initial analysis.
 */

import type { App } from 'obsidian';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { MyPluginSettings } from '@/app/settings/types';
import { PromptId } from '@/service/prompt/PromptId';
import { VaultSearchAgentSDK } from './VaultSearchAgentSDK';

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
    app: App;
    pluginId: string;
    searchClient: SearchClient;
    aiServiceManager: AIServiceManager;
    settings: MyPluginSettings;
}

export class ContinueAnalysisAgent {
    constructor(private readonly options: ContinueAnalysisAgentOptions) {}

    /**
     * Run a follow-up analysis round. Yields the same LLMStreamEvent types as
     * VaultSearchAgentSDK.startSession() so that routeEvent can process the
     * output identically.
     */
    async *startSession(context: ContinueContext): AsyncGenerator<LLMStreamEvent> {
        const { app, pluginId, searchClient, aiServiceManager, settings } = this.options;

        // 1. Render the continue-specific system prompt
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

        // 2. Render the continue user prompt (previous round context)
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

        // 3. Delegate to VaultSearchAgentSDK with overrides
        const sdkAgent = new VaultSearchAgentSDK({
            app,
            pluginId,
            searchClient,
            aiServiceManager,
            settings,
            systemPromptOverride: systemPrompt,
            contextPrefix,
        });

        // 4. Warmup + stream events through
        await sdkAgent.warmup();
        yield* sdkAgent.startSession(context.followUpQuery);
    }
}
