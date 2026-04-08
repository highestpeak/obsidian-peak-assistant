/**
 * Tool set for knowledge intuition recon: folder tools plus graph helpers.
 */

import type { JSONValue } from 'ai';
import type { ModelMessage, ToolModelMessage } from 'ai';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { AgentTool } from '@/service/tools/types';
import {
	exploreFolderToolMarkdownOnly,
	findPathTool,
	graphTraversalToolMarkdownOnly,
	grepFileTreeTool,
	hubLocalGraphTool,
	inspectNoteContextToolMarkdownOnly,
	localSearchWholeVaultTool,
} from '@/service/tools/search-graph-inspector';

const TOOL_OUTPUT_MAX_CHARS = 14_000;

function truncateForPrompt(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n_(truncated)_`;
}

/** Inspector tools used to ground intuition skeleton claims. */
export function buildIntuitionTools(tm: TemplateManager): Record<string, AgentTool> {
	return {
		explore_folder: exploreFolderToolMarkdownOnly(tm),
		grep_file_tree: grepFileTreeTool(),
		local_search_whole_vault: localSearchWholeVaultTool(tm),
		inspect_note_context: inspectNoteContextToolMarkdownOnly(tm),
		graph_traversal: graphTraversalToolMarkdownOnly(tm),
		hub_local_graph: hubLocalGraphTool(tm),
		find_path: findPathTool(tm),
	};
}

export async function executeReconToolCalls(
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
