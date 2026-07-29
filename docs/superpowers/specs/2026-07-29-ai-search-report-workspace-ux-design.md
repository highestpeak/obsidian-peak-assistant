# AI Search report workspace UX redesign

Date: 2026-07-29

Status: **Review-ready design**

Production status: **Unchanged**

Related artifacts:

- [Interactive review and mock](../../gstack/ai-search-report-workspace-2026-07-29/index.html)
- [Mock boundary and source map](../../gstack/ai-search-report-workspace-2026-07-29/README.md)
- [Accepted AI Search unified modes design](./2026-07-28-ai-search-unified-modes.md)
- [AI Graph artifact platform](./2026-07-28-ai-graph-artifact-platform.md)

This design reviews the 51.37-second recording `~/Downloads/ai search ui ux recording.mp4`, the current AI Search production components, the standalone simulator, and the shared Vault Search Result Browser. It changes no production source.

## 1. Verdict

Keep the two-phase architecture:

1. Search and evidence collection produce a reviewable plan.
2. Independent report sections generate in parallel, followed by any dependent synthesis.

Retire the fixed report taxonomy as a user-visible structure and as a universal planner constraint. `Synthesis`, `Action Plan`, `Decomposition`, `Risk Audit`, and the other current mission roles are analytical lenses, not sections that every answer needs.

The report structure must be derived from the current question, evidence coverage, and requested output. The UI should show the questions each section answers, its evidence, format, and generation state. It should not group sections under fixed English mission-role headings.

## 2. Confirmed problems

### 2.1 Entry screen

- `Recent searches` and `Recent` show overlapping history at the same time.
- `Suggested for you` makes a personalization claim but mostly exposes generic templates and current-context substitutions.
- A raw `{activeDocumentTitle}` placeholder is visible in the recording.
- Chinese and English labels are mixed inside the same hierarchy.
- The input-level `Vault Analysis` pill repeats an implementation recipe that the accepted unified-modes design already removes.
- The large `1141 analyses` count has no immediate decision value.

### 2.2 Research activity and trust

- The simulator completes multiple tool calls in fractions of a second because `normalMs` is 120 ms and `slowMs` is 900 ms.
- The activity log reports `0 folders`, `0 files`, `0 chars`, and `0 sources selected`, while the plan immediately claims six sources per section.
- Pending measurements are rendered as zero rather than unknown or in progress.
- A detailed tool trace and the user-facing research summary occupy the same visual level.
- The plan editor is nested inside the process log, so the primary decision is buried inside execution telemetry.

### 2.3 Plan review and IME

- `MISSION_ROLES` currently marks `synthesis` and `action_plan` as universally required.
- The planning prompt requires three to six “McKinsey-style” sections, at least one synthesis section, at least one action plan, and at least one Mermaid visualization regardless of the question.
- Those rules can force an action plan into descriptive, archival, comparison, or evidence-only questions where no action plan is justified.
- Section title, mission role, content type, and visual type are overlapping classification layers exposed through a tall editor.
- The insight field commits on any `Enter` keydown and does not guard `isComposing` or `keyCode === 229`, so an IME candidate confirmation can become an unintended instruction.

### 2.4 Generation and report

- After `Generate Report`, Process remains the visible workspace while the report is generated.
- The user cannot start reading completed sections while the remaining sections continue in parallel.
- The simulator returns the same short paragraphs for every section, so it does not verify tables, charts, diagrams, citations, links, images, long content, or section-specific formatting.
- The current bottom-only table-of-contents icon is hard to discover and detached from the reading position.
- The report does not foreground source coverage or unsupported claims.

### 2.5 Sources and graph

- `V2SourcesView` builds a separate `List / Graph` surface instead of consuming the shared Result Browser.
- It omits the shared Tree view, density modes, graph presets, semantic controls, and list-row behavior.
- Source rows do not make “why selected”, “where cited”, evidence snippet, or freshness easy to scan.
- The current graph empty state launches a separate AI graph generator, but does not explain the difference between deterministic Vault links and AI-extracted relationships.

## 3. Target user flow

```text
Ask a question
  -> collect evidence with honest activity counts
  -> propose a dynamic answer plan
  -> user edits or adds instructions explicitly
  -> generate independent sections in parallel
  -> switch immediately to the Report workspace
  -> read completed sections while others stream
  -> review Sources through shared List / Tree / Graph
  -> optionally generate an AI relationship map from the chosen evidence scope
```

`Activity` remains available as a secondary view. It is not the default reading surface after report generation begins.

## 4. Dynamic answer planner

### 4.1 Answer contract

Before choosing sections, the planner derives an internal answer contract:

```ts
interface AnswerContract {
  intent:
    | 'explain'
    | 'summarize'
    | 'inventory'
    | 'compare'
    | 'evaluate'
    | 'diagnose'
    | 'decide'
    | 'timeline'
    | 'plan'
    | 'mixed';
  requestedOutput: 'brief' | 'report' | 'table' | 'timeline' | 'map' | 'recommendation';
  scope: SourceScope;
  constraints: string[];
  answerQuestions: string[];
  evidenceGaps: EvidenceGap[];
}
```

This is a design contract, not a claim that the current domain type exists.

### 4.2 Section selection

Each proposed section must pass four tests:

1. It answers a distinct question in the answer contract.
2. It has enough evidence or is explicitly labelled as a gap.
3. Its format reduces reading cost for this content.
4. It does not duplicate another section.

The planner may use internal lenses such as contradiction, trade-off, risk, decomposition, or next steps when the question and evidence justify them. These lenses are optional quality tags. They do not create fixed UI groups and are never universally required.

### 4.3 Conditional structure

- A short answer may have one direct-answer block and an evidence strip.
- A comparison may use criteria, a comparison table, and a conclusion.
- A timeline may use phases, turning points, and current implications.
- A research report may use findings, evidence themes, contradictions, gaps, and implications.
- An action plan appears only when the user requests action, decision support, implementation, or next steps.
- An executive summary appears only when the report is long enough that a separate summary reduces reading cost.

### 4.4 Parallel generation

The planner assigns dependencies rather than assuming every block is independent:

```text
Evidence-backed sections ─┐
Comparison / timeline ────┼─ run in parallel when independent
Visual projections ───────┘
              ↓
Cross-section synthesis or executive summary
```

Parallel generation remains a strength. The change is that the dependency graph and formats are derived from the current answer contract.

## 5. Screen design

### 5.1 AI Search landing

Primary job: ask a question or continue a prior analysis.

- Keep the accepted two-position header: `Vault Search` and one AI workspace selector.
- Remove the visible `Vault Analysis` recipe pill.
- Replace `Suggested for you` with `Start from current context`.
- Resolve every context variable before display.
- Use one `Continue your analysis` history list.
- Do not show a separate recent-query block on the empty landing page.
- Expose scope as concrete context chips such as current note, current folder, Vault, and Web state.

### 5.2 Research activity

Primary job: communicate what is happening and whether the evidence is trustworthy.

- Show one current phase and a compact completed summary.
- Distinguish folders scanned, files considered, files read, characters read, and sources cited.
- Use `—` for unknown or pending values; reserve zero for confirmed zero.
- Use actual wall-clock duration in production.
- Keep provider/model/tool spans inside an expandable Activity detail.
- In simulator review mode, label the run and use a realistic pacing profile.

### 5.3 Answer plan review

Primary job: approve the shape of the answer.

Each section row shows:

- conclusion-style title;
- question answered;
- evidence count and coverage state;
- proposed output format;
- dependency, only when another section must finish first;
- edit, reorder, remove, or add actions.

The refinement field is a multiline instruction composer:

- plain `Enter` inserts a newline;
- `Cmd/Ctrl+Enter` applies the instruction;
- the explicit `Apply to plan` button is always available;
- composition events never submit;
- applying an instruction previews the plan changes before generation.

### 5.4 Report generation

Primary job: let the user read useful output as soon as it exists.

- Clicking `Generate report` switches immediately to Report.
- A compact banner shows completed and active sections.
- Finished sections render in their final positions.
- Generating sections stream in place.
- Pending sections use labelled skeletons.
- Activity remains one click away without replacing the report.

### 5.5 Report workspace

Primary job: read, navigate, verify, and reuse the report.

- Use a visible, position-aware section navigator rather than a bottom icon.
- Allow rich Markdown content: prose, tables, task lists, code, Mermaid, Vault links, external links, and callouts.
- Allow report-owned visual projections such as charts and evidence diagrams.
- Show inline Vault citations and make the source openable.
- Keep unsupported or weakly supported claims visibly labelled.
- Preserve per-section copy and regenerate actions.
- Keep save, open in file, continue, and open in Chat as report-level actions.

### 5.6 Sources workspace

Primary job: inspect the evidence set and its relationships.

Use the shared Result Browser:

- `List`: detailed or compact rows with snippet, path, selection reason, cited sections, and freshness.
- `Tree`: the same evidence grouped by full Vault folder hierarchy.
- `Graph`: the same evidence projected through shared graph chrome.

Graph data semantics remain explicit:

1. `Vault graph` uses deterministic Vault links, folder relations, and optional pre-indexed semantic edges.
2. `AI relationship map` uses AI-extracted or inferred concepts and relationships, with provenance and review state.

Both can share layout controls, but they do not share truth semantics. `Folder tree`, `local neighborhood`, and `orbit` remain deterministic file-graph presets. AI relationship maps use their own graph type and lens contract.

## 6. Simulator fixture contract

The simulator needs separate profiles for automation and design review:

- `test-fast`: deterministic, minimal latency, intended for automated checks.
- `review-realistic`: visible multi-step timing and chunking, intended for UI review and recordings.
- `failure`: the existing deterministic failure scenarios.

The review-realistic fixture must:

- return non-zero counts from real tool outputs when evidence was read;
- use distinct durations per phase;
- stream multiple paragraphs per section;
- vary content and structure by section;
- include at least one table, one diagram or chart, inline Vault links, and a source-backed callout across the full report;
- include a long-content case that exercises navigation and scrolling;
- generate an AI relationship map fixture with extracted versus inferred relationship styling;
- never claim remote model behavior when the local provider produced the content.

Fast automation timing may remain fast, but it must not be presented as realistic user-facing elapsed time.

## 7. Reuse map

| Target | Existing source to reuse | Current duplicate to retire |
| --- | --- | --- |
| Landing information architecture | `2026-07-28-ai-search-unified-modes.md` | input-level `Vault Analysis` mode |
| Sources List / Tree / Graph | `src/ui/component/result-browser/` | custom `V2SourcesView` list and mode toggle |
| Vault graph layout controls | `ResultBrowserToolbar.tsx` and `AtlasGraphCanvasImpl.tsx` | graph-local ad hoc controls |
| AI relationship map rendering | `MultiLensGraph` plus the AI Graph artifact contract | unlabeled graph empty state |
| Rich report body | `StreamdownIsolated` | repeated simulator paragraphs |
| Shared instruction behavior | Shared AI Instruction Composer contract | raw Enter-to-chip field |

This table is an implementation direction, not an instruction to merge the deterministic Result Browser model with the AI Graph artifact model.

## 8. Acceptance criteria

- Landing has one visible history surface and no unresolved template variables.
- The plan contains only sections justified by the current answer contract.
- No mission role is universally required.
- IME candidate confirmation cannot add an instruction or start generation.
- Activity counts agree with the evidence set.
- Pending counts do not display as confirmed zero.
- Generate switches immediately to Report.
- A completed section is readable while other sections continue.
- The simulator exercises prose, table, visual, link, citation, and long-content rendering.
- Sources use the shared List / Tree / Graph chrome.
- Vault graph and AI relationship map have separate provenance and truth labels.
- No production source is considered implemented until real Obsidian interaction verification is complete.

## 9. Do not do

- Do not replace one fixed report taxonomy with another fixed taxonomy.
- Do not make every query produce an action plan, risk audit, roadmap, or executive summary.
- Do not show simulator fast-test duration as realistic elapsed time.
- Do not solve contradictory counters by hiding them; correct the metric semantics.
- Do not style the existing Sources list to look similar while keeping a second component system.
- Do not present AI-inferred relations as Vault links.
- Do not treat this design mock as production acceptance.
