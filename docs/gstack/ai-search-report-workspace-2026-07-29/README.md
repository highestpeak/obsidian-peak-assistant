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
- `src/ui/component/result-browser/`
- `tools/ai-search-simulator/config.json`
- `tools/ai-search-simulator/scenario-engine.mjs`
- `templates/prompts/ai-analysis-vault-sdk-playbook.md`
- `templates/prompts/ai-analysis-report-section-system.md`
- `docs/superpowers/specs/2026-07-28-ai-search-unified-modes.md`
- `docs/superpowers/specs/2026-07-28-ai-graph-artifact-platform.md`

The interactive prototype demonstrates:

- a single AI Search landing history surface;
- current-context quick starts instead of `Suggested for you`;
- honest research counts and readable activity summary;
- a dynamic answer plan without fixed mission-role groups;
- explicit IME-safe plan refinement;
- immediate transition into Report during generation;
- varied long-form report content with a table, chart/diagram, links, citations, and an image;
- shared Result Browser-style List / Tree / Graph source projections;
- a visible truth boundary between deterministic Vault graph and AI relationship map.

The report content inside the mock is an illustrative simulator fixture grounded in the real `Peak Composer Visual Parity QA.md` document and current project conventions. It is not a claim that production already returns that report.

Validation:

```bash
node docs/gstack/ai-search-report-workspace-2026-07-29/validate.mjs
```
