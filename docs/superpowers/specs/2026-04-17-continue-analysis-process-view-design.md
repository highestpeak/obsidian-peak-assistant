# Continue Analysis & Process View Redesign

## Problem

After the V2 AI Analysis refactor, the Continue Analysis flow and Process view have several UX issues:

1. **Process history lost on Continue**: `startContinueRound` resets the Process view, discarding all visible steps from previous rounds. Users lose context of what was already analyzed.
2. **Report Evolution is broken**: Shows duplicate identical "Final Report" cards instead of per-round versions. The component adds no real value as a standalone section.
3. **Plan review requires tab switch**: Users must switch from Process to Report tab to see/approve the plan, breaking the natural flow of watching the analysis unfold.
4. **No section-level generation progress**: "Generating sections (0/6)" shows a single line with no per-section status.
5. **Plan outline not collapsible**: When the plan is long, it dominates the Process view with no way to collapse it.

## Design Decisions (confirmed with user)

- **Linear chain model** (not tree/branch) — matches existing `rounds[]` data structure
- **Round summary in fold header** (not standalone Report Evolution block) — more compact, unified with timeline
- **Plan review inline in Process view** (not in Report tab) — eliminates tab-switch friction

## Architecture

### Data Layer: No Changes

The existing store state is sufficient:

- `rounds: Round[]` — frozen snapshots of completed rounds (via `freezeCurrentRound`)
- `currentRoundIndex: number` — active round index
- `v2Steps`, `v2Timeline`, `v2PlanSections`, etc. — current round working state
- `startContinueRound()` — resets working state, preserves `rounds[]` and `v2Sources`

No interface changes, no migration needed.

### UI Layer: Process View Overhaul

#### Component: `V2ProcessView.tsx` (major rewrite)

**Current structure:**
```
ReportEvolution (single card, only when completed)
Timeline items (flat list of current round steps)
Section generation progress
```

**New structure:**
```
[Round 1 — collapsed]  header: query, duration, source count, section count, [Report →]
[Round 2 — collapsed]  header: query, duration, source count, section count, [Report →]
[Round N — expanded]   ← current round
  Timeline items (search, read, follow links, etc.)
  Plan node (collapsible inline plan review + Generate Report button)
  Section generation progress (per-section status list)
```

#### New Component: `V2RoundBlock.tsx`

Renders a single round (either frozen from `rounds[]` or the current active round).

Props:
```ts
interface V2RoundBlockProps {
  round: {
    index: number;
    query: string;
    steps: V2ToolStep[];
    timeline: V2TimelineItem[];
    sections: V2Section[];
    summary: string;
    sources: V2Source[];
    duration?: number;
    proposedOutline: string | null;
  };
  isCurrent: boolean;        // true for active round
  defaultExpanded: boolean;   // true for current round, false for history
  onNavigateToReport?: (roundIndex: number) => void;
}
```

**Collapsed state (header only):**
- Round number + query text (truncated)
- Stats: duration, source count, section count
- `[Report →]` link that switches to Report view and scrolls to that round's content

**Expanded state:**
- Full timeline (reuses existing `ToolRow`, `BatchRow`, `ThinkingRow` components)
- Plan node (if `proposedOutline` exists)
- Section generation progress (if sections exist)

#### New Component: `V2InlinePlanReview.tsx`

Extracted from the current `V2PlanReview.tsx`, adapted for inline use in Process view.

**Collapsed state (default after approval):**
- One-line summary: "Report Outline · 6 sections" with expand chevron
- Section titles listed compactly

**Expanded state (default before approval):**
- Section cards with editable title, brief, content_type, mission_role
- Reorder and delete controls
- Missing required roles warning
- User insight input field
- **"Generate Report" button** (primary action)

**After approval:**
- Button changes to ✅ "Report Generated" (disabled)
- Auto-collapses to compact view

#### Section Generation Progress (enhanced)

Renders inside the current round's `V2RoundBlock`, after the plan node.

```
⏳ Generating sections (2/6)
   ✅ 你有55个产品想法，但本质上只有一种商业模式
   ✅ 第一梯队：3个想法有明确的市场空白
   ⏳ 为什么AI Compare是最快现金流
   ○ 符合你现状的致富方案
   ○ Peak Assistant是你的长期护城河
   ○ 避免7个常见陷阱
```

Each section shows its `status` icon (✅ done / ⏳ generating / ○ pending) and `title`. This already exists in the current `V2ProcessView` (lines 292-322) but needs the title per-line instead of just a count.

### UI Layer: Report View Changes

#### Remove `V2PlanReview` rendering

**Current flow in `V2ReportView.tsx`:**
```ts
if (sections.length > 0 && !planApproved) {
  return <V2PlanReview onApprove={onApprove} />;
}
```

**New flow:** Remove this gate. Report view always shows the report content (Executive Summary + sections). If no content is generated yet, show a minimal empty state: "Report will appear here after plan approval."

#### Remove `ReportEvolution` from `V2ProcessView`

The inline `ReportEvolution` component (lines 152-200 of `V2ProcessView.tsx`) is deleted. Its functionality is replaced by the `[Report →]` link in each round's header.

### Interaction Flow

```
User submits query
  → Process view shows Round 1 (expanded)
  → Agent searches, reads notes, builds evidence
  → Plan node appears (expanded, editable)
  → User reviews plan, clicks "Generate Report"
  → Section generation progress shows per-section status
  → When done, auto-switch to Report view

User clicks "Continue" with follow-up question
  → freezeCurrentRound() saves Round 1
  → startContinueRound() resets working state
  → Process view now shows:
      [Round 1 — collapsed]  "我的独立开发产品..."  87s · 15 sources
      [Round 2 — expanded]   ← current, shows new search progress
  → Same flow: search → plan → generate → report
```

## File Changes Summary

| File | Change |
|---|---|
| `V2ProcessView.tsx` | Major rewrite: render `rounds[]` as collapsed `V2RoundBlock`, current round as expanded `V2RoundBlock`. Remove `ReportEvolution`. |
| `V2RoundBlock.tsx` | **New file**: single round display with collapse/expand, header stats, timeline, plan node, section progress |
| `V2InlinePlanReview.tsx` | **New file**: extracted from `V2PlanReview.tsx`, adapted for inline use with collapse/expand |
| `V2ReportView.tsx` | Remove `V2PlanReview` gate. Always show report content or empty state. |
| `V2PlanReview.tsx` | Delete or keep as legacy (if V1 still uses it) |
| `V2SearchResultView.tsx` | Pass `onApprove` / `onRegenerateSection` to `V2ProcessView` instead of only to `V2ReportView` |
| `tab-AISearch.tsx` | Wire `handleApprovePlan` through to Process view |

## Not In Scope

- Tree/branch model for rounds
- Token usage display (separate feature)
- Report Evolution as standalone component
- Changes to `Round` interface or store data model
- V1 (non-SDK) search flow changes
