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

Keep three different artifacts and never collapse them:

1. **Activity / agent run** records what the system inspected, searched, read, checked, and produced. Its job is progress and trust.
2. **Report plan** states what the answer will contain, which analytical moves were selected, what evidence covers each section, and what can run in parallel. Its job is user control.
3. **Report** is the reading, verification, reuse, and export surface. Its job is the useful outcome.

The old report system should not be discarded. It contains six valuable design assets:

- Logic Audit and evidence coverage checks;
- SCQA / answer-first structure;
- content type to output-carrier selection;
- mission roles such as synthesis, contradiction, trade-off, risk, roadmap, decomposition, blind spots, and probing horizon;
- parallel per-section generation and isolated retry;
- dependent synthesis only after section bodies exist.

The correction is narrower: retire the binding **mission role = fixed user-visible section** and retire universal requirements such as `Action Plan required` or `Mermaid always`. Mission roles become planner analytical moves. They may create a section, change a section's question, or remain an internal quality check depending on this query.

The report structure must be derived from the current question, evidence coverage, requested output, and selected analytical moves. The UI shows concrete sections rather than fixed English mission-role groups.

### 1.1 Historical AI Analysis design audit

| Source | Valuable design | Decision |
| --- | --- | --- |
| `docs/90-old-root-docs/AI_ANALYSIS_ARCHITECTURE_AND_PROMPTS.md` | Thought/Search separation, evidence hints, structured memory, diagnosis before synthesis | **Keep concept**, do not restore the retired V1 runtime architecture |
| `docs/archive/RESEARCH_WORKFLOW_ENGINEERING.md` | discovery → dossier → gap fill → verified summary; facts remain connected to source paths | **Keep** as research-quality contract |
| `2026-04-13-per-section-report-generation.md` | agent run → plan review → parallel sections → dependent summary → per-section regeneration | **Keep** as the core lifecycle |
| `2026-04-13-v2-report-quality-and-ui-fixes.md` | Logic Audit, SCQA, enumeration completeness, content-type-aware presentation | **Keep**, but remove universal section-count and Mermaid requirements |
| `2026-04-14-mission-roles-plan-review.md` | synthesis, contradiction, trade-off, action, risk, roadmap, decomposition, blind spots, probing horizon | **Move** from fixed UI grouping to visible planner analytical moves |
| `2026-04-15-report-quality-overhaul.md` | no artificial word cap, summary after bodies, inline citations, visual selection with a valid “no visual” outcome | **Keep** |
| `2026-04-17-ai-analysis-ux-overhaul.md` | Report as primary outcome; Activity, Plan, Sources, and Graph as review surfaces; continue / synthesize rounds | **Keep information architecture**, reconcile with the newer footer and persistence contracts |

The audit deliberately separates design lineage from current production. A useful old prompt or UI concept is not evidence that the current runtime implements it.

## 2. Confirmed problems

### 2.1 Entry screen

- `Recent searches` and `Recent` show overlapping completed-history surfaces at the same time.
- `Suggested for you` makes a personalization claim but mostly exposes generic templates and current-context substitutions.
- A raw `{activeDocumentTitle}` placeholder is visible in the recording.
- Chinese and English labels are mixed inside the same hierarchy.
- The input-level `Vault Analysis` pill repeats an implementation recipe that the accepted unified-modes design already removes.
- The large `1141 analyses` count has no immediate decision value.

### 2.2 Research activity and trust

- The simulator completes multiple tool calls in fractions of a second because `normalMs` is 120 ms and `slowMs` is 900 ms.
- The activity log reports `0 folders`, `0 files`, `0 chars`, and `0 sources selected`, while the plan immediately claims six sources per section.
- Pending measurements are rendered as zero rather than unknown or in progress.
- The simulator reduces the agent run to counters, losing the actual sequence that explains how evidence was found.
- The plan and process are not distinguished clearly enough: the run should lead into the report plan, not disappear and not become the plan.

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
- The mock incorrectly moved the outline into a permanent left rail and changed a good existing footer information architecture.
- The report does not foreground source coverage or unsupported claims.

### 2.5 Sources and graph

- `V2SourcesView` builds a separate `List / Graph` surface instead of consuming the shared Result Browser.
- It omits the shared Tree view, density modes, graph presets, semantic controls, and list-row behavior.
- Source rows do not make “why selected”, “where cited”, evidence snippet, or freshness easy to scan.
- The current graph empty state launches a separate AI graph generator, but does not explain the difference between deterministic Vault links and AI-extracted relationships.

## 3. Target user flow

```text
Ask a question
  -> run agent steps with honest activity evidence
  -> propose a dynamic report plan
  -> user edits or adds instructions explicitly
  -> generate independent sections in parallel
  -> switch immediately to the Report workspace
  -> read completed sections while others stream
  -> review Sources through shared List / Tree / Graph
  -> optionally generate an AI relationship map from the chosen evidence scope
```

`Activity` remains a first-class workspace tab and retains the complete run. It is not the default surface after report generation begins.

This separation is also consistent with current research products. [OpenAI Deep Research](https://help.openai.com/en/articles/10500283-deep-research) exposes a modifiable research plan, live progress, a final report, sources, and activity history. [Gemini Deep Research](https://blog.google/products-and-platforms/products/gemini/tips-how-to-use-deep-research/) exposes an editable plan plus “Show thinking” and “Sites browsed” while the report is produced. The relevant lesson is not to copy their chrome; it is that plan, run, report, and sources serve different user questions and remain inspectable.

## 4. Dynamic report architecture

### 4.0 Four layers

The planner uses four layers:

| Layer | Stable or dynamic | Purpose |
| --- | --- | --- |
| Quality contract | Stable | direct answer, evidence provenance, uncertainty, conflict checking, no duplication, user language |
| Analytical moves | Selected per query | synthesis, contradiction, trade-off, risk, roadmap, decomposition, blind spots, probing horizon |
| Concrete sections | Dynamic | conclusion-style title, question, evidence, dependency, generation state |
| Output carriers | Dynamic | prose, table, timeline, chart, graph, task list, code, image, source-backed callout |

The stable quality contract protects report quality. Analytical moves preserve the best part of the old mission-role design. Concrete sections and carriers remain query-specific.

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

### 4.2 Analytical moves and section selection

Each proposed section must pass four tests:

1. It answers a distinct question in the answer contract.
2. It has enough evidence or is explicitly labelled as a gap.
3. Its format reduces reading cost for this content.
4. It does not duplicate another section.

The planner evaluates the old mission-role set for every substantial query, then selects only the moves that add value. Selected moves are visible as compact plan metadata so the capability is not hidden. They do not create fixed UI groups and are never universally required.

- `Synthesis` usually becomes an answer-in-brief or final synthesis only when multiple findings need integration.
- `Contradiction` creates visible content only when sources materially disagree.
- `Trade-off`, `Risk`, `Roadmap`, and `Action plan` appear only when the user's decision or requested outcome needs them.
- `Blind spots` and coverage checks always run internally, but become visible sections only when they contain consequential gaps.
- `Decomposition` may shape several sections without becoming a section titled “Decomposition”.

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

Primary job: ask a question or continue an unfinished analysis.

- Keep the accepted two-position header: `Vault Search` and one AI workspace selector.
- Remove the visible `Vault Analysis` recipe pill.
- Replace `Suggested for you` with sentence-case `Start with current context`. These are context-derived starters, not personalization and not history.
- Resolve every context variable before display.
- Use `Continue analysis` only for unfinished states such as running, queued, error recovery, or plan ready for review.
- Do not show completed history or a separate recent-query block on the landing page.
- Preserve the original `GlobeOff` / `Globe` icon and tooltip rather than replacing it with bare text.
- Keep the `Analyze` action inside the pill composer and give it the same pill-radius geometry.
- Expose automatic scope as concrete context chips such as current note and Vault.
- Provide a quiet `+` / add-context affordance for pinning a note or folder. Do not open a permanent references panel by default; automatic current-note context already covers the common case.

### 5.2 Research activity

Primary job: communicate what is happening and whether the evidence is trustworthy.

- Show the actual agent run steps, followed by a compact completed summary.
- Distinguish folders scanned, files considered, files read, characters read, and sources cited.
- Use `—` for unknown or pending values; reserve zero for confirmed zero.
- Use actual wall-clock duration in production.
- Keep provider/model/tool spans inside an expandable Activity detail.
- In simulator review mode, label the run and use a realistic pacing profile.

### 5.3 Report plan review

Primary job: approve the shape of the answer after reviewing what the agent did.

The Activity view places the complete run first and the report plan after it. It does not replace one with the other.

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

Direct row editing and plan-wide refinement are complementary, not substitutes:

- row-level edit changes the section title, question, and proposed output form deterministically;
- reorder, remove, and add remain available before approval;
- the multiline refinement composer asks AI to restructure several sections together;
- no redesign may collapse these controls into an unexplained overflow menu or silently remove them.

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

- Preserve the original bottom footer order: `Activity`, `Report`, table-of-contents icon, `Sources`.
- Do not reserve a permanent left rail for the outline.
- The table-of-contents icon opens a compact outline popover above the footer and tracks the current section when implemented.
- Allow rich Markdown content: prose, tables, task lists, code, Mermaid, Vault links, external links, and callouts.
- Allow report-owned typed visual projections such as charts and evidence diagrams.
- Show inline Vault citations and make the source openable.
- Keep unsupported or weakly supported claims visibly labelled.
- Preserve three distinct section actions: `Ask`, `Revise`, and `Copy`.
- `Ask` is a non-destructive, section-anchored follow-up thread. It searches that section, its citations, and its prior Q&A without rewriting the report block.
- `Revise` generates a new section variant from an optional instruction; the previous version and evidence boundary remain recoverable.
- Selected-text `question / disagree / expand / note` annotations remain an additional input to later analysis rounds; they are not a replacement for section Q&A.
- Keep an overall follow-up composer below the complete report. It uses generated follow-up suggestions and appends a new analysis round while preserving the previous report.
- Show `Synthesize all rounds` only after two or more rounds exist.
- Keep save, open in file, continue, and open in Chat as report-level actions.

### 5.6 Report content model: Markdown-first, not HTML-first

The report is **Markdown-first plus typed rich artifacts**:

- narrative, headings, lists, links, citations, code, callouts, and ordinary tables stream as Markdown through `StreamdownIsolated`;
- simple deterministic diagrams may use Mermaid;
- charts, AI relationship maps, images, interactive tables, and other structured visuals are typed artifact blocks rendered by trusted React components;
- arbitrary model-generated HTML is not a report source format.

The canonical machine record remains structured run and report data. Markdown, Word, PDF, or HTML are export projections. This avoids treating a display format as the source of truth while retaining Vault-native readability, streaming, safe rendering, diffability, and future interactive components.

### 5.7 Sources workspace

Primary job: inspect the evidence set and its relationships.

Use the generic shared Result Browser already intended for Workspace, File Atlas, and Vault Search:

- `List`: detailed or compact rows with snippet, path, selection reason, cited sections, and freshness.
- `Tree`: the same evidence grouped by full Vault folder hierarchy.
- `Graph`: the same evidence projected through shared graph chrome.

Graph data semantics remain explicit:

1. `Vault graph` uses deterministic Vault links, folder relations, and optional pre-indexed semantic edges.
2. `AI relationship map` uses AI-extracted or inferred concepts and relationships, with extracted/inferred provenance styling.

They share renderer primitives such as the React Flow canvas, viewport, selection, fullscreen, and export. They do **not** share data controls. `Folder tree`, `local neighborhood`, `orbit`, hop scope, and indexed semantic edges belong to the deterministic Vault graph.

The embedded AI relationship map must match the current `MultiLensGraph` contract rather than importing candidate taxonomy from a newer artifact proposal:

- current lens ids are `topology`, `thinking-tree`, `bridge`, `timeline`, and `gap-analysis`;
- current labels are `Topology`, `Thinking Tree`, `Bridges`, `Timeline`, and `Gaps`;
- only `graphData.availableLenses` render; a graph must not promise a lens unsupported by its generated data;
- the simulator fixture may intentionally provide all five so every current projection can be reviewed;
- `Constellation / Concept / Evidence / Flow / Source` are not current AI Graph tabs and must not appear in this mock.

The accepted AI Graph artifact platform proposal may later add graph-type, review, and version semantics, but those future controls must be treated as a separate migration decision. They are not evidence of the current AI Graph UI.

Toolbar order is not host-specific:

1. `List / Tree / Graph` at the left.
2. When `Graph` is active, `Vault graph / AI relationship map` appears immediately after the view selector.
3. `Compact / Detailed` remains at the far right.
4. `Vault graph` shows scope, deterministic layout presets, semantic edges, copy, and export.
5. Before AI generation, `AI relationship map` shows a compact source/query resolver summary and `Edit inputs`.
6. After AI generation, it shows only the current data-supported AI Graph lenses and `Save to Vault`. It does not show Vault scope, Vault layout presets, semantic-edge controls, or invented artifact controls.

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
- generate data-supported current AI Graph projections for Topology, Thinking Tree, Bridges, Timeline, and Gaps;
- preserve section-level Q&A, section revision, overall Continue, and multi-round Synthesize states;
- never claim remote model behavior when the local provider produced the content.

Fast automation timing may remain fast, but it must not be presented as realistic user-facing elapsed time.

## 7. Reuse map

| Target | Existing source to reuse | Current duplicate to retire |
| --- | --- | --- |
| Landing information architecture | `2026-07-28-ai-search-unified-modes.md` | input-level `Vault Analysis` mode |
| Sources List / Tree / Graph across Workspace, File Atlas, and Search | `src/ui/component/result-browser/` | custom `V2SourcesView` list and mode toggle |
| Vault graph layout controls | `ResultBrowserToolbar.tsx` and `AtlasGraphCanvasImpl.tsx` | graph-local ad hoc controls |
| AI relationship map rendering | `MultiLensGraph` plus the AI Graph artifact contract | unlabeled graph empty state |
| Rich report body | `StreamdownIsolated` plus typed artifact renderers | repeated simulator paragraphs or arbitrary HTML |
| Shared instruction behavior | Shared AI Instruction Composer contract | raw Enter-to-chip field |

This table is an implementation direction, not an instruction to merge the deterministic Result Browser model with the AI Graph artifact model.

## 8. Acceptance criteria

- Landing has no completed history surface, only unfinished `Continue analysis`, and no unresolved template variables.
- Landing retains the original Web state icon, aligned Analyze geometry, and quiet opt-in context pinning.
- Activity shows the complete agent run and the report plan follows it.
- The plan contains only sections justified by the current answer contract.
- Every plan row exposes edit, reorder, remove, and add behavior; plan-wide refinement remains separately available.
- The selected old-framework analytical moves are visible, but no mission role is universally required as a section.
- IME candidate confirmation cannot add an instruction or start generation.
- Activity counts agree with the evidence set.
- Pending counts do not display as confirmed zero.
- Generate switches immediately to Report.
- A completed section is readable while other sections continue.
- Every completed report section exposes non-destructive Ask, versioned Revise, and Copy actions.
- The complete report exposes an overall follow-up composer; a second round does not overwrite round one.
- Footer order is `Activity / Report / TOC / Sources`; TOC opens as a popover rather than occupying a left rail.
- The simulator exercises prose, table, visual, link, citation, and long-content rendering.
- Sources use the shared List / Tree / Graph chrome.
- Graph mode selection follows `List / Tree / Graph`, density stays at the far right, and graph controls keep their established layout.
- Vault graph and AI relationship map share renderer primitives but expose different data-semantic controls.
- Vault graph and AI relationship map have separate provenance and truth labels.
- AI relationship map uses the current `Topology / Thinking Tree / Bridges / Timeline / Gaps` labels and filters them by available graph data.
- No production source is considered implemented until real Obsidian interaction verification is complete.

## 9. Do not do

- Do not replace one fixed report taxonomy with another fixed taxonomy.
- Do not delete the old report framework; preserve it as quality contracts and planner analytical moves.
- Do not make every query produce an action plan, risk audit, roadmap, or executive summary.
- Do not show simulator fast-test duration as realistic elapsed time.
- Do not solve contradictory counters by hiding them; correct the metric semantics.
- Do not style the existing Sources list to look similar while keeping a second component system.
- Do not present AI-inferred relations as Vault links.
- Do not make raw model-generated HTML the canonical report format.
- Do not treat this design mock as production acceptance.
