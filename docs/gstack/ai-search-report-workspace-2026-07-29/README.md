# AI Search report workspace review mock

This is a design-only artifact. It does not change `src/`, the simulator, AI Search state, report prompts, Result Browser, or graph persistence.

Open:

- `index.html`
- embedded mock only: `index.html?embed=1`

Evidence reviewed:

- `~/Downloads/ai search ui ux recording.mp4`
  - duration: 51.366667 seconds
  - resolution: 3456 × 2168
  - MD5: `3000ff4ca753ac5a4d391b16aa4b4d8e`
- `src/ui/view/quick-search/components/V2InlinePlanReview.tsx`
- `src/ui/view/quick-search/components/V2ProcessView.tsx`
- `src/ui/view/quick-search/components/V2ReportView.tsx`
- `src/ui/view/quick-search/components/V2SourcesView.tsx`
- `src/ui/view/quick-search/components/V2ContinueAnalysisInput.tsx`
- `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx`
- `src/core/types/lens-graph.ts`
- `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts`
- `src/ui/component/result-browser/`
- `tools/ai-search-simulator/config.json`
- `tools/ai-search-simulator/scenario-engine.mjs`
- `templates/prompts/ai-analysis-vault-sdk-playbook.md`
- `templates/prompts/ai-analysis-report-section-system.md`
- `docs/90-old-root-docs/AI_ANALYSIS_ARCHITECTURE_AND_PROMPTS.md`
- `docs/archive/RESEARCH_WORKFLOW_ENGINEERING.md`
- `docs/superpowers/specs/2026-04-13-per-section-report-generation.md`
- `docs/superpowers/plans/2026-04-13-v2-report-quality-and-ui-fixes.md`
- `docs/superpowers/plans/2026-04-14-mission-roles-plan-review.md`
- `docs/superpowers/plans/2026-04-15-report-quality-overhaul.md`
- `docs/superpowers/specs/2026-04-17-ai-analysis-ux-overhaul.md`
- `docs/superpowers/specs/2026-07-28-ai-search-unified-modes.md`
- `docs/superpowers/specs/2026-07-28-ai-graph-artifact-platform.md`

The interactive prototype demonstrates:

- no completed-history surface on the AI Search landing;
- one `Continue analysis` row for unfinished work only;
- sentence-case current-context starters instead of `Suggested for you`;
- the original Web-state icon, aligned pill geometry, and quiet opt-in context pinning;
- a visible agent run with honest research counts;
- a report plan that preserves old analytical moves without fixed mission-role groups, including direct per-row edit / reorder / remove / add;
- explicit IME-safe plan refinement;
- immediate transition into Report during generation;
- the original footer order: Activity / Report / TOC / Sources, with a TOC popover instead of a left rail;
- separate per-section `Ask`, `Revise`, and `Copy` actions plus report-wide Continue and multi-round Synthesize;
- varied long-form report content with a table, chart/diagram, links, citations, and an image;
- shared Workspace / File Atlas / Search Result Browser-style List / Tree / Graph projections;
- graph-kind controls immediately after List / Tree / Graph and density at the far right;
- a visible truth boundary between deterministic Vault graph and AI relationship map;
- Vault-only scope / layout / semantic-edge controls;
- an AI-only source/query resolver before generation;
- the current AI Graph lens contract after generation: Topology / Thinking Tree / Bridges / Timeline / Gaps, filtered by available graph data.

Report content decision:

- Markdown streamed through Streamdown for narrative content;
- typed React-rendered artifacts for charts, AI graphs, images, and interactive blocks;
- Markdown / Word / PDF / HTML as exports rather than the canonical machine-run record.

The report content inside the mock is an illustrative simulator fixture grounded in the real `Peak Composer Visual Parity QA.md` document and current project conventions. It is not a claim that production already returns that report.

Validation:

```bash
node docs/gstack/ai-search-report-workspace-2026-07-29/validate.mjs
```
