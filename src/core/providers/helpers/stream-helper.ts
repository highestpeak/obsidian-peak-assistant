import { DEFAULT_TOOL_ERROR_RETRY_TIMES } from "@/core/constant";
import { emptyUsage, LLMStreamEvent, mergeTokenUsage, RawUIStreamEvent, StreamTriggerName, UIStepType, type LLMUsage } from "../types";
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
            // no system prompt show in debug. as system is immutable in most cases (design this for cache)
            // system: system ?? 'undefined',
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

/** Part types: streamText().fullStream (TextStreamPart) or legacy streamObject (ObjectStreamPart). */
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
 * Run multiple async generators with a concurrency limit; yield events as they arrive (merge order).
 */
export async function* mergeStreamsWithConcurrency<T>(
    limit: number,
    factories: Array<() => AsyncGenerator<T>>,
): AsyncGenerator<T> {
    const queue = [...factories];
    type PoolEntry = { gen: AsyncGenerator<T>; next: Promise<IteratorResult<T>> };
    const pool: PoolEntry[] = [];

    function startNext(): boolean {
        if (queue.length === 0) return false;
        const factory = queue.shift()!;
        const gen = factory();
        pool.push({ gen, next: gen.next() });
        return true;
    }

    for (let i = 0; i < limit && queue.length > 0; i++) {
        startNext();
    }

    while (pool.length > 0) {
        const { index, result } = await Promise.race(
            pool.map((p, i) => p.next.then((r) => ({ index: i, result: r }))),
        );
        const entry = pool[index]!;
        if (result.done) {
            pool.splice(index, 1);
            startNext();
        } else {
            yield result.value;
            entry.next = entry.gen.next();
        }
    }
}

/**
 * A generic stream retry wrapper. When retry is triggered, yields a pk-debug event with error info before the next attempt.
 */
export async function* withRetryStream<TVariables>(
    variables: TVariables,
    streamFactory: (vars: TVariables, retryCtx?: ErrorRetryInfo | RetryContext) => AsyncGenerator<LLMStreamEvent>,
    options?: {
        maxRetries?: number;
        /**
         * if true, the stream will be broken when the eventRetryCheckFn returns true.
         */
        ifEventRetryBreakStream?: boolean;
        /**
         * check every event to determine if the stream should be retried.
         */
        eventRetryCheckFn?: (event: LLMStreamEvent) => { shouldRetry: boolean, retryText: string };
        /**
         * check after the stream is finished to determine if the stream should be retried.
         */
        postStreamRetryCheckFn?: () => { shouldRetry: boolean, retryText: string };
        /** Used for pk-debug when retry is triggered so timeline can attribute the event. */
        triggerName?: StreamTriggerName;
    }
): AsyncGenerator<LLMStreamEvent> {
    let lastRetryText = '';
    let shouldRetry = false;

    const maxRetries = options?.maxRetries ?? DEFAULT_TOOL_ERROR_RETRY_TIMES;
    const realEventRetryCheckFn = ((event: LLMStreamEvent): { shouldRetry: boolean, retryText: string } => {
        const eventRetryCheckResult = options?.eventRetryCheckFn?.(event);
        if (eventRetryCheckResult?.shouldRetry) {
            return eventRetryCheckResult;
        }

        if (event.type === 'error')
            return {
                shouldRetry: true,
                retryText: convertMessagesToText([buildToolCorrectionMessageFromChunk(event)])
            };

        // Detect tool-result with error field (from safeAgentTool)
        if (event.type === 'tool-result' && event.output?.error)
            return {
                shouldRetry: true,
                retryText: `Tool "${event.toolName}" returned error: ${event.output.error}`
            };

        return {
            shouldRetry: false,
            retryText: '',
        };
    });

    // retry = 1 is more readable than retry = 0. so we start from 0 and end at maxRetries + 1.
    for (let i = 0; i < maxRetries + 1; i++) {
        shouldRetry = false; // reset the state at the beginning of each attempt

        const stream = streamFactory(
            variables,
            lastRetryText ? { attemptTimes: i, lastRetryText } : undefined
        );

        for await (const event of stream) {
            const { shouldRetry: shouldEventRetry, retryText } = realEventRetryCheckFn(event);
            if (shouldEventRetry) {
                lastRetryText = retryText;
                shouldRetry = true;
                if (options?.ifEventRetryBreakStream) {
                    break;
                }
            }
            yield event;
        }

        if (!shouldRetry) {
            const { shouldRetry: shouldPostStreamRetry, retryText } = options?.postStreamRetryCheckFn?.() ?? { shouldRetry: false, retryText: '' };
            if (shouldPostStreamRetry) {
                lastRetryText = retryText;
                shouldRetry = true;
            } else {
                break;
            }
        }

        // Yield debug so caller/timeline sees why we are retrying.
        yield {
            type: 'pk-debug',
            debugName: 'retry_stream_triggered',
            triggerName: options?.triggerName,
            extra: {
                attemptTimes: i + 1,
                nextAttempt: i + 2,
                maxAttempts: maxRetries + 1,
                lastRetryText,
            },
        };
    }
}

export interface EventProcessor {
    toolResultChunkPostProcessor?: (chunk: any) => LLMStreamEvent | {};
    chunkEventInterceptor?: (chunk: any) => void;
    yieldEventPostProcessor?: (chunk: any) => LLMStreamEvent | { extra?: any } | {};
    /** Return extra event(s) to yield after the main event for this chunk. */
    yieldExtraAfterEvent?: (chunk: any) => LLMStreamEvent | LLMStreamEvent[] | void;
    /** Auto-yield ui-step-delta for delta events (text-delta, reasoning-delta). */
    yieldUIStep?: {
        uiType: UIStepType;
        stepId: string;
        /** Only handles ui-step and ui-step-delta events. */
        uiEventGenerator?: (chunk: any) => RawUIStreamEvent | RawUIStreamEvent[] | void;
    };
    /** 
     * Manual handlers: run handler on tool-call, yield events, skip tool-result from stream.
     * we use this maninly when tool result is a stream of events.
     *  */
    manualToolCallHandlers?: Record<string, ManualToolCallHandler>;
}

export async function* streamTransform<TOOLS extends ToolSet>(
    fullStream: AsyncIterableStream<TextStreamPart<TOOLS>> | AsyncIterable<ObjectStreamPartLike>,
    triggerName: StreamTriggerName,
    eventProcessor: EventProcessor
): AsyncGenerator<LLMStreamEvent> {
    let manualToolTokenUsage: LLMUsage = emptyUsage();
    let startTime = Date.now();
    // help to debug delta event duration
    let deltaStartTimestamp = Date.now();
    let deltaTextChunks: string[] = [];

    for await (const chunk of fullStream) {
        if (!checkIfModeDeltaEvent(chunk.type) && deltaTextChunks.length > 0) {
            yield {
                type: 'pk-debug',
                debugName: 'delta-text-flush',
                extra: {
                    deltaText: deltaTextChunks.join(''),
                    durationMs: Date.now() - deltaStartTimestamp,
                },
            }
            deltaStartTimestamp = Date.now();
            deltaTextChunks = [];
        }

        eventProcessor.chunkEventInterceptor?.(chunk);
        let yieldEvent: LLMStreamEvent | undefined = undefined;
        let deltaText: string | undefined = undefined;
        /** Reused for manual tool-result so tool-call and tool-result share the same id. */
        let lastToolCallId: string | undefined;

        switch (chunk.type) {
            case 'text-start': {
                deltaStartTimestamp = Date.now();
                deltaTextChunks = [];
                yieldEvent = {
                    type: 'text-start',
                };
                break;
            }
            case 'text-delta': {
                const text = (chunk as any).text ?? (chunk as any).textDelta ?? '';
                deltaText = text;
                deltaTextChunks.push(text);
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
                    extra: {
                        deltaText: deltaTextChunks.join(''),
                        durationMs: Date.now() - deltaStartTimestamp,
                    },
                };
                deltaTextChunks = [];
                break;
            }
            case 'reasoning-start': {
                deltaTextChunks = [];
                deltaStartTimestamp = Date.now();
                yieldEvent = {
                    type: 'reasoning-start',
                };
                break;
            }
            case 'reasoning-delta':
                deltaText = chunk.text;
                deltaTextChunks.push(deltaText);
                yieldEvent = {
                    type: 'reasoning-delta',
                    text: chunk.text,
                    triggerName,
                };
                break;
            case 'reasoning-end': {
                yieldEvent = {
                    type: 'reasoning-end',
                    extra: {
                        deltaText: deltaTextChunks.join(''),
                        durationMs: Date.now() - deltaStartTimestamp,
                    },
                };
                deltaTextChunks = [];
                break;
            }
            case 'tool-call': {
                lastToolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                yieldEvent = {
                    type: 'tool-call',
                    id: lastToolCallId,
                    toolName: chunk.toolName,
                    input: chunk.input,
                    triggerName,
                };
                break;
            }
            case 'tool-input-start': {
                deltaStartTimestamp = Date.now();
                deltaTextChunks = [];
                break;
            }
            case 'tool-input-delta': {
                deltaText = chunk.delta;
                deltaTextChunks.push(deltaText);
                break;
            }
            case 'tool-input-end': {
                yieldEvent = {
                    type: 'pk-debug',
                    debugName: 'tool-input-end-duration',
                    extra: {
                        deltaText: deltaTextChunks.join(''),
                        durationMs: Date.now() - deltaStartTimestamp,
                    },
                };
                deltaTextChunks = [];
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
                    durationMs: Date.now() - startTime,
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
            yield* yieldChunkEvent<TOOLS>(yieldEvent, eventProcessor, triggerName, chunk, deltaText);
        }

        if (chunk.type === 'tool-call') {
            const manualToolHandler = eventProcessor.manualToolCallHandlers?.[chunk.toolName];
            if (manualToolHandler) {
                const resultCollector: Record<string, any> = {};
                yield* manualToolHandler.handle(chunk.input, resultCollector);
                manualToolTokenUsage = mergeTokenUsage(manualToolTokenUsage, resultCollector.stepTokenUsage);
                const toolCallId = lastToolCallId ?? generateToolCallId();

                const toolResultOutput = manualToolHandler.outputGetter?.(resultCollector) ?? resultCollector;
                yield* yieldChunkEvent<TOOLS>(
                    {
                        type: 'tool-result',
                        id: toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input,
                        output: toolResultOutput,
                    },
                    eventProcessor,
                    triggerName,
                    // manual create tool-result chunk to align with chunk type
                    {
                        type: 'tool-result' as const,
                        toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input,
                        output: toolResultOutput,
                    } as TextStreamPart<TOOLS> | ObjectStreamPartLike,
                    deltaText
                );
            }
        }
    }
}

async function* yieldChunkEvent<TOOLS extends ToolSet>(
    yieldEvent: LLMStreamEvent, eventProcessor: EventProcessor, triggerName: StreamTriggerName,
    chunk: TextStreamPart<TOOLS> | ObjectStreamPartLike, deltaText?: string
): AsyncGenerator<LLMStreamEvent> {
    const uiStep = eventProcessor.yieldUIStep;

    const eventPostProcessorResult = eventProcessor.yieldEventPostProcessor ? eventProcessor.yieldEventPostProcessor(chunk) : {};
    yieldEvent = {
        ...yieldEvent,
        ...(eventPostProcessorResult),
        extra: 'extra' in eventPostProcessorResult && eventPostProcessorResult.extra != null
            ? { ...yieldEvent.extra, ...eventPostProcessorResult.extra }
            : yieldEvent.extra,
        triggerName,
    };
    yield yieldEvent;

    // Auto-yield ui-step-delta for delta events when yieldUIStep is configured
    if (uiStep && deltaText !== undefined) {
        const uiEvent = uiStep.uiEventGenerator?.(chunk);
        if (uiEvent) {
            if (Array.isArray(uiEvent)) {
                for (const e of uiEvent) {
                    yield {
                        ...e,
                        stepId: uiStep.stepId,
                        triggerName,
                    } as LLMStreamEvent;
                }
            } else {
                yield {
                    ...uiEvent,
                    stepId: uiStep.stepId,
                    triggerName,
                } as LLMStreamEvent;
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

export const DELTA_EVENT_TYPES = new Set(['text-delta', 'reasoning-delta', 'prompt-stream-delta', 'tool-input-delta', 'ui-step-delta']);
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
        case 'ui-step-delta':
            return (event.titleDelta ?? '') + (event.descriptionDelta ?? '');
    }
    return '';
}

export function checkIfDeltaEvent(type: LLMStreamEvent['type']) {
    return DELTA_EVENT_TYPES.has(type);
}

function checkIfModeDeltaEvent(type: any) {
    return type === 'text-delta' || type === 'reasoning-delta' || type === 'tool-input-delta';
}

type ParallelEntry = { index: number; result: IteratorResult<LLMStreamEvent> };

export type ParallelStreamOptions = {
    /** When set with factories, run at most this many streams at a time; factories are started as slots free up. */
    limit?: number;
};

/**
 * Merge multiple async generators of LLMStreamEvent into one; yields whenever any source yields.
 *
 * - **Default** (single arg: array of generators): all run concurrently; yields `parallel-stream-progress` on completion changes.
 * - **With options** (factories + `options: { limit: N }`): at most N streams at a time; factories created on demand; still yields `parallel-stream-progress`.
 */
export async function* parallelStream(
    sourcesOrFactories: AsyncGenerator<LLMStreamEvent>[] | Array<() => AsyncGenerator<LLMStreamEvent>>,
    options?: ParallelStreamOptions,
): AsyncGenerator<LLMStreamEvent> {
    const useLimit = options != null && typeof options.limit === 'number';
    const isFactories =
        sourcesOrFactories.length > 0 && typeof (sourcesOrFactories as unknown[])[0] === 'function';

    if (useLimit && isFactories) {
        yield* parallelStreamWithLimit(
            sourcesOrFactories as Array<() => AsyncGenerator<LLMStreamEvent>>,
            options.limit!,
        );
        return;
    }

    const streamGenerator = sourcesOrFactories as AsyncGenerator<LLMStreamEvent>[];
    if (streamGenerator.length === 0) return;

    const total = streamGenerator.length;
    const completedIndices = new Set<number>();
    const pending = new Map<number, Promise<ParallelEntry>>();

    const runNext = (index: number): Promise<ParallelEntry> =>
        streamGenerator[index].next().then((result) => ({ index, result }));

    const yieldProgress = () =>
        ({
            type: 'parallel-stream-progress' as const,
            completed: completedIndices.size,
            total,
            completedIndices: [...completedIndices],
        }) as LLMStreamEvent;

    yield yieldProgress();

    for (let i = 0; i < total; i++) {
        pending.set(i, runNext(i));
    }
    while (pending.size > 0) {
        const { index, result } = await Promise.race(pending.values());
        if (result.done) {
            pending.delete(index);
            completedIndices.add(index);
            yield yieldProgress();
        } else {
            yield result.value;
            pending.set(index, runNext(index));
        }
    }
}

async function* parallelStreamWithLimit(
    factories: Array<() => AsyncGenerator<LLMStreamEvent>>,
    limit: number,
): AsyncGenerator<LLMStreamEvent> {
    if (factories.length === 0) return;

    const total = factories.length;
    const queue = [...factories];
    let completed = 0;
    type PoolEntry = {
        gen: AsyncGenerator<LLMStreamEvent>;
        next: Promise<{ entry: PoolEntry; result: IteratorResult<LLMStreamEvent> }>;
    };
    const pool: PoolEntry[] = [];

    const yieldProgress = () =>
        ({
            type: 'parallel-stream-progress' as const,
            completed,
            total,
        }) as LLMStreamEvent;

    yield yieldProgress();

    function startNext(): boolean {
        if (queue.length === 0) return false;
        const factory = queue.shift()!;
        const gen = factory();
        const entry: PoolEntry = {
            gen,
            next: gen.next().then((result) => ({ entry, result })),
        };
        pool.push(entry);
        return true;
    }

    for (let i = 0; i < limit && queue.length > 0; i++) {
        startNext();
    }

    while (pool.length > 0) {
        const { entry, result } = await Promise.race(pool.map((p) => p.next));
        if (result.done) {
            pool.splice(pool.indexOf(entry), 1);
            completed++;
            yield yieldProgress();
            startNext();
        } else {
            yield result.value;
            entry.next = entry.gen.next().then((r) => ({ entry, result: r }));
        }
    }
}