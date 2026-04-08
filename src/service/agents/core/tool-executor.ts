/**
 * Generic tool call execution for agent loops.
 * Framework-agnostic utility for executing tool calls and collecting results.
 */

import type { JSONValue } from 'ai';
import type { ModelMessage, ToolModelMessage } from 'ai';
import type { AgentTool } from '@/service/tools/types';

export const TOOL_OUTPUT_MAX_CHARS = 14_000;

/**
 * Truncate text for prompt consumption.
 */
export function truncateForPrompt(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n_(truncated)_`;
}

/**
 * Execute tool calls from a plan step and collect results.
 * Returns full results (for context within loop), summarized (for history), and per-tool timings.
 */
export async function executeToolCalls(
	tools: Record<string, AgentTool>,
	planStepMessages: ModelMessage[],
): Promise<{ full: ModelMessage[]; summary: ModelMessage[]; timings: Array<{ toolName: string; durationMs: number }> }> {
	const toolCalls = planStepMessages.flatMap((msg) =>
		msg.role === 'assistant' && Array.isArray(msg.content)
			? msg.content.filter((part) => part.type === 'tool-call')
			: [],
	);
	const full: ModelMessage[] = [];
	const summary: ModelMessage[] = [];
	const timings: Array<{ toolName: string; durationMs: number }> = [];

	for (const tc of toolCalls) {
		const exec = tools[tc.toolName];
		if (!exec?.execute) continue;

		let output: unknown;
		const t0 = Date.now();
		try {
			output = await exec.execute(tc.input);
		} catch (err) {
			output = { error: err instanceof Error ? err.message : String(err) };
		}
		timings.push({ toolName: tc.toolName, durationMs: Date.now() - t0 });

		const makeToolResult = (outputValue: string | JSONValue): ToolModelMessage => ({
			role: 'tool',
			content: [{ type: 'tool-result', toolCallId: tc.toolCallId, toolName: tc.toolName, output: typeof outputValue === 'string' ? { type: 'text', value: outputValue } : { type: 'json', value: outputValue } }],
		});

		const str = typeof output === 'string' ? output : JSON.stringify(output);
		full.push(makeToolResult(truncateForPrompt(str, TOOL_OUTPUT_MAX_CHARS)));
		summary.push(makeToolResult('[truncated for context]'));
	}

	return { full, summary, timings };
}
