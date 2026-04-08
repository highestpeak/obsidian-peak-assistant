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
 * Returns both full results (for context within loop) and summarized (for history).
 */
export async function executeToolCalls(
	tools: Record<string, AgentTool>,
	planStepMessages: ModelMessage[],
): Promise<{ full: ModelMessage[]; summary: ModelMessage[] }> {
	const toolCalls = planStepMessages.flatMap((msg) =>
		msg.role === 'assistant' && Array.isArray(msg.content)
			? msg.content.filter((part) => part.type === 'tool-call')
			: [],
	);
	const full: ModelMessage[] = [];
	const summary: ModelMessage[] = [];

	for (const tc of toolCalls) {
		const exec = tools[tc.toolName];
		if (!exec?.execute) continue;

		let output: unknown;
		try {
			output = await exec.execute(tc.input);
		} catch (err) {
			output = { error: err instanceof Error ? err.message : String(err) };
		}

		const toolResultGetter = (outputValue: string | JSONValue): ToolModelMessage => ({
			role: 'tool',
			content: [
				{
					type: 'tool-result',
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					output:
						typeof outputValue === 'string'
							? { type: 'text', value: outputValue }
							: { type: 'json', value: outputValue },
				},
			],
		});

		const str = typeof output === 'string' ? output : JSON.stringify(output);
		full.push(toolResultGetter(truncateForPrompt(str, TOOL_OUTPUT_MAX_CHARS)));
		summary.push(toolResultGetter('[truncated for context]'));
	}

	return { full, summary };
}

/**
 * @deprecated Use executeToolCalls instead. Kept for backward compatibility.
 */
export const executeReconToolCalls = executeToolCalls;
