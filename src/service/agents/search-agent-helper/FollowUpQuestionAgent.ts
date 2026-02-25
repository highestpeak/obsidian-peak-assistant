import { streamObject } from 'ai';
import { suggestedFollowUpQuestionsSchema } from '@/core/schemas/agents';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UIStepType } from '@/core/providers/types';
import { streamTransform } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { AgentContextManager } from './AgentContextManager';

export type { SuggestedFollowUpQuestions } from '@/core/schemas/agents';

export interface FollowUpQuestionVariables {
    initialPrompt: string;
    agentMemoryMessage: string;
    topics?: string;
    dashboardBlocks?: string;
}

/**
 * Agent for suggesting follow-up questions from the full analysis session.
 * Uses streamObject with system + user prompts; yields text-delta and on-step-finish.
 * Uses getModelForPrompt(AiAnalysisSuggestFollowUpQuestions).
 */
export class FollowUpQuestionAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: AgentContextManager;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;
    }

    /**
     * Stream suggested follow-up questions. Yields text-delta and on-step-finish.
     * Call setQuestions when done to receive the final list.
     */
    public async *stream(
        stepId: string,
    ): AsyncGenerator<LLMStreamEvent> {
        stepId = stepId ?? generateUuidWithoutHyphens();

        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSuggestFollowUpQuestions);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const hasTopics = this.context.getAgentResult().topics?.length ?? 0 > 0;
        const hasDashboardBlocks = this.context.getAgentResult().dashboardBlocks?.length ?? 0 > 0;
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSuggestFollowUpQuestions, {
            initialPrompt: this.context.getInitialPrompt(),
            agentMemoryMessage: this.context.getLatestMessageText(),
            topics: hasTopics ? JSON.stringify(this.context.getAgentResult().topics) : undefined,
            dashboardBlocks: hasDashboardBlocks ? JSON.stringify(this.context.getAgentResult().dashboardBlocks) : undefined,
        });

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisSuggestFollowUpQuestions);
        const model = this.aiServiceManager.getMultiChat()
            .getProviderService(provider)
            .modelClient(modelId);

        const result = streamObject({
            model,
            schema: suggestedFollowUpQuestionsSchema,
            schemaName: 'SuggestedFollowUpQuestions',
            schemaDescription: 'Follow-up questions from the analysis session.',
            system,
            prompt,
        });

        yield* streamTransform(
            result.fullStream,
            StreamTriggerName.FOLLOW_UP_QUESTION_AGENT,
            {
                yieldUIStep: stepId ? { uiType: UIStepType.STEPS_DISPLAY, stepId } : undefined,
                chunkEventInterceptor: (chunk) => {
                    if (chunk.type === 'finish') {
                        const obj = (chunk as any).object as SuggestedFollowUpQuestions | undefined;
                        this.context.getAgentResult().suggestedFollowUpQuestions = obj?.questions ?? [];
                    }
                },
            },
        );
        if (result.object) {
            const obj = await result.object;
            this.context.getAgentResult().suggestedFollowUpQuestions = obj?.questions ?? [];
        }
    }
}
