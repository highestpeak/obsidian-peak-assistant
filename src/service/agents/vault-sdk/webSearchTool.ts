/**
 * Web search MCP tool for Claude Agent SDK.
 *
 * Uses the user's configured Web Search profile (Perplexity, OpenRouter, Google, etc.)
 * to perform a single-turn LLM query with web search capability.
 * The search-capable LLM returns a natural language summary with sources.
 */

import type { App } from 'obsidian';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { collectText } from '@/service/agents/core/sdkMessageAdapter';

const WEB_SEARCH_SYSTEM_PROMPT =
    'Search the web and provide a comprehensive answer with sources. Cite URLs where possible. ' +
    'Focus on factual, up-to-date information. If the query is about a specific topic, provide relevant context and details.';

export interface WebSearchMcpServerDeps {
    app: App;
    pluginId: string;
}

/**
 * Build an in-process MCP server with a single `web_search` tool.
 * Returns null if no web search profile is configured.
 */
export function buildWebSearchMcpServer(deps: WebSearchMcpServerDeps) {
    const { app, pluginId } = deps;

    const webSearch = tool(
        'web_search',
        'Search the web for up-to-date information, external knowledge, or facts not found in the vault. ' +
        'Use when the user asks about recent events, external products, public data, or anything beyond their personal notes.',
        {
            query: z.string().describe('The search query to look up on the web'),
        },
        async (input) => {
            const profile = ProfileRegistry.getInstance().getActiveWebSearchProfile();
            if (!profile) {
                return {
                    content: [{ type: 'text' as const, text: 'Web search is not configured. Please set a Web Search profile in Settings → Profiles.' }],
                };
            }

            try {
                const messages = queryWithProfile(app, pluginId, profile, {
                    prompt: input.query,
                    systemPrompt: WEB_SEARCH_SYSTEM_PROMPT,
                    maxTurns: 1,
                });
                const text = await collectText(messages);
                return {
                    content: [{ type: 'text' as const, text: text || 'No results found.' }],
                };
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Web search failed';
                return {
                    content: [{ type: 'text' as const, text: `Web search error: ${msg}` }],
                };
            }
        },
    );

    return createSdkMcpServer({
        tools: [webSearch],
    });
}
