import { convertMessagesToText } from '@/core/providers/adapter/ai-sdk-adapter';
import type { AgentMemory } from '@/service/agents/search-agent-helper/AgentContextManager';
import {
	getAnalysisMessageByIndexInputSchema,
	getAnalysisMessageCountInputSchema,
	makeGetThoughtHistoryInputSchema,
	searchMemoryStoreInputSchema,
} from '@/core/schemas/tools/searchMemoryStore';
import { AgentTool, safeAgentTool } from './types';

export interface SearchMemoryStoreOptions {
    /** Custom description for the tool */
    description?: string;
}

/**
 * Generic tool to search a memory/store by query. Injects searchFn; reusable across agents.
 */
export function searchMemoryStoreTool(
    searchFn: (query: string, options?: { maxChars?: number }) => string,
    options?: SearchMemoryStoreOptions
): AgentTool {
    return safeAgentTool({
        description: options?.description ?? 'Search the memory store for relevant context by keyword or phrase.',
        inputSchema: searchMemoryStoreInputSchema,
        execute: async (input) => {
            const result = searchFn(input.query, { maxChars: input.maxChars });
            return { content: result };
        },
    });
}

export interface GetAnalysisMessageCountToolOptions {
    description?: string;
}

/**
 * Tool that returns the total number of analysis session messages. Use with get_analysis_message_by_index to fetch specific messages.
 */
export function getAnalysisMessageCountTool(
    getCount: () => number,
    options?: GetAnalysisMessageCountToolOptions
): AgentTool {
    return safeAgentTool({
        description: options?.description ?? 'Return the total number of messages in the analysis session. Call this first to know the valid index range (0 to count-1) before using get_analysis_message_by_index.',
        inputSchema: getAnalysisMessageCountInputSchema,
        execute: async () => {
            const count = getCount();
            return {
                content: `Total analysis messages: ${count}. Valid indices for get_analysis_message_by_index are 0 to ${Math.max(0, count - 1)}.`,
            };
        },
    });
}

export interface GetAnalysisMessageByIndexToolOptions {
    description?: string;
}

/**
 * Tool that returns the text of one analysis session message by 0-based index.
 */
export function getAnalysisMessageByIndexTool(
    getMessageAt: (index: number) => string,
    getCount: () => number,
    options?: GetAnalysisMessageByIndexToolOptions
): AgentTool {
    return safeAgentTool({
        description: options?.description ?? 'Return the full text of one message from the analysis session by 0-based index. Call get_analysis_message_count first to get the valid range (0 to count-1).',
        inputSchema: getAnalysisMessageByIndexInputSchema,
        execute: async (input) => {
            const count = getCount();
            const index = input.index;
            if (index < 0 || index >= count) {
                return {
                    content: `Invalid index ${index}. Valid range is 0 to ${count - 1}. Total messages: ${count}.`,
                };
            }
            const text = getMessageAt(index);
            return { content: text || '(empty message)' };
        },
    });
}

export interface GetThoughtHistoryToolOptions {
    description?: string;
    /** Max chars for the combined output (default 12000). */
    defaultMaxChars?: number;
}

/**
 * Tool that returns ThoughtAgent's session summary and recent thought messages.
 * Use so SummaryAgent can ground the synthesis in prior reasoning and conclusions.
 */
export function getThoughtHistoryTool(
    getMemory: () => AgentMemory,
    options?: GetThoughtHistoryToolOptions
): AgentTool {
    const defaultMaxChars = options?.defaultMaxChars ?? 12000;
    return safeAgentTool({
        description:
            options?.description ??
            'Get the analysis session summary and recent thought/reasoning messages from the ThoughtAgent. Use to ground your synthesis in prior reasoning, conclusions, and evidence traces.',
        inputSchema: makeGetThoughtHistoryInputSchema(defaultMaxChars),
        execute: async (input) => {
            const mem = getMemory();
            const maxChars = input?.maxChars ?? defaultMaxChars;
            const parts: string[] = [];
            if (mem.sessionSummary?.trim()) {
                parts.push('[Session Summary]\n' + mem.sessionSummary.trim());
            }
            const messagesText = convertMessagesToText(mem.latestMessages ?? []);
            if (messagesText.trim()) {
                parts.push('[Recent Thought Messages]\n' + messagesText.trim());
            }
            const mindflow = mem.mindflowContext;
            if (mindflow?.progressHistory?.length) {
                const p = mindflow.progressHistory[mindflow.progressHistory.length - 1];
                if (p?.statusLabel || p?.decision || p?.critique) {
                    parts.push(
                        '[MindFlow Progress]\n' +
                            [p.statusLabel, p.decision, p.critique].filter(Boolean).join('\n')
                    );
                }
            }
            const content = parts.join('\n\n---\n\n');
            return { content: content.slice(0, maxChars) };
        },
    });
}
