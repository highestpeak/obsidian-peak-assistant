# Per-Section Report Generation

> Agent searches → structured plan → user approval → parallel per-section LLM generation → section-level regeneration

## Problem

V2 Agent SDK generates the entire report in a single `query()` call as one monolithic markdown blob (`proposed_outline`). This sacrifices V1's block-based quality control: no plan approval, no per-section streaming, no section-level iteration.

## Solution

Split report generation into two phases:
1. **Agent phase**: `query()` only does search + outputs a structured plan via `vault_submit_plan`
2. **Orchestrator phase**: application-layer TypeScript generates each section independently via `streamText`, in parallel

Users can review/adjust the plan before generation, and regenerate any section with an optional prompt after generation.

## Flow

```
Agent query() search → vault_submit_plan(structured plan) → query() ends
                              ↓
                  UI shows plan cards, user adjusts
                              ↓
                     User clicks "Generate Report"
                              ↓
           Parallel streamText per section → each renders as block card
                              ↓
           All body sections done → generate Executive Summary (streaming, top)
                              ↓
           Any section can be regenerated with optional prompt
```

## Changes

### 1. vault_submit_plan Schema

**File:** `src/service/agents/vault-sdk/vaultMcpServer.ts`

Add `plan_sections` field, change `proposed_outline` semantics to brief overview (not full report):

```ts
interface SubmitPlanInput {
  selected_paths: string[];
  rationale: string;
  proposed_outline: string;        // now: 2-3 sentence overview, NOT full report
  plan_sections: Array<{
    id: string;                    // "s1", "s2"...
    title: string;                 // conclusion-as-heading
    content_type: string;          // enumeration | comparison | analysis | recommendation | timeline
    visual_type: string;           // table | quadrantChart | flowchart | timeline | mindmap | none
    evidence_paths: string[];      // vault paths relevant to this section
    brief: string;                 // 1-2 sentence description
    weight: number;                // 0-10, controls card width (V1 layout logic)
  }>;
  coverage_assessment: string;
  follow_up_questions: string[];
}
```

Zod schema in the `tool()` call updated accordingly. `plan_sections` is required.

### 2. Playbook Rewrite

**File:** `templates/prompts/ai-analysis-vault-sdk-playbook.md`

Key changes:
- Agent must NOT generate the full report — only the plan
- `vault_submit_plan` instructions updated: `proposed_outline` is a brief overview, `plan_sections` is the structured section list
- Report Planning section (already added) drives the plan output
- Remove Report Format section from playbook (report format is now in per-section prompts, not agent instructions)

### 3. Store Changes

**File:** `src/ui/view/quick-search/store/searchSessionStore.ts`

Expand `v2PlanSections` type:

```ts
interface V2Section {
  id: string;
  title: string;
  contentType: string;
  visualType: string;
  evidencePaths: string[];
  brief: string;
  weight: number;
  // Generation state
  status: 'pending' | 'generating' | 'done' | 'error';
  content: string;
  streamingChunks: string[];
  error?: string;
  // Regeneration history
  generations: Array<{ content: string; prompt?: string; timestamp: number }>;
}
```

New `SessionStatus` value: `'plan_ready'` — agent search done, plan submitted, awaiting user approval.

New actions:
- `setPlanSections(sections)` — write plan from vault_submit_plan callback
- `approvePlan()` — user confirms, triggers generation
- `appendSectionChunk(id, chunk)` — streaming update during generation
- `completeSectionContent(id, content)` — section generation done
- `startSectionRegenerate(id)` — begin regenerating a section
- `setSummaryStreaming(text)` — executive summary streaming update

### 4. ReportOrchestrator (New Module)

**New file:** `src/service/agents/report/ReportOrchestrator.ts`

Responsibilities:
- Takes approved plan + evidence paths. Reads document content from vault via `DocumentLoaderManager` at generation time (V2Sources only store path/title, not content).
- Generates each body section via independent `streamText` call, in parallel
- After all body sections complete, generates Executive Summary via `streamText`
- Handles single-section regeneration with optional user prompt

```ts
class ReportOrchestrator {
  async generateReport(plan: V2Section[], evidence: V2Source[], overview: string): Promise<void>;
  async regenerateSection(section: V2Section, plan: V2Section[], evidence: V2Source[], userPrompt?: string): Promise<void>;
}
```

**Per-section prompt structure:**
- System: report writing rules (language matching, `[[wikilink]]` citations, no disclaimers, Mermaid safety rules) — extracted from V1's `ai-analysis-vault-report-system.md`
- User: "You are writing section {n} of a report. Title: {title}. Content type: {contentType}. Required visualization: {visualType}. \n\nReport overview: {overview}\n\nRelevant evidence:\n{evidence content}\n\n{userPrompt || ''}"

**Executive Summary prompt:**
- Reuses V1's approach: receives `blocksSummary` (first 300 chars of each section), generates ~800-1200 words of flowing prose
- System/user prompts adapted from V1's `ai-analysis-vault-report-summary-system.md` and `ai-analysis-vault-report-summary.md`

**New prompt templates:**
- `templates/prompts/ai-analysis-report-section-system.md` — section generation system prompt
- `templates/prompts/ai-analysis-report-section.md` — section generation user prompt
- Reuse existing `ai-analysis-vault-report-summary-system.md` and `ai-analysis-vault-report-summary.md` for executive summary (may need minor adjustments)

### 5. useSearchSession Hook Changes

**File:** `src/ui/view/quick-search/hooks/useSearchSession.ts`

- On `vault_submit_plan` tool call: extract `plan_sections` → `store.setPlanSections()`, set status to `'plan_ready'`
- No longer extract `proposed_outline` as the full report
- New `handleApprovePlan()`: instantiates `ReportOrchestrator`, calls `generateReport()`, wires streaming chunks to store
- New `handleRegenerateSection(id, prompt?)`: calls `ReportOrchestrator.regenerateSection()`

### 6. Plan Approval UI

**New file:** `src/ui/view/quick-search/components/V2PlanReview.tsx`

Shown when `status === 'plan_ready'`:
- Each section as a lightweight card: title + content_type badge + visual_type badge + brief + evidence count
- Up/down arrow buttons for reordering
- Delete button per section
- Click to edit title/brief inline
- "Generate Report" button at bottom

### 7. Report View Changes

**File:** `src/ui/view/quick-search/components/V2ReportView.tsx`

When `status === 'plan_ready'`: render `V2PlanReview`.

When generating or completed: render block cards (reusing V1's visual design from `DashboardBlocksSection`):
- Each section as a card: `pktw-bg-[#f9fafb] pktw-rounded-xl pktw-p-5 pktw-border`
- Title + copy button + **regenerate button** (hover-visible)
- Content area: `StreamdownIsolated` with `isAnimating` during generation
- Weight-based sizing: reuse V1's `getBlockFlexStyle()` logic
- Generating sections show streaming content; pending sections show skeleton/placeholder
- Regenerate button click → small prompt input popover → triggers `handleRegenerateSection()`

Executive Summary at top: reuse V1's `SummarySection` card style (purple Sparkles icon, flowing prose).

### 8. Process View Changes

**File:** `src/ui/view/quick-search/components/V2ProcessView.tsx`

- Agent search phase: existing tool steps (unchanged)
- Plan phase: step showing "Plan generated — N sections"
- Report generation phase: each section as a parallel step with title + streaming progress
- Summary generation: separate step
- Regeneration: new step entry marked "Regenerate: {section title}"

### 9. V2SearchResultView Changes

**File:** `src/ui/view/quick-search/components/V2SearchResultView.tsx`

- When `status === 'plan_ready'`: show plan review in report view area
- During section generation: show report view with block cards streaming in

## Out of Scope (Initial)

- Drag-and-drop section reordering (use arrow buttons)
- Section version comparison UI (history stored but no diff view)
- Inter-section references/dependencies
- TILE/ACTION_GROUP/MERMAID render engine switching (all MARKDOWN)
- Source assessment scoring (keep V2's simple sources list)
- Adding entirely new sections after generation (only regenerate existing)

## Key Files

| File | Action |
|------|--------|
| `src/service/agents/vault-sdk/vaultMcpServer.ts` | Modify schema |
| `templates/prompts/ai-analysis-vault-sdk-playbook.md` | Rewrite: plan-only output |
| `src/ui/view/quick-search/store/searchSessionStore.ts` | Expand V2Section, new actions, new status |
| `src/service/agents/report/ReportOrchestrator.ts` | **New**: per-section generation |
| `templates/prompts/ai-analysis-report-section-system.md` | **New**: section system prompt |
| `templates/prompts/ai-analysis-report-section.md` | **New**: section user prompt |
| `src/ui/view/quick-search/hooks/useSearchSession.ts` | Wire plan → approval → generation |
| `src/ui/view/quick-search/components/V2PlanReview.tsx` | **New**: plan approval UI |
| `src/ui/view/quick-search/components/V2ReportView.tsx` | Modify: plan review + block cards |
| `src/ui/view/quick-search/components/V2ProcessView.tsx` | Modify: section-level steps |
| `src/ui/view/quick-search/components/V2SearchResultView.tsx` | Modify: plan_ready routing |
