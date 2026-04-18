/**
 * GraphAgent — thin shell over Claude Agent SDK query() for knowledge graph
 * generation. Follows the same warmup / env / subprocess pattern as
 * VaultSearchAgentSDK.
 *
 * Flow:
 *   1. warmup() installs renderer compat patches + probes node binary
 *   2. generateGraph() reads profile, builds graph MCP server, calls query()
 *   3. When LLM calls submit_graph, the callback captures the GraphOutput
 *   4. Returns the parsed GraphOutput or null on failure
 */

import type { App } from 'obsidian';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { MyPluginSettings } from '@/app/settings/types';
import type { GraphOutput } from './graph-output-types';
import { buildGraphMcpServer } from './graphMcpServer';
import { buildGraphSystemPrompt } from './graph-system-prompt';
import { readProfileFromSettings, toAgentSdkEnv } from '../vault-sdk/sdkProfile';
import {
    warmupSdkAgentPool,
    getCliPath,
    type NodeBinaryInfo,
} from '../vault-sdk/sdkAgentPool';

export interface GraphAgentInput {
    searchQuery: string;
    sources: Array<{ path: string; title?: string; score?: number }>;
}

export class GraphAgent {
    private nodeInfo: NodeBinaryInfo | null = null;

    constructor(
        private readonly app: App,
        private readonly pluginId: string,
        private readonly settings: MyPluginSettings,
    ) {}

    async warmup(): Promise<void> {
        if (!this.nodeInfo) {
            this.nodeInfo = await warmupSdkAgentPool(this.app, this.pluginId);
        }
    }

    async generateGraph(input: GraphAgentInput, signal?: AbortSignal): Promise<GraphOutput | null> {
        // 1. Ensure warmup ran
        if (!this.nodeInfo) {
            try {
                this.nodeInfo = await warmupSdkAgentPool(this.app, this.pluginId);
            } catch (err) {
                console.error('[GraphAgent] warmup failed', err);
                return null;
            }
        }
        const nodeInfo = this.nodeInfo;

        // 2. Build env from Profile
        const profile = readProfileFromSettings(this.settings);
        let profileEnv: Record<string, string>;
        try {
            profileEnv = toAgentSdkEnv(profile);
        } catch (err) {
            console.error('[GraphAgent] profile env error', err);
            return null;
        }

        const subprocessEnv: Record<string, string> = {
            ...profileEnv,
            PATH: process.env.PATH ?? '',
        };
        if (nodeInfo.isElectron) {
            subprocessEnv.ELECTRON_RUN_AS_NODE = '1';
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
        const cliPath = getCliPath(this.app, this.pluginId);
        const basePath = (this.app.vault.adapter as unknown as { getBasePath(): string }).getBasePath();

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

        // 5. Wire abort signal
        const abortController = new AbortController();
        if (signal) {
            signal.addEventListener('abort', () => abortController.abort());
        }

        // 6. Call query() and consume messages until graph is submitted
        try {
            const messages = query({
                prompt: `Analyze these ${input.sources.length} source documents for the search query: "${input.searchQuery}". Read all sources, then submit the graph.`,
                options: {
                    pathToClaudeCodeExecutable: cliPath,
                    executable: nodeInfo.path as 'node',
                    executableArgs: [],
                    cwd: basePath,
                    maxTurns: 10,
                    systemPrompt,
                    allowedTools: [
                        'mcp__graph__read_sources',
                        'mcp__graph__submit_graph',
                    ],
                    disallowedTools: [
                        'Read',
                        'Write',
                        'Edit',
                        'Bash',
                        'Glob',
                        'Grep',
                        'WebSearch',
                        'WebFetch',
                        'AskUserQuestion',
                    ],
                    mcpServers: { graph: graphMcpServer },
                    settingSources: [],
                    env: subprocessEnv,
                    abortController,
                } as Parameters<typeof query>[0]['options'],
            });

            for await (const raw of messages) {
                if (signal?.aborted) break;
                if (graphSubmitted) break;
                // Log for debugging
                console.log('[GraphAgent] message', raw);
            }
        } catch (err) {
            console.error('[GraphAgent] query error', err);
            return null;
        }

        return graphResult;
    }
}
