import { Experimental_Agent as Agent } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { AgentTool, ManualToolCallHandler } from '@/service/tools/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { MermaidOverviewAgent } from './MermaidOverviewAgent';
import { callAgentTool } from '@/service/tools/call-agent-tool';
import { RawSearchAgent } from './RawSearchAgent';

type SummaryToolSet = AgentMemoryToolSet & {
    call_search_agent: AgentTool;
};

export interface AiSummaryVariables {
    originalQuery: string;
    summary: string;
}

/**
 * Produces the comprehensive synthesis summary. Uses an Agent with tools to fetch
 * dashboard state, thought history, and block content before writing the summary.
 */
export class SummaryAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;
    private summaryAgent: Agent<SummaryToolSet>;
    private mermaidOverviewAgent: MermaidOverviewAgent;
    private rawSearchAgent: RawSearchAgent;

    /** Store for call_search_agent: execute awaits; manual handler resolves. Per-stream, set in realStreamInternal. */
    private readonly manualCallSearchAgent?: ManualToolCallHandler;

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: AgentContextManager;
        rawSearchAgent: RawSearchAgent;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;
        this.rawSearchAgent = params.rawSearchAgent;
        this.mermaidOverviewAgent = new MermaidOverviewAgent(params);

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisSummary);
        const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
        this.summaryAgent = new Agent<SummaryToolSet>({
            model,
            tools: {
                ...this.context.getAgentMemoryTool(),
                call_search_agent: callAgentTool('search'),
            },
        });

        this.manualCallSearchAgent = {
            toolName: 'call_search_agent',
            triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT,
            handle: this.rawSearchAgent.manualToolCallHandle.bind(this.rawSearchAgent),
            outputGetter: (resultCollector) => resultCollector.searchResultChunks,
        }
    }

    public async *streamMultiStep(
        opts: {
            streamTitle?: boolean;
            streamSummary?: boolean;
            streamMermaidOverview?: boolean;
        }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = generateUuidWithoutHyphens();
        if (opts.streamTitle) {
            yield* this.streamTitle({ stepId });
        }
        if (opts.streamSummary) {
            yield* this.streamSummary({ stepId });
        }
        if (opts.streamMermaidOverview) {
            yield* this.streamMermaidOverview({ stepId });
        }
    }

    /**
     * Generate and set agentResult.title (used for save filename, recent list, folder suggestion).
     */
    public async *streamTitle(
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_TITLE,
        };

        const stream = this.aiServiceManager.chatWithPromptStream(PromptId.AiAnalysisTitle, {
            query: this.context.getInitialPrompt() ?? '',
            summary: this.context.getLatestMessageText(),
        });
        for await (const chunk of stream) {
            if (chunk.type === 'prompt-stream-result') {
                this.context.getAgentResult().title = String(chunk.output ?? '').trim() || undefined;
            }
            yield { ...chunk, triggerName: StreamTriggerName.SEARCH_TITLE };
        }
    }

    /**
     * Run summary agent with tools; collect all text-delta as the final summary.
     */
    public async *streamSummary(
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_SUMMARY,
        };

        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSummary);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSummary, {
            originalQuery: this.context.getInitialPrompt() ?? '',
            summary: this.context.getLatestMessageText(),
        });

        yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_SUMMARY, system, prompt);

        const result = this.summaryAgent.stream({ system, prompt });
        const summaryCollector: string[] = [];
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_SUMMARY, {
            yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
            yieldEventPostProcessor: (chunk: any) => {
                if (chunk.type === 'text-delta') {
                    summaryCollector.push(chunk.text ?? (chunk as any).textDelta ?? '');
                }
                return chunk;
            },
            manualToolCallHandlers: {
                call_search_agent: this.manualCallSearchAgent!,
            },
        });

        this.context.getAgentResult().summary = summaryCollector.join('');
    }

    public async *streamMermaidOverview(
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        yield* this.mermaidOverviewAgent.stream(
            opts
        );
    }
}
