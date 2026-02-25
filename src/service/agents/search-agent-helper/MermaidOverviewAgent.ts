import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UISignalChannel, UISignalKind, UIStepType } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import type { AgentTool } from '@/service/tools/types';
import { overviewMermaidUpdateTool } from './helpers/DashboardUpdateToolBuilder';
import { buildErrorRetryInfo, buildPromptTraceDebugEvent, RetryContext, streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';
import { validateMermaidCode } from '@/core/utils/analysis-data-validator';
import type { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';

const DEFAULT_MAX_STEPS = 10;

type MermaidToolSet = AgentMemoryToolSet & {
    submit_overview_mermaid: AgentTool;
};

export interface MermaidOverviewVariables {
    originalQuery: string;
    agentMemoryMessage: string;
    lastMermaid?: string;
}

/**
 * Agent for producing the Mermaid overview diagram.
 * Uses search_analysis_context for RAG and submit_overview_mermaid to set the result.
 * Uses getModelForPrompt(AiAnalysisOverviewMermaid).
 */
export class MermaidOverviewAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;

    private agent: Agent<MermaidToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager,
        context: AgentContextManager,
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisOverviewMermaid);
        const tools: MermaidToolSet = {
            ...this.context.getAgentMemoryTool(),
            submit_overview_mermaid: overviewMermaidUpdateTool(),
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
    public async *stream(
        opts?: { stepId?: string; },
    ): AsyncGenerator<LLMStreamEvent> {
        const { stepId } = opts ?? {};
        const self = this;

        let validMermaid = true;
        let generationCount = 0;
        do {
            generationCount++;

            yield* withRetryStream(
                {},
                async function* (_, retryCtx) {
                    yield* self.realStreamInternal(stepId, retryCtx);
                },
                { maxRetries: 2 },
            );

            const overview = (self.context.getAgentResult().overviewMermaid ?? '').trim();
            const validation = await validateMermaidCode(overview);
            if (!validation.valid) {
                validMermaid = false;
                yield {
                    type: "pk-debug",
                    debugName: "overview_mermaid_validation_failed",
                    triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
                    extra: {
                        error: validation.error,
                    },
                }
            }
        } while (!validMermaid && generationCount < 3);
    }

    /**
     * Stream Mermaid overview generation. Agent receives context, may query history, then submits diagram.
     */
    private async *realStreamInternal(
        stepId?: string,
        retryCtx?: ErrorRetryInfo | RetryContext,
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisOverviewMermaid);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewMermaid, {
            originalQuery: this.context.getInitialPrompt() ?? '',
            agentMemoryMessage: this.context.getLatestMessageText(),
            lastMermaid: this.context.getMindflowContext()?.lastMermaid,
            ...buildErrorRetryInfo(retryCtx) ?? {},
        });

        yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_OVERVIEW_MERMAID, system, prompt);
        const result = this.agent.stream({ system, prompt });
        const ctx = this.context;
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_OVERVIEW_MERMAID, {
            yieldUIStep: stepId ? { uiType: UIStepType.STEPS_DISPLAY, stepId } : undefined,
            yieldEventPostProcessor: (chunk: any) => {
                return chunk.toolName === 'submit_overview_mermaid'
                    ? this.context.yieldAgentResult()
                    : {};
            },
            yieldExtraAfterEvent: (chunk: any) => {
                if (chunk.type === 'tool-result' && chunk.toolName === 'submit_overview_mermaid') {
                    const mermaid = (ctx.getAgentResult().overviewMermaid ?? '').trim();
                    if (mermaid) {
                        return {
                            type: 'ui-signal' as const,
                            channel: UISignalChannel.OVERVIEW_MERMAID,
                            kind: UISignalKind.COMPLETE,
                            entityId: 'overview-mermaid',
                            payload: { mermaid },
                        };
                    }
                }
            },
        });
    }
}
