/**
 * Wiring glue for ContextManager stage (c) LLM summarisation.
 *
 * `ContextManager` accepts an injected `CompactSummarizer` function to keep
 * the manager pure and easy to unit-test. Production code paths need to
 * synthesize that function from the currently active fast-role profile.
 * Kept separate from the manager so tests can stub the summariser without
 * pulling ProfileRegistry / vercelGenerateText.
 */

import type { ModelMessage } from 'ai';
import type { CompactSummarizer, CompactSummarizerInput } from './types';
import type { MemoryBlock } from '../memory/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { vercelGenerateText } from '@/core/providers/vercel';
import type { DebugTracePort } from '@/core/debug-trace';

const SUMMARY_SYSTEM_PROMPT = `You compact a chat history window for a long-running agent. The middle turns will be replaced by your summary before the next agent step runs. Return prose only — no markdown, no lists, no headers.

Compress under 800 characters. Preserve, in order of importance:
  1. Decisions made or accepted by the user or the agent.
  2. Open questions the agent still has to resolve.
  3. Blockers, errors, or user constraints that will shape the next step.
  4. Named entities the tail will refer to (files, functions, resources).

Drop small talk, greetings, and repeat re-statements of the same fact.
Never invent content. If a turn's role or content is unclear, say so briefly.`;

/**
 * Build the default LLM-backed summariser used at runtime. Prefers the
 * active fast-role binding (Agent Fast). Returns null when no profile is
 * available so the caller can decide whether to skip stage (c).
 */
export function createDefaultCompactSummarizer(debugTrace: DebugTracePort | null = null): CompactSummarizer | null {
    const fast = ProfileRegistry.getInstance().getActiveAgentFastConfig();
    if (!fast) return null;
    return async (input: CompactSummarizerInput): Promise<string> => {
        const userPrompt = renderSummarizerPrompt(input);
        const { text } = await vercelGenerateText(fast.profile, fast.modelId, [
            { role: 'system', content: [{ type: 'text', text: SUMMARY_SYSTEM_PROMPT }] },
            { role: 'user', content: [{ type: 'text', text: userPrompt }] },
		], undefined, undefined, {
			debugTrace,
			surface: 'agent',
			capabilityId: 'harness.context-compact',
		});
        return text;
    };
}

/**
 * Format the dropped tail + blocks as a single user-facing prompt block so
 * the summariser LLM sees a clean, self-contained view of what to compress.
 * Exported so tests can pin the string shape.
 */
export function renderSummarizerPrompt(input: CompactSummarizerInput): string {
    const parts: string[] = [];
    parts.push('The following window is about to be dropped from the agent context.');

    if (input.droppedBlocks.length > 0) {
        parts.push('\n## Dropped memory blocks');
        for (const block of input.droppedBlocks) {
            parts.push(`- ${block.name}: ${truncate(block.content, 240)}`);
        }
    }

    if (input.droppedMessages.length > 0) {
        parts.push('\n## Dropped conversation turns');
        for (let i = 0; i < input.droppedMessages.length; i++) {
            const m = input.droppedMessages[i];
            const text = flattenMessageContent(m);
            parts.push(`${i + 1}. [${m.role}] ${truncate(text, 400)}`);
        }
    }

    parts.push('\nSummarise this window into a single prose paragraph following the system prompt rules.');
    return parts.join('\n');
}

function flattenMessageContent(m: ModelMessage): string {
    const content = m.content as unknown;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    const chunks: string[] = [];
    for (const part of content) {
        if (typeof part === 'string') { chunks.push(part); continue; }
        if (part && typeof part === 'object') {
            const p = part as { type?: string; text?: string };
            if ((p.type === 'text' || p.type === 'reasoning') && typeof p.text === 'string') {
                chunks.push(p.text);
            }
        }
    }
    return chunks.join(' ');
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}

/**
 * Convenience: turn a plain string-returning function into a CompactSummarizer
 * (used by tests + as a documentation seam).
 */
export function makeSummarizer(fn: (input: CompactSummarizerInput) => Promise<string> | string): CompactSummarizer {
    return async (input) => {
        const result = await fn(input);
        return typeof result === 'string' ? result : '';
    };
}

// Keep this export list lean so trivial reexports don't accidentally leak
// SDK internals up the composition tree.
export type { MemoryBlock };
