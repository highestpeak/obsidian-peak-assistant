/**
 * Pure(ish) adapter from Agent SDK's SDKMessage union to canonical trace records.
 *
 * The mapper is stateful because iterations span multiple messages:
 *   - An `assistant` message whose content contains one or more `tool_use` blocks
 *     opens a new iteration and registers each tool call as "pending".
 *   - A `user` message whose content contains `tool_result` blocks closes
 *     pending tool calls by matching `tool_use_id`.
 *   - A `result` message finalizes the run.
 *
 * The mapper holds an in-memory TraceBuffer. Callers access it via getBuffer()
 * after each consume() or once at flush time. The mapper does no I/O.
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
    CanonicalEvent,
    FinalEvent,
    IterationEvent,
    SessionHeader,
    StoppedReason,
    ToolCallRecord,
    TraceBuffer,
    UsageSummary,
} from './trace-types';

export interface SdkMessageMapperOptions {
    sessionId: string;
    agentName: string;
    scenarioName?: string;
    intent?: string;
    profileId: string;
    fixture?: string;
    track: 'cli' | 'obsidian';
}

interface PendingToolCall {
    iterationIndex: number;
    toolUseId: string;
    record: ToolCallRecord;
    startedAt: number;
}

export class SdkMessageMapper {
    private buffer: TraceBuffer;
    private currentIteration: IterationEvent | null = null;
    private pendingByToolUseId = new Map<string, PendingToolCall>();

    constructor(private options: SdkMessageMapperOptions) {
        const header: SessionHeader = {
            type: 'session',
            sessionId: options.sessionId,
            ts: new Date().toISOString(),
            agentName: options.agentName,
            scenarioName: options.scenarioName,
            intent: options.intent,
            profileId: options.profileId,
            model: options.profileId, // will be overwritten by system init message if present
            fixture: options.fixture,
            track: options.track,
        };
        this.buffer = { header, iterations: [] };
    }

    getBuffer(): TraceBuffer {
        return this.buffer;
    }

    consume(msg: SDKMessage): void {
        switch ((msg as any).type) {
            case 'system':
                this.handleSystem(msg as any);
                break;
            case 'assistant':
                this.handleAssistant(msg as any);
                break;
            case 'user':
                this.handleUser(msg as any);
                break;
            case 'result':
                this.handleResult(msg as any);
                break;
            // All other SDKMessage variants (partial, progress, hook, etc.)
            // are intentionally ignored. They do not contribute to canonical records.
            default:
                break;
        }
    }

    private handleSystem(msg: any): void {
        if (msg.subtype !== 'init') return;
        if (typeof msg.model === 'string') {
            this.buffer.header.model = msg.model;
        }
    }

    private handleAssistant(msg: any): void {
        const content = msg.message?.content;
        if (!Array.isArray(content)) return;

        const textParts: string[] = [];
        const thinkingParts: string[] = [];
        const toolUses: Array<{ id: string; name: string; input: unknown }> = [];

        for (const block of content) {
            if (!block || typeof block !== 'object') continue;
            if (block.type === 'text' && typeof block.text === 'string') {
                textParts.push(block.text);
            } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
                thinkingParts.push(block.thinking);
            } else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
                toolUses.push({ id: block.id, name: block.name, input: block.input });
            }
        }

        // An assistant message without any tool_use blocks is a pure-thought turn,
        // not an iteration boundary. We do not open an iteration for it.
        if (toolUses.length === 0) return;

        const index = this.buffer.iterations.length;
        const iteration: IterationEvent = {
            type: 'iteration',
            index,
            planMs: 0, // filled from result.duration distribution later (or left 0 if unknown)
            toolCount: toolUses.length,
            toolCalls: [],
            plan: {
                assistantText: textParts.join('\n'),
                thinking: thinkingParts.length > 0 ? thinkingParts.join('\n') : undefined,
            },
        };
        this.buffer.iterations.push(iteration);
        this.currentIteration = iteration;

        const now = Date.now();
        for (const tu of toolUses) {
            const record: ToolCallRecord = {
                toolName: tu.name,
                toolUseId: tu.id,
                durationMs: 0,
                inputShape: shapeOf(tu.input),
                input: tu.input,
            };
            iteration.toolCalls.push(record);
            this.pendingByToolUseId.set(tu.id, {
                iterationIndex: index,
                toolUseId: tu.id,
                record,
                startedAt: now,
            });
        }
    }

    private handleUser(msg: any): void {
        const content = msg.message?.content;
        if (!Array.isArray(content)) return;
        const now = Date.now();
        for (const block of content) {
            if (!block || typeof block !== 'object') continue;
            if (block.type !== 'tool_result') continue;
            const id = block.tool_use_id;
            if (typeof id !== 'string') continue;
            const pending = this.pendingByToolUseId.get(id);
            if (!pending) continue;
            pending.record.output = stringifyToolResultContent(block.content);
            pending.record.durationMs = Math.max(0, now - pending.startedAt);
            this.pendingByToolUseId.delete(id);
        }
    }

    private handleResult(msg: any): void {
        const usage: UsageSummary = {
            inputTokens: msg.usage?.input_tokens ?? 0,
            outputTokens: msg.usage?.output_tokens ?? 0,
            cacheReadInputTokens: msg.usage?.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: msg.usage?.cache_creation_input_tokens ?? 0,
            totalTokens:
                (msg.usage?.input_tokens ?? 0) +
                (msg.usage?.output_tokens ?? 0),
            costUSD: msg.total_cost_usd,
        };

        const totalToolCalls = this.buffer.iterations.reduce((acc, it) => acc + it.toolCalls.length, 0);

        const finalOutput: string | undefined = typeof msg.result === 'string' ? msg.result : undefined;

        const final: FinalEvent = {
            type: 'final',
            stoppedReason: mapStoppedReason(msg),
            totalIterations: this.buffer.iterations.length,
            totalToolCalls,
            durationMs: msg.duration_ms ?? 0,
            usage,
            finalOutputShape: {
                kind: finalOutput !== undefined ? 'text' : 'unknown',
                length: finalOutput?.length,
            },
            finalOutput,
            error: msg.is_error
                ? { message: Array.isArray(msg.errors) ? msg.errors.join('; ') : 'unknown error' }
                : undefined,
        };
        this.buffer.final = final;
    }

    finalize(errorMessage?: string): void {
        if (this.buffer.final) return;
        const totalToolCalls = this.buffer.iterations.reduce((acc, it) => acc + it.toolCalls.length, 0);
        this.buffer.final = {
            type: 'final',
            stoppedReason: errorMessage ? 'error_during_execution' : 'aborted',
            totalIterations: this.buffer.iterations.length,
            totalToolCalls,
            durationMs: 0,
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
                totalTokens: 0,
            },
            finalOutputShape: { kind: 'unknown' },
            error: errorMessage ? { message: errorMessage } : undefined,
        };
    }
}

function mapStoppedReason(resultMsg: any): StoppedReason {
    if (resultMsg.subtype === 'success') return 'success';
    if (resultMsg.subtype === 'error_during_execution') return 'error_during_execution';
    if (resultMsg.subtype === 'error_max_turns') return 'error_max_turns';
    if (resultMsg.subtype === 'error_max_budget_usd') return 'error_max_budget_usd';
    if (resultMsg.subtype === 'error_max_structured_output_retries') return 'error_max_structured_output_retries';
    return 'error_during_execution';
}

/**
 * Build a shape descriptor map for the meta projection.
 * For each top-level key, record a short type+size hint, never the value itself.
 * Example: { query: "hello", path: "/notes/a.md" } -> { query: "string(5)", path: "string(12)" }
 */
function shapeOf(input: unknown): Record<string, string> {
    if (input === null || typeof input !== 'object') return { _: describe(input) };
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = describe(v);
    }
    return out;
}

function describe(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'string') return `string(${v.length})`;
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'boolean';
    if (Array.isArray(v)) return `array(${v.length})`;
    if (typeof v === 'object') return `object(${Object.keys(v as object).length})`;
    return typeof v;
}

/**
 * tool_result `content` can be a plain string or an array of blocks.
 * Normalize to a single string that the canonical record can store.
 */
function stringifyToolResultContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const b of content) {
            if (!b || typeof b !== 'object') continue;
            const block = b as Record<string, unknown>;
            if (block.type === 'text' && typeof block.text === 'string') {
                parts.push(block.text);
            } else if (block.type === 'image') {
                parts.push('[image]');
            } else {
                parts.push(JSON.stringify(block));
            }
        }
        return parts.join('\n');
    }
    try {
        return JSON.stringify(content);
    } catch {
        return String(content);
    }
}

// Convenience: non-class factory + one-shot iterator drain for cases where the
// caller prefers a functional style. Not used in tests but used in the CLI harness.
export function drainToBuffer(
    mapper: SdkMessageMapper,
    iter: AsyncIterable<SDKMessage>,
): Promise<TraceBuffer> {
    return (async () => {
        for await (const msg of iter) {
            mapper.consume(msg);
        }
        return mapper.getBuffer();
    })();
}

export type { CanonicalEvent };
