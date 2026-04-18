# AI Graph Multi-Lens Implementation Plan
> **STATUS: COMPLETED**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "AI Graph" analysis preset with multi-lens graph visualization (topology, thinking tree, cross-domain bridges, timeline), powered by @xyflow/react, with markdown persistence.

**Architecture:** Simplify presets to `vaultFull` + `aiGraph` (remove `docSimple`, `vaultSimple`). New `AIGraphAgent` generates graph data via AI-inferred relationships. Shared `MultiLensGraph` React Flow component renders 4 lens types, reused in both AI Graph mode and Vault Analysis Sources tab. Graph results persist as markdown with embedded JSON code blocks.

**Tech Stack:** @xyflow/react, @dagrejs/dagre (already in deps), d3-force (already in deps), Zod schemas, Zustand store, existing Agent/Tool patterns.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx` | Main React Flow wrapper — lens switcher + graph rendering |
| `src/ui/component/mine/multi-lens-graph/types.ts` | `LensType`, `LensGraphData`, `LensNode`, `LensEdge` type definitions |
| `src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx` | Custom React Flow node — title, path badge, role icon, hover preview |
| `src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx` | Custom React Flow edge — kind-aware styling (physical/semantic/derives) |
| `src/ui/component/mine/multi-lens-graph/layouts/topology-layout.ts` | Force-directed layout via d3-force → React Flow positions |
| `src/ui/component/mine/multi-lens-graph/layouts/tree-layout.ts` | Hierarchical tree layout via dagre (top-down mind map) |
| `src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts` | Arc/column layout — group by folder, cross-group edges as arcs |
| `src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts` | Horizontal timeline layout — x=time, y=group |
| `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts` | Hook: given `LensGraphData` + `LensType`, compute React Flow nodes/edges |
| `src/service/agents/AIGraphAgent.ts` | Agent class — orchestrates graph construction (query or file selection → AI infer → graph data) |
| `src/service/agents/ai-graph/infer-thinking-tree.ts` | AI call: given document set, infer parent-child hierarchy |
| `src/service/agents/ai-graph/infer-cross-domain.ts` | Algorithmic: group sources by folder, compute cross-folder semantic edges |
| `src/service/agents/ai-graph/infer-timeline.ts` | Algorithmic: extract file created/modified times, order by time |
| `src/service/agents/ai-graph/build-graph-data.ts` | Combine inferred structures into `LensGraphData` |
| `src/core/schemas/ai-graph-schemas.ts` | Zod schema for AI graph markdown persistence format |
| `src/core/storage/vault/search-docs/AiGraphDoc.ts` | Build/parse AI Graph markdown (frontmatter + summary + JSON code block + sources) |
| `src/ui/view/quick-search/components/ai-graph-view/AIGraphView.tsx` | Full AI Graph mode view — input, lens selector, graph, save button |
| `src/ui/view/quick-search/store/aiGraphStore.ts` | Zustand store for AI Graph state (graph data, active lens, loading) |

### Modified files

| File | Change |
|------|--------|
| `src/service/agents/shared-types.ts:93` | Change `AnalysisMode` type: remove `docSimple`/`vaultSimple`, add `aiGraph` |
| `src/ui/view/quick-search/SearchModal.tsx:64-175` | Update `PRESET_LABELS`, preset selector UI, icons |
| `src/ui/view/quick-search/hooks/useSearchSession.ts:930` | Add `aiGraph` branch in `performAnalysis` |
| `src/ui/view/quick-search/store/searchSessionStore.ts:81,252,416` | Update default `analysisMode`, type refs |
| `src/ui/view/quick-search/components/ai-analysis-state/CompletedAIAnalysis.tsx:78` | Update `isSimpleMode` → remove vaultSimple reference |
| `src/ui/view/quick-search/components/ai-analysis-sections/SourcesSection.tsx:308,481-542` | Replace D3 Canvas graph with `MultiLensGraph` in graph tab |
| `src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts` | Add `saveAiGraphToMarkdown` export |
| `src/app/context/AppContext.ts:144` | Add `static aiGraphAgent()` factory method |

---

## Task 1: Define Types and Schemas

**Files:**
- Create: `src/ui/component/mine/multi-lens-graph/types.ts`
- Create: `src/core/schemas/ai-graph-schemas.ts`
- Modify: `src/service/agents/shared-types.ts:93`

- [ ] **Step 1: Define LensType and graph data types**

```ts
// src/ui/component/mine/multi-lens-graph/types.ts
import type { Node, Edge } from '@xyflow/react';

export type LensType = 'topology' | 'thinking-tree' | 'bridge' | 'timeline';

/** Source document node in the multi-lens graph. */
export interface LensNodeData {
  label: string;
  path: string;
  /** Role hint for visual encoding. */
  role?: 'root' | 'hub' | 'bridge' | 'leaf' | 'orphan';
  /** Folder group for bridge lens. */
  group?: string;
  /** File created timestamp (ms) for timeline lens. */
  createdAt?: number;
  /** File modified timestamp (ms) for timeline lens. */
  modifiedAt?: number;
  /** Tree depth level for thinking-tree lens (0 = root). */
  level?: number;
  /** Parent node id for thinking-tree lens. */
  parentId?: string;
  /** AI-generated one-line summary for hover preview. */
  summary?: string;
  /** Score from search results (0-1). */
  score?: number;
}

export type LensNode = Node<LensNodeData, 'lensNode'>;

export interface LensEdgeData {
  /** Edge semantic kind. */
  kind: 'link' | 'semantic' | 'derives' | 'temporal' | 'cross-domain';
  /** Strength 0-1. */
  weight?: number;
  /** Optional label on edge. */
  edgeLabel?: string;
}

export type LensEdge = Edge<LensEdgeData>;

/** Complete graph data for all lenses. */
export interface LensGraphData {
  nodes: LensNodeData[];
  edges: Array<{
    source: string;
    target: string;
    kind: LensEdgeData['kind'];
    weight?: number;
    label?: string;
  }>;
  /** Which lenses have data available. */
  availableLenses: LensType[];
}
```

- [ ] **Step 2: Define AI Graph persistence schema**

```ts
// src/core/schemas/ai-graph-schemas.ts
import { z } from 'zod/v3';

export const lensNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  role: z.enum(['root', 'hub', 'bridge', 'leaf', 'orphan']).optional(),
  group: z.string().optional(),
  createdAt: z.number().optional(),
  modifiedAt: z.number().optional(),
  level: z.number().optional(),
  parentId: z.string().optional(),
  summary: z.string().optional(),
  score: z.number().optional(),
});

export const lensEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: z.enum(['link', 'semantic', 'derives', 'temporal', 'cross-domain']),
  weight: z.number().optional(),
  label: z.string().optional(),
});

export const aiGraphDocSchema = z.object({
  nodes: z.array(lensNodeSchema),
  edges: z.array(lensEdgeSchema),
  lensHint: z.enum(['topology', 'thinking-tree', 'bridge', 'timeline']).optional(),
});

export type AiGraphDocData = z.infer<typeof aiGraphDocSchema>;
```

- [ ] **Step 3: Update AnalysisMode type**

In `src/service/agents/shared-types.ts:93`, change:

```ts
// Before:
export type AnalysisMode = 'docSimple' | 'vaultSimple' | 'vaultFull';

// After:
export type AnalysisMode = 'vaultFull' | 'aiGraph';
```

- [ ] **Step 4: Fix all TypeScript compilation errors from AnalysisMode change**

Run: `npx tsc --noEmit 2>&1 | head -60`

This will surface all files referencing `docSimple` or `vaultSimple`. Fix each one:
- `SearchModal.tsx:64-68` — update `PRESET_LABELS` (next task)
- `searchSessionStore.ts:252` — default stays `'vaultFull'`
- `CompletedAIAnalysis.tsx:78` — `isSimpleMode` logic removed (always full mode now)
- `useSearchSession.ts:930` — remove `vaultSimple` from `isVaultMode`, add `aiGraph` branch
- `StreamingAnalysis.tsx:53` — remove `isSimpleMode` check
- Any other references: search for `docSimple`, `vaultSimple` and update or remove.

Expected: `tsc --noEmit` passes with zero errors after fixes.

- [ ] **Step 5: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/types.ts src/core/schemas/ai-graph-schemas.ts src/service/agents/shared-types.ts
# Also add any files touched in Step 4
git commit -m "feat(ai-graph): define multi-lens types, schemas, simplify AnalysisMode to vaultFull|aiGraph"
```

---

## Task 2: Update Preset Selector UI

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:64-175`
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:252,416`
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts:930`

- [ ] **Step 1: Update PRESET_LABELS and preset array**

In `SearchModal.tsx:64-68`, replace:

```ts
// Before:
export const PRESET_LABELS: Record<'docSimple' | 'vaultSimple' | 'vaultFull', { short: string; full: string }> = {
    docSimple: { short: 'Doc', full: 'Doc Simple · Chat with current note.' },
    vaultSimple: { short: 'Vault Simple', full: 'Vault Simple · Search whole vault then summarize.' },
    vaultFull: { short: 'Vault Full', full: 'Vault Full · Deep analysis whole vault.' },
};

// After:
export const PRESET_LABELS: Record<AnalysisMode, { short: string; full: string }> = {
    vaultFull: { short: 'Vault Analysis', full: 'Vault Analysis · Deep analysis whole vault.' },
    aiGraph: { short: 'AI Graph', full: 'AI Graph · Build interactive knowledge graphs.' },
};
```

- [ ] **Step 2: Update PRESETS array and icon mapping**

In `SearchModal.tsx:95`, change:

```ts
// Before:
const PRESETS: AnalysisMode[] = ['docSimple', 'vaultSimple', 'vaultFull'];

// After:
const PRESETS: AnalysisMode[] = ['vaultFull', 'aiGraph'];
```

Update icon in the trigger button (`SearchModal.tsx:149`):

```ts
// Before:
{analysisMode === 'docSimple' ? <FileText ... /> : analysisMode === 'vaultSimple' ? <Zap ... /> : <Brain ... />}

// After:
{analysisMode === 'vaultFull' ? <Brain className="pktw-w-4 pktw-h-4" /> : <Network className="pktw-w-4 pktw-h-4" />}
```

Import `Network` from lucide-react (already imported in SourcesSection).

Update icons in the preset list (`SearchModal.tsx:165`):

```ts
// Before:
{p === 'docSimple' ? <FileText ... /> : p === 'vaultSimple' ? <Zap ... /> : <Brain ... />}

// After:
{p === 'vaultFull' ? <Brain className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" /> : <Network className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />}
```

Remove the `docSimple` file-path display logic (`SearchModal.tsx:87-88, 92, 147, 167-169`).

- [ ] **Step 3: Update useSearchSession dispatch**

In `useSearchSession.ts:930`, replace:

```ts
// Before:
const isVaultMode = analysisMode === 'vaultFull' || analysisMode === 'vaultSimple';

// After:
const isVaultMode = analysisMode === 'vaultFull';
```

After the vault mode block (after line ~962), add the aiGraph branch:

```ts
if (analysisMode === 'aiGraph') {
    // AI Graph mode: delegate to AIGraphAgent
    // Placeholder — will be implemented in Task 5
    const agent = AppContext.aiGraphAgent();
    await consumeStream(agent.startSession(searchQuery));
    store.getState().markCompleted();
    markAIAnalysisCompleted();
    return;
}
```

- [ ] **Step 4: Remove isSimpleMode references**

In `CompletedAIAnalysis.tsx:78`:
```ts
// Before:
const isSimpleMode = runAnalysisMode === 'docSimple' || runAnalysisMode === 'vaultSimple';

// After: remove this line entirely, and remove all conditional blocks gated on isSimpleMode
// (replace `!isSimpleMode && <Component>` with just `<Component>`)
```

Do the same in `StreamingAnalysis.tsx` if it has `isSimpleMode`.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds. (AIGraphAgent doesn't exist yet, so the import in useSearchSession will be stubbed — create a minimal placeholder class in Task 5.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx src/ui/view/quick-search/hooks/useSearchSession.ts src/ui/view/quick-search/store/searchSessionStore.ts src/ui/view/quick-search/components/ai-analysis-state/CompletedAIAnalysis.tsx
git commit -m "feat(ai-graph): simplify presets to vaultFull + aiGraph, update selector UI"
```

---

## Task 3: Build MultiLensGraph Component (Topology + Tree Lenses)

**Files:**
- Create: `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx`
- Create: `src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx`
- Create: `src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx`
- Create: `src/ui/component/mine/multi-lens-graph/layouts/topology-layout.ts`
- Create: `src/ui/component/mine/multi-lens-graph/layouts/tree-layout.ts`
- Create: `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts`

- [ ] **Step 1: Create topology layout**

```ts
// src/ui/component/mine/multi-lens-graph/layouts/topology-layout.ts
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import type { LensNodeData, LensEdgeData } from '../types';

interface LayoutInput {
  nodes: LensNodeData[];
  edges: Array<{ source: string; target: string; kind: LensEdgeData['kind']; weight?: number }>;
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

export function computeTopologyLayout(input: LayoutInput): LayoutResult {
  const simNodes = input.nodes.map((n) => ({ id: n.path, x: Math.random() * 400, y: Math.random() * 400 }));
  const simLinks = input.edges.map((e) => ({ source: e.source, target: e.target }));

  const sim = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d: any) => d.id).distance(120))
    .force('charge', forceManyBody().strength(-300))
    .force('center', forceCenter(200, 200))
    .force('collide', forceCollide(40))
    .stop();

  // Run synchronously
  for (let i = 0; i < 200; i++) sim.tick();

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of simNodes) {
    positions.set(n.id, { x: n.x, y: n.y });
  }
  return { positions };
}
```

- [ ] **Step 2: Create tree layout**

```ts
// src/ui/component/mine/multi-lens-graph/layouts/tree-layout.ts
import dagre from '@dagrejs/dagre';
import type { LensNodeData, LensEdgeData } from '../types';

interface LayoutInput {
  nodes: LensNodeData[];
  edges: Array<{ source: string; target: string; kind: LensEdgeData['kind'] }>;
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

export function computeTreeLayout(input: LayoutInput): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 });

  for (const n of input.nodes) {
    g.setNode(n.path, { width: 180, height: 50 });
  }

  // Use parent→child derives edges for tree structure
  const treeEdges = input.edges.filter((e) => e.kind === 'derives');
  for (const e of treeEdges) {
    g.setEdge(e.source, e.target);
  }

  // If no derives edges, fall back to all edges
  if (treeEdges.length === 0) {
    for (const e of input.edges) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of input.nodes) {
    const pos = g.node(n.path);
    if (pos) positions.set(n.path, { x: pos.x, y: pos.y });
  }
  return { positions };
}
```

- [ ] **Step 3: Create custom node component**

```tsx
// src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LensNodeData } from '../types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shadcn/tooltip';

const ROLE_COLORS: Record<string, string> = {
  root: '#7c3aed',
  hub: '#0ea5e9',
  bridge: '#f59e0b',
  leaf: '#6b7280',
  orphan: '#d1d5db',
};

export const LensNodeComponent = memo(({ data }: NodeProps<LensNodeData>) => {
  const color = ROLE_COLORS[data.role ?? 'leaf'] ?? ROLE_COLORS.leaf;
  const fileName = data.path.split('/').pop() ?? data.label;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="pktw-rounded-lg pktw-border pktw-px-3 pktw-py-2 pktw-bg-white pktw-shadow-sm pktw-cursor-pointer pktw-max-w-[200px] pktw-transition-shadow hover:pktw-shadow-md"
            style={{ borderColor: color, borderLeftWidth: 3 }}
          >
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338] pktw-truncate pktw-block">
              {data.label || fileName}
            </span>
            {data.role && (
              <span className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider" style={{ color }}>
                {data.role}
              </span>
            )}
            <Handle type="target" position={Position.Top} className="!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0" />
            <Handle type="source" position={Position.Bottom} className="!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0" />
          </div>
        </TooltipTrigger>
        {data.summary && (
          <TooltipContent side="right" className="pktw-max-w-[280px] pktw-text-xs">
            <span className="pktw-text-[10px] pktw-text-[#6b7280] pktw-block pktw-mb-1">{data.path}</span>
            {data.summary}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
});

LensNodeComponent.displayName = 'LensNodeComponent';
```

- [ ] **Step 4: Create custom edge component**

```tsx
// src/ui/component/mine/multi-lens-graph/edges/LensEdgeComponent.tsx
import React from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { LensEdgeData } from '../types';

const KIND_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  link: { stroke: '#7c3aed' },
  semantic: { stroke: '#d1d5db', strokeDasharray: '5 3' },
  derives: { stroke: '#0ea5e9' },
  temporal: { stroke: '#f59e0b', strokeDasharray: '8 4' },
  'cross-domain': { stroke: '#dc2626', strokeDasharray: '3 3' },
};

export function LensEdgeComponent(props: EdgeProps<LensEdgeData>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const style = KIND_STYLES[data?.kind ?? 'link'] ?? KIND_STYLES.link;

  return (
    <BaseEdge
      path={edgePath}
      style={{ ...style, strokeWidth: Math.max(1, (data?.weight ?? 0.5) * 3) }}
    />
  );
}
```

- [ ] **Step 5: Create useLensLayout hook**

```ts
// src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts
import { useMemo } from 'react';
import type { LensType, LensGraphData, LensNode, LensEdge } from '../types';
import { computeTopologyLayout } from '../layouts/topology-layout';
import { computeTreeLayout } from '../layouts/tree-layout';

export function useLensLayout(graphData: LensGraphData | null, lens: LensType) {
  return useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) return { nodes: [] as LensNode[], edges: [] as LensEdge[] };

    let positions: Map<string, { x: number; y: number }>;

    switch (lens) {
      case 'thinking-tree':
        positions = computeTreeLayout({ nodes: graphData.nodes, edges: graphData.edges }).positions;
        break;
      case 'bridge':
        // Placeholder: fall back to topology until Task 6
        positions = computeTopologyLayout({ nodes: graphData.nodes, edges: graphData.edges }).positions;
        break;
      case 'timeline':
        // Placeholder: fall back to topology until Task 6
        positions = computeTopologyLayout({ nodes: graphData.nodes, edges: graphData.edges }).positions;
        break;
      case 'topology':
      default:
        positions = computeTopologyLayout({ nodes: graphData.nodes, edges: graphData.edges }).positions;
        break;
    }

    const nodes: LensNode[] = graphData.nodes.map((n) => ({
      id: n.path,
      type: 'lensNode',
      position: positions.get(n.path) ?? { x: 0, y: 0 },
      data: n,
    }));

    const edges: LensEdge[] = graphData.edges.map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'lensEdge',
      data: { kind: e.kind, weight: e.weight },
    }));

    return { nodes, edges };
  }, [graphData, lens]);
}
```

- [ ] **Step 6: Create MultiLensGraph main component**

```tsx
// src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx
import React, { useCallback, useState } from 'react';
import { ReactFlow, Background, MiniMap, Controls, type NodeMouseHandler } from '@xyflow/react';
import type { LensType, LensGraphData } from './types';
import { LensNodeComponent } from './nodes/LensNodeComponent';
import { LensEdgeComponent } from './edges/LensEdgeComponent';
import { useLensLayout } from './hooks/useLensLayout';
import { Button } from '@/ui/component/shadcn/button';
import { Network, GitBranch, Waypoints, Clock } from 'lucide-react';

const nodeTypes = { lensNode: LensNodeComponent };
const edgeTypes = { lensEdge: LensEdgeComponent };

const LENS_CONFIG: Array<{ type: LensType; icon: React.FC<{ className?: string }>; label: string }> = [
  { type: 'topology', icon: Network, label: 'Topology' },
  { type: 'thinking-tree', icon: GitBranch, label: 'Thinking Tree' },
  { type: 'bridge', icon: Waypoints, label: 'Bridges' },
  { type: 'timeline', icon: Clock, label: 'Timeline' },
];

interface MultiLensGraphProps {
  graphData: LensGraphData | null;
  defaultLens?: LensType;
  onNodeClick?: (path: string) => void;
  className?: string;
  showControls?: boolean;
  showMiniMap?: boolean;
}

export const MultiLensGraph: React.FC<MultiLensGraphProps> = ({
  graphData,
  defaultLens = 'topology',
  onNodeClick,
  className = '',
  showControls = true,
  showMiniMap = false,
}) => {
  const [activeLens, setActiveLens] = useState<LensType>(defaultLens);
  const { nodes, edges } = useLensLayout(graphData, activeLens);
  const availableLenses = graphData?.availableLenses ?? ['topology'];

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const path = node.data?.path;
    if (path && onNodeClick) onNodeClick(path);
  }, [onNodeClick]);

  if (!graphData || nodes.length === 0) {
    return (
      <div className={`pktw-flex pktw-items-center pktw-justify-center pktw-text-[#6b7280] pktw-text-sm ${className}`}>
        No graph data
      </div>
    );
  }

  return (
    <div className={`pktw-flex pktw-flex-col ${className}`}>
      {/* Lens switcher */}
      <div className="pktw-flex pktw-gap-1 pktw-p-1 pktw-border-b pktw-border-[#e5e7eb] pktw-bg-[#f9fafb] pktw-rounded-t-lg">
        {LENS_CONFIG.filter((l) => availableLenses.includes(l.type)).map((l) => (
          <Button
            key={l.type}
            variant={activeLens === l.type ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveLens(l.type)}
            className="pktw-gap-1 pktw-text-xs"
            style={{ cursor: 'pointer' }}
          >
            <l.icon className="pktw-w-3.5 pktw-h-3.5" />
            {l.label}
          </Button>
        ))}
      </div>
      {/* React Flow canvas */}
      <div className="pktw-flex-1 pktw-min-h-[200px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background color="#f3f4f6" gap={20} />
          {showControls && <Controls />}
          {showMiniMap && <MiniMap />}
        </ReactFlow>
      </div>
    </div>
  );
};
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: Build succeeds. Component is not yet wired into any view — just verifying it compiles.

- [ ] **Step 8: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/
git commit -m "feat(ai-graph): add MultiLensGraph component with topology + tree lenses"
```

---

## Task 4: Integrate MultiLensGraph into Sources Section

**Files:**
- Modify: `src/ui/view/quick-search/components/ai-analysis-sections/SourcesSection.tsx:308,481-542`

- [ ] **Step 1: Add adapter to convert SourcesGraph → LensGraphData**

Add at the top of `SourcesSection.tsx` (or in a small helper near the imports):

```ts
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

function sourcesGraphToLensData(graph: SourcesGraph): LensGraphData {
  return {
    nodes: graph.nodes.map((n) => ({
      label: n.label,
      path: n.attributes?.path ?? n.id,
      role: n.type === 'hub' ? 'hub' : n.type === 'bridge' ? 'bridge' : 'leaf',
      group: n.attributes?.path?.split('/').slice(0, -1).join('/'),
    })),
    edges: graph.edges.map((e) => ({
      source: e.from_node_id,
      target: e.to_node_id,
      kind: e.kind === 'semantic' ? 'semantic' as const : 'link' as const,
    })),
    availableLenses: ['topology'] as const,
  };
}
```

- [ ] **Step 2: Replace GraphVisualization with MultiLensGraph in graph tab**

In `SourcesSection.tsx`, replace the graph tab rendering block (lines ~481-542) with:

```tsx
{viewMode === 'graph' ? (
  <div className="pktw-h-[320px] pktw-w-full pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-overflow-hidden">
    {sourcesGraphLoading ? (
      <div className="pktw-h-full pktw-w-full pktw-flex pktw-items-center pktw-justify-center pktw-text-[#6b7280] pktw-text-sm">
        <Loader2 className="pktw-w-5 pktw-h-5 pktw-animate-spin pktw-mr-2" />
        Discovering connections…
      </div>
    ) : (
      <MultiLensGraph
        graphData={sourcesGraph ? sourcesGraphToLensData(sourcesGraph) : null}
        defaultLens="topology"
        onNodeClick={(path) => onOpen(path)}
        className="pktw-h-full pktw-w-full"
      />
    )}
  </div>
)
```

Remove imports and refs no longer needed: `GraphVisualization`, `GraphVisualizationHandle`, `createPortal`, `obsidianPreset`, `graphRef`, `inlineContainerEl`, `fullscreenContainerEl`, `fullscreenOpen` state, and the fullscreen overlay div.

Note: The existing fullscreen feature is temporarily removed. It can be re-added later as a prop on MultiLensGraph. Keep the `Maximize2` button hidden for now.

- [ ] **Step 3: Verify build and manual test**

Run: `npm run build`
Expected: Build succeeds. Open Obsidian, run a Vault Analysis search, switch to Sources → Graph tab. Should see a React Flow graph with topology lens only.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/ai-analysis-sections/SourcesSection.tsx
git commit -m "feat(ai-graph): replace D3 Canvas graph with MultiLensGraph in Sources section"
```

---

## Task 5: AI Graph Agent (Scaffold + Topology Lens)

**Files:**
- Create: `src/service/agents/AIGraphAgent.ts`
- Create: `src/service/agents/ai-graph/build-graph-data.ts`
- Create: `src/ui/view/quick-search/store/aiGraphStore.ts`
- Create: `src/ui/view/quick-search/components/ai-graph-view/AIGraphView.tsx`
- Modify: `src/app/context/AppContext.ts:144`

- [ ] **Step 1: Create aiGraphStore**

```ts
// src/ui/view/quick-search/store/aiGraphStore.ts
import { create } from 'zustand';
import type { LensGraphData, LensType } from '@/ui/component/mine/multi-lens-graph/types';

interface AIGraphState {
  graphData: LensGraphData | null;
  activeLens: LensType;
  loading: boolean;
  error: string | null;
  query: string;
  /** File paths when in file-selection mode. */
  selectedPaths: string[];

  setGraphData: (data: LensGraphData | null) => void;
  setActiveLens: (lens: LensType) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setQuery: (q: string) => void;
  setSelectedPaths: (paths: string[]) => void;
  reset: () => void;
}

export const useAIGraphStore = create<AIGraphState>((set) => ({
  graphData: null,
  activeLens: 'topology',
  loading: false,
  error: null,
  query: '',
  selectedPaths: [],

  setGraphData: (data) => set({ graphData: data }),
  setActiveLens: (lens) => set({ activeLens: lens }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  setQuery: (q) => set({ query: q }),
  setSelectedPaths: (paths) => set({ selectedPaths: paths }),
  reset: () => set({ graphData: null, activeLens: 'topology', loading: false, error: null, query: '', selectedPaths: [] }),
}));
```

- [ ] **Step 2: Create build-graph-data (topology from existing sources graph)**

```ts
// src/service/agents/ai-graph/build-graph-data.ts
import { buildSourcesGraphWithDiscoveredEdges } from '@/service/tools/search-graph-inspector/build-sources-graph';
import type { SearchResultItem } from '@/service/search/types';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

/**
 * Build LensGraphData from search results.
 * Phase 1: topology lens only (from existing SourcesGraph builder).
 * Phase 2: AI-inferred thinking tree + bridge + timeline lenses.
 */
export async function buildLensGraphFromSources(sources: SearchResultItem[]): Promise<LensGraphData> {
  const sg = await buildSourcesGraphWithDiscoveredEdges(sources);

  if (!sg) {
    return { nodes: [], edges: [], availableLenses: [] };
  }

  const nodes = sg.nodes.map((n) => ({
    label: n.label,
    path: n.attributes?.path ?? n.id,
    role: 'leaf' as const,
    group: (n.attributes?.path ?? n.id).split('/').slice(0, -1).join('/'),
  }));

  const edges = sg.edges.map((e) => ({
    source: e.from_node_id,
    target: e.to_node_id,
    kind: (e.kind === 'semantic' ? 'semantic' : 'link') as 'semantic' | 'link',
  }));

  return { nodes, edges, availableLenses: ['topology'] };
}
```

- [ ] **Step 3: Create AIGraphAgent scaffold**

```ts
// src/service/agents/AIGraphAgent.ts
import type { LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { AppContext } from '@/app/context/AppContext';
import { buildLensGraphFromSources } from './ai-graph/build-graph-data';

export type AIGraphEvent = LLMStreamEvent;

export class AIGraphAgent {
  constructor(private readonly aiServiceManager: AIServiceManager) {}

  /**
   * Start AI Graph construction from a query.
   * Phase 1: search vault → build topology graph → emit complete event.
   */
  async *startSession(userQuery: string): AsyncGenerator<AIGraphEvent> {
    const ctx = AppContext.getInstance();

    yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'searching' } } as any;

    // Step 1: Search vault for relevant sources
    const searchClient = ctx.searchClient;
    const results = await searchClient.search(userQuery, { limit: 30 });

    yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'building-graph' } } as any;

    // Step 2: Build graph from sources
    const graphData = await buildLensGraphFromSources(results);

    // Step 3: Emit graph data as complete event
    yield {
      type: 'ui-signal',
      channel: 'ai-graph-data',
      data: { graphData },
    } as any;

    yield { type: 'complete', result: { summary: `Built graph with ${graphData.nodes.length} nodes` } } as any;
  }

  /**
   * Build graph from a set of file paths (file-selection mode).
   */
  async *startFromPaths(paths: string[]): AsyncGenerator<AIGraphEvent> {
    yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'building-graph' } } as any;

    // Convert paths to minimal SearchResultItem shape
    const sources = paths.map((p) => ({
      id: p,
      path: p,
      title: p.split('/').pop() ?? p,
      reasoning: '',
      badges: [],
      score: { physical: 0, semantic: 0, average: 0 },
    }));

    const graphData = await buildLensGraphFromSources(sources as any);

    yield {
      type: 'ui-signal',
      channel: 'ai-graph-data',
      data: { graphData },
    } as any;

    yield { type: 'complete', result: { summary: `Built graph with ${graphData.nodes.length} nodes` } } as any;
  }
}
```

- [ ] **Step 4: Add factory method to AppContext**

In `src/app/context/AppContext.ts`, after the `vaultSearchAgent` method (~line 146):

```ts
public static aiGraphAgent(): AIGraphAgent {
    return new AIGraphAgent(AppContext.getInstance().manager);
}
```

Add import at top:
```ts
import { AIGraphAgent } from '@/service/agents/AIGraphAgent';
```

- [ ] **Step 5: Create AIGraphView placeholder**

```tsx
// src/ui/view/quick-search/components/ai-graph-view/AIGraphView.tsx
import React from 'react';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import { useAIGraphStore } from '@/ui/view/quick-search/store/aiGraphStore';
import { Loader2 } from 'lucide-react';

/**
 * Full AI Graph mode view.
 * Renders after AIGraphAgent completes — shows multi-lens graph with save button.
 */
export const AIGraphView: React.FC<{ onOpenPath: (path: string) => void }> = ({ onOpenPath }) => {
  const graphData = useAIGraphStore((s) => s.graphData);
  const loading = useAIGraphStore((s) => s.loading);

  if (loading) {
    return (
      <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-[400px] pktw-text-[#6b7280] pktw-text-sm">
        <Loader2 className="pktw-w-5 pktw-h-5 pktw-animate-spin pktw-mr-2" />
        Building knowledge graph…
      </div>
    );
  }

  return (
    <div className="pktw-h-[500px] pktw-w-full">
      <MultiLensGraph
        graphData={graphData}
        onNodeClick={onOpenPath}
        className="pktw-h-full pktw-w-full"
        showControls
        showMiniMap
      />
    </div>
  );
};
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/service/agents/AIGraphAgent.ts src/service/agents/ai-graph/ src/ui/view/quick-search/store/aiGraphStore.ts src/ui/view/quick-search/components/ai-graph-view/AIGraphView.tsx src/app/context/AppContext.ts
git commit -m "feat(ai-graph): add AIGraphAgent scaffold with topology lens, AIGraphView, aiGraphStore"
```

---

## Task 6: Bridge and Timeline Layouts

**Files:**
- Create: `src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts`
- Create: `src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts`
- Modify: `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts`

- [ ] **Step 1: Create bridge layout**

```ts
// src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts
import type { LensNodeData } from '../types';

interface LayoutInput {
  nodes: LensNodeData[];
  edges: Array<{ source: string; target: string; kind: string }>;
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

/**
 * Column layout: group nodes by folder, place each group in a vertical column.
 * Cross-group edges become visible "bridges".
 */
export function computeBridgeLayout(input: LayoutInput): LayoutResult {
  // Group by folder
  const groups = new Map<string, LensNodeData[]>();
  for (const n of input.nodes) {
    const folder = n.group || n.path.split('/').slice(0, -1).join('/') || '/';
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push(n);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const colWidth = 250;
  const rowHeight = 70;
  let colIndex = 0;

  for (const [, nodes] of groups) {
    for (let i = 0; i < nodes.length; i++) {
      positions.set(nodes[i].path, {
        x: colIndex * colWidth,
        y: i * rowHeight,
      });
    }
    colIndex++;
  }

  return { positions };
}
```

- [ ] **Step 2: Create timeline layout**

```ts
// src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts
import type { LensNodeData } from '../types';

interface LayoutInput {
  nodes: LensNodeData[];
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

/**
 * Horizontal timeline: x = time (created or modified), y = staggered to avoid overlap.
 */
export function computeTimelineLayout(input: LayoutInput): LayoutResult {
  const sorted = [...input.nodes].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  if (sorted.length === 0) return { positions: new Map() };

  const minTime = sorted[0].createdAt ?? 0;
  const maxTime = sorted[sorted.length - 1].createdAt ?? 1;
  const timeRange = maxTime - minTime || 1;
  const canvasWidth = Math.max(800, sorted.length * 120);

  const positions = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i].createdAt ?? 0;
    const x = ((t - minTime) / timeRange) * canvasWidth;
    // Stagger y to reduce overlap
    const y = (i % 3) * 80 + 40;
    positions.set(sorted[i].path, { x, y });
  }

  return { positions };
}
```

- [ ] **Step 3: Wire bridge and timeline into useLensLayout**

In `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts`, replace the placeholder cases:

```ts
import { computeBridgeLayout } from '../layouts/bridge-layout';
import { computeTimelineLayout } from '../layouts/timeline-layout';

// In the switch:
case 'bridge':
  positions = computeBridgeLayout({ nodes: graphData.nodes, edges: graphData.edges }).positions;
  break;
case 'timeline':
  positions = computeTimelineLayout({ nodes: graphData.nodes }).positions;
  break;
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/layouts/bridge-layout.ts src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts
git commit -m "feat(ai-graph): add bridge (column) and timeline layouts"
```

---

## Task 7: AI-Inferred Thinking Tree

**Files:**
- Create: `src/service/agents/ai-graph/infer-thinking-tree.ts`
- Modify: `src/service/agents/ai-graph/build-graph-data.ts`
- Modify: `src/service/agents/AIGraphAgent.ts`

- [ ] **Step 1: Create thinking tree inference prompt and function**

```ts
// src/service/agents/ai-graph/infer-thinking-tree.ts
import { AppContext } from '@/app/context/AppContext';
import type { LensNodeData } from '@/ui/component/mine/multi-lens-graph/types';

interface TreeInferenceInput {
  files: Array<{ path: string; title: string; firstLines: string }>;
}

interface TreeInferenceResult {
  nodes: Array<{
    path: string;
    label: string;
    parentPath: string | null;
    level: number;
    role: 'root' | 'hub' | 'bridge' | 'leaf';
    summary: string;
  }>;
}

const SYSTEM_PROMPT = `You analyze document relationships and infer a thinking tree structure.
Given a set of documents with their titles and first few lines, determine:
1. Which document is the root (the starting point / index / overview)
2. Parent-child relationships (which doc elaborates on which)
3. The depth level of each document (0 = root)
4. Each document's role: root, hub (connects many children), bridge (connects different topics), leaf (endpoint)

Output JSON only, no explanation.`;

const USER_PROMPT_TEMPLATE = `Analyze these documents and infer their hierarchical thinking tree:

{{FILES}}

Output format:
{
  "nodes": [
    { "path": "...", "label": "short title", "parentPath": null or "parent path", "level": 0, "role": "root|hub|bridge|leaf", "summary": "one line summary" }
  ]
}`;

export async function inferThinkingTree(input: TreeInferenceInput): Promise<TreeInferenceResult> {
  const filesText = input.files
    .map((f) => `### ${f.path}\nTitle: ${f.title}\n${f.firstLines}`)
    .join('\n\n');

  const prompt = USER_PROMPT_TEMPLATE.replace('{{FILES}}', filesText);

  const ctx = AppContext.getInstance();
  const provider = ctx.manager.getDefaultProvider();
  if (!provider) throw new Error('No AI provider available');

  const response = await provider.generateText({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2000,
    temperature: 0.3,
  });

  const text = typeof response === 'string' ? response : response.text;
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { nodes: [] };

  try {
    return JSON.parse(jsonMatch[0]) as TreeInferenceResult;
  } catch {
    return { nodes: [] };
  }
}
```

- [ ] **Step 2: Update build-graph-data to include thinking tree**

In `src/service/agents/ai-graph/build-graph-data.ts`, add:

```ts
import { inferThinkingTree } from './infer-thinking-tree';
import { AppContext } from '@/app/context/AppContext';

/**
 * Enrich LensGraphData with AI-inferred thinking tree structure.
 * Called on-demand when user switches to thinking-tree lens.
 */
export async function enrichWithThinkingTree(baseData: LensGraphData): Promise<LensGraphData> {
  const ctx = AppContext.getInstance();
  const app = ctx.app;

  // Read first 500 chars of each file for inference
  const files = await Promise.all(
    baseData.nodes.map(async (n) => {
      const file = app.vault.getAbstractFileByPath(n.path);
      if (!file || !('extension' in file)) return { path: n.path, title: n.label, firstLines: '' };
      const content = await app.vault.cachedRead(file as any);
      return { path: n.path, title: n.label, firstLines: content.slice(0, 500) };
    }),
  );

  const tree = await inferThinkingTree({ files });

  if (tree.nodes.length === 0) return baseData;

  // Merge tree info into existing nodes
  const treeMap = new Map(tree.nodes.map((n) => [n.path, n]));
  const enrichedNodes = baseData.nodes.map((n) => {
    const t = treeMap.get(n.path);
    if (!t) return n;
    return { ...n, label: t.label || n.label, level: t.level, parentId: t.parentPath ?? undefined, role: t.role, summary: t.summary };
  });

  // Build derives edges from parent-child
  const derivesEdges = tree.nodes
    .filter((n) => n.parentPath)
    .map((n) => ({ source: n.parentPath!, target: n.path, kind: 'derives' as const }));

  const allEdges = [...baseData.edges, ...derivesEdges];
  const availableLenses = [...new Set([...baseData.availableLenses, 'thinking-tree' as const])];

  return { nodes: enrichedNodes, edges: allEdges, availableLenses };
}
```

- [ ] **Step 3: Update AIGraphAgent to support on-demand lens enrichment**

In `AIGraphAgent.ts`, add a method:

```ts
/**
 * Enrich existing graph data with AI-inferred thinking tree.
 * Called when user switches to thinking-tree lens for the first time.
 */
async enrichThinkingTree(currentData: LensGraphData): Promise<LensGraphData> {
  const { enrichWithThinkingTree } = await import('./ai-graph/build-graph-data');
  return enrichWithThinkingTree(currentData);
}
```

- [ ] **Step 4: Wire on-demand enrichment in AIGraphView**

In `AIGraphView.tsx`, add logic to trigger thinking tree inference when user switches to that lens:

```tsx
// Add to AIGraphView:
const [enriching, setEnriching] = useState(false);

const handleLensChange = useCallback(async (lens: LensType) => {
  const store = useAIGraphStore.getState();
  const data = store.graphData;
  if (!data) return;

  if (lens === 'thinking-tree' && !data.availableLenses.includes('thinking-tree')) {
    setEnriching(true);
    try {
      const agent = AppContext.aiGraphAgent();
      const enriched = await agent.enrichThinkingTree(data);
      store.setGraphData(enriched);
    } finally {
      setEnriching(false);
    }
  }
}, []);
```

Pass `onLensChange` to `MultiLensGraph` — add an `onLensChange?: (lens: LensType) => void` prop to MultiLensGraph and call it in the lens switcher button onClick (alongside `setActiveLens`).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/service/agents/ai-graph/infer-thinking-tree.ts src/service/agents/ai-graph/build-graph-data.ts src/service/agents/AIGraphAgent.ts src/ui/view/quick-search/components/ai-graph-view/AIGraphView.tsx src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx
git commit -m "feat(ai-graph): add AI-inferred thinking tree with on-demand enrichment"
```

---

## Task 8: Markdown Persistence

**Files:**
- Create: `src/core/storage/vault/search-docs/AiGraphDoc.ts`
- Modify: `src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts`
- Modify: `src/ui/view/quick-search/components/ai-graph-view/AIGraphView.tsx`

- [ ] **Step 1: Create AiGraphDoc builder/parser**

```ts
// src/core/storage/vault/search-docs/AiGraphDoc.ts
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import { aiGraphDocSchema, type AiGraphDocData } from '@/core/schemas/ai-graph-schemas';

interface AiGraphDocModel {
  query: string;
  created: string;
  summary: string;
  graphData: LensGraphData;
  lensHint?: string;
}

export function buildAiGraphMarkdown(model: AiGraphDocModel): string {
  const lines: string[] = [
    '---',
    `type: ai-graph`,
    `query: "${model.query.replace(/"/g, '\\"')}"`,
    `created: ${model.created}`,
    `lens: ${model.lensHint ?? 'topology'}`,
    `sources: ${model.graphData.nodes.length}`,
    '---',
    '',
    `## AI Graph: ${model.query}`,
    '',
    '### Summary',
    model.summary,
    '',
    '### Graph Data',
    '```json',
    JSON.stringify({
      nodes: model.graphData.nodes.map((n) => ({
        id: n.path,
        label: n.label,
        path: n.path,
        role: n.role,
        group: n.group,
        level: n.level,
        parentId: n.parentId,
        summary: n.summary,
      })),
      edges: model.graphData.edges.map((e) => ({
        source: e.source,
        target: e.target,
        kind: e.kind,
        weight: e.weight,
        label: e.label,
      })),
      lensHint: model.lensHint ?? 'topology',
    }, null, 2),
    '```',
    '',
    '### Sources',
    ...model.graphData.nodes.map((n) => `- [[${n.path}]] — ${n.summary ?? n.label}`),
    '',
  ];
  return lines.join('\n');
}

export function parseAiGraphMarkdown(content: string): AiGraphDocData | null {
  const jsonMatch = content.match(/```json\n([\s\S]*?)```/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return aiGraphDocSchema.parse(parsed);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add saveAiGraphToMarkdown export**

In `src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts`, add:

```ts
import { buildAiGraphMarkdown } from '@/core/storage/vault/search-docs/AiGraphDoc';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

export async function saveAiGraphToMarkdown(params: {
  folderPath: string;
  fileName: string;
  query: string;
  summary: string;
  graphData: LensGraphData;
  lensHint?: string;
}): Promise<{ path: string }> {
  const ctx = AppContext.getInstance();
  const app = ctx.app;
  const folder = params.folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const fileName = sanitizeFileName(params.fileName || 'AI Graph');
  const fullFolderPath = folder.length ? folder : '';
  const filePath = fullFolderPath ? `${fullFolderPath}/${fileName}.md` : `${fileName}.md`;

  if (fullFolderPath) {
    await ensureFolder(fullFolderPath);
  }

  const content = buildAiGraphMarkdown({
    query: params.query,
    created: new Date().toISOString(),
    summary: params.summary,
    graphData: params.graphData,
    lensHint: params.lensHint,
  });

  const existing = app.vault.getAbstractFileByPath(filePath);
  let finalPath = filePath;
  if (existing) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    finalPath = fullFolderPath ? `${fullFolderPath}/${fileName}-${ts}.md` : `${fileName}-${ts}.md`;
  }
  await app.vault.create(finalPath, content);
  return { path: finalPath };
}
```

- [ ] **Step 3: Add save button to AIGraphView**

In `AIGraphView.tsx`, add a save button:

```tsx
import { Button } from '@/ui/component/shadcn/button';
import { Save } from 'lucide-react';
import { saveAiGraphToMarkdown } from '@/ui/view/quick-search/callbacks/save-ai-analyze-to-md';

// Inside AIGraphView, after the MultiLensGraph:
const handleSave = async () => {
  const { graphData, query, activeLens } = useAIGraphStore.getState();
  if (!graphData) return;
  const result = await saveAiGraphToMarkdown({
    folderPath: 'ai-analysis',
    fileName: `AI Graph - ${query.slice(0, 40)}`,
    query,
    summary: `Knowledge graph with ${graphData.nodes.length} nodes across ${graphData.availableLenses.length} lenses.`,
    graphData,
    lensHint: activeLens,
  });
  new Notice(`AI Graph saved to ${result.path}`);
};

// Render save button in the toolbar area:
<div className="pktw-flex pktw-justify-end pktw-p-2">
  <Button variant="outline" size="sm" onClick={handleSave} className="pktw-gap-1">
    <Save className="pktw-w-3.5 pktw-h-3.5" />
    Save to vault
  </Button>
</div>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage/vault/search-docs/AiGraphDoc.ts src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts src/ui/view/quick-search/components/ai-graph-view/AIGraphView.tsx
git commit -m "feat(ai-graph): add markdown persistence with save-to-vault"
```

---

## Task 9: Wire AI Graph Mode into Search Session

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts`
- Modify: `src/ui/view/quick-search/components/ai-analysis-state/CompletedAIAnalysis.tsx`
- Modify: `src/ui/view/quick-search/components/ai-analysis-state/StreamingAnalysis.tsx` (if exists)

- [ ] **Step 1: Route aiGraph events to aiGraphStore**

In `useSearchSession.ts`, update the `routeEvent` function or add a new handler in the `aiGraph` branch. The AI Graph agent emits `ui-signal` events with `channel: 'ai-graph-data'`:

```ts
// In the aiGraph branch of performAnalysis (from Task 2 Step 3):
if (analysisMode === 'aiGraph') {
    const agent = AppContext.aiGraphAgent();
    useAIGraphStore.getState().setLoading(true);
    useAIGraphStore.getState().setQuery(searchQuery);

    for await (const event of agent.startSession(searchQuery)) {
        if (signal?.aborted) break;
        if (event.type === 'ui-signal' && (event as any).channel === 'ai-graph-data') {
            useAIGraphStore.getState().setGraphData((event as any).data.graphData);
        }
    }

    useAIGraphStore.getState().setLoading(false);
    store.getState().markCompleted();
    markAIAnalysisCompleted();
    return;
}
```

Add import at top:
```ts
import { useAIGraphStore } from '../store/aiGraphStore';
```

- [ ] **Step 2: Render AIGraphView in completed state**

In `CompletedAIAnalysis.tsx`, add conditional rendering when `runAnalysisMode === 'aiGraph'`:

```tsx
import { AIGraphView } from '../ai-graph-view/AIGraphView';

// Near the top of the component body, before the existing report sections:
if (runAnalysisMode === 'aiGraph') {
    return (
        <div className="pktw-space-y-4 pktw-p-4">
            <AIGraphView onOpenPath={(path) => { /* open file */ }} />
        </div>
    );
}
```

- [ ] **Step 3: Verify build and integration test**

Run: `npm run build`
Expected: Build succeeds. In Obsidian, switch to AI Graph preset, type a query, press Enter. Should see loading → topology graph.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/hooks/useSearchSession.ts src/ui/view/quick-search/components/ai-analysis-state/CompletedAIAnalysis.tsx
git commit -m "feat(ai-graph): wire AI Graph mode into search session, render AIGraphView on completion"
```

---

## Task 10: Cross-Domain Bridge Enrichment

**Files:**
- Create: `src/service/agents/ai-graph/infer-cross-domain.ts`
- Modify: `src/service/agents/ai-graph/build-graph-data.ts`

- [ ] **Step 1: Create cross-domain inference (algorithmic, no AI call)**

```ts
// src/service/agents/ai-graph/infer-cross-domain.ts
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

/**
 * Enrich graph with cross-domain bridge info.
 * Groups nodes by top-level folder, marks cross-group semantic edges as 'cross-domain',
 * and identifies bridge nodes (nodes with edges to 2+ different groups).
 */
export function enrichWithCrossDomain(data: LensGraphData): LensGraphData {
  // Assign groups by top-level folder
  const getTopFolder = (path: string): string => {
    const parts = path.split('/');
    return parts.length > 1 ? parts[0] : '/';
  };

  const nodeGroups = new Map<string, string>();
  const enrichedNodes = data.nodes.map((n) => {
    const group = getTopFolder(n.path);
    nodeGroups.set(n.path, group);
    return { ...n, group };
  });

  // Mark cross-group edges
  const enrichedEdges = data.edges.map((e) => {
    const srcGroup = nodeGroups.get(e.source);
    const tgtGroup = nodeGroups.get(e.target);
    if (srcGroup && tgtGroup && srcGroup !== tgtGroup) {
      return { ...e, kind: 'cross-domain' as const };
    }
    return e;
  });

  // Identify bridge nodes: connected to 2+ groups
  const nodeGroupConnections = new Map<string, Set<string>>();
  for (const e of enrichedEdges) {
    const srcGroup = nodeGroups.get(e.source);
    const tgtGroup = nodeGroups.get(e.target);
    if (!nodeGroupConnections.has(e.source)) nodeGroupConnections.set(e.source, new Set());
    if (!nodeGroupConnections.has(e.target)) nodeGroupConnections.set(e.target, new Set());
    if (srcGroup) nodeGroupConnections.get(e.source)!.add(srcGroup);
    if (tgtGroup) nodeGroupConnections.get(e.source)!.add(tgtGroup);
    if (srcGroup) nodeGroupConnections.get(e.target)!.add(srcGroup);
    if (tgtGroup) nodeGroupConnections.get(e.target)!.add(tgtGroup);
  }

  const finalNodes = enrichedNodes.map((n) => {
    const groups = nodeGroupConnections.get(n.path);
    if (groups && groups.size >= 2 && n.role !== 'root' && n.role !== 'hub') {
      return { ...n, role: 'bridge' as const };
    }
    return n;
  });

  const availableLenses = [...new Set([...data.availableLenses, 'bridge' as const])];

  return { nodes: finalNodes, edges: enrichedEdges, availableLenses };
}
```

- [ ] **Step 2: Wire into build-graph-data**

In `build-graph-data.ts`, call `enrichWithCrossDomain` in `buildLensGraphFromSources`:

```ts
import { enrichWithCrossDomain } from './infer-cross-domain';

// At the end of buildLensGraphFromSources, before return:
const withBridges = enrichWithCrossDomain(baseResult);
return withBridges;
```

This makes the bridge lens available by default (no extra AI call needed).

- [ ] **Step 3: Add timeline data enrichment**

Also in `buildLensGraphFromSources`, enrich nodes with file timestamps:

```ts
// After building initial nodes, before enrichWithCrossDomain:
const ctx = AppContext.getInstance();
const app = ctx.app;
const nodesWithTime = await Promise.all(nodes.map(async (n) => {
  const file = app.vault.getAbstractFileByPath(n.path);
  if (file && 'stat' in file) {
    const stat = (file as any).stat;
    return { ...n, createdAt: stat.ctime, modifiedAt: stat.mtime };
  }
  return n;
}));

// Use nodesWithTime instead of nodes for the rest
// And add 'timeline' to availableLenses
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds. All 4 lenses should now have data available.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/ai-graph/infer-cross-domain.ts src/service/agents/ai-graph/build-graph-data.ts
git commit -m "feat(ai-graph): add cross-domain bridge enrichment and timeline data"
```

---

## Summary

| Task | What it delivers | Depends on |
|------|-----------------|------------|
| 1 | Types, schemas, AnalysisMode simplification | — |
| 2 | Updated preset selector UI (2 presets) | 1 |
| 3 | MultiLensGraph React Flow component (topology + tree layouts) | 1 |
| 4 | Replace D3 Canvas graph in Sources section | 3 |
| 5 | AIGraphAgent scaffold + AIGraphView + store | 1, 3 |
| 6 | Bridge + Timeline layouts | 3 |
| 7 | AI-inferred thinking tree (on-demand) | 5 |
| 8 | Markdown persistence (save to vault) | 5 |
| 9 | Wire AI Graph into search session end-to-end | 2, 5 |
| 10 | Cross-domain bridge enrichment + timeline data | 5, 6 |

Critical path: **1 → 2 → 5 → 9** (gets AI Graph mode running end-to-end).
Parallel track: **1 → 3 → 4** (gets MultiLensGraph into Sources section) and **3 → 6** (remaining layouts).
