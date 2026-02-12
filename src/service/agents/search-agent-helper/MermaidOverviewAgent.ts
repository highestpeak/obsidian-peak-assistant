import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import type { AgentTool } from '@/service/tools/types';
import type { DashboardUpdateContext, InnerAgentContext } from '../AISearchAgent';
import { overviewMermaidUpdateTool } from './DashboardUpdateToolBuilder';
import { streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';

const DEFAULT_MAX_STEPS = 10;

type MermaidToolSet = {
    search_analysis_context: AgentTool;
    submit_overview_mermaid: AgentTool;
};

/**
 * Agent for producing the Mermaid overview diagram.
 * Uses search_analysis_context for RAG and submit_overview_mermaid to set the result.
 */
export class MermaidOverviewAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: { provider: string; model: string };
    private readonly context: InnerAgentContext;

    private agent: Agent<MermaidToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager,
        options: { provider: string; model: string },
        context: InnerAgentContext,
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.options = params.options;
        this.context = params.context;

        const { searchHistory } = this.context;
        const tools: MermaidToolSet = {
            search_analysis_context: searchMemoryStoreTool(searchHistory, {
                description: 'Search the analysis session history for relevant context. Use when you need to look up specific information from the search process, tool results, or reasoning.',
            }),
            submit_overview_mermaid: overviewMermaidUpdateTool(this.context.getResult),
        };
        this.agent = new Agent<MermaidToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(this.options.provider)
                .modelClient(this.options.model),
            tools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_STEPS),
                hasToolCall('submit_overview_mermaid'),
            ],
        });
    }

    public async *stream(variables: DashboardUpdateContext): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            variables,
            (vars, retryCtx) => this.realStreamInterlal(vars, retryCtx),
        );
    }

    /**
     * Stream Mermaid overview generation. Agent receives context, may query history, then submits diagram.
     */
    private async *realStreamInterlal(
        variables: DashboardUpdateContext,
        errorRetryInfo?: ErrorRetryInfo
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisOverviewMermaid);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewMermaid, {
            ...variables,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
        });

        const result = this.agent.stream({ system, prompt });
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_OVERVIEW_MERMAID, {
            yieldEventPostProcessor: (chunk: any) => {
                return chunk.toolName === 'submit_overview_mermaid'
                    ? { extra: { currentResult: this.context.getResult() } }
                    : {};
            },
        });
    }
}
