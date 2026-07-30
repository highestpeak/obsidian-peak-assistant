/** Peak Harness tools used by the knowledge-graph agent. */

import type { AppHandle } from '@/core/ports/AppHandle';
import { ok, type ToolDef } from '@/core/types/tool';
import { z } from 'zod';
import { GraphOutputSchema, type GraphOutput } from './graph-output-types';

export interface GraphToolsOptions {
    app: AppHandle;
    onSubmitGraph: (graph: GraphOutput) => Promise<void>;
}

export function buildGraphTools(options: GraphToolsOptions): ToolDef[] {
    const { app, onSubmitGraph } = options;

    const readSources: ToolDef = {
        name: 'mcp__graph__read_sources',
        description: 'Read all source files content and their wikilinks in batch. Call this first with all source paths.',
        inputSchema: z.object({
            paths: z.array(z.string()).describe('Array of vault file paths to read'),
        }),
        source: 'local',
        kind: 'read',
        async execute(input) {
            const results = [];
            for (const p of input.paths) {
                const tfile = app.vault.getFileByPath(p);
                if (!tfile) {
                    results.push({ path: p, content: '[file not found]', outgoing_links: [], incoming_links: [] });
                    continue;
                }
                const content = await app.vault.cachedRead(tfile);
                const metadata = app.metadataCache.getFileCache(tfile);
                const outgoing = (metadata?.links ?? [])
                    .map((link: { link: string }) => link.link);
                const resolvedLinks = app.metadataCache.resolvedLinks as Record<string, Record<string, unknown>>;
                const incoming = Object.entries(resolvedLinks)
                    .filter(([, targets]) => p in targets)
                    .map(([source]) => source);
                results.push({ path: p, content, outgoing_links: outgoing, incoming_links: incoming });
            }
            return ok(results);
        },
    };

    const submitGraph: ToolDef = {
        name: 'mcp__graph__submit_graph',
        description: 'Submit the final graph structure. Call this after analyzing all documents.',
        inputSchema: z.object({
            nodes: GraphOutputSchema.shape.nodes,
            edges: GraphOutputSchema.shape.edges,
            clusters: GraphOutputSchema.shape.clusters,
            bridges: GraphOutputSchema.shape.bridges,
            evolution_chains: GraphOutputSchema.shape.evolution_chains,
            insights: GraphOutputSchema.shape.insights,
        }),
        source: 'local',
        kind: 'meta',
        async execute(input) {
            const parsed = GraphOutputSchema.parse(input);
            await onSubmitGraph(parsed);
            return ok({ submitted: true });
        },
    };

    return [readSources, submitGraph];
}
