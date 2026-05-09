// src/service/chat/tools/chatToolBuilder.ts
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { App } from 'obsidian';
import type { ModelCapabilities } from '@/core/providers/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { collectText } from '@/service/agents/core/sdkMessageAdapter';

const WEB_SEARCH_SYSTEM_PROMPT =
    'Search the web and provide a comprehensive answer with sources. Cite URLs where possible. ' +
    'Focus on factual, up-to-date information. If the query is about a specific topic, provide relevant context and details.';

export interface ChatToolDeps {
    app: App;
    pluginId: string;
    enableWebSearch: boolean;
}

export interface ChatToolSet {
    tools: ToolSet;
    maxSteps: number;
}

/**
 * Build Vercel AI SDK tools based on UI toggles and model capabilities.
 * Returns empty tools when nothing is enabled.
 */
export function buildChatTools(
    deps: ChatToolDeps,
    capabilities: ModelCapabilities,
): ChatToolSet {
    const tools: ToolSet = {};

    // Web search: skip if model has native web search capability
    if (deps.enableWebSearch && !capabilities.webSearch) {
        const webProfile = ProfileRegistry.getInstance().getActiveWebSearchProfile();
        if (webProfile) {
            tools.web_search = tool({
                description:
                    'Search the web for up-to-date information, recent events, external knowledge, or facts. ' +
                    'Use when the user asks about current events, external products, public data, or anything beyond their personal notes.',
                parameters: z.object({
                    query: z.string().describe('The search query to look up on the web'),
                }),
                execute: async ({ query }) => {
                    try {
                        const messages = queryWithProfile(deps.app, deps.pluginId, webProfile, {
                            prompt: query,
                            systemPrompt: WEB_SEARCH_SYSTEM_PROMPT,
                            maxTurns: 1,
                        });
                        return (await collectText(messages)) || 'No results found.';
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Web search failed';
                        return `Web search error: ${msg}`;
                    }
                },
            });
        }
    }

    const hasTools = Object.keys(tools).length > 0;
    return {
        tools,
        maxSteps: hasTools ? 3 : 1,
    };
}
