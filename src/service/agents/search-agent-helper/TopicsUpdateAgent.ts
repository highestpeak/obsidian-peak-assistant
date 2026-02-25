import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import { topicUpdateTool, getTopicToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import type { AgentTool } from '@/service/tools/types';
import { buildPromptTraceDebugEvent, streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

const DEFAULT_MAX_STEPS = 18;

type TopicsUpdateToolSet = AgentMemoryToolSet & {
    update_topics: AgentTool;
};

export interface TopicsUpdateVariables {
    agentMemoryMessage: string;
    topicPlan: string[];
    currentTopics?: string;
}

/** Uses getModelForPrompt(AiAnalysisDashboardUpdateTopics). */
export class TopicsUpdateAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;

    private agent: Agent<TopicsUpdateToolSet>;

    constructor(
        params: {
            aiServiceManager: AIServiceManager,
            context: AgentContextManager,
        }
    ) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;
        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDashboardUpdateTopics);

        const tools: TopicsUpdateToolSet = {
            ...this.context.getAgentMemoryTool(),
            update_topics: topicUpdateTool(),
        };

        this.agent = new Agent<TopicsUpdateToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_STEPS),
            ],
        });
    }

    public async *stream(
        topicsPlan: string[],
        stepId?: string
    ): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            {},
            (_, retryCtx) => this.realStreamInterlal(topicsPlan, retryCtx, stepId),
        );
    }

    private async *realStreamInterlal(
        topicPlan: string[],
        errorRetryInfo?: ErrorRetryInfo,
        stepId?: string
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdateTopics);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const hasTopics = this.context.getAgentResult().topics?.length ?? 0 > 0;
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDashboardUpdateTopics, {
            topicPlan: topicPlan,
            agentMemoryMessage: this.context.getLatestMessageText(),
            currentTopics: hasTopics ? JSON.stringify(this.context.getAgentResult().topics) : undefined,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
            toolFormatGuidance: getTopicToolFormatGuidance(),
        });

        yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_TOPICS_AGENT, system, prompt);
        const result = this.agent.stream({
            system, prompt,
        });

        stepId = stepId ?? generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Updating topics...',
            description: 'Updating topics',
            triggerName: StreamTriggerName.SEARCH_TOPICS_AGENT,
        }
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_TOPICS_AGENT, {
            yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId: stepId },
            yieldEventPostProcessor: (chunk: any) => {
                if (chunk.type === 'tool-result') {
                    if (chunk.toolName === 'update_topics') {
                        return this.context.yieldAgentResult();
                    }
                }
                return {};
            },
        });
    }
}
