/**
 * In-process MCP server exposing graph-analysis tools for the GraphAgent.
 *
 * Two tools:
 *   - read_sources: batch-read vault files + resolve wikilinks (in/out)
 *   - submit_graph: submit the final GraphOutput JSON
 *
 * Follows the same tool() + createSdkMcpServer() pattern as vaultMcpServer.ts.
 */

import type { App } from 'obsidian';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { GraphOutputSchema, type GraphOutput } from './graph-output-types';

export interface GraphMcpServerOptions {
    app: App;
    onSubmitGraph: (graph: GraphOutput) => Promise<void>;
}

export function buildGraphMcpServer(options: GraphMcpServerOptions) {
    const { app, onSubmitGraph } = options;

    const readSources = tool(
        'read_sources',
        'Read all source files content and their wikilinks in batch. Call this first with all source paths.',
        {
            paths: z.array(z.string()).describe('Array of vault file paths to read'),
        },
        async (input, _extra) => {
            const results = [];
            for (const p of input.paths) {
                const tfile = app.vault.getFileByPath(p);
                if (!tfile) {
                    results.push({ path: p, content: '[file not found]', outgoing_links: [], incoming_links: [] });
                    continue;
                }
                const content = await app.vault.cachedRead(tfile);
                const metadata = app.metadataCache.getFileCache(tfile);
                const outgoing = (metadata?.links ?? []).map(l => l.link);
                const incoming = Object.entries(app.metadataCache.resolvedLinks)
                    .filter(([, targets]) => p in targets)
                    .map(([source]) => source);
                results.push({ path: p, content, outgoing_links: outgoing, incoming_links: incoming });
            }
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
            };
        },
    );

    const submitGraph = tool(
        'submit_graph',
        'Submit the final graph structure. Call this after analyzing all documents.',
        {
            nodes: GraphOutputSchema.shape.nodes,
            edges: GraphOutputSchema.shape.edges,
            clusters: GraphOutputSchema.shape.clusters,
            bridges: GraphOutputSchema.shape.bridges,
            evolution_chains: GraphOutputSchema.shape.evolution_chains,
            insights: GraphOutputSchema.shape.insights,
        },
        async (input, _extra) => {
            const parsed = GraphOutputSchema.parse(input);
            await onSubmitGraph(parsed);
            return {
                content: [{ type: 'text' as const, text: 'Graph submitted successfully.' }],
            };
        },
    );

    return createSdkMcpServer({
        name: 'graph',
        version: '1.0.0',
        tools: [readSources, submitGraph],
    });
}
