import { DEFAULT_TOOL_ERROR_RETRY_TIMES } from "@/core/constant";
import { LLMStreamEvent, StreamTriggerName, UIStepType } from "../types";
import { convertMessagesToText, generateToolCallId } from "../adapter/ai-sdk-adapter";
import { buildToolCorrectionMessageFromChunk, buildToolResultStreamEventFromChunk } from "./message-helper";
import { ErrorRetryInfo } from "@/service/prompt/PromptId";
import { AsyncIterableStream, TextStreamPart, ToolSet } from "ai";

export type RetryContext = {
    attemptTimes: number;
    lastRetryText: string;
};

/**
 * A generic stream retry wrapper.
 */
export async function* withRetryStream<TVariables>(
    variables: TVariables,
    streamFactory: (vars: TVariables, retryCtx?: ErrorRetryInfo | RetryContext) => AsyncGenerator<LLMStreamEvent>,
    options?: {
        maxRetries?: number;
        retryCondition?: (event: LLMStreamEvent) => boolean;
        getRetryText?: (event: LLMStreamEvent) => string;
    }
): AsyncGenerator<LLMStreamEvent> {
    let lastRetryText = '';
    let shouldRetry = false;

    const maxRetries = options?.maxRetries ?? DEFAULT_TOOL_ERROR_RETRY_TIMES;
    const retryCondition = options?.retryCondition ?? ((event: LLMStreamEvent) => event.type === 'error');
    const getRetryText = options?.getRetryText ?? ((event: LLMStreamEvent) =>
        convertMessagesToText([buildToolCorrectionMessageFromChunk(event)])
    );

    // retry = 1 is more readable than retry = 0. so we start from 0 and end at maxRetries + 1.
    for (let i = 0; i < maxRetries + 1; i++) {
        shouldRetry = false; // reset the state at the beginning of each attempt

        const stream = streamFactory(
            variables,
            lastRetryText ? { attemptTimes: i, lastRetryText } : undefined
        );

        for await (const event of stream) {
            if (retryCondition(event)) {
                lastRetryText = getRetryText(event);
                shouldRetry = true;
            }
            yield event;
        }

        // if the stream didn't need to retry, break the loop
        if (!shouldRetry) break;
    }
}


export async function* streamTransform<TOOLS extends ToolSet>(
    fullStream: AsyncIterableStream<TextStreamPart<TOOLS>>,
    triggerName: StreamTriggerName,
    eventProcessor: {
        toolResultChunkPostProcessor?: (chunk: any) => LLMStreamEvent | {};
        chunkEventInterceptor?: (chunk: any) => void;
        yieldEventPostProcessor?: (chunk: any) => LLMStreamEvent | {};
        /** Return extra event(s) to yield after the main event for this chunk. */
        yieldExtraAfterEvent?: (chunk: any, yieldedEvent: LLMStreamEvent) => LLMStreamEvent | LLMStreamEvent[] | void;
        yieldUIStep?: {
            uiType: UIStepType;
            stepId: string;
        }
    }
): AsyncGenerator<LLMStreamEvent> {
    const yieldUIStep = eventProcessor.yieldUIStep;
    for await (const chunk of fullStream) {
        eventProcessor.chunkEventInterceptor?.(chunk);
        let yieldEvent: LLMStreamEvent | undefined = undefined;
        switch (chunk.type) {
            case 'text-delta':
                yieldEvent = {
                    type: 'text-delta',
                    text: chunk.text,
                    triggerName,
                };
                yieldUIStep ? yield {
                    type: 'ui-step',
                    uiType: yieldUIStep.uiType,
                    stepId: yieldUIStep.stepId,
                    title: chunk.text,
                    description: chunk.text,
                } : null;
                break;
            case 'reasoning-delta':
                yieldEvent = {
                    type: 'reasoning-delta',
                    text: chunk.text,
                    triggerName,
                };
                yieldUIStep ? yield {
                    type: 'ui-step',
                    uiType: yieldUIStep.uiType,
                    stepId: yieldUIStep.stepId,
                    title: chunk.text,
                    description: chunk.text,
                } : null;
                break;
            case 'tool-call':
                const toolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                yieldEvent = {
                    type: 'tool-call',
                    id: toolCallId,
                    toolName: chunk.toolName,
                    input: chunk.input,
                    triggerName,
                };
                break;
            case 'tool-result': {
                const toolName = chunk.toolName;
                const toolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                yieldEvent = {
                    ...{
                        type: 'tool-result',
                        id: toolCallId,
                        toolName,
                        input: chunk.input,
                        output: chunk.output,
                        triggerName,
                    },
                    ...(eventProcessor.toolResultChunkPostProcessor ? eventProcessor.toolResultChunkPostProcessor(chunk) : {}),
                };
                break;
            }
            case 'tool-error': {
                yieldEvent = buildToolResultStreamEventFromChunk(
                    chunk,
                    triggerName
                );
                break;
            }
            case 'finish':
                yieldEvent = {
                    type: 'on-step-finish',
                    text: `${triggerName} finish.`,
                    finishReason: chunk.finishReason,
                    usage: chunk.totalUsage,
                    triggerName,
                };
                break;
            default:
                break;
        }
        if (yieldEvent) {
            yieldEvent = {
                ...yieldEvent,
                ...(eventProcessor.yieldEventPostProcessor ? eventProcessor.yieldEventPostProcessor(chunk) : {}),
            };
            yield yieldEvent;
            const extra = eventProcessor.yieldExtraAfterEvent?.(chunk, yieldEvent);
            if (extra !== undefined && extra !== null) {
                if (Array.isArray(extra)) {
                    for (const e of extra) yield e;
                } else {
                    yield extra;
                }
            }
        }
    }
}

export const DELTA_EVENT_TYPES = new Set(['text-delta', 'reasoning-delta', 'prompt-stream-delta', 'tool-input-delta']);
export function getDeltaEventDeltaText(event: LLMStreamEvent): string {
    switch (event.type) {
        case 'text-delta':
            return event.text;
        case 'reasoning-delta':
            return event.text;
        case 'prompt-stream-delta':
            return event.delta ?? '';
        case 'tool-input-delta':
            return event.delta;
    }
    return '';
}