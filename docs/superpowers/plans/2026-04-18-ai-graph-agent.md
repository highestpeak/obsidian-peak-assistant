# AI Graph Agent Implementation Plan
> **STATUS: COMPLETED**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace physical-data graph rendering with an Anthropic Agent SDK-driven graph agent that analyzes source documents and outputs semantic relationships, topic clusters, bridges, and evolution chains.

**Architecture:** A Graph Agent (using `@anthropic-ai/claude-agent-sdk` `query()`) is launched during the search pipeline when sources are identified. It reads all source files via an in-process MCP server, reasons about their relationships, and outputs a structured `GraphOutput` JSON via a `submit_graph` tool. The frontend transforms `GraphOutput` into `LensGraphData` for three redesigned tabs: Topology (semantic relationships), Bridges (swimlane cross-domain view), and Timeline (time-axis evolution chains).

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` (agent loop), `@dagrejs/dagre` (layout), `@xyflow/react` (graph rendering), Zod (schema validation)

**Spec:** `docs/superpowers/specs/2026-04-18-ai-graph-agent-design.md`

---

### Task 1: Types, Schema, and Transformer

**Files:**
- Create: `src/service/agents/ai-graph/graph-output-types.ts`
- Create: `src/service/agents/ai-graph/graph-output-to-lens.ts`
- Modify: `src/ui/component/mine/multi-lens-graph/types.ts:1-35`
- Create: `test/graph-output-to-lens.test.ts`

- [ ] **Step 1: Define GraphOutput types and Zod schema**

Create `src/service/agents/ai-graph/graph-output-types.ts`:

```typescript
import { z } from 'zod';

export const GraphNodeSchema = z.object({
    path: z.string(),
    label: z.string(),
    role: z.enum(['hub', 'bridge', 'leaf']),
    cluster_id: z.string(),
    summary: z.string(),
    importance: z.number().min(0).max(1),
    created_at: z.number().optional(),
});

export const GraphEdgeSchema = z.object({
    source: z.string(),
    target: z.string(),
    kind: z.enum(['builds_on', 'contrasts', 'complements', 'applies', 'references']),
    label: z.string(),
    weight: z.number().min(0).max(1),
});

export const GraphClusterSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
});

export const GraphBridgeSchema = z.object({
    node_path: z.string(),
    connects: z.tuple([z.string(), z.string()]),
    explanation: z.string(),
});

export const EvolutionChainSchema = z.object({
    chain: z.array(z.string()),
    theme: z.string(),
});

export const GraphOutputSchema = z.object({
    nodes: z.array(GraphNodeSchema),
    edges: z.array(GraphEdgeSchema),
    clusters: z.array(GraphClusterSchema),
    bridges: z.array(GraphBridgeSchema),
    evolution_chains: z.array(EvolutionChainSchema),
});

export type GraphOutput = z.infer<typeof GraphOutputSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphCluster = z.infer<typeof GraphClusterSchema>;
export type GraphBridge = z.infer<typeof GraphBridgeSchema>;
export type EvolutionChain = z.infer<typeof EvolutionChainSchema>;
```

- [ ] **Step 2: Extend LensGraphData types**

In `src/ui/component/mine/multi-lens-graph/types.ts`, add the new edge kinds and extend `LensGraphData`:

```typescript
// Replace the LensEdgeData kind union:
export interface LensEdgeData extends Record<string, unknown> {
    kind: 'link' | 'semantic' | 'derives' | 'temporal' | 'cross-domain'
        | 'builds_on' | 'contrasts' | 'complements' | 'applies' | 'references';
    weight?: number;
    edgeLabel?: string;
}

// Add to LensNodeData:
export interface LensNodeData extends Record<string, unknown> {
    label: string;
    path: string;
    role?: 'root' | 'hub' | 'bridge' | 'leaf' | 'orphan';
    group?: string;
    createdAt?: number;
    modifiedAt?: number;
    level?: number;
    parentId?: string;
    summary?: string;
    score?: number;
    // New fields for AI graph:
    clusterId?: string;
    importance?: number;
}

// Extend LensGraphData with optional AI graph metadata:
export interface LensGraphData {
    nodes: LensNodeData[];
    edges: Array<{
        source: string;
        target: string;
        kind: LensEdgeData['kind'];
        weight?: number;
        label?: string;
    }>;
    availableLenses: LensType[];
    // AI graph extras:
    clusters?: Array<{ id: string; name: string; description: string }>;
    bridges?: Array<{ node_path: string; connects: [string, string]; explanation: string }>;
    evolutionChains?: Array<{ chain: string[]; theme: string }>;
}
```

- [ ] **Step 3: Write failing test for transformer**

Create `test/graph-output-to-lens.test.ts`:

```typescript
import { graphOutputToLensData } from '../src/service/agents/ai-graph/graph-output-to-lens';
import type { GraphOutput } from '../src/service/agents/ai-graph/graph-output-types';

const SAMPLE_OUTPUT: GraphOutput = {
    nodes: [
        { path: 'a.md', label: 'Note A', role: 'hub', cluster_id: 'c1', summary: 'Hub note', importance: 0.9, created_at: 1700000000000 },
        { path: 'b.md', label: 'Note B', role: 'leaf', cluster_id: 'c1', summary: 'Leaf note', importance: 0.4, created_at: 1700100000000 },
        { path: 'c.md', label: 'Note C', role: 'bridge', cluster_id: 'c2', summary: 'Bridge note', importance: 0.7, created_at: 1700200000000 },
    ],
    edges: [
        { source: 'a.md', target: 'b.md', kind: 'builds_on', label: 'B expands A', weight: 0.8 },
        { source: 'a.md', target: 'c.md', kind: 'complements', label: 'Cross-domain link', weight: 0.5 },
    ],
    clusters: [
        { id: 'c1', name: 'Topic A', description: 'First topic' },
        { id: 'c2', name: 'Topic B', description: 'Second topic' },
    ],
    bridges: [
        { node_path: 'c.md', connects: ['c1', 'c2'], explanation: 'Connects topics' },
    ],
    evolution_chains: [
        { chain: ['a.md', 'b.md'], theme: 'Idea evolution' },
    ],
};

function test(name: string, fn: () => void) {
    try { fn(); console.log(`  PASS: ${name}`); }
    catch (e) { console.error(`  FAIL: ${name}`, (e as Error).message); process.exit(1); }
}

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('graph-output-to-lens tests:');

test('converts nodes with correct fields', () => {
    const result = graphOutputToLensData(SAMPLE_OUTPUT);
    assert(result.nodes.length === 3, 'expected 3 nodes');
    const hub = result.nodes.find(n => n.path === 'a.md')!;
    assert(hub.role === 'hub', 'hub role');
    assert(hub.clusterId === 'c1', 'cluster id mapped');
    assert(hub.importance === 0.9, 'importance mapped');
    assert(hub.createdAt === 1700000000000, 'createdAt mapped');
});

test('converts edges with correct kind', () => {
    const result = graphOutputToLensData(SAMPLE_OUTPUT);
    assert(result.edges.length === 2, 'expected 2 edges');
    assert(result.edges[0].kind === 'builds_on', 'edge kind preserved');
    assert(result.edges[0].label === 'B expands A', 'edge label preserved');
});

test('includes clusters, bridges, evolutionChains', () => {
    const result = graphOutputToLensData(SAMPLE_OUTPUT);
    assert(result.clusters!.length === 2, 'clusters present');
    assert(result.bridges!.length === 1, 'bridges present');
    assert(result.evolutionChains!.length === 1, 'evolution chains present');
});

test('sets correct availableLenses', () => {
    const result = graphOutputToLensData(SAMPLE_OUTPUT);
    assert(result.availableLenses.includes('topology'), 'topology always available');
    assert(result.availableLenses.includes('bridge'), 'bridge available when bridges exist');
    assert(result.availableLenses.includes('timeline'), 'timeline available when chains or timestamps exist');
});

test('omits bridge lens when no bridges', () => {
    const noBridges = { ...SAMPLE_OUTPUT, bridges: [] };
    const result = graphOutputToLensData(noBridges);
    assert(!result.availableLenses.includes('bridge'), 'no bridge lens');
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- test/graph-output-to-lens.test.ts`
Expected: FAIL — `graphOutputToLensData` not found.

- [ ] **Step 5: Implement transformer**

Create `src/service/agents/ai-graph/graph-output-to-lens.ts`:

```typescript
import type { GraphOutput } from './graph-output-types';
import type { LensGraphData, LensNodeData, LensType } from '@/ui/component/mine/multi-lens-graph/types';

export function graphOutputToLensData(output: GraphOutput): LensGraphData {
    const nodes: LensNodeData[] = output.nodes.map(n => ({
        label: n.label,
        path: n.path,
        role: n.role,
        group: n.cluster_id,
        clusterId: n.cluster_id,
        summary: n.summary,
        importance: n.importance,
        createdAt: n.created_at,
    }));

    const edges = output.edges.map(e => ({
        source: e.source,
        target: e.target,
        kind: e.kind as LensGraphData['edges'][number]['kind'],
        weight: e.weight,
        label: e.label,
    }));

    const availableLenses: LensType[] = ['topology'];
    if (output.bridges.length > 0) availableLenses.push('bridge');
    const hasTimeline = output.evolution_chains.length > 0
        || output.nodes.some(n => n.created_at != null);
    if (hasTimeline) availableLenses.push('timeline');

    return {
        nodes,
        edges,
        availableLenses,
        clusters: output.clusters,
        bridges: output.bridges,
        evolutionChains: output.evolution_chains,
    };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- test/graph-output-to-lens.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/service/agents/ai-graph/graph-output-types.ts src/service/agents/ai-graph/graph-output-to-lens.ts src/ui/component/mine/multi-lens-graph/types.ts test/graph-output-to-lens.test.ts
git commit -m "feat: add GraphOutput types, schema, and transformer to LensGraphData"
```

---

### Task 2: Graph MCP Server + Agent

**Files:**
- Create: `src/service/agents/ai-graph/graphMcpServer.ts`
- Create: `src/service/agents/ai-graph/GraphAgent.ts`
- Create: `src/service/agents/ai-graph/graph-system-prompt.ts`
- Reference: `src/service/agents/VaultSearchAgentSDK.ts` (follow same patterns)
- Reference: `src/service/agents/vault-sdk/vaultMcpServer.ts` (tool definition pattern)
- Reference: `src/service/agents/vault-sdk/sdkAgentPool.ts` (warmup + CLI path)
- Reference: `src/service/agents/vault-sdk/sdkProfile.ts` (env setup)

- [ ] **Step 1: Create Graph MCP server with tools**

Create `src/service/agents/ai-graph/graphMcpServer.ts`:

```typescript
import { z } from 'zod';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { App, TFile } from 'obsidian';
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
        async ({ paths }) => {
            const results: Array<{
                path: string;
                content: string;
                outgoing_links: string[];
                incoming_links: string[];
            }> = [];

            for (const p of paths) {
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
        'Submit the final graph structure. Call this after analyzing all documents. The JSON must follow the GraphOutput schema exactly.',
        {
            nodes: GraphOutputSchema.shape.nodes,
            edges: GraphOutputSchema.shape.edges,
            clusters: GraphOutputSchema.shape.clusters,
            bridges: GraphOutputSchema.shape.bridges,
            evolution_chains: GraphOutputSchema.shape.evolution_chains,
        },
        async (args) => {
            const parsed = GraphOutputSchema.parse(args);
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
```

- [ ] **Step 2: Create system prompt**

Create `src/service/agents/ai-graph/graph-system-prompt.ts`:

```typescript
export function buildGraphSystemPrompt(searchQuery: string, sourcesMeta: Array<{
    path: string;
    folder: string;
    filename: string;
    createdAt?: number;
    modifiedAt?: number;
    relevanceScore?: number;
}>): string {
    const sourcesTable = sourcesMeta.map(s => {
        const date = s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : 'unknown';
        return `- ${s.filename} (${s.folder}) — created: ${date}, relevance: ${(s.relevanceScore ?? 0).toFixed(2)}`;
    }).join('\n');

    return `You are a knowledge graph analyst. Your job is to analyze a set of documents found for a user's search query and produce a structured knowledge graph.

## Search Query
${searchQuery}

## Source Files
${sourcesTable}

## Instructions

1. Call read_sources with ALL source file paths to get their content and links.
2. Analyze the documents to understand:
   - What each document is about (one-line summary)
   - How documents relate to each other (builds_on, contrasts, complements, applies, references)
   - Which documents cluster into the same topic
   - Which documents bridge between different topic clusters
   - How ideas evolved over time across documents
3. Call submit_graph with the complete graph structure.

## Edge Types
- builds_on: B extends or deepens ideas from A
- contrasts: B presents an opposing or alternative view to A
- complements: A and B cover different aspects of the same topic
- applies: B applies theories or frameworks from A to a specific case
- references: B explicitly references or cites A

## Node Roles
- hub: Central, highly-connected document in its cluster
- bridge: Document that connects two or more topic clusters
- leaf: Peripheral document with few connections

## Rules
- Every source file must appear as a node
- importance: 0-1 scale based on centrality to the search query and connectivity
- cluster_id: use short kebab-case identifiers (e.g. "ai-product", "personal-growth")
- Only create edges where there is a genuine semantic relationship, not just because two files are in the same folder
- evolution_chains: ordered by conceptual evolution (not necessarily by creation date), include created_at timestamps from the file metadata
- bridges: only mark a node as bridge if it genuinely connects ideas from different clusters`;
}
```

- [ ] **Step 3: Create GraphAgent class**

Create `src/service/agents/ai-graph/GraphAgent.ts`:

```typescript
import type { App } from 'obsidian';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { MyPluginSettings } from '@/app/settings/types';
import type { GraphOutput } from './graph-output-types';
import { buildGraphMcpServer } from './graphMcpServer';
import { buildGraphSystemPrompt } from './graph-system-prompt';
import { readProfileFromSettings, toAgentSdkEnv } from '../vault-sdk/sdkProfile';
import { warmupSdkAgentPool, getCliPath, type NodeBinaryInfo } from '../vault-sdk/sdkAgentPool';

export interface GraphAgentInput {
    searchQuery: string;
    sources: Array<{
        path: string;
        title?: string;
        score?: number;
    }>;
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
        await this.warmup();
        const nodeInfo = this.nodeInfo!;

        // Build env
        const profile = readProfileFromSettings(this.settings);
        const profileEnv = toAgentSdkEnv(profile);
        const subprocessEnv: Record<string, string> = {
            ...profileEnv,
            PATH: process.env.PATH ?? '',
        };
        if (nodeInfo.isElectron) {
            subprocessEnv.ELECTRON_RUN_AS_NODE = '1';
        }

        // Build source metadata
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
        const basePath = (this.app.vault.adapter as any).getBasePath();

        // Capture submit_graph result
        let graphResult: GraphOutput | null = null;
        let graphSubmitted = false;

        const graphMcpServer = buildGraphMcpServer({
            app: this.app,
            onSubmitGraph: async (graph) => {
                graphResult = graph;
                graphSubmitted = true;
            },
        });

        const abortController = new AbortController();
        if (signal) {
            signal.addEventListener('abort', () => abortController.abort());
        }

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
                        'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
                        'WebSearch', 'WebFetch', 'AskUserQuestion',
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
            }
        } catch (err) {
            console.error('[GraphAgent] query error', err);
            return null;
        }

        return graphResult;
    }
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors related to new files.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/ai-graph/graphMcpServer.ts src/service/agents/ai-graph/graph-system-prompt.ts src/service/agents/ai-graph/GraphAgent.ts
git commit -m "feat: add Graph Agent with MCP tools using Claude Agent SDK"
```

---

### Task 3: Update Node and Edge Components

**Files:**
- Modify: `src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx`
- Modify: `src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx`

- [ ] **Step 1: Update LensNodeComponent for importance-based sizing and cluster colors**

In `src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx`, replace the existing `ROLE_COLORS` map and node rendering with:

```typescript
// Cluster color palette — assigned by index
const CLUSTER_PALETTE = [
    '#89b4fa', // blue
    '#a6e3a1', // green
    '#f9e2af', // yellow
    '#cba6f7', // mauve
    '#fab387', // peach
    '#94e2d5', // teal
    '#f38ba8', // red
    '#74c7ec', // sapphire
];

// Role-based border styles
const ROLE_STYLES: Record<string, { borderStyle: string; borderColor?: string }> = {
    hub:    { borderStyle: 'solid' },
    bridge: { borderStyle: 'dashed', borderColor: '#f38ba8' },
    leaf:   { borderStyle: 'solid' },
    root:   { borderStyle: 'solid' },
    orphan: { borderStyle: 'solid' },
};
```

The node component should:
- Use `data.importance` (default 0.5) to scale padding: hub/high-importance nodes get `pktw-px-4 pktw-py-3`, low-importance get `pktw-px-2 pktw-py-1.5`
- Use `data.clusterId` to pick color from `CLUSTER_PALETTE` (hash cluster id to index)
- Apply the cluster color as left border accent: `borderLeft: 3px solid ${clusterColor}`
- Show `data.summary` as subtitle text when role is hub or bridge
- Bridge nodes get dashed border in pink `#f38ba8`

- [ ] **Step 2: Update LensEdgeComponent for new edge kinds**

In `src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx`, replace `KIND_STYLES` with:

```typescript
const KIND_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
    // New AI graph kinds:
    builds_on:    { stroke: '#89b4fa' },                        // blue solid
    complements:  { stroke: '#a6e3a1', strokeDasharray: '4 3' }, // green dashed
    contrasts:    { stroke: '#f38ba8', strokeDasharray: '6 3' }, // red dashed
    applies:      { stroke: '#f9e2af' },                        // yellow solid
    references:   { stroke: '#585b70' },                        // grey solid
    // Legacy kinds (backward compat):
    link:          { stroke: '#7c3aed' },
    semantic:      { stroke: '#94a3b8', strokeDasharray: '6 4' },
    derives:       { stroke: '#0ea5e9' },
    temporal:      { stroke: '#f59e0b', strokeDasharray: '8 4' },
    'cross-domain': { stroke: '#dc2626', strokeDasharray: '4 4' },
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx
git commit -m "feat: update node/edge components for AI graph kinds and cluster coloring"
```

---

### Task 4: Rewrite Bridge Layout (Swimlane)

**Files:**
- Modify: `src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts`
- Create: `test/bridge-layout.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/bridge-layout.test.ts`:

```typescript
import { computeBridgeLayout } from '../src/ui/component/mine/multi-lens-graph/layouts/bridge-layout';

function test(name: string, fn: () => void) {
    try { fn(); console.log(`  PASS: ${name}`); }
    catch (e) { console.error(`  FAIL: ${name}`, (e as Error).message); process.exit(1); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('bridge-layout tests:');

const NODES = [
    { label: 'A', path: 'a.md', role: 'leaf' as const, group: 'c1', clusterId: 'c1' },
    { label: 'B', path: 'b.md', role: 'leaf' as const, group: 'c1', clusterId: 'c1' },
    { label: 'Bridge', path: 'br.md', role: 'bridge' as const, group: 'c1', clusterId: 'c1' },
    { label: 'C', path: 'c.md', role: 'leaf' as const, group: 'c2', clusterId: 'c2' },
    { label: 'D', path: 'd.md', role: 'leaf' as const, group: 'c2', clusterId: 'c2' },
];

const CLUSTERS = [
    { id: 'c1', name: 'Topic 1', description: 'First' },
    { id: 'c2', name: 'Topic 2', description: 'Second' },
];

const BRIDGES = [
    { node_path: 'br.md', connects: ['c1', 'c2'] as [string, string], explanation: 'Connects topics' },
];

test('places bridge nodes between cluster columns', () => {
    const result = computeBridgeLayout({
        nodes: NODES,
        edges: [],
        clusters: CLUSTERS,
        bridges: BRIDGES,
    });
    const positions = result.positions;
    const bridgePos = positions.get('br.md')!;
    const aPos = positions.get('a.md')!;
    const cPos = positions.get('c.md')!;

    assert(bridgePos != null, 'bridge node has position');
    assert(aPos != null, 'cluster node has position');
    // Bridge should be horizontally between the two clusters
    assert(bridgePos.x > aPos.x && bridgePos.x < cPos.x, 'bridge is between clusters');
});

test('groups non-bridge nodes by cluster', () => {
    const result = computeBridgeLayout({
        nodes: NODES,
        edges: [],
        clusters: CLUSTERS,
        bridges: BRIDGES,
    });
    const positions = result.positions;
    const aX = positions.get('a.md')!.x;
    const bX = positions.get('b.md')!.x;
    const cX = positions.get('c.md')!.x;
    const dX = positions.get('d.md')!.x;

    // Same cluster → same x column
    assert(aX === bX, 'a and b in same column');
    assert(cX === dX, 'c and d in same column');
    assert(aX !== cX, 'different clusters in different columns');
});

test('returns bridge edges connecting bridge to clusters', () => {
    const result = computeBridgeLayout({
        nodes: NODES,
        edges: [],
        clusters: CLUSTERS,
        bridges: BRIDGES,
    });
    assert(result.bridgeEdges != null, 'bridge edges returned');
    assert(result.bridgeEdges!.length >= 2, 'at least 2 bridge edges (one per connected cluster)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/bridge-layout.test.ts`
Expected: FAIL — old signature doesn't accept `clusters` / `bridges` params, or `bridgeEdges` not in result.

- [ ] **Step 3: Rewrite bridge-layout.ts**

Replace `src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts`:

```typescript
import type { LensNodeData, LensEdgeData } from '../types';

export interface BridgeLayoutInput {
    nodes: LensNodeData[];
    edges: Array<{ source: string; target: string; kind: string }>;
    clusters?: Array<{ id: string; name: string; description: string }>;
    bridges?: Array<{ node_path: string; connects: [string, string]; explanation: string }>;
}

export interface BridgeLayoutResult {
    positions: Map<string, { x: number; y: number }>;
    bridgeEdges?: Array<{ source: string; target: string; kind: string; label?: string }>;
    swimlanes?: Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>;
}

const COL_WIDTH = 220;
const COL_GAP = 200;
const ROW_HEIGHT = 70;
const PADDING = 40;

export function computeBridgeLayout(input: BridgeLayoutInput): BridgeLayoutResult {
    const { nodes, clusters, bridges } = input;
    const positions = new Map<string, { x: number; y: number }>();
    const bridgeEdges: BridgeLayoutResult['bridgeEdges'] = [];
    const swimlanes: BridgeLayoutResult['swimlanes'] = [];

    const bridgePathSet = new Set((bridges ?? []).map(b => b.node_path));

    // Group non-bridge nodes by cluster
    const clusterIds = clusters?.map(c => c.id) ?? [];
    const clusterNodes = new Map<string, LensNodeData[]>();
    const bridgeNodes: LensNodeData[] = [];

    for (const n of nodes) {
        if (bridgePathSet.has(n.path)) {
            bridgeNodes.push(n);
        } else {
            const cid = n.clusterId ?? n.group ?? 'unknown';
            if (!clusterNodes.has(cid)) clusterNodes.set(cid, []);
            clusterNodes.get(cid)!.push(n);
        }
    }

    // Ensure cluster order follows the clusters array
    const orderedClusterIds = clusterIds.length > 0
        ? clusterIds.filter(id => clusterNodes.has(id))
        : [...clusterNodes.keys()];

    // Layout: left clusters | center bridges | right clusters
    // Split clusters into left and right halves
    const midIndex = Math.ceil(orderedClusterIds.length / 2);
    const leftClusterIds = orderedClusterIds.slice(0, midIndex);
    const rightClusterIds = orderedClusterIds.slice(midIndex);

    // Position left clusters
    let colX = PADDING;
    for (const cid of leftClusterIds) {
        const cNodes = clusterNodes.get(cid) ?? [];
        const clusterName = clusters?.find(c => c.id === cid)?.name ?? cid;
        let maxRowCount = 0;
        cNodes.forEach((n, i) => {
            positions.set(n.path, { x: colX, y: PADDING + ROW_HEIGHT + i * ROW_HEIGHT });
            maxRowCount = i + 1;
        });
        const height = PADDING + ROW_HEIGHT + maxRowCount * ROW_HEIGHT + PADDING;
        swimlanes.push({ id: cid, name: clusterName, x: colX - 15, y: PADDING / 2, width: COL_WIDTH, height });
        colX += COL_WIDTH + COL_GAP;
    }

    // Position bridge nodes in center
    const bridgeCenterX = colX;
    bridgeNodes.forEach((n, i) => {
        positions.set(n.path, { x: bridgeCenterX, y: PADDING + ROW_HEIGHT + i * (ROW_HEIGHT + 20) });
    });
    colX += COL_WIDTH + COL_GAP;

    // Position right clusters
    for (const cid of rightClusterIds) {
        const cNodes = clusterNodes.get(cid) ?? [];
        const clusterName = clusters?.find(c => c.id === cid)?.name ?? cid;
        let maxRowCount = 0;
        cNodes.forEach((n, i) => {
            positions.set(n.path, { x: colX, y: PADDING + ROW_HEIGHT + i * ROW_HEIGHT });
            maxRowCount = i + 1;
        });
        const height = PADDING + ROW_HEIGHT + maxRowCount * ROW_HEIGHT + PADDING;
        swimlanes.push({ id: cid, name: clusterName, x: colX - 15, y: PADDING / 2, width: COL_WIDTH, height });
        colX += COL_WIDTH + COL_GAP;
    }

    // Generate bridge edges: from bridge node to a representative node in each connected cluster
    for (const b of (bridges ?? [])) {
        for (const cid of b.connects) {
            const cNodes = clusterNodes.get(cid);
            if (cNodes && cNodes.length > 0) {
                bridgeEdges.push({
                    source: b.node_path,
                    target: cNodes[0].path,
                    kind: 'cross-domain',
                    label: b.explanation,
                });
            }
        }
    }

    return { positions, bridgeEdges, swimlanes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/bridge-layout.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts test/bridge-layout.test.ts
git commit -m "feat: rewrite bridge layout as swimlane with AI bridge nodes"
```

---

### Task 5: Rewrite Timeline Layout (Time Axis + Evolution Chains)

**Files:**
- Modify: `src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts`
- Create: `test/timeline-layout.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/timeline-layout.test.ts`:

```typescript
import { computeTimelineLayout } from '../src/ui/component/mine/multi-lens-graph/layouts/timeline-layout';

function test(name: string, fn: () => void) {
    try { fn(); console.log(`  PASS: ${name}`); }
    catch (e) { console.error(`  FAIL: ${name}`, (e as Error).message); process.exit(1); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

console.log('timeline-layout tests:');

const DAY = 86400000;
const BASE = 1700000000000;

const NODES = [
    { label: 'Early', path: 'early.md', createdAt: BASE },
    { label: 'Mid', path: 'mid.md', createdAt: BASE + 30 * DAY },
    { label: 'Late', path: 'late.md', createdAt: BASE + 90 * DAY },
    { label: 'Solo', path: 'solo.md', createdAt: BASE + 60 * DAY },
];

const CHAINS = [
    { chain: ['early.md', 'mid.md', 'late.md'], theme: 'Main evolution' },
];

test('positions nodes left-to-right by time', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    const pos = result.positions;
    assert(pos.get('early.md')!.x < pos.get('mid.md')!.x, 'early < mid');
    assert(pos.get('mid.md')!.x < pos.get('late.md')!.x, 'mid < late');
});

test('respects proportional time spacing', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    const pos = result.positions;
    const earlyX = pos.get('early.md')!.x;
    const midX = pos.get('mid.md')!.x;
    const lateX = pos.get('late.md')!.x;
    // Mid is at 30/90 = 1/3 of the way
    const ratio = (midX - earlyX) / (lateX - earlyX);
    assert(Math.abs(ratio - 1/3) < 0.1, `proportional spacing: ratio=${ratio.toFixed(2)}`);
});

test('chain nodes above axis, solo nodes near axis', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    const pos = result.positions;
    const axisY = result.axisY!;
    // Chain nodes should be offset from axis
    assert(Math.abs(pos.get('early.md')!.y - axisY) > 20, 'chain node offset from axis');
    // Solo node should be near axis
    assert(Math.abs(pos.get('solo.md')!.y - axisY) < 40, 'solo node near axis');
});

test('returns chain edges', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    assert(result.chainEdges!.length === 2, '2 chain edges for 3-node chain');
    assert(result.chainEdges![0].source === 'early.md', 'first edge source');
    assert(result.chainEdges![0].target === 'mid.md', 'first edge target');
});

test('returns time ticks', () => {
    const result = computeTimelineLayout({ nodes: NODES, evolutionChains: CHAINS });
    assert(result.timeTicks != null, 'ticks present');
    assert(result.timeTicks!.length > 0, 'at least one tick');
    assert(result.timeTicks![0].label != null, 'tick has label');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/timeline-layout.test.ts`
Expected: FAIL — old signature doesn't accept `evolutionChains`.

- [ ] **Step 3: Rewrite timeline-layout.ts**

Replace `src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts`:

```typescript
import type { LensNodeData } from '../types';

export interface TimelineLayoutInput {
    nodes: LensNodeData[];
    evolutionChains?: Array<{ chain: string[]; theme: string }>;
}

export interface TimelineLayoutResult {
    positions: Map<string, { x: number; y: number }>;
    axisY: number;
    chainEdges?: Array<{ source: string; target: string; kind: string; chainIndex: number }>;
    timeTicks?: Array<{ x: number; label: string; timestamp: number }>;
}

const CANVAS_PADDING = 80;
const CANVAS_WIDTH = 900;
const AXIS_Y = 260;
const CHAIN_OFFSET_Y = 80;
const SOLO_OFFSET_Y = 20;

export function computeTimelineLayout(input: TimelineLayoutInput): TimelineLayoutResult {
    const { nodes, evolutionChains = [] } = input;
    const positions = new Map<string, { x: number; y: number }>();
    const chainEdges: TimelineLayoutResult['chainEdges'] = [];

    // Get all nodes with timestamps, sorted by time
    const timed = nodes
        .filter(n => n.createdAt != null)
        .sort((a, b) => a.createdAt! - b.createdAt!);

    if (timed.length === 0) {
        // Fallback: horizontal line, equal spacing
        nodes.forEach((n, i) => {
            positions.set(n.path, { x: CANVAS_PADDING + i * 100, y: AXIS_Y });
        });
        return { positions, axisY: AXIS_Y };
    }

    const minTime = timed[0].createdAt!;
    const maxTime = timed[timed.length - 1].createdAt!;
    const timeRange = maxTime - minTime || 1;

    // Map time to x position (proportional)
    function timeToX(t: number): number {
        return CANVAS_PADDING + ((t - minTime) / timeRange) * (CANVAS_WIDTH - 2 * CANVAS_PADDING);
    }

    // Determine which nodes are in chains
    const chainMembership = new Map<string, number>(); // path → chain index
    for (let ci = 0; ci < evolutionChains.length; ci++) {
        for (const p of evolutionChains[ci].chain) {
            chainMembership.set(p, ci);
        }
    }

    // Position nodes
    const aboveCount = new Map<number, number>(); // track stacking for chains above
    const belowCount = new Map<number, number>(); // track stacking for chains below

    for (const n of timed) {
        const x = timeToX(n.createdAt!);
        let y: number;

        if (chainMembership.has(n.path)) {
            const ci = chainMembership.get(n.path)!;
            // Alternate chains above and below axis
            if (ci % 2 === 0) {
                y = AXIS_Y - CHAIN_OFFSET_Y - (aboveCount.get(ci) ?? 0) * 15;
                aboveCount.set(ci, (aboveCount.get(ci) ?? 0) + 1);
            } else {
                y = AXIS_Y + CHAIN_OFFSET_Y + (belowCount.get(ci) ?? 0) * 15;
                belowCount.set(ci, (belowCount.get(ci) ?? 0) + 1);
            }
        } else {
            y = AXIS_Y - SOLO_OFFSET_Y;
        }

        positions.set(n.path, { x, y });
    }

    // Nodes without timestamps: place at the end
    const untimed = nodes.filter(n => n.createdAt == null);
    untimed.forEach((n, i) => {
        positions.set(n.path, {
            x: CANVAS_WIDTH - CANVAS_PADDING + 30 + i * 60,
            y: AXIS_Y,
        });
    });

    // Generate chain edges
    for (let ci = 0; ci < evolutionChains.length; ci++) {
        const chain = evolutionChains[ci].chain;
        for (let i = 0; i < chain.length - 1; i++) {
            chainEdges.push({
                source: chain[i],
                target: chain[i + 1],
                kind: 'temporal',
                chainIndex: ci,
            });
        }
    }

    // Generate time ticks
    const timeTicks = generateTimeTicks(minTime, maxTime, timeToX);

    return { positions, axisY: AXIS_Y, chainEdges, timeTicks };
}

function generateTimeTicks(
    minTime: number,
    maxTime: number,
    timeToX: (t: number) => number,
): TimelineLayoutResult['timeTicks'] {
    const rangeMs = maxTime - minTime;
    const DAY = 86400000;

    // Choose interval based on range
    let intervalMs: number;
    let formatFn: (d: Date) => string;
    if (rangeMs < 14 * DAY) {
        intervalMs = DAY;
        formatFn = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (rangeMs < 90 * DAY) {
        intervalMs = 7 * DAY;
        formatFn = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    } else {
        intervalMs = 30 * DAY;
        formatFn = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const ticks: NonNullable<TimelineLayoutResult['timeTicks']> = [];
    // Snap to interval boundary
    const startTick = Math.ceil(minTime / intervalMs) * intervalMs;
    for (let t = startTick; t <= maxTime; t += intervalMs) {
        ticks.push({
            x: timeToX(t),
            label: formatFn(new Date(t)),
            timestamp: t,
        });
    }
    return ticks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/timeline-layout.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts test/timeline-layout.test.ts
git commit -m "feat: rewrite timeline layout with proportional time axis and evolution chains"
```

---

### Task 6: Update MultiLensGraph (Tooltips, Loading, Empty States)

**Files:**
- Modify: `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx:76-111`
- Modify: `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts`

- [ ] **Step 1: Add tab tooltips**

In `MultiLensGraph.tsx`, add a tooltip map and apply `title` attribute to each tab button (around line 76 where tabs are rendered):

```typescript
const LENS_TOOLTIPS: Record<LensType, string> = {
    topology: '展示文档间的语义关系和知识结构',
    bridge: '标识跨越知识领域的关键连接文档',
    timeline: '展示知识积累和思想演化的时间脉络',
    'thinking-tree': '展示文档间的思想推导和层级关系',
};
```

Apply to each tab `<Button>`: add `title={LENS_TOOLTIPS[lens]}`.

- [ ] **Step 2: Add loading and empty states**

In `MultiLensGraph.tsx`, before the `<ReactFlow>` render, add:

```typescript
// Loading state
if (graphData === null) {
    return (
        <div className={cn('pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground', className)}>
            <div className="pktw-text-center">
                <div className="pktw-animate-pulse pktw-text-sm">正在分析文档关系...</div>
            </div>
        </div>
    );
}

// Empty state per lens
const LENS_EMPTY_MESSAGES: Record<LensType, string> = {
    topology: '当前源文件之间未发现结构关系',
    bridge: '当前源文件之间未发现跨领域桥梁连接',
    timeline: '当前源文件缺少时间信息或演化关系',
    'thinking-tree': '需要点击生成来推断思维树',
};

if (nodes.length === 0) {
    return (
        <div className={cn('pktw-flex pktw-items-center pktw-justify-center pktw-h-full', className)}>
            {/* Tab bar still shown */}
            {renderTabBar()}
            <div className="pktw-text-sm pktw-text-muted-foreground">
                {LENS_EMPTY_MESSAGES[activeLens]}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Update useLensLayout to pass new data to layouts**

In `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts`, update the layout dispatch to pass `clusters`, `bridges`, and `evolutionChains` from `graphData` to the respective layout functions:

```typescript
case 'bridge':
    layoutResult = computeBridgeLayout({
        nodes: graphData.nodes,
        edges: graphData.edges,
        clusters: graphData.clusters,
        bridges: graphData.bridges,
    });
    // Merge bridge-generated edges into the edge list
    if (layoutResult.bridgeEdges) {
        extraEdges = layoutResult.bridgeEdges;
    }
    break;

case 'timeline':
    layoutResult = computeTimelineLayout({
        nodes: graphData.nodes,
        evolutionChains: graphData.evolutionChains,
    });
    // Merge chain edges
    if (layoutResult.chainEdges) {
        extraEdges = layoutResult.chainEdges.map(e => ({
            source: e.source,
            target: e.target,
            kind: e.kind,
        }));
    }
    break;
```

The `extraEdges` should be merged into the returned `LensEdge[]` array alongside the original edges.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts
git commit -m "feat: add tab tooltips, loading/empty states, pass AI data to layouts"
```

---

### Task 7: Search Pipeline Integration

**Files:**
- Create: `src/ui/view/quick-search/hooks/useGraphAgent.ts`
- Modify: `src/ui/view/quick-search/components/V2SourcesView.tsx:142-217`
- Modify: `src/ui/view/quick-search/components/ai-analysis-sections/SourcesSection.tsx:253-286`
- Reference: `src/ui/view/quick-search/store/aiGraphStore.ts` (store pattern)

- [ ] **Step 1: Create useGraphAgent hook**

This hook starts the Graph Agent when sources become available. It runs eagerly (not lazily on Graph toggle).

Create `src/ui/view/quick-search/hooks/useGraphAgent.ts`:

```typescript
import { useState, useEffect, useRef } from 'react';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import type { GraphOutput } from '@/service/agents/ai-graph/graph-output-types';
import { graphOutputToLensData } from '@/service/agents/ai-graph/graph-output-to-lens';

interface SourceItem {
    path: string;
    title?: string;
    score?: number;
}

interface UseGraphAgentResult {
    graphData: LensGraphData | null;
    loading: boolean;
    error: string | null;
}

export function useGraphAgent(
    sources: SourceItem[],
    searchQuery: string,
): UseGraphAgentResult {
    const [graphData, setGraphData] = useState<LensGraphData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    // Track which source set we've already started for
    const sourcesKeyRef = useRef<string>('');

    useEffect(() => {
        if (sources.length === 0 || !searchQuery) return;

        // Deduplicate: don't re-run for the same sources
        const key = sources.map(s => s.path).sort().join('|');
        if (key === sourcesKeyRef.current) return;
        sourcesKeyRef.current = key;

        // Abort previous run
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        (async () => {
            try {
                const { GraphAgent } = await import('@/service/agents/ai-graph/GraphAgent');
                const { AppContext } = await import('@/app/context/AppContext');
                const ctx = AppContext.getInstance();

                const agent = new GraphAgent(ctx.app, ctx.pluginId, ctx.settings);
                const result = await agent.generateGraph(
                    { searchQuery, sources },
                    controller.signal,
                );

                if (controller.signal.aborted) return;

                if (result) {
                    setGraphData(graphOutputToLensData(result));
                } else {
                    // Fallback to physical data
                    console.warn('[useGraphAgent] agent returned null, falling back to physical data');
                    await fallbackToPhysicalGraph(sources, setGraphData);
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    console.error('[useGraphAgent] error, falling back to physical data', err);
                    await fallbackToPhysicalGraph(sources, setGraphData);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            controller.abort();
        };
    }, [sources, searchQuery]);

    return { graphData, loading, error };
}

/** Fallback: build graph from physical vault data (wikilinks + semantic edges) */
async function fallbackToPhysicalGraph(
    sources: SourceItem[],
    setGraphData: (data: LensGraphData) => void,
) {
    try {
        const { buildSourcesGraphWithDiscoveredEdges } = await import(
            '@/service/tools/search-graph-inspector/build-sources-graph'
        );
        const { enrichWithCrossDomain } = await import(
            '@/service/agents/ai-graph/infer-cross-domain'
        );
        const searchItems = sources.map(s => ({ path: s.path, title: s.title ?? '', score: s.score ?? 0 }));
        const sg = await buildSourcesGraphWithDiscoveredEdges(searchItems as any);
        if (sg) {
            // Import the existing converter from V2SourcesView pattern
            const nodes = sg.nodes.map((n: any) => ({
                label: n.title ?? n.path.split('/').pop() ?? n.path,
                path: n.path,
                role: 'leaf' as const,
            }));
            const edges = sg.edges.map((e: any) => ({
                source: e.from,
                target: e.to,
                kind: 'link' as const,
                weight: e.weight ?? 0.5,
            }));
            let data: LensGraphData = { nodes, edges, availableLenses: ['topology'] };
            data = enrichWithCrossDomain(data);
            setGraphData(data);
        }
    } catch (err) {
        console.error('[useGraphAgent] fallback also failed', err);
    }
}
```

- [ ] **Step 2: Update V2SourcesView to use AI graph**

In `src/ui/view/quick-search/components/V2SourcesView.tsx`, replace the existing `SourcesGraph` component's `useEffect` that calls `buildSourcesGraphWithDiscoveredEdges` (lines ~147-195) with the `useGraphAgent` hook:

```typescript
import { useGraphAgent } from '../hooks/useGraphAgent';

// Inside the SourcesGraph component (around line 142):
function SourcesGraph({ sources, searchQuery, ... }: SourcesGraphProps) {
    const { graphData, loading, error } = useGraphAgent(
        sources.map(s => ({ path: s.path, title: s.title, score: s.score })),
        searchQuery,
    );

    return (
        <MultiLensGraph
            graphData={loading ? null : graphData}
            onNodeClick={onOpenPath}
            showControls
        />
    );
}
```

Remove the old imports of `buildSourcesGraphWithDiscoveredEdges`, `getCachedSourcesGraph`, `enrichWithCrossDomain`, and the local `sourcesGraphToLensData` / `buildCoCitationFallback` functions that are no longer needed.

- [ ] **Step 3: Update SourcesSection similarly**

In `src/ui/view/quick-search/components/ai-analysis-sections/SourcesSection.tsx`, replace the `useSourcesGraph` hook (lines 253-286) with `useGraphAgent`:

```typescript
import { useGraphAgent } from '../../hooks/useGraphAgent';

// Replace useSourcesGraph call (around line 349):
const { graphData: aiGraphData, loading: graphLoading } = useGraphAgent(
    mixedSources.map(s => ({ path: s.path, title: s.title, score: s.score })),
    searchQuery,  // need to pass the query — add as prop if not available
);

// Update the MultiLensGraph render (around line 476):
<MultiLensGraph
    graphData={graphLoading ? null : aiGraphData}
    onNodeClick={...}
    showControls
/>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Manual integration test**

1. Open Obsidian with the plugin in dev mode
2. Open Quick Search, type a query that returns multiple sources
3. Click on the sources section → toggle to Graph view
4. Verify: loading state appears → graph renders with edges and cluster coloring
5. Switch between Topology, Bridges, Timeline tabs
6. Verify tooltips appear on hover over tab names

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/quick-search/hooks/useGraphAgent.ts src/ui/view/quick-search/components/V2SourcesView.tsx src/ui/view/quick-search/components/ai-analysis-sections/SourcesSection.tsx
git commit -m "feat: integrate Graph Agent into search pipeline, eagerly generate AI graph"
```

---
