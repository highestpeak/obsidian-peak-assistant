import { DEFAULT_TOOL_ERROR_RETRY_TIMES } from "@/core/constant";
import { emptyUsage, LLMStreamEvent, mergeTokenUsage, StreamTriggerName, UIStepType, type LLMUsage } from "../types";
import type { FinishReason } from "ai";

/** Max chars per prompt for pk-debug (avoids huge console dumps). */
export const PK_DEBUG_PROMPT_TRUNCATE_CHARS = 2000;

/** Build a pk-debug event for prompt trace (system + user truncated). */
export function buildPromptTraceDebugEvent(
    triggerName: StreamTriggerName,
    system?: string,
    prompt?: string,
): LLMStreamEvent {
    return {
        type: 'pk-debug',
        debugName: 'prompt-trace',
        triggerName,
        extra: {
            system: system ?? 'undefined',
            prompt: prompt ?? 'undefined',
            systemLen: system?.length ?? 'undefined',
            promptLen: prompt?.length ?? 'undefined',
        },
    };
}
import { convertMessagesToText, generateToolCallId } from "../adapter/ai-sdk-adapter";
import { buildToolCorrectionMessageFromChunk, buildToolResultStreamEventFromChunk as buildToolErrorStreamEventFromChunk } from "./message-helper";
import { ErrorRetryInfo } from "@/service/prompt/PromptId";
import { AsyncIterableStream, TextStreamPart, ToolSet } from "ai";
import { ManualToolCallHandler } from "@/service/tools/types";

/** Part types from streamObject().fullStream (ObjectStreamPart). Use for type cast when passing result.fullStream. */
export type ObjectStreamPartLike =
    | { type: 'text-delta'; textDelta: string }
    | { type: 'object'; object: unknown }
    | { type: 'error'; error: unknown }
    | { type: 'finish'; finishReason?: FinishReason; usage?: LLMUsage; response?: unknown };

export type RetryContext = {
    attemptTimes: number;
    lastRetryText: string;
};

export function buildErrorRetryInfo(retryCtx?: ErrorRetryInfo | RetryContext): ErrorRetryInfo | undefined {
    if (!retryCtx) {
        return undefined;
    }
    if (retryCtx && 'attemptTimes' in retryCtx && 'lastAttemptErrorMessages' in retryCtx) {
        return retryCtx;
    }
    return {
        attemptTimes: retryCtx?.attemptTimes ?? 0,
        lastAttemptErrorMessages: (retryCtx as RetryContext)?.lastRetryText ?? '',
    };
}

export function accumulateTokenUsage(event: LLMStreamEvent, accumulateFunc: (usage?: LLMUsage) => void): void {
    if (event.type === 'on-step-finish' || event.type === 'prompt-stream-result') {
        accumulateFunc(event.usage);
    }
}

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
    const retryCondition = options?.retryCondition ?? ((event: LLMStreamEvent) => {
        if (event.type === 'error') return true;
        // Detect tool-result with error field (from safeAgentTool)
        if (event.type === 'tool-result' && event.output?.error) return true;
        return false;
    });
    const getRetryText = options?.getRetryText ?? ((event: LLMStreamEvent) => {
        // Handle tool-result with error field
        if (event.type === 'tool-result' && event.output?.error) {
            return `Tool "${event.toolName}" returned error: ${event.output.error}`;
        }
        return convertMessagesToText([buildToolCorrectionMessageFromChunk(event)]);
    });

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
    fullStream: AsyncIterableStream<TextStreamPart<TOOLS>> | AsyncIterable<ObjectStreamPartLike>,
    triggerName: StreamTriggerName,
    eventProcessor: {
        toolResultChunkPostProcessor?: (chunk: any) => LLMStreamEvent | {};
        chunkEventInterceptor?: (chunk: any) => void;
        yieldEventPostProcessor?: (chunk: any) => LLMStreamEvent | { extra?: any } | {};
        /** Return extra event(s) to yield after the main event for this chunk. */
        yieldExtraAfterEvent?: (chunk: any) => LLMStreamEvent | LLMStreamEvent[] | void;
        /** Auto-yield ui-step-delta for delta events (text-delta, reasoning-delta). */
        yieldUIStep?: {
            uiType: UIStepType;
            stepId: string;
            uiEventGenerator?: (chunk: any) => LLMStreamEvent | LLMStreamEvent[] | void;
        };
        /** 
         * Manual handlers: run handler on tool-call, yield events, skip tool-result from stream.
         * we use this maninly when tool result is a stream of events.
         *  */
        manualToolCallHandlers?: Record<string, ManualToolCallHandler>;
    }
): AsyncGenerator<LLMStreamEvent> {
    const uiStep = eventProcessor.yieldUIStep;
    let manualToolTokenUsage: LLMUsage = emptyUsage();

    for await (const chunk of fullStream) {
        eventProcessor.chunkEventInterceptor?.(chunk);
        let yieldEvent: LLMStreamEvent | undefined = undefined;
        let deltaText: string | undefined = undefined;

        switch (chunk.type) {
            case 'text-start': {
                yieldEvent = {
                    type: 'text-start',
                };
                break;
            }
            case 'text-delta': {
                const text = (chunk as any).text ?? (chunk as any).textDelta ?? '';
                deltaText = text;
                yieldEvent = {
                    type: 'text-delta',
                    text,
                    triggerName,
                };
                break;
            }
            case 'text-end': {
                yieldEvent = {
                    type: 'text-end',
                };
                break;
            }
            case 'reasoning-start': {
                yieldEvent = {
                    type: 'reasoning-start',
                };
                break;
            }
            case 'reasoning-delta':
                deltaText = chunk.text;
                yieldEvent = {
                    type: 'reasoning-delta',
                    text: chunk.text,
                    triggerName,
                };
                break;
            case 'reasoning-end': {
                yieldEvent = {
                    type: 'reasoning-end',
                };
                break;
            }
            case 'tool-call': {
                const toolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                yieldEvent = {
                    type: 'tool-call',
                    id: toolCallId,
                    toolName: chunk.toolName,
                    input: chunk.input,
                    triggerName,
                };
                const manualToolHandler = eventProcessor.manualToolCallHandlers?.[chunk.toolName];
                if (manualToolHandler) {
                    const resultCollector: Record<string, any> = {};
                    yield* manualToolHandler.handle(chunk.input, resultCollector);
                    manualToolTokenUsage = mergeTokenUsage(manualToolTokenUsage, resultCollector.stepTokenUsage);
                    yield {
                        type: 'tool-result',
                        id: toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input,
                        output: manualToolHandler.outputGetter?.(resultCollector) ?? resultCollector,
                        triggerName: manualToolHandler.triggerName,
                    };
                }
                break;
            }
            case 'tool-input-delta': {
                deltaText = chunk.delta;
                break;
            }
            case 'tool-result': {
                if (eventProcessor.manualToolCallHandlers?.[chunk.toolName]) {
                    break;
                }
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
                yieldEvent = buildToolErrorStreamEventFromChunk(
                    chunk,
                    triggerName
                );
                break;
            }
            case 'finish': {
                const usage = ((chunk as any).totalUsage ?? (chunk as any).usage) as LLMUsage | undefined;
                const finishReason = ((chunk as any).finishReason ?? 'unknown') as FinishReason;
                yieldEvent = {
                    type: 'on-step-finish',
                    text: `${triggerName} finish.`,
                    finishReason,
                    usage: mergeTokenUsage(usage ?? emptyUsage(), manualToolTokenUsage),
                    triggerName,
                };
                break;
            }
            case 'error': {
                const err = (chunk as any).error;
                yieldEvent = {
                    type: 'error',
                    error: err instanceof Error ? err : new Error(String(err)),
                    triggerName
                };
                break;
            }
            default:
                break;
        }
        if (yieldEvent) {
            yieldEvent = {
                ...yieldEvent,
                ...(eventProcessor.yieldEventPostProcessor ? eventProcessor.yieldEventPostProcessor(chunk) : {}),
                triggerName,
            };
            yield yieldEvent;

            // Auto-yield ui-step-delta for delta events when yieldUIStep is configured
            if (uiStep && deltaText !== undefined) {
                const uiEvent = uiStep.uiEventGenerator?.(chunk);
                if (uiEvent) {
                    if (Array.isArray(uiEvent)) {
                        for (const e of uiEvent) {
                            yield e;
                        }
                    } else {
                        yield uiEvent;
                    }
                } else {
                    yield {
                        type: 'ui-step-delta',
                        uiType: uiStep.uiType,
                        stepId: uiStep.stepId,
                        descriptionDelta: deltaText,
                        triggerName,
                    };
                }
            }

            const extra = eventProcessor.yieldExtraAfterEvent?.(chunk);
            if (extra !== undefined && extra !== null) {
                if (Array.isArray(extra)) {
                    for (const e of extra)
                        yield {
                            ...e,
                            triggerName,
                        };
                } else {
                    yield {
                        ...extra,
                        triggerName,
                    };
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

export function checkIfDeltaEvent(type: LLMStreamEvent['type']) {
    return type === 'text-delta'
        || type === 'reasoning-delta'
        || type === 'prompt-stream-delta'
        || type === 'tool-input-delta'
        || type === 'ui-step-delta';
}