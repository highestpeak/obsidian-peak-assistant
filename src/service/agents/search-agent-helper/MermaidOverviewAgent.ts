import { Experimental_Agent as Agent } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UISignalChannel, UISignalKind, UIStepType } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import type { AgentTool } from '@/service/tools/types';
import { overviewMermaidUpdateTool } from './helpers/DashboardUpdateToolBuilder';
import { buildErrorRetryInfo, buildPromptTraceDebugEvent, streamTransform, withRetryStream, type RetryContext } from '@/core/providers/helpers/stream-helper';
import type { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { MermaidFixAgent } from './MermaidFixAgent';

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
    private readonly mermaidFixAgent: MermaidFixAgent;

    private agent: Agent<MermaidToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager,
        context: AgentContextManager,
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;
        this.mermaidFixAgent = new MermaidFixAgent(params.aiServiceManager);

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
        });
    }

    /**
     * Stream overview Mermaid generation. Retries on tool/stream error only. If validation fails,
     * uses MermaidFixAgent to fix (up to 2 fix retries) instead of re-running the full agent.
     */
    public async *stream(
        opts?: { stepId?: string; },
    ): AsyncGenerator<LLMStreamEvent> {
        const { stepId } = opts ?? {};
        const self = this;

        yield* withRetryStream(
            {},
            async function* (_, retryCtx) {
                yield* self.realStreamInternal(stepId, retryCtx);
            },
            { maxRetries: 2, triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID },
        );

        const overview = (self.context.getAgentResult().overviewMermaid ?? '').trim();
        yield* self.mermaidFixAgent.ifInvalidThenFix(overview, (m) => {
            self.context.getAgentResult().overviewMermaid = m;
        });
    }

    /**
     * Stream Mermaid overview generation. Agent receives context, may query history, then submits diagram.
     */
    private async *realStreamInternal(
        stepId?: string,
        retryCtx?: ErrorRetryInfo | RetryContext,
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisOverviewMermaid);
        const originalQuery = this.context.getInitialPrompt() ?? '';
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const dossier = this.context.getDossierForSummary();
        const overviewContext = dossier.verifiedFactSheet || (dossier.confirmedFacts?.length ? dossier.confirmedFacts.join('\n') : '(No verified facts yet.)');
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewMermaid, {
            originalQuery,
            agentMemoryMessage: overviewContext,
            lastMermaid: this.context.getLatestMindflowMermaid(),
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
