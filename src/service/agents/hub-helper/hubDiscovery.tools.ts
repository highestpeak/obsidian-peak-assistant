/**
 * Shared inspector tool sets and tool-call execution for hub recon loops (folder + document).
 */

import type { JSONValue } from 'ai';
import type { ModelMessage, ToolModelMessage } from 'ai';
import {
	exploreFolderToolMarkdownOnly,
	findPathTool,
	graphTraversalToolMarkdownOnly,
	grepFileTreeTool,
	hubLocalGraphTool,
	inspectNoteContextToolMarkdownOnly,
	localSearchWholeVaultTool,
} from '@/service/tools/search-graph-inspector';
import type { AgentTool } from '@/service/tools/types';
import type { TemplateManager } from '@/core/template/TemplateManager';

export const TOOL_OUTPUT_MAX_CHARS = 14_000;

export function truncateForPrompt(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n_(truncated)_`;
}

/** Tools for folder-hub recon: structure search + grep + local search + optional note inspect. */
export function buildFolderHubTools(tm: TemplateManager): Record<string, AgentTool> {
	return {
		explore_folder: exploreFolderToolMarkdownOnly(tm),
		grep_file_tree: grepFileTreeTool(),
		local_search_whole_vault: localSearchWholeVaultTool(tm),
		inspect_note_context: inspectNoteContextToolMarkdownOnly(tm),
	};
}

/** Tools for document-hub recon: graph-first, optional explore_folder. */
export function buildDocumentHubTools(tm: TemplateManager): Record<string, AgentTool> {
	return {
		graph_traversal: graphTraversalToolMarkdownOnly(tm),
		hub_local_graph: hubLocalGraphTool(tm),
		inspect_note_context: inspectNoteContextToolMarkdownOnly(tm),
		find_path: findPathTool(tm),
		grep_file_tree: grepFileTreeTool(),
		explore_folder: exploreFolderToolMarkdownOnly(tm),
		local_search_whole_vault: localSearchWholeVaultTool(tm),
	};
}

/**
 * Executes tool calls from a plan step (full + summary result messages).
 */
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
