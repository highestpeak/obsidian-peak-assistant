/**
 * Shared mock-model helpers for harness tests. All AgentLoop tests share the
 * same streaming shape (text-start / text-delta / text-end / finish, or a
 * tool-call chunk in place of the text-delta run) so keeping the builders in
 * one place avoids drift as the AI SDK V6 raw chunk contract evolves.
 *
 * Usage:
 *   const model = makeStreamModel('m', [textStep('hello'), toolStep('noop', {x:1})])
 *
 * This helper intentionally does NOT depend on any harness types so it can
 * be used from characterization tests too. The raw usage shapes below mirror
 * chat-runtime-characterization.test.ts:130 — see A1 pitfall log for why
 * `finishReason` must be a { unified, raw } object at this SDK version.
 */

import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';

export const RAW_USAGE_STOP = {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, textTokens: 5, reasoningTokens: undefined },
    totalTokens: 15,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
};

export const RAW_USAGE_TOOL = {
    inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 6, textTokens: 6, reasoningTokens: undefined },
    totalTokens: 18,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
};

/** One step's worth of raw stream chunks (before the trailing `finish`). */
export type StepChunks = any[];

export interface TextStepOptions {
    text: string;
    id?: string;
    reasoning?: string;
    usage?: any;
}

/** Build the chunk sequence for a step that emits assistant text. */
export function textStepChunks({ text, id = 't', reasoning, usage = RAW_USAGE_STOP }: TextStepOptions): StepChunks {
    const chunks: any[] = [{ type: 'stream-start', warnings: [] }];
    if (reasoning) {
        chunks.push({ type: 'reasoning-start', id: `${id}r` });
        // Raw provider stream: reasoning-delta uses `delta` (ai v6 raw
        // contract, index.d.ts:2005-2008). streamText re-emits as `text` on
        // fullStream. Both text-delta and reasoning-delta use `delta` here.
        chunks.push({ type: 'reasoning-delta', id: `${id}r`, delta: reasoning });
        chunks.push({ type: 'reasoning-end', id: `${id}r` });
    }
    chunks.push({ type: 'text-start', id });
    chunks.push({ type: 'text-delta', id, delta: text });
    chunks.push({ type: 'text-end', id });
    chunks.push({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
    });
    return chunks;
}

/** Split text into multiple deltas for token-streaming tests. */
export function textStepChunksSplit({ deltas, id = 't', usage = RAW_USAGE_STOP }: { deltas: string[]; id?: string; usage?: any }): StepChunks {
    const chunks: any[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id },
    ];
    for (const delta of deltas) chunks.push({ type: 'text-delta', id, delta });
    chunks.push({ type: 'text-end', id });
    chunks.push({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
    });
    return chunks;
}

export interface ToolStepOptions {
    toolName: string;
    input: any;
    toolCallId?: string;
    usage?: any;
}

/** Build the chunk sequence for a step that emits a single tool call. */
export function toolStepChunks({ toolName, input, toolCallId = 'tc1', usage = RAW_USAGE_STOP }: ToolStepOptions): StepChunks {
    return [
        { type: 'stream-start', warnings: [] },
        {
            type: 'tool-call',
            toolCallId,
            toolName,
            input: typeof input === 'string' ? input : JSON.stringify(input),
        },
        {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            usage,
        },
    ];
}

export interface ToolStreamingInputStepOptions extends ToolStepOptions {
    /**
     * Chunks of tool-input JSON to stream before the terminal `tool-call`.
     * Providers typically stream the arg JSON in pieces (Anthropic emits
     * partial-json deltas, OpenAI emits input JSON tokens). The mock plays
     * them back verbatim so `AgentLoop.ts:285-314` sees the shape a real
     * provider would produce.
     *
     * If omitted, defaults to splitting the JSON-serialised `input` roughly
     * in half so callers who don't care about the exact partition still get
     * ≥2 deltas.
     */
    inputDeltas?: string[];
}

/**
 * Build the chunk sequence for a step whose tool-call arrives with streaming
 * input JSON: `stream-start → tool-input-start → N × tool-input-delta →
 * tool-call → finish`. The raw doStream chunk shapes match the AI SDK v6
 * ToolInputStart / ToolInputDelta contract at
 * `node_modules/ai/dist/index.d.ts:2532`+ (id, toolName, delta). AgentLoop
 * reads `chunk.toolName` / `chunk.id` / `chunk.delta` — mirrored here.
 */
export function toolStepChunksWithStreamingInput({
    toolName,
    input,
    toolCallId = 'tc1',
    usage = RAW_USAGE_STOP,
    inputDeltas,
}: ToolStreamingInputStepOptions): StepChunks {
    const serialised = typeof input === 'string' ? input : JSON.stringify(input);
    const deltas =
        inputDeltas && inputDeltas.length > 0
            ? inputDeltas
            : [serialised.slice(0, Math.max(1, Math.floor(serialised.length / 2))), serialised.slice(Math.max(1, Math.floor(serialised.length / 2)))];
    const chunks: any[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-input-start', id: toolCallId, toolName },
    ];
    for (const delta of deltas) {
        chunks.push({ type: 'tool-input-delta', id: toolCallId, delta });
    }
    chunks.push({ type: 'tool-input-end', id: toolCallId });
    chunks.push({
        type: 'tool-call',
        toolCallId,
        toolName,
        input: serialised,
    });
    chunks.push({
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
        usage,
    });
    return chunks;
}

/**
 * Build a MockLanguageModelV3 that plays back the given step chunk lists in
 * order. Each call to doStream advances one step; overflow returns the last
 * step (matches the classic "final answer keeps repeating" pattern which
 * behaves fine because AgentLoop stops as soon as finalAnswer is detected).
 */
export function makeStreamModel(modelId: string, steps: StepChunks[]): MockLanguageModelV3 {
    let call = 0;
    return new MockLanguageModelV3({
        provider: 'mock',
        modelId,
        doStream: async () => {
            const idx = Math.min(call, steps.length - 1);
            call += 1;
            return {
                stream: convertArrayToReadableStream([...steps[idx]] as any),
            };
        },
    });
}
