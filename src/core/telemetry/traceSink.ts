/**
 * TraceSink: holds a SdkMessageMapper, accepts SDKMessage events, and on flush()
 * writes two JSONL projections of the accumulated TraceBuffer to disk.
 *
 * Output layout:
 *   <rootDir>/YYYY-MM-DD/<agent>-<scenario?>-<timestamp>.meta.jsonl
 *   <rootDir>/YYYY-MM-DD/<agent>-<scenario?>-<timestamp>.full.jsonl
 *
 * Writes are atomic: write-to-tmp + rename, so a reader never sees a half-file.
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { SdkMessageMapper, type SdkMessageMapperOptions } from './sdk-message-mapper';
import { truncateToolOutput } from './truncate-tool-output';
import type {
    CanonicalEvent,
    FinalEvent,
    IterationEvent,
    SessionHeader,
    ToolCallRecord,
    TraceBuffer,
} from './trace-types';

export interface TraceSinkOptions extends Omit<SdkMessageMapperOptions, 'sessionId'> {
    /** Root directory for trace files (typically <plugin-data>/data/traces/). */
    rootDir: string;
    /** Tool output cap in bytes; 0 disables truncation. Default is DEFAULT_TOOL_CAP_BYTES. */
    toolCapBytes: number;
    /** Explicit session id (for tests / resumable sessions). Auto-generated if omitted. */
    sessionId?: string;
    /** Clock injector for deterministic tests. Defaults to () => new Date(). */
    now?: () => Date;
}

export interface FlushResult {
    metaPath: string;
    fullPath: string;
}

export class TraceSink {
    private mapper: SdkMessageMapper;
    private now: () => Date;

    constructor(private options: TraceSinkOptions) {
        this.now = options.now ?? (() => new Date());
        const sessionId = options.sessionId ?? generateSessionId();
        this.mapper = new SdkMessageMapper({
            sessionId,
            agentName: options.agentName,
            scenarioName: options.scenarioName,
            intent: options.intent,
            profileId: options.profileId,
            fixture: options.fixture,
            track: options.track,
        });
    }

    consume(msg: SDKMessage): void {
        this.mapper.consume(msg);
    }

    finalizeWithError(message: string): void {
        this.mapper.finalize(message);
    }

    flush(): FlushResult {
        const buffer = this.mapper.getBuffer();
        if (!buffer.final) this.mapper.finalize();

        const when = this.now();
        const dateDir = formatDateDir(when);
        const stamp = formatStamp(when);
        const scenarioPart = this.options.scenarioName ? `-${slug(this.options.scenarioName)}` : '';
        const baseName = `${slug(this.options.agentName)}${scenarioPart}-${stamp}`;
        const dir = path.join(this.options.rootDir, dateDir);
        fs.mkdirSync(dir, { recursive: true });

        const metaPath = path.join(dir, `${baseName}.meta.jsonl`);
        const fullPath = path.join(dir, `${baseName}.full.jsonl`);

        const metaLines = buildMetaProjection(buffer);
        const fullLines = buildFullProjection(buffer, this.options.toolCapBytes);

        writeAtomic(metaPath, metaLines.join('\n') + '\n');
        writeAtomic(fullPath, fullLines.join('\n') + '\n');

        return { metaPath, fullPath };
    }
}

// -- Projections --------------------------------------------------------------

function buildMetaProjection(buffer: TraceBuffer): string[] {
    const lines: string[] = [];
    lines.push(JSON.stringify(buffer.header));
    for (const iter of buffer.iterations) {
        const metaIter: IterationEvent = {
            type: 'iteration',
            index: iter.index,
            planMs: iter.planMs,
            toolCount: iter.toolCount,
            toolCalls: iter.toolCalls.map((tc): ToolCallRecord => ({
                toolName: tc.toolName,
                toolUseId: tc.toolUseId,
                durationMs: tc.durationMs,
                inputShape: tc.inputShape,
                // input/output/outputTruncated/originalOutputBytes intentionally omitted
            })),
            // plan intentionally omitted in meta projection
        };
        lines.push(JSON.stringify(metaIter));
    }
    if (buffer.final) {
        const metaFinal: FinalEvent = {
            type: 'final',
            stoppedReason: buffer.final.stoppedReason,
            totalIterations: buffer.final.totalIterations,
            totalToolCalls: buffer.final.totalToolCalls,
            durationMs: buffer.final.durationMs,
            usage: buffer.final.usage,
            finalOutputShape: buffer.final.finalOutputShape,
            // finalOutput intentionally omitted in meta projection
            error: buffer.final.error,
        };
        lines.push(JSON.stringify(metaFinal));
    }
    return lines;
}

function buildFullProjection(buffer: TraceBuffer, toolCapBytes: number): string[] {
    const lines: string[] = [];
    lines.push(JSON.stringify(buffer.header));
    for (const iter of buffer.iterations) {
        const fullIter: IterationEvent = {
            type: 'iteration',
            index: iter.index,
            planMs: iter.planMs,
            toolCount: iter.toolCount,
            toolCalls: iter.toolCalls.map((tc): ToolCallRecord => {
                const out = typeof tc.output === 'string' ? truncateToolOutput(tc.output, toolCapBytes) : undefined;
                return {
                    toolName: tc.toolName,
                    toolUseId: tc.toolUseId,
                    durationMs: tc.durationMs,
                    inputShape: tc.inputShape,
                    input: tc.input,
                    output: out?.output,
                    outputTruncated: out?.truncated ?? false,
                    originalOutputBytes: out?.originalBytes,
                };
            }),
            plan: iter.plan,
        };
        lines.push(JSON.stringify(fullIter));
    }
    if (buffer.final) {
        lines.push(JSON.stringify(buffer.final));
    }
    return lines;
}

// -- Helpers ------------------------------------------------------------------

function formatDateDir(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatStamp(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const rand = randomBytes(2).toString('hex');
    return `${y}${m}${day}-${hh}${mm}${ss}-${rand}`;
}

function slug(s: string): string {
    return s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function writeAtomic(finalPath: string, content: string): void {
    const tmpPath = `${finalPath}.${randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, finalPath);
}

function generateSessionId(): string {
    return `sess-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

export type { CanonicalEvent, SessionHeader, IterationEvent, FinalEvent };
