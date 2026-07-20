// src/service/chat/tools/chatToolBuilder.ts
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { AppHandle } from '@/core/ports/AppHandle';
import type { ModelCapabilities } from '@/core/providers/types';
import type { VaultRetrievalPort } from '@/core/ports/VaultRetrievalPort';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { collectText } from '@/service/agents/core/sdkMessageAdapter';
import { extractWebSourcesFromText, type SourceReceiptCollector } from './sourceReceiptCollector';
import { VAULT_SEARCH_TOP_K } from '@/core/constant';

/**
 * T11Y-6: web search tool system prompt body moved to
 * templates/prompts/web-search-tool-system.md
 * (PromptId.WebSearchToolSystem). Previously duplicated in webSearchTool.ts.
 */

export interface ChatToolDeps {
    app: AppHandle;
    pluginId: string;
    enableWebSearch: boolean;
    /** Vault Search switch (chat-studio RUN-01). Only effective when vaultRetrieval is wired. */
    enableVaultSearch?: boolean;
    /** Real retrieval port; absent = Vault Search unavailable, no tool is built. */
    vaultRetrieval?: VaultRetrievalPort | null;
    /** Folder scope for vault retrieval (conversation focusFolder). */
    vaultScopeFolder?: string;
    /** Per-turn actual-source receipt accumulator (chat-studio RUN-02). */
    receipts?: SourceReceiptCollector;
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

    // Vault search: only when the switch is on AND a real retrieval port is
    // wired. No port = no tool; the UI must surface "unavailable" instead of
    // pretending the vault was searched (chat-studio RUN-01).
    if (deps.enableVaultSearch && deps.vaultRetrieval) {
        const retrieval = deps.vaultRetrieval;
        tools.vault_search = tool({
            description:
                "Search the user's personal knowledge base (Obsidian vault) for notes, documents, and past writing. " +
                'Use when the user asks about their own notes, projects, ideas, or anything they may have written before.',
            parameters: z.object({
                query: z.string().describe('The search query to run against the vault'),
            }),
            execute: async ({ query }) => {
                deps.receipts?.recordVaultQuery(query);
                try {
                    const hits = await retrieval.search(query, {
                        topK: VAULT_SEARCH_TOP_K,
                        scopeFolder: deps.vaultScopeFolder,
                    });
                    if (hits.length === 0) return 'No matching notes found in the vault.';
                    for (const hit of hits) {
                        deps.receipts?.recordVaultDocument({ id: hit.id, path: hit.path, title: hit.title });
                    }
                    return hits
                        .map((hit, i) => {
                            const snippet = hit.snippet ? `\n${hit.snippet}` : '';
                            return `${i + 1}. [[${hit.path}]] — ${hit.title}${snippet}`;
                        })
                        .join('\n\n');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Vault search failed';
                    return `Vault search error: ${msg}`;
                }
            },
        });
    }

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
                    deps.receipts?.recordWebQuery(query);
                    try {
                        const tm = TemplateManager.getInstance();
                        if (!tm) return 'Web search error: template manager not bound';
                        const systemPrompt = await tm.render(PromptId.WebSearchToolSystem, {});
                        const messages = queryWithProfile(deps.app as any, deps.pluginId, webProfile, {
                            prompt: query,
                            systemPrompt,
                            maxTurns: 1,
                        });
                        const answer = (await collectText(messages)) || 'No results found.';
                        // RUN-02 receipt honesty: record the ACTUAL web sources the
                        // model cited. The provider profile exposes no structured
                        // per-source metadata (search runs server-side; the CLI
                        // WebSearch tool is disallowed), so we recover the real
                        // sources by parsing the cited URLs out of the answer text.
                        // See extractWebSourcesFromText for the constraint rationale.
                        if (deps.receipts) {
                            for (const source of extractWebSourcesFromText(answer)) {
                                deps.receipts.recordWebSource(source);
                            }
                        }
                        return answer;
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
