import {
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
