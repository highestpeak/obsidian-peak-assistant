import { streamObject } from 'ai';
import { z } from 'zod/v3';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

const schema = z.object({
    questions: z.array(z.string()).describe('Follow-up questions the user might ask next'),
});

export type SuggestedFollowUpQuestions = z.infer<typeof schema>;

export type FollowUpQuestionAgentOptions = {
    aiServiceManager: AIServiceManager;
    options?: { provider: string; model: string };
    onTokenUsage?: (usage: import('@/core/providers/types').LLMUsage) => void;
};

/**
 * Agent for suggesting follow-up questions from the full analysis session.
 * Uses streamObject with system + user prompts; yields text-delta and on-step-finish.
 * Uses getModelForPrompt(AiAnalysisSuggestFollowUpQuestions).
 */
export class FollowUpQuestionAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly onTokenUsage?: FollowUpQuestionAgentOptions['onTokenUsage'];

    constructor(params: FollowUpQuestionAgentOptions) {
        this.aiServiceManager = params.aiServiceManager;
        this.onTokenUsage = params.onTokenUsage;
    }

    /**
     * Stream suggested follow-up questions. Yields text-delta and on-step-finish.
     * Call setQuestions when done to receive the final list.
     */
    public async *stream(
        variables: { sessionContext: string },
        opts?: { setQuestions?: (q: string[]) => void; stepId?: string; triggerName?: StreamTriggerName }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        const triggerName = opts?.triggerName ?? StreamTriggerName.FOLLOW_UP_QUESTION_AGENT;

        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSuggestFollowUpQuestions);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSuggestFollowUpQuestions, variables);

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisSuggestFollowUpQuestions);
        const model = this.aiServiceManager.getMultiChat()
            .getProviderService(provider)
            .modelClient(modelId);

        const result = streamObject({
            model,
            schema,
            schemaName: 'SuggestedFollowUpQuestions',
            schemaDescription: 'Follow-up questions from the analysis session.',
            system,
            prompt,
        });

        for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
                yield { type: 'text-delta', text: part.textDelta, triggerName };
            }
            if (part.type === 'finish') {
                this.onTokenUsage?.(part.usage as import('@/core/providers/types').LLMUsage);
                const obj = await result.object;
                const questions = obj.questions ?? [];
                opts?.setQuestions?.(questions);
                yield { type: 'on-step-finish', text: '', finishReason: part.finishReason, usage: part.usage, triggerName };
            }
        }
    }
}
