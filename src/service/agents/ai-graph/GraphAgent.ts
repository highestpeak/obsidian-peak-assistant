/**
 * GraphAgent — thin shell over Claude Agent SDK query() for knowledge graph
 * generation. Follows the same warmup / env / subprocess pattern as
 * VaultSearchAgentSDK.
 *
 * Flow:
 *   1. warmupPool() installs renderer compat patches + probes node binary
 *   2. generateGraph() resolves profile, builds graph MCP server, calls queryWithProfile()
 *   3. When LLM calls submit_graph, the callback captures the GraphOutput
 *   4. Returns the parsed GraphOutput or null on failure
 *
 * Provider v2 Task 2: now delegates warmup + env materialization to shared sdkAgentPool.
 */

import type { App } from 'obsidian';
import type { Profile } from '@/core/profiles/types';
import type { GraphOutput } from './graph-output-types';
import { buildGraphMcpServer } from './graphMcpServer';
import { buildGraphSystemPrompt } from './graph-system-prompt';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { warmupPool, queryWithProfile } from '../core/sdkAgentPool';

export interface GraphAgentInput {
    searchQuery: string;
    sources: Array<{ path: string; title?: string; score?: number }>;
}

export type GraphAgentStepCallback = (event: {
    type: 'step-start' | 'step-done' | 'thinking';
    id: string;
    label: string;
    detail?: string;
}) => void;

export class GraphAgent {

    constructor(
        private readonly app: App,
        private readonly pluginId: string,
    ) {}

    async warmup(): Promise<void> {
        await warmupPool();
    }

    async generateGraph(input: GraphAgentInput, signal?: AbortSignal, onStep?: GraphAgentStepCallback): Promise<GraphOutput | null> {
        // 1. Ensure pool is warmed up (idempotent)
        try {
            await warmupPool();
        } catch (err) {
            console.error('[GraphAgent] warmup failed', err);
            return null;
        }

        // 2. Resolve profile from ProfileRegistry
        const profile: Profile | null = ProfileRegistry.getInstance().getActiveAgentProfile();
        if (!profile) {
            throw new Error('No active profile configured. Please set up a profile in Settings → Profiles.');
        }

        // 3. Build source metadata for system prompt
        const sourcesMeta = input.sources.map(s => {
            const file = this.app.vault.getFileByPath(s.path);
            const folder = s.path.includes('/') ? s.path.split('/').slice(0, -1).join('/') : '/';
            const filename = s.path.split('/').pop() ?? s.path;
            return {
                path: s.path,
                folder,
                filename,
                createdAt: file?.stat?.ctime,
                modifiedAt: file?.stat?.mtime,
                relevanceScore: s.score,
            };
        });

        const systemPrompt = buildGraphSystemPrompt(input.searchQuery, sourcesMeta);

        // 4. Build MCP server with graph tools
        let graphResult: GraphOutput | null = null;
        let graphSubmitted = false;

        const graphMcpServer = buildGraphMcpServer({
            app: this.app,
            onSubmitGraph: async (graph) => {
                graphResult = graph;
                graphSubmitted = true;
            },
        });

        // 5. Call queryWithProfile() and consume messages until graph is submitted
        try {
            const messages = queryWithProfile(this.app, this.pluginId, profile, {
                prompt: `Analyze these ${input.sources.length} source documents for the search query: "${input.searchQuery}". Read all sources, then submit the graph.`,
                systemPrompt,
                maxTurns: 10,
                allowedTools: [
                    'mcp__graph__read_sources',
                    'mcp__graph__submit_graph',
                ],
                disallowedTools: [
                    'AskUserQuestion',
                ],
                mcpServers: { graph: graphMcpServer },
                signal,
            });

            let turnIndex = 0;
            for await (const raw of messages) {
                if (signal?.aborted) break;
                if (graphSubmitted) break;

                const msg = raw as { type?: string; message?: { content?: Array<{ type: string; name?: string; text?: string; thinking?: string }> } };

                if (msg.type === 'assistant' && msg.message?.content) {
                    turnIndex++;
                    for (const block of msg.message.content) {
                        if (block.type === 'tool_use' && block.name) {
                            const toolName = block.name.replace('mcp__graph__', '');
                            if (toolName === 'read_sources') {
                                onStep?.({ type: 'step-start', id: 'read', label: `Reading ${input.sources.length} source files...` });
                                onStep?.({ type: 'step-start', id: 'analyze', label: 'Analyzing document relations, clusters, and evolution chains...' });
                            } else if (toolName === 'submit_graph') {
                                onStep?.({ type: 'step-done', id: 'read', label: 'Source files loaded' });
                                onStep?.({ type: 'step-done', id: 'analyze', label: 'Document analysis complete' });
                                onStep?.({ type: 'step-start', id: 'submit', label: 'Building graph structure...' });
                            }
                        }
                        if (block.type === 'text' && block.text && turnIndex > 1) {
                            const snippet = block.text.length > 100 ? block.text.slice(0, 100) + '...' : block.text;
                            onStep?.({ type: 'thinking', id: 'analyze', label: 'Analyzing document relations, clusters, and evolution chains...', detail: snippet });
                        }
                    }
                }

            }
        } catch (err) {
            console.error('[GraphAgent] query error', err);
            return null;
        }

        return graphResult;
    }
}
