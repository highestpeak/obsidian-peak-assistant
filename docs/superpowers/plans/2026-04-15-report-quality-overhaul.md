# Report Quality Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AI search report from shallow, fragmented Mermaid-heavy output into a deep, coherent, citation-rich report with reliable JSON→React visualizations.

**Architecture:** Three-phase overhaul: (1) Remove artificial constraints that cap report depth, (2) Replace Mermaid-based Visual Agent with a JSON schema → React component pipeline using `@xyflow/react` and `recharts`, (3) Improve content quality via inline citations, better evidence reading, and a post-generation summary that synthesizes actual findings.

**Tech Stack:** React 18, Zod, @xyflow/react (already installed), recharts (new), @dagrejs/dagre (new for graph auto-layout), Vercel AI SDK `streamText`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/core/schemas/report-viz-schemas.ts` | Zod schemas for all viz JSON specs (graph, bar, table, timeline) |
| `src/ui/view/quick-search/components/viz/VizRenderer.tsx` | Dispatcher: switch on `vizType` → render correct component |
| `src/ui/view/quick-search/components/viz/RelationshipGraph.tsx` | @xyflow/react wrapper with dagre auto-layout |
| `src/ui/view/quick-search/components/viz/DataChart.tsx` | Recharts bar chart wrapper |
| `src/ui/view/quick-search/components/viz/StyledTable.tsx` | Styled comparison table with optional highlight column |
| `src/ui/view/quick-search/components/viz/TimelineViz.tsx` | Vertical timeline component (CSS-only, no deps) |
| `templates/prompts/ai-analysis-report-viz-json-system.md` | New Visual Agent system prompt (JSON output, not Mermaid) |
| `templates/prompts/ai-analysis-report-viz-json.md` | New Visual Agent user prompt template |
| `test/report-viz-schemas.test.ts` | Tests for Zod schema validation |

### Modified Files

| File | What Changes |
|------|-------------|
| `src/service/agents/report/ReportOrchestrator.ts` | Remove token caps, reorder summary after content, new visual pipeline |
| `src/ui/view/quick-search/store/searchSessionStore.ts:47-61` | Add `vizData` field to `V2Section` |
| `src/ui/view/quick-search/components/V2ReportView.tsx:125,201` | Render `VizRenderer` below section content |
| `templates/prompts/ai-analysis-report-section-system.md:38,52` | Remove word limit, add citation rules, update viz instructions |
| `templates/prompts/ai-analysis-vault-report-summary-system.md:6` | Remove word limit |
| `templates/prompts/ai-analysis-vault-report-summary.md` | Receive actual section content instead of briefs |
| `src/service/prompt/PromptId.ts` | Add new viz JSON prompt IDs |
| `src/core/template/TemplateRegistry.ts` | Register new viz JSON templates |
| `package.json` | Add `recharts`, `@dagrejs/dagre` |

### Dependency Graph

```
Task 1 (remove limits) ─────────┐
Task 2 (summary after content) ─┤
Task 3 (inline citations) ──────┤── all independent, can run in parallel
Task 9 (evidence reading) ──────┘
Task 4 (Zod schemas) → Task 5 (React viz components) → Task 7 (wire orchestrator) → Task 8 (render in UI)
Task 6 (JSON viz prompts) → Task 7
```

---

## Task 1: Remove Artificial Constraints

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section-system.md:52`
- Modify: `templates/prompts/ai-analysis-vault-report-summary-system.md:6`
- Modify: `src/service/agents/report/ReportOrchestrator.ts:113,313,511`

- [ ] **Step 1: Remove word count limit from section system prompt**

In `templates/prompts/ai-analysis-report-section-system.md`, replace line 52:

```markdown
OLD:
- **100-180 words**. Every sentence must carry new information. Prefer tables and structured formats over prose.

NEW:
- Every sentence must carry new information. Let section complexity determine length — short sections are fine, deep analysis can be longer. Prefer tables and structured formats for comparisons and enumerations.
```

- [ ] **Step 2: Remove word count limit from summary system prompt**

In `templates/prompts/ai-analysis-vault-report-summary-system.md`, replace line 6:

```markdown
OLD:
- 写约 150-250 字的连续散文，不用项目符号列表。简洁有力，每句话都带来新信息

NEW:
- 连续散文，不用项目符号列表。简洁有力，每句话都带来新信息。篇幅由发现的复杂度决定，不需要人为限制字数
```

- [ ] **Step 3: Raise maxTokens caps in ReportOrchestrator**

In `src/service/agents/report/ReportOrchestrator.ts`:

Line 113 (`generateReport` fast-path):
```ts
// OLD
maxTokens: 800,
// NEW
maxTokens: 4096,
```

Line 313 (`streamSectionContent`):
```ts
// OLD
maxTokens: 800,
// NEW
maxTokens: 4096,
```

Line 511 (`runSummaryAgent`):
```ts
// OLD
maxTokens: 600,
// NEW
maxTokens: 2048,
```

- [ ] **Step 4: Build and verify no compilation errors**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add templates/prompts/ai-analysis-report-section-system.md \
      templates/prompts/ai-analysis-vault-report-summary-system.md \
      src/service/agents/report/ReportOrchestrator.ts
git commit -m "feat(report): remove artificial word/token limits for deeper analysis"
```

---

## Task 2: Fix Summary Generation Order (Summary After Content)

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts:121,477-530`
- Modify: `templates/prompts/ai-analysis-vault-report-summary.md`

Currently `runSummaryAgent` runs in parallel with section content and can only see `section.brief`. The summary should run after all sections complete, synthesizing actual generated content.

- [ ] **Step 1: Update summary template to receive actual section content**

Replace `templates/prompts/ai-analysis-vault-report-summary.md` entirely:

```markdown
## User Query
{{{userQuery}}}

## Research Plan (what was investigated)
{{{reportPlan}}}

## Generated Section Content
{{#each sections}}
### {{this.title}}
{{this.content}}

{{/each}}

## Evidence Sources Referenced
{{{evidenceList}}}

Write a concise executive summary (flowing prose, answer-first) that synthesizes the key findings from the sections above. No references or citations. CRITICAL: Write in the SAME LANGUAGE as the User Query.
```

- [ ] **Step 2: Move summary generation to after content completion**

In `src/service/agents/report/ReportOrchestrator.ts`, change the `generateReport` method. Replace the parallel summary+content block (around lines 121–151):

```ts
// OLD (summary runs in parallel — can only see briefs):
const summaryPromise = this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);
const contentPromises = streams.map(async ({ sec, result, controller }) => { ... });
await Promise.all([summaryPromise, ...contentPromises]);

// NEW (summary runs after content — sees actual generated text):
const contentPromises = streams.map(async ({ sec, result, controller }) => { ... });
await Promise.all(contentPromises);

// Now run summary with actual section content
await this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);
```

- [ ] **Step 3: Update runSummaryAgent to pass actual section content**

In `runSummaryAgent` (around line 487), replace the `blocksSummary` construction and render call:

```ts
// OLD:
const currentSections = this.store.getState().v2PlanSections;
const blocksSummary = currentSections
    .map((sec) => `### ${sec.title}\n${sec.brief}`)
    .join('\n\n');
// ... render with { userQuery, reportPlan: overview, blocksSummary, evidenceList }

// NEW:
const currentSections = this.store.getState().v2PlanSections;
const evidenceList = allEvidencePaths
    .map((p) => `- [[${p.replace(/\.md$/, '')}]]`)
    .join('\n');

const [systemPrompt, userMessage] = await Promise.all([
    this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummarySystem, {}),
    this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummary, {
        userQuery,
        reportPlan: overview,
        sections: currentSections.map((s) => ({ title: s.title, content: s.content })),
        evidenceList,
    }),
]);
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/report/ReportOrchestrator.ts \
      templates/prompts/ai-analysis-vault-report-summary.md
git commit -m "feat(report): generate summary after content for deeper synthesis"
```

---

## Task 3: Add Inline Citations to Section Prompts

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section-system.md:30-35`

- [ ] **Step 1: Replace the evidence use section with citation rules**

In `templates/prompts/ai-analysis-report-section-system.md`, replace the `# EVIDENCE USE` section (lines 30–35):

```markdown
OLD:
# EVIDENCE USE

- Base claims on provided evidence. Mark unsupported claims **(speculation)**.
- Do NOT include [[wikilinks]], citations, or reference sections. The UI handles sources separately.
- Never fabricate paths or URLs.

NEW:
# EVIDENCE USE & CITATIONS

- Base claims on provided evidence. Mark unsupported claims **(speculation)**.
- **Inline citations (CRITICAL)**: When a claim comes from a specific note, cite it inline using `[[note name]]` wikilink syntax. Example: "向量搜索的召回率约 85%[[search-benchmark-2024]]". Place the wikilink immediately after the claim, before the period.
- Use the note names from the evidence section headings (`### [[note name]]`). Do NOT fabricate note names.
- Do NOT add a separate references/bibliography section — inline wikilinks are sufficient.
- If a claim synthesizes multiple notes, cite the most relevant one.
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds (template-only change).

- [ ] **Step 3: Commit**

```bash
git add templates/prompts/ai-analysis-report-section-system.md
git commit -m "feat(report): add inline wikilink citations to section prompts"
```

---

## Task 4: Define Viz JSON Schemas (Zod)

**Files:**
- Create: `src/core/schemas/report-viz-schemas.ts`
- Create: `test/report-viz-schemas.test.ts`

- [ ] **Step 1: Write tests for viz schemas**

Create `test/report-viz-schemas.test.ts`:

```ts
import { describe, it, assert } from './test-utils';
import {
    vizSpecSchema,
    type VizSpec,
} from '../src/core/schemas/report-viz-schemas';

describe('report-viz-schemas', () => {
    it('accepts valid graph spec', () => {
        const data: VizSpec = {
            vizType: 'graph',
            title: 'Concept relationships',
            data: {
                nodes: [
                    { id: 'n1', label: 'Node A' },
                    { id: 'n2', label: 'Node B', group: 'cluster1' },
                ],
                edges: [
                    { source: 'n1', target: 'n2', label: 'relates to' },
                ],
            },
        };
        const result = vizSpecSchema.safeParse(data);
        assert(result.success, `Should accept valid graph: ${result.error?.message}`);
    });

    it('accepts valid bar chart spec', () => {
        const data: VizSpec = {
            vizType: 'bar',
            title: 'Feature comparison',
            data: {
                items: [
                    { name: 'Product A', value: 85 },
                    { name: 'Product B', value: 72 },
                ],
                xLabel: 'Product',
                yLabel: 'Score',
            },
        };
        const result = vizSpecSchema.safeParse(data);
        assert(result.success, `Should accept valid bar chart: ${result.error?.message}`);
    });

    it('accepts valid comparison table spec', () => {
        const data: VizSpec = {
            vizType: 'table',
            title: 'Options comparison',
            data: {
                headers: ['Feature', 'Option A', 'Option B'],
                rows: [
                    ['Price', '$10', '$20'],
                    ['Speed', 'Fast', 'Slow'],
                ],
                highlightColumn: 1,
            },
        };
        const result = vizSpecSchema.safeParse(data);
        assert(result.success, `Should accept valid table: ${result.error?.message}`);
    });

    it('accepts valid timeline spec', () => {
        const data: VizSpec = {
            vizType: 'timeline',
            title: 'Project milestones',
            data: {
                events: [
                    { date: '2024-01', title: 'Kick-off', description: 'Project started' },
                    { date: '2024-06', title: 'MVP', description: 'First release' },
                ],
            },
        };
        const result = vizSpecSchema.safeParse(data);
        assert(result.success, `Should accept valid timeline: ${result.error?.message}`);
    });

    it('rejects unknown vizType', () => {
        const data = { vizType: 'unknown', title: 'test', data: {} };
        const result = vizSpecSchema.safeParse(data);
        assert(!result.success, 'Should reject unknown vizType');
    });

    it('rejects graph with no nodes', () => {
        const data = {
            vizType: 'graph',
            title: 'Empty',
            data: { nodes: [], edges: [] },
        };
        const result = vizSpecSchema.safeParse(data);
        assert(!result.success, 'Should reject empty graph');
    });

    it('rejects bar chart with no items', () => {
        const data = {
            vizType: 'bar',
            title: 'Empty',
            data: { items: [] },
        };
        const result = vizSpecSchema.safeParse(data);
        assert(!result.success, 'Should reject empty bar chart');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/report-viz-schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the viz schemas**

Create `src/core/schemas/report-viz-schemas.ts`:

```ts
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Graph (relationship/concept map) — rendered by @xyflow/react + dagre
// ---------------------------------------------------------------------------

export const graphNodeSchema = z.object({
    id: z.string(),
    label: z.string().max(40),
    group: z.string().optional(),
});

export const graphEdgeSchema = z.object({
    source: z.string(),
    target: z.string(),
    label: z.string().max(30).optional(),
});

export const graphVizDataSchema = z.object({
    nodes: z.array(graphNodeSchema).min(2).max(20),
    edges: z.array(graphEdgeSchema).max(30),
});

// ---------------------------------------------------------------------------
// Bar / Line chart — rendered by recharts
// ---------------------------------------------------------------------------

export const chartItemSchema = z.object({
    name: z.string(),
    value: z.number(),
    value2: z.number().optional(),
});

export const barChartDataSchema = z.object({
    items: z.array(chartItemSchema).min(1).max(20),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    y2Label: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Comparison table — rendered by custom StyledTable
// ---------------------------------------------------------------------------

export const comparisonTableDataSchema = z.object({
    headers: z.array(z.string()).min(2).max(10),
    rows: z.array(z.array(z.string()).min(1)).min(1).max(20),
    highlightColumn: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Timeline — rendered by custom TimelineViz
// ---------------------------------------------------------------------------

export const timelineEventSchema = z.object({
    date: z.string(),
    title: z.string().max(60),
    description: z.string().max(200).optional(),
});

export const timelineDataSchema = z.object({
    events: z.array(timelineEventSchema).min(2).max(15),
});

// ---------------------------------------------------------------------------
// Discriminated union: VizSpec
// ---------------------------------------------------------------------------

export const graphVizSpecSchema = z.object({
    vizType: z.literal('graph'),
    title: z.string(),
    data: graphVizDataSchema,
});

export const barVizSpecSchema = z.object({
    vizType: z.literal('bar'),
    title: z.string(),
    data: barChartDataSchema,
});

export const tableVizSpecSchema = z.object({
    vizType: z.literal('table'),
    title: z.string(),
    data: comparisonTableDataSchema,
});

export const timelineVizSpecSchema = z.object({
    vizType: z.literal('timeline'),
    title: z.string(),
    data: timelineDataSchema,
});

export const vizSpecSchema = z.discriminatedUnion('vizType', [
    graphVizSpecSchema,
    barVizSpecSchema,
    tableVizSpecSchema,
    timelineVizSpecSchema,
]);

export type GraphVizData = z.infer<typeof graphVizDataSchema>;
export type BarChartData = z.infer<typeof barChartDataSchema>;
export type ComparisonTableData = z.infer<typeof comparisonTableDataSchema>;
export type TimelineData = z.infer<typeof timelineDataSchema>;
export type VizSpec = z.infer<typeof vizSpecSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- test/report-viz-schemas.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/schemas/report-viz-schemas.ts test/report-viz-schemas.test.ts
git commit -m "feat(report): add Zod schemas for JSON-based visualization specs"
```

---

## Task 5: Install Dependencies & Create React Viz Components

**Files:**
- Modify: `package.json`
- Create: `src/ui/view/quick-search/components/viz/VizRenderer.tsx`
- Create: `src/ui/view/quick-search/components/viz/RelationshipGraph.tsx`
- Create: `src/ui/view/quick-search/components/viz/DataChart.tsx`
- Create: `src/ui/view/quick-search/components/viz/StyledTable.tsx`
- Create: `src/ui/view/quick-search/components/viz/TimelineViz.tsx`

- [ ] **Step 1: Install recharts and dagre**

```bash
npm install recharts @dagrejs/dagre
npm install -D @types/dagre
```

- [ ] **Step 2: Create StyledTable component**

Create `src/ui/view/quick-search/components/viz/StyledTable.tsx`:

```tsx
import React from 'react';
import type { ComparisonTableData } from '@/core/schemas/report-viz-schemas';

export const StyledTable: React.FC<{ data: ComparisonTableData; title: string }> = ({ data, title }) => {
    return (
        <div className="pktw-overflow-x-auto pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-mb-1.5 pktw-block">{title}</span>
            <table className="pktw-w-full pktw-text-sm pktw-border-collapse">
                <thead>
                    <tr>
                        {data.headers.map((h, i) => (
                            <th
                                key={i}
                                className={`pktw-px-3 pktw-py-2 pktw-text-left pktw-font-semibold pktw-text-[#374151] pktw-border-b-2 pktw-border-[#e5e7eb] pktw-bg-[#f3f4f6] ${
                                    data.highlightColumn === i ? 'pktw-bg-[#ede9fe]' : ''
                                }`}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.rows.map((row, ri) => (
                        <tr key={ri} className="pktw-border-b pktw-border-[#f3f4f6] hover:pktw-bg-[#f9fafb]">
                            {row.map((cell, ci) => (
                                <td
                                    key={ci}
                                    className={`pktw-px-3 pktw-py-2 pktw-text-[#4b5563] ${
                                        data.highlightColumn === ci ? 'pktw-bg-[#f5f3ff] pktw-font-medium' : ''
                                    }`}
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
```

- [ ] **Step 3: Create TimelineViz component**

Create `src/ui/view/quick-search/components/viz/TimelineViz.tsx`:

```tsx
import React from 'react';
import type { TimelineData } from '@/core/schemas/report-viz-schemas';

export const TimelineViz: React.FC<{ data: TimelineData; title: string }> = ({ data, title }) => {
    return (
        <div className="pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-mb-2 pktw-block">{title}</span>
            <div className="pktw-relative pktw-pl-6">
                {/* Vertical line */}
                <div className="pktw-absolute pktw-left-2 pktw-top-1 pktw-bottom-1 pktw-w-0.5 pktw-bg-[#e5e7eb] pktw-rounded-full" />
                {data.events.map((evt, i) => (
                    <div key={i} className="pktw-relative pktw-pb-4 last:pktw-pb-0">
                        {/* Dot */}
                        <div className="pktw-absolute pktw-left-[-18px] pktw-top-1.5 pktw-w-2.5 pktw-h-2.5 pktw-rounded-full pktw-bg-[#7c3aed] pktw-border-2 pktw-border-white pktw-shadow-sm" />
                        <span className="pktw-text-xs pktw-font-mono pktw-text-[#9ca3af]">{evt.date}</span>
                        <span className="pktw-block pktw-text-sm pktw-font-semibold pktw-text-[#374151] pktw-mt-0.5">{evt.title}</span>
                        {evt.description && (
                            <span className="pktw-block pktw-text-xs pktw-text-[#6b7280] pktw-mt-0.5">{evt.description}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
```

- [ ] **Step 4: Create DataChart component**

Create `src/ui/view/quick-search/components/viz/DataChart.tsx`:

```tsx
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { BarChartData } from '@/core/schemas/report-viz-schemas';

export const DataChart: React.FC<{ data: BarChartData; title: string }> = ({ data, title }) => {
    const chartData = data.items.map((item) => ({
        name: item.name,
        value: item.value,
        ...(item.value2 !== undefined ? { value2: item.value2 } : {}),
    }));

    return (
        <div className="pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-mb-2 pktw-block">{title}</span>
            <div className="pktw-w-full" style={{ height: Math.min(300, 40 + chartData.length * 36) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                            type="number"
                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                            label={data.yLabel ? { value: data.yLabel, position: 'bottom', fontSize: 11 } : undefined}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 11, fill: '#4b5563' }}
                            width={100}
                        />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                        <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={20} />
                        {data.y2Label && <Bar dataKey="value2" fill="#60a5fa" radius={[0, 4, 4, 0]} barSize={20} />}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
```

- [ ] **Step 5: Create RelationshipGraph component**

Create `src/ui/view/quick-search/components/viz/RelationshipGraph.tsx`:

```tsx
import React, { useMemo } from 'react';
import { ReactFlow, Background, type Node, type Edge, Position } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { GraphVizData } from '@/core/schemas/report-viz-schemas';

const GROUP_COLORS: Record<string, string> = {
    default: '#7c3aed',
    cluster0: '#7c3aed', cluster1: '#2563eb', cluster2: '#059669',
    cluster3: '#d97706', cluster4: '#dc2626', cluster5: '#db2777',
};

function getGroupColor(group?: string): string {
    if (!group) return GROUP_COLORS.default;
    return GROUP_COLORS[group] ?? GROUP_COLORS.default;
}

function layoutGraph(data: GraphVizData): { nodes: Node[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });

    for (const n of data.nodes) {
        g.setNode(n.id, { width: 140, height: 40 });
    }
    for (const e of data.edges) {
        g.setEdge(e.source, e.target);
    }

    dagre.layout(g);

    const nodes: Node[] = data.nodes.map((n) => {
        const pos = g.node(n.id);
        return {
            id: n.id,
            data: { label: n.label },
            position: { x: pos.x - 70, y: pos.y - 20 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            style: {
                background: getGroupColor(n.group),
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                width: 140,
                textAlign: 'center' as const,
            },
        };
    });

    const edges: Edge[] = data.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.source,
        target: e.target,
        label: e.label ?? '',
        style: { stroke: '#d1d5db', strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: '#6b7280' },
        type: 'smoothstep',
    }));

    return { nodes, edges };
}

export const RelationshipGraph: React.FC<{ data: GraphVizData; title: string }> = ({ data, title }) => {
    const { nodes, edges } = useMemo(() => layoutGraph(data), [data]);

    const maxY = Math.max(...nodes.map((n) => n.position.y)) + 60;
    const height = Math.min(400, Math.max(200, maxY));

    return (
        <div className="pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-mb-2 pktw-block">{title}</span>
            <div className="pktw-w-full pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden" style={{ height }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    panOnDrag={false}
                    zoomOnScroll={false}
                    preventScrolling={false}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                >
                    <Background color="#f3f4f6" gap={20} />
                </ReactFlow>
            </div>
        </div>
    );
};
```

- [ ] **Step 6: Create VizRenderer dispatcher**

Create `src/ui/view/quick-search/components/viz/VizRenderer.tsx`:

```tsx
import React from 'react';
import type { VizSpec } from '@/core/schemas/report-viz-schemas';
import { StyledTable } from './StyledTable';
import { TimelineViz } from './TimelineViz';
import { DataChart } from './DataChart';
import { RelationshipGraph } from './RelationshipGraph';

export const VizRenderer: React.FC<{ spec: VizSpec }> = ({ spec }) => {
    switch (spec.vizType) {
        case 'graph':
            return <RelationshipGraph data={spec.data} title={spec.title} />;
        case 'bar':
            return <DataChart data={spec.data} title={spec.title} />;
        case 'table':
            return <StyledTable data={spec.data} title={spec.title} />;
        case 'timeline':
            return <TimelineViz data={spec.data} title={spec.title} />;
        default:
            return null;
    }
};
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Build succeeds. Components compile but are not wired in yet.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json \
      src/ui/view/quick-search/components/viz/
git commit -m "feat(report): add JSON→React viz components (graph, chart, table, timeline)"
```

---

## Task 6: New Visual Agent Prompts (JSON output)

**Files:**
- Create: `templates/prompts/ai-analysis-report-viz-json-system.md`
- Create: `templates/prompts/ai-analysis-report-viz-json.md`
- Modify: `src/service/prompt/PromptId.ts`
- Modify: `src/core/template/TemplateRegistry.ts`

- [ ] **Step 1: Create new Visual Agent system prompt**

Create `templates/prompts/ai-analysis-report-viz-json-system.md`:

```markdown
You are the **Visual Architect**. Given a report section, decide if a visualization adds value and, if so, generate a JSON spec.

# DECISION FRAMEWORK

Ask yourself: "Does this section contain spatial, relational, comparative, or temporal information that text alone cannot convey efficiently?" If NO, output `{"skip": true}`.

# AVAILABLE VISUALIZATION TYPES

| vizType | When to use | Data shape |
|---------|-------------|------------|
| `graph` | Concepts/entities with relationships, cause-effect, dependencies | `{ nodes: [{id, label, group?}], edges: [{source, target, label?}] }` |
| `bar` | Ranking, scoring, frequency, quantitative comparison | `{ items: [{name, value, value2?}], xLabel?, yLabel?, y2Label? }` |
| `table` | Side-by-side feature/attribute comparison (3+ items, 3+ attributes) | `{ headers: [string], rows: [[string]], highlightColumn?: number }` |
| `timeline` | Chronological events, project phases, evolution | `{ events: [{date, title, description?}] }` |

# SELECTION RULES

1. **Graph**: Use for concept maps, dependency chains, cause→effect, entity relationships. Min 3 nodes, max 15. Assign `group` to cluster related nodes.
2. **Bar chart**: Use ONLY when you have real numeric values (scores, counts, percentages) — never fabricate numbers. Min 2 items, max 15.
3. **Table**: Use when comparing 3+ options across 3+ attributes. Do NOT use for 2-item comparisons (prose is sufficient). Do NOT duplicate tables already in the section content.
4. **Timeline**: Use for chronological progressions with 3+ events. Include year/month in `date`.
5. **Skip**: If the section is pure analysis/recommendation with no structural data, output `{"skip": true}`.

# CONSTRAINTS

- Max 15 nodes/items/rows. Keep labels short (≤ 30 chars).
- All labels in the SAME LANGUAGE as the section content.
- The visualization must convey information NOT already in the section text. Do not merely reformat prose into a chart.
- Output ONLY the JSON object. No markdown, no explanation, no code fences.

# OUTPUT FORMAT

Either:
```
{"skip": true}
```

Or:
```
{"vizType": "graph"|"bar"|"table"|"timeline", "title": "...", "data": { ... }}
```
```

- [ ] **Step 2: Create new Visual Agent user prompt**

Create `templates/prompts/ai-analysis-report-viz-json.md`:

```markdown
## Section Title
{{{sectionTitle}}}

## Section Content
{{{sectionContent}}}

## Content Type
{{{contentType}}}

## Mission Role
{{{missionRole}}}

Analyze this section and decide: does a visualization add value? If yes, output the JSON viz spec. If no, output `{"skip": true}`. Output ONLY the JSON object.
```

- [ ] **Step 3: Register new PromptIds**

In `src/service/prompt/PromptId.ts`, after the existing `AiAnalysisReportVisual` entries (around line 229), add:

```ts
AiAnalysisReportVizJsonSystem = 'ai-analysis-report-viz-json-system',
AiAnalysisReportVizJson = 'ai-analysis-report-viz-json',
```

- [ ] **Step 4: Register templates in TemplateRegistry**

In `src/core/template/TemplateRegistry.ts`, after the existing report visual entries (around line 214), add:

```ts
'ai-analysis-report-viz-json-system': meta('prompts', 'ai-analysis-report-viz-json-system'),
'ai-analysis-report-viz-json': meta('prompts', 'ai-analysis-report-viz-json', { systemPromptId: 'ai-analysis-report-viz-json-system' }),
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add templates/prompts/ai-analysis-report-viz-json-system.md \
      templates/prompts/ai-analysis-report-viz-json.md \
      src/service/prompt/PromptId.ts \
      src/core/template/TemplateRegistry.ts
git commit -m "feat(report): add JSON viz agent prompts and register in template system"
```

---

## Task 7: Wire Visual Agent to JSON Pipeline in ReportOrchestrator

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts:408-471`
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:47-61`
- Modify: `templates/prompts/ai-analysis-report-section-system.md:38`

- [ ] **Step 1: Add vizData field to V2Section interface**

In `src/ui/view/quick-search/store/searchSessionStore.ts`, add to the `V2Section` interface (after `generations` field, line 60):

```ts
// ADD after line 60:
    vizData?: import('@/core/schemas/report-viz-schemas').VizSpec;
```

The full interface becomes:

```ts
export interface V2Section {
    id: string;
    title: string;
    contentType: string;
    visualType: string;
    evidencePaths: string[];
    brief: string;
    weight: number;
    missionRole: string;
    status: 'pending' | 'generating' | 'done' | 'error';
    content: string;
    streamingChunks: string[];
    error?: string;
    generations: Array<{ content: string; prompt?: string; timestamp: number }>;
    vizData?: import('@/core/schemas/report-viz-schemas').VizSpec;
}
```

- [ ] **Step 2: Update section system prompt — remove Mermaid Visual Agent reference**

In `templates/prompts/ai-analysis-report-section-system.md`, replace line 38:

```markdown
OLD:
- Do NOT include Mermaid diagrams — a dedicated Visual Agent handles that.

NEW:
- Do NOT include Mermaid diagrams or visualization code — a dedicated Visual Agent generates visualizations from your content after you finish.
```

- [ ] **Step 3: Rewrite runVisualAgent in ReportOrchestrator**

In `src/service/agents/report/ReportOrchestrator.ts`, replace the `runVisualAgent` method (lines 408–437) and delete `generateMermaidBlock` (lines 439–466) and `extractMermaidInner` (lines 468–471). Replace with:

```ts
// -----------------------------------------------------------------------
// Agent 2: Visual (JSON-based)
// -----------------------------------------------------------------------

private async runVisualAgent(section: V2Section): Promise<void> {
    const currentContent = this.store.getState().v2PlanSections.find((s) => s.id === section.id)?.content ?? '';
    if (!currentContent) return;

    try {
        const [systemPrompt, userMessage] = await Promise.all([
            this.mgr.renderPrompt(PromptId.AiAnalysisReportVizJsonSystem, {}),
            this.mgr.renderPrompt(PromptId.AiAnalysisReportVizJson, {
                sectionTitle: section.title,
                sectionContent: currentContent.slice(0, 3000),
                contentType: section.contentType,
                missionRole: section.missionRole ?? 'synthesis',
            }),
        ]);

        const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportVizJson);
        const result = streamText({
            model,
            system: systemPrompt,
            prompt: userMessage,
            maxTokens: 1500,
        });

        let text = '';
        for await (const chunk of result.textStream) {
            text += chunk;
        }

        // Extract JSON from response (LLM may wrap in code fence)
        const jsonStr = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        // Check for skip signal
        if (parsed.skip) return;

        // Validate with Zod
        const { vizSpecSchema } = await import('@/core/schemas/report-viz-schemas');
        const validation = vizSpecSchema.safeParse(parsed);
        if (!validation.success) {
            console.warn(`[Visual:${section.id.slice(0, 8)}] Schema validation failed:`, validation.error.message);
            return;
        }

        // Store validated viz data on the section
        this.store.getState().updatePlanSection(section.id, (s) => ({
            ...s,
            vizData: validation.data,
        }));
    } catch (err) {
        // Visual generation is optional — log and continue
        console.warn(`[Visual:${section.id.slice(0, 8)}] Failed:`, err);
    }
}
```

- [ ] **Step 4: Update PromptId import if needed**

At the top of `ReportOrchestrator.ts`, the `PromptId` import already exists. The new enum values `AiAnalysisReportVizJsonSystem` and `AiAnalysisReportVizJson` will be available via the existing import after Task 6.

- [ ] **Step 5: Remove old Mermaid imports if unused**

Check if `validateMermaidCode` import (line 8) is still referenced. If not (after removing `generateMermaidBlock`), remove it:

```ts
// REMOVE if no longer used:
import { validateMermaidCode } from '@/core/utils/analysis-data-validator';
```

Note: Keep `runMermaidFixAgent` method for now — it's used by the public `fixMermaid` method. It can be cleaned up in a future pass.

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/service/agents/report/ReportOrchestrator.ts \
      src/ui/view/quick-search/store/searchSessionStore.ts \
      templates/prompts/ai-analysis-report-section-system.md
git commit -m "feat(report): replace Mermaid visual agent with JSON→React pipeline"
```

---

## Task 8: Render Viz Components in V2ReportView

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx`

- [ ] **Step 1: Import VizRenderer**

At the top of `src/ui/view/quick-search/components/V2ReportView.tsx`, add:

```ts
import { VizRenderer } from './viz/VizRenderer';
```

- [ ] **Step 2: Render viz below section content in SectionBlock**

After the `StreamdownIsolated` block (around line 128), add the viz renderer:

```tsx
// AFTER the existing StreamdownIsolated block:
{content && (
    <StreamdownIsolated isAnimating={section.status === 'generating'} className="pktw-select-text pktw-break-words">
        {content}
    </StreamdownIsolated>
)}

{/* ADD: Visualization — rendered from JSON spec */}
{section.vizData && section.status === 'done' && (
    <VizRenderer spec={section.vizData} />
)}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/V2ReportView.tsx
git commit -m "feat(report): render JSON viz components in report section cards"
```

---

## Task 9: Improve Evidence Reading Strategy

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts:41-53`

Currently `readEvidence` takes the first 3000 characters of each file. For long notes, the core content may be elsewhere.

- [ ] **Step 1: Rewrite readEvidence with smarter extraction**

In `src/service/agents/report/ReportOrchestrator.ts`, replace the `readEvidence` method (lines 41–53):

```ts
private async readEvidence(paths: string[], sectionBrief?: string): Promise<string> {
    const vault = AppContext.getInstance().app.vault;
    const PER_FILE_LIMIT = 6000;
    const chunks: string[] = [];

    for (const p of paths) {
        const file = vault.getAbstractFileByPath(p);
        if (!file || !('extension' in file)) continue;
        try {
            const content = await vault.cachedRead(file as any);
            const noteName = p.replace(/\.md$/, '');

            if (content.length <= PER_FILE_LIMIT) {
                chunks.push(`### [[${noteName}]]\n${content}`);
                continue;
            }

            // For long files: try to find the most relevant section
            if (sectionBrief) {
                const relevant = this.extractRelevantSection(content, sectionBrief, PER_FILE_LIMIT);
                if (relevant) {
                    chunks.push(`### [[${noteName}]] (excerpt)\n${relevant}`);
                    continue;
                }
            }

            // Fallback: first + last portion
            const half = Math.floor(PER_FILE_LIMIT / 2);
            const excerpt = content.slice(0, half) + '\n\n...(truncated)...\n\n' + content.slice(-half);
            chunks.push(`### [[${noteName}]] (excerpt)\n${excerpt}`);
        } catch { /* skip unreadable */ }
    }
    return chunks.join('\n\n---\n\n');
}

private extractRelevantSection(content: string, brief: string, maxLen: number): string | null {
    const keywords = brief
        .toLowerCase()
        .split(/[\s,;.!?，。；！？]+/)
        .filter((w) => w.length > 1);
    if (keywords.length === 0) return null;

    const paragraphs = content.split(/\n{2,}/);
    if (paragraphs.length <= 3) return null;

    const scores = paragraphs.map((p) => {
        const lower = p.toLowerCase();
        return keywords.filter((kw) => lower.includes(kw)).length;
    });

    const maxScore = Math.max(...scores);
    if (maxScore < 2) return null;

    const bestIdx = scores.indexOf(maxScore);
    let result = paragraphs[bestIdx];
    let lo = bestIdx - 1;
    let hi = bestIdx + 1;

    while (result.length < maxLen) {
        const addLo = lo >= 0 ? paragraphs[lo] : null;
        const addHi = hi < paragraphs.length ? paragraphs[hi] : null;
        if (!addLo && !addHi) break;

        if (addLo && (!addHi || (scores[lo] >= scores[hi]))) {
            if (result.length + addLo.length > maxLen) break;
            result = addLo + '\n\n' + result;
            lo--;
        } else if (addHi) {
            if (result.length + addHi.length > maxLen) break;
            result = result + '\n\n' + addHi;
            hi++;
        }
    }

    return result;
}
```

- [ ] **Step 2: Update all callsites to pass sectionBrief**

In `generateReport` (around line 82):
```ts
// OLD:
const evidenceContent = await this.readEvidence(sec.evidencePaths);
// NEW:
const evidenceContent = await this.readEvidence(sec.evidencePaths, sec.brief);
```

In `streamSectionContent` (around line 280):
```ts
// OLD:
const evidenceContent = await this.readEvidence(section.evidencePaths);
// NEW:
const evidenceContent = await this.readEvidence(section.evidencePaths, section.brief);
```

In `runContentAgent` (around line 359):
```ts
// OLD:
const evidenceContent = await this.readEvidence(section.evidencePaths);
// NEW:
const evidenceContent = await this.readEvidence(section.evidencePaths, section.brief);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/report/ReportOrchestrator.ts
git commit -m "feat(report): smarter evidence extraction with keyword relevance matching"
```

---

## Summary of Changes

| Task | What | Impact |
|------|------|--------|
| 1 | Remove word/token limits | Sections can be as deep as needed |
| 2 | Summary after content | Summary synthesizes actual findings, not plans |
| 3 | Inline `[[wikilink]]` citations | Users can trace claims to source notes |
| 4 | Zod viz schemas | Type-safe JSON contract between LLM and renderer |
| 5 | React viz components | Reliable graph/chart/table/timeline rendering |
| 6 | JSON Visual Agent prompts | LLM outputs JSON instead of Mermaid syntax |
| 7 | Wire orchestrator to JSON pipeline | End-to-end: LLM → Zod validate → store → render |
| 8 | V2ReportView renders viz | Viz appears below section content |
| 9 | Smarter evidence reading | More relevant context per section |

**Mermaid backward compatibility:** Old Mermaid prompts and `runMermaidFixAgent` are preserved (not deleted). StreamdownIsolated still renders `\`\`\`mermaid` blocks in markdown content naturally. The change is that the Visual Agent no longer intentionally generates Mermaid — it outputs JSON that renders via React components.
