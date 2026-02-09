import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { SearchAgentResult } from '../AISearchAgent';
import { applyOperationsForDimension } from './ResultUpdateToolHelper';
import { ResultUpdateDimension } from './ResultUpdateToolHelper';

export interface DimensionUpdateAgentOptions {
    provider: string;
    model: string;
}

export interface DimensionUpdateAgentContext {
    getResult: () => SearchAgentResult;
    verifiedPaths: Set<string>;
}

const MAX_ATTEMPTS = 3;

/**
 * Parses LLM output as JSON array of operations. Tolerates markdown code blocks and extra whitespace.
 */
function parseOperationsJson(raw: string): any[] {
    let s = raw.trim();
    const codeBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) s = codeBlockMatch[1].trim();
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    return parsed;
}

/**
 * Sub-agent that turns Thought agent text into operations for one dimension.
 * Keeps context isolated: maintains lastError internally and passes it into the prompt on retry.
 * Uses chatWithPromptStream; retries up to MAX_ATTEMPTS without pushing to external context.
 */
export class DimensionUpdateAgent {
    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private readonly options: DimensionUpdateAgentOptions,
        private readonly context: DimensionUpdateAgentContext,
        private readonly dimension: ResultUpdateDimension,
        private readonly promptId: PromptId,
        private readonly triggerName: StreamTriggerName
    ) {}

    async *stream(text: string, resultCollector?: Record<string, any>): AsyncGenerator<LLMStreamEvent> {
        yield { type: 'pk-debug', debugName: `${this.dimension}-agent-start`, triggerName: this.triggerName };

        if (!text || String(text).trim().length === 0) {
            if (resultCollector) {
                resultCollector.success = false;
                resultCollector.message = 'No text provided.';
            }
            yield { type: 'pk-debug', debugName: `${this.dimension}-agent-done`, triggerName: this.triggerName };
            return;
        }

        let lastError: string | undefined;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            let output = '';
            const stream = this.aiServiceManager.chatWithPromptStream(
                this.promptId,
                { text: String(text).trim(), lastError },
                this.options.provider,
                this.options.model
            );
            for await (const event of stream) {
                yield { ...event, triggerName: this.triggerName };
                if (event.type === 'prompt-stream-result' && event.output != null) {
                    output = typeof event.output === 'string' ? event.output : String(event.output);
                }
            }

            let operations: any[];
            try {
                operations = parseOperationsJson(output);
            } catch (err) {
                lastError = `Output must be a valid JSON array of operations. ${err instanceof Error ? err.message : String(err)}`;
                continue;
            }

            if (!operations.length) {
                lastError = 'Output must be a non-empty JSON array of operations.';
                continue;
            }

            const { success, message } = await applyOperationsForDimension(
                this.dimension,
                this.context.getResult,
                operations,
                this.context.verifiedPaths
            );

            if (success) {
                if (resultCollector) {
                    resultCollector.success = true;
                    resultCollector.result = 'OK';
                }
                yield { type: 'pk-debug', debugName: `${this.dimension}-agent-done`, triggerName: this.triggerName };
                return;
            }
            lastError = message;
        }

        if (resultCollector) {
            resultCollector.success = false;
            resultCollector.message = 'Max attempts reached.';
        }
        yield { type: 'pk-debug', debugName: `${this.dimension}-agent-done`, triggerName: this.triggerName };
    }

    async *manualToolCallHandle(chunkInput: any, resultCollector: Record<string, any>): AsyncGenerator<LLMStreamEvent> {
        const text = (chunkInput?.text ?? chunkInput?.prompt ?? '').trim();
        yield* this.stream(text, resultCollector);
    }
}
