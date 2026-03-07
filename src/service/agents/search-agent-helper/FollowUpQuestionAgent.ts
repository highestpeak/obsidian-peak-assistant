import { streamObject } from 'ai';
import { SuggestedFollowUpQuestions, suggestedFollowUpQuestionsSchema } from '@/core/schemas/agents';
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
    /** Final dashboard blocks (conclusions, diagrams, actions). Primary input when present. */
    dashboardBlocks?: string;
    /** Gold standard facts; use with blocks to suggest targeted follow-ups. */
    confirmedFacts?: string;
    topics?: string;
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
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Suggesting follow-up questions...',
            triggerName: StreamTriggerName.FOLLOW_UP_QUESTION_AGENT,
        };

        stepId = stepId ?? generateUuidWithoutHyphens();

        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSuggestFollowUpQuestions);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const topics = this.context.getTopics();
        const hasTopics = (topics?.length ?? 0) > 0;
        const dashboardBlocks = this.context.getDashboardBlocks();
        const hasDashboardBlocks = (dashboardBlocks?.length ?? 0) > 0;
        const confirmedFactsList = this.context.getConfirmedFacts();
        const confirmedFactsText =
            confirmedFactsList.length > 0
                ? confirmedFactsList.map((f, i) => `Fact #${i + 1}: ${f}`).join('\n')
                : undefined;
        // No raw memory: only dashboard blocks + confirmed facts (and topics).
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSuggestFollowUpQuestions, {
            initialPrompt: this.context.getInitialPrompt(),
            dashboardBlocks: hasDashboardBlocks ? JSON.stringify(dashboardBlocks) : undefined,
            confirmedFacts: confirmedFactsText,
            topics: hasTopics ? JSON.stringify(topics) : undefined,
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
                        this.context.setSuggestedFollowUpQuestions(obj?.questions ?? []);
                    }
                },
            },
        );
        if (result.object) {
            const obj = await result.object;
            this.context.setSuggestedFollowUpQuestions(obj?.questions ?? []);
        }
    }
}
