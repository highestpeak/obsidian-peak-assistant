import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import type { AgentTool } from '@/service/tools/types';
import type { AISearchUpdateContext, InnerAgentContext } from '../AISearchAgent';
import { overviewMermaidUpdateTool } from './helpers/DashboardUpdateToolBuilder';
import { buildPromptTraceDebugEvent, streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';
import { validateMermaidCode } from '@/core/utils/analysis-data-validator';

const DEFAULT_MAX_STEPS = 10;

type MermaidToolSet = {
    search_analysis_context: AgentTool;
    submit_overview_mermaid: AgentTool;
};

/**
 * Agent for producing the Mermaid overview diagram.
 * Uses search_analysis_context for RAG and submit_overview_mermaid to set the result.
 * Uses getModelForPrompt(AiAnalysisOverviewMermaid).
 */
export class MermaidOverviewAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: InnerAgentContext;

    private agent: Agent<MermaidToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager,
        context: InnerAgentContext,
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisOverviewMermaid);
        const { searchHistory } = this.context;
        const tools: MermaidToolSet = {
            search_analysis_context: searchMemoryStoreTool(searchHistory, {
                description: 'Search the analysis session history for relevant context. Use when you need to look up specific information from the search process, tool results, or reasoning.',
            }),
            submit_overview_mermaid: overviewMermaidUpdateTool(this.context.getResult),
        };
        this.agent = new Agent<MermaidToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_STEPS),
                hasToolCall('submit_overview_mermaid'),
            ],
        });
    }

    /**
     * Stream overview Mermaid generation. Retries on tool error or on post-stream validation failure (empty/invalid diagram).
     * When errorRetryInfo is provided (e.g. from caller), runs a single repair pass without inner retry loop.
     */
    public async *stream(variables: AISearchUpdateContext, errorRetryInfo?: ErrorRetryInfo): AsyncGenerator<LLMStreamEvent> {
        if (errorRetryInfo) {
            yield* this.realStreamInterlal(variables, this.normalizeRetryCtx(errorRetryInfo));
            return;
        }
        const self = this;
        yield* withRetryStream(
            variables,
            async function* (vars, retryCtx) {
                yield* self.realStreamInterlal(vars, retryCtx ? self.normalizeRetryCtx(retryCtx) : undefined);
                const overview = (self.context.getResult().overviewMermaid ?? '').trim();
                if (!overview) {
                    yield { type: 'error', toolName: 'submit_overview_mermaid', error: new Error('Empty overview diagram'), triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID };
                    return;
                }
                const validation = await validateMermaidCode(overview);
                if (!validation.valid) {
                    yield { type: 'error', toolName: 'submit_overview_mermaid', error: new Error(validation.error), triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID };
                }
            },
            { maxRetries: 2 },
        );
    }

    /** Normalize RetryContext (lastRetryText) or ErrorRetryInfo (lastAttemptErrorMessages) for prompt. */
    private normalizeRetryCtx(ctx: ErrorRetryInfo | { attemptTimes?: number; lastRetryText?: string; lastAttemptErrorMessages?: string }): ErrorRetryInfo {
        return {
            attemptTimes: ctx.attemptTimes ?? 0,
            lastAttemptErrorMessages: 'lastAttemptErrorMessages' in ctx && ctx.lastAttemptErrorMessages !== undefined
                ? ctx.lastAttemptErrorMessages
                : (ctx as { lastRetryText?: string }).lastRetryText ?? '',
        };
    }

    /**
     * Stream Mermaid overview generation. Agent receives context, may query history, then submits diagram.
     */
    private async *realStreamInterlal(
        variables: AISearchUpdateContext,
        errorRetryInfo?: ErrorRetryInfo,
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisOverviewMermaid);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewMermaid, {
            ...variables,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
        });

        yield buildPromptTraceDebugEvent('overview-mermaid-prompt', StreamTriggerName.SEARCH_OVERVIEW_MERMAID, system, prompt);
        const result = this.agent.stream({ system, prompt });
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_OVERVIEW_MERMAID, {
            chunkEventInterceptor: (chunk: any) => {
                if (chunk.type === 'on-step-finish') {
                    this.context.getMemoryManager().accumulateTokenUsage(chunk.usage);
                }
            },
            yieldEventPostProcessor: (chunk: any) => {
                return chunk.toolName === 'submit_overview_mermaid'
                    ? { extra: { currentResult: this.context.getResult() } }
                    : {};
            },
        });
    }
}
