import { AgentTool, safeAgentTool } from './types';
import { z } from 'zod/v3';

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
        inputSchema: z.object({
            query: z.string().describe('Search query (keyword or phrase)'),
            maxChars: z.number().min(100).max(8000).optional().describe('Max chars to return (default 4000)'),
        }),
        execute: async (input) => {
            const result = searchFn(input.query, { maxChars: input.maxChars });
            return { content: result };
        },
    });
}
