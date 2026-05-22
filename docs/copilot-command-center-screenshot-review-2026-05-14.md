# Copilot / Command Center Screenshot Review — 2026-05-14

## Scope

- Source folder: `/Users/zhangjike/Downloads/clipsaver/20260514-163215`
- Goal: understand screenshots one by one, identify Copilot and Command Center design issues, and propose improvements.
- Constraint: analysis only; no product code changes in this pass.
- Project phase context: `docs/progress.md` marks Copilot Phase W and AE as implemented, but manual validation for Copilot 15 actions and Copilot Agent Loop is still pending.

## Progress

- [x] 01 — `20260514-151747-20-iShot-313f295cd0.png`
- [x] 02 — `20260514-151750-19-iShot-8febc06472.png`
- [x] 03 — `20260514-151752-18-iShot-3de9f406a1.png`
- [x] 04 — `20260514-151754-17-iShot-ecead2d716.png`
- [x] 05 — `20260514-151756-16-iShot-1943072478.png`
- [x] 06 — `20260514-151759-15-iShot-a612312099.png`
- [x] 07 — `20260514-151802-14-iShot-42aea9792e.png`
- [x] 08 — `20260514-151806-13-iShot-353d034013.png`
- [x] 09 — `20260514-151810-12-iShot-672e2137e2.png`
- [x] 10 — `20260514-151813-11-iShot-7979b619f9.png`
- [x] 11 — `20260514-151822-10-iShot-ef37e0898a.png`
- [x] 12 — `20260514-151825-09-iShot-1ce30f1d43.png`
- [x] 13 — `20260514-151828-08-iShot-302759bcef.png`
- [x] 14 — `20260514-151831-07-iShot-28899c6417.png`
- [x] 15 — `20260514-151835-06-iShot-614aab5a12.png`
- [x] 16 — `20260514-151839-05-iShot-372221cf57.png`

## Per-Screenshot Notes

### 01 — `20260514-151747-20-iShot-313f295cd0.png`

Status: reviewed.

Type: hand-drawn information architecture / concept sketch.

What it shows:

- A proposed top-level command surface with tabs/sections: `copilot`, `knowledge`, and `manage / misc / settings`.
- The interaction model is explicitly compared to IntelliJ IDEA command search, likely meaning a fast command palette style entry point instead of many disconnected panels.
- Copilot appears split into two families:
  - Document-facing workflows: automatic recommendations and document actions such as split, tags, links, and writing/document operations.
  - Agent-facing workflows: action cards that run multi-step agents, with both recommended and manual triggers.
- A search/filter command list is sketched below the Copilot action grid, then a generation/run stage, then an output stage with steps, summary, diff, and apply-style actions.
- The management side includes onboarding, adding skills, search/index update, full update, and advanced settings.

Design diagnosis:

- The current product likely exposes many powerful functions, but the mental model is fragmented: Copilot actions, knowledge/index tools, and settings are perceived as separate islands.
- The sketch is asking for an operating system for the plugin: one place to discover, search, trigger, and monitor actions.
- Copilot should not be just "15 buttons". It needs hierarchy, search, recommendation, run state, result review, and apply/undo semantics.
- Command Center should separate "do something to current document" from "manage the knowledge system". Mixing these without grouping will make the interface feel noisy and unsafe.

Improvement suggestions:

- Define Command Center as the primary action router:
  - Top tabs: `Copilot`, `Knowledge`, `Manage`.
  - Global search at the top: fuzzy search over commands, skills, actions, settings, and recent runs.
  - Context strip: current note, selected text, folder, vault/index health, active model.
- In `Copilot`, group actions by intent rather than implementation:
  - `Write & Rewrite`
  - `Structure & Extract`
  - `Connect & Enrich`
  - `Review & Fix`
  - `Research & Synthesize`
- Add two lanes inside Copilot:
  - `Suggested for this note`: context-aware recommended actions.
  - `All actions`: searchable catalog for manual use.
- For agent actions, use a consistent lifecycle UI:
  - configure scope → run steps → inspect evidence → review diff/summary → apply.
- In `Knowledge`, keep index/search/graph/health tools together:
  - index status, update index, full rebuild, graph health, hub regeneration, gap analysis.
- In `Manage`, keep onboarding, model/provider settings, skills, advanced diagnostics, and usage dashboard.

Open question for later implementation:

- Should Command Center be a modal command palette, a full tabbed panel, or both? The sketch leans toward a command-palette mental model, but the agent lifecycle likely needs a richer full panel after selection.

### 02 — `20260514-151750-19-iShot-8febc06472.png`

Status: reviewed.

Type: Copilot agent result modal, `Add Evidence` action after a multi-step run.

What it shows:

- Header says `Add Evidence`, with a `Back` affordance that visually collides with the title area.
- A large step timeline is visible: browse vault, multiple searches, reads, and an `Evidence plan`.
- The step timeline has a centered `collapse` control at the top, but the content below remains visually dominant even after the main value has shifted to the result.
- The final output is rendered as plain markdown-like text inside a large scroll area.
- User annotation points to the result area as "疑问无操作", meaning the answer is not clearly actionable.

Design diagnosis:

- The modal currently explains that the agent worked, but does not convert the work into a reviewable product decision.
- `Add Evidence` should end with candidate evidence blocks and an insertion/apply workflow. Instead, it ends with text that the user must manually interpret.
- Step trace and final result are competing for attention. After completion, the default focus should move from "what happened" to "what can I approve or insert".
- The header hierarchy is weak: title, back, duration, collapse, and trace all sit in one visual layer, so the modal feels more like a debug log than a product surface.
- The result text is not tied to the source notes with clear provenance controls; it mentions evidence and quote, but there is no compact card, source open action, or insert preview.

Improvement suggestions:

- Split completed agent output into two areas:
  - Primary `Evidence candidates`: structured cards with source note, quote/excerpt, relevance reason, confidence, and checkbox.
  - Secondary `Run details`: collapsed trace/timeline, expandable only when the user wants to inspect.
- Add explicit actions at the bottom:
  - `Insert selected evidence`
  - `Copy evidence block`
  - `Open source notes`
  - `Regenerate / refine`
- Replace the raw markdown result with an insertion preview:
  - `Where it will be inserted`
  - `Text to insert`
  - `Source links`
  - `Why this evidence matches`
- Move elapsed time and step count into a small status line, e.g. `Completed in 89s · 12 steps · 8 notes inspected`.
- Make the default completed state collapse the step timeline automatically, while keeping an `Inspect steps` affordance.
- Keep `Cancel` only during running state. After completion it should become `Close`, with apply actions taking priority.

### 03 — `20260514-151752-18-iShot-3de9f406a1.png`

Status: reviewed.

Type: Copilot `Continue Writing` completed result modal.

What it shows:

- Header contains `Continue Writing`, `Back`, and a purple `CONTINUATION` badge, but the title/back area visually overlaps.
- Main body shows generated markdown tasks in Chinese.
- Footer has `Discard` and `Insert at End`, plus token usage.
- User annotation says the generated result should probably be compared together with Copilot / original document, as a file diff.

Design diagnosis:

- `Continue Writing` is a document mutation action, but the UI treats it like a detached generation result.
- `Insert at End` is too blunt. The user likely needs to decide whether the continuation belongs at end, after current cursor, after current heading, or as a new section.
- There is no side-by-side or inline diff, so the user cannot judge how the new text connects to the current note.
- The modal footer is closer to a generic AI output confirmation than a document editing workflow.
- The header layout makes the modal feel visually broken before the user even evaluates the generated text.

Improvement suggestions:

- For writing actions, switch the completed state to a document-aware preview:
  - left/upper context: current note excerpt around cursor or target heading.
  - right/lower preview: proposed insertion.
  - highlighted boundary showing exactly where new text will be inserted.
- Replace `Insert at End` with placement options:
  - `Insert at cursor`
  - `Append to current section`
  - `Append to document`
  - `Create new note`
- Add an inline diff mode for actions that rewrite or extend existing content.
- Make the generated text editable before applying.
- Fix the header composition: `Back` should be a small icon/text action outside the title line, and the action badge should sit under or beside the title without overlap.
- Keep token usage secondary, in a compact muted footer line.

### 04 — `20260514-151754-17-iShot-ecead2d716.png`

Status: reviewed.

Type: side-by-side critique of a Vault Lint duplicate-file result and a Copilot `Find & Solve Tasks` agent result.

What it shows:

- Left panel: `Duplicate Files` result with `127 groups`, `3391 files scanned`, one duplicate group selected, and a long list of paths.
- The duplicate group shows a hash-like key, `48 identical files`, plus actions such as `Keep Newest` and `Merge`.
- Right panel: `Find & Solve Tasks` completed after `74s`, with a long step trace and a raw JSON/text result at the bottom.
- Handwritten notes call out that there is too much unstructured content, the result is mostly raw text/JSON, and the Command Center/Copilot UI needs clearer organization.

Design diagnosis:

- The duplicate-file surface exposes machine-level grouping before user-level decision framing. A hash and long path list are useful evidence, but not the first thing the user needs.
- `Keep Newest` and `Merge` are high-risk destructive actions. They need a preview, rationale, affected-note count, and undo/recovery explanation before becoming primary actions.
- The task agent result repeats the issue seen in screenshot 02: after completion, the UI still emphasizes trace and raw output rather than a reviewable product artifact.
- Raw JSON in the final result makes the agent feel like a developer tool. For normal use, it should become task cards with source, suggested answer, confidence, and apply/open actions.
- The current layouts make "scan/run happened" visible, but they do not make "what should I do next" obvious enough.

Improvement suggestions:

- For duplicate files, show a decision-first group card:
  - `48 identical files`
  - recommended canonical file
  - why it is recommended, e.g. newest, most linked, non-empty frontmatter, best folder
  - affected links/backlinks
  - preview of what merge/delete will do
- Replace the raw duplicate path list with grouped affordances:
  - `Likely generated chat files`
  - `Same note across folders`
  - `Empty/zero-byte duplicates`
  - expandable full path evidence below each group.
- Gate destructive actions behind review:
  - `Review merge plan`
  - `Open compare view`
  - `Apply with backup`
  - `Ignore group`.
- For `Find & Solve Tasks`, render final output as task-resolution cards:
  - task text
  - source note
  - suggested answer/next step
  - confidence
  - actions: `Open task`, `Insert answer`, `Create follow-up note`, `Mark reviewed`.
- After completion, collapse the trace by default and put a compact status line above the result: `Completed in 74s · 3391 files scanned · N tasks found`.
- Add a Command Center-level distinction between `Maintenance results` and `Agent results`, but make both follow the same lifecycle: scan/run → grouped findings → preview → apply/ignore.

### 05 — `20260514-151756-16-iShot-1943072478.png`

Status: reviewed.

Type: Vault action grid / Command Center category critique.

What it shows:

- A `VAULT` section headed by `Batch Tag Suggestions`, with a 3-column grid of actions.
- Actions include `Find Related`, `Knowledge Gaps`, `Synthesize Topic`, `Vault Health`, `Vault Summary`, `Extract Todos`, `Deduplicate Scan`, `Find & Solve Tasks`, `Smart Connections`, `Detect & File`, `Prompt Audit`, and `Run Workflow`.
- Several items are hand-circled: `Knowledge Gaps`, `Vault Health`, `Extract Todos`, `Deduplicate Scan`, `Find & Solve Tasks`, `Smart Connections`, `Detect & File`, and `Prompt Audit`.
- Handwritten notes question whether these belong under Vault or Copilot, and mark some actions as likely unnecessary or unclear.

Design diagnosis:

- The current category is too broad. `VAULT` contains maintenance scans, writing/research agents, workflow automation, prompt tooling, and filing suggestions in one visual layer.
- The page title `Batch Tag Suggestions` conflicts with the content. The title describes one action, while the grid shows an entire vault tool catalog.
- Several actions overlap semantically:
  - `Find Related` and `Smart Connections`
  - `Knowledge Gaps` and `Synthesize Topic`
  - `Extract Todos` and `Find & Solve Tasks`
  - `Vault Health` and `Deduplicate Scan`
- User intent is missing from the hierarchy. A user probably thinks in goals like "clean my vault", "continue writing", "find next tasks", or "understand a topic", not in implementation labels.
- `Prompt Audit` feels like an admin/developer tool, not a normal Vault/Copilot action, unless the product is explicitly exposing prompt customization.

Improvement suggestions:

- Rename this surface from a single `VAULT` grid to a Command Center with intent groups:
  - `Maintain Vault`: Vault Health, Deduplicate Scan, Batch Tag Suggestions, Detect & File.
  - `Connect Knowledge`: Find Related / Smart Connections, Knowledge Gaps.
  - `Research & Synthesize`: Synthesize Topic, Vault Summary.
  - `Tasks & Workflow`: Extract Todos, Find & Solve Tasks, Run Workflow.
  - `Admin`: Prompt Audit, Settings, Index/Model diagnostics.
- Merge or visually relate overlapping actions:
  - Make `Smart Connections` the richer version of `Find Related`, or make `Find Related` a quick command inside Smart Connections.
  - Make `Extract Todos` a scan mode, and `Find & Solve Tasks` an agent mode that starts from extracted todos.
  - Make `Deduplicate Scan` one module inside `Vault Health`, not a peer unless it has a dedicated workflow.
- Replace the generic grid with two lanes:
  - `Recommended now`: 3-5 context-aware actions based on current note/vault health.
  - `All tools`: searchable grouped catalog.
- Add small scope chips to each action: `Current note`, `Folder`, `Vault`, `Selection`, `Admin`. This would immediately clarify why some tools belong under Copilot and others under Vault.
- Hide or demote developer/internal actions such as `Prompt Audit` unless the user has enabled advanced mode.
- Fix the section heading so it matches the selected category. If the selected action is `Batch Tag Suggestions`, show its configuration screen; if this is the catalog, title it `Vault Tools` or `Command Center`.

### 06 — `20260514-151759-15-iShot-a612312099.png`

Status: reviewed.

Type: `Vault Todos` result list plus `Smart Connections` empty-state critique.

What it shows:

- Left panel: `Vault Todos` with `677 / 677`, `3391 files scanned`, tag/folder filters, and a long grouped checklist by source file and line number.
- The todo list includes many heterogeneous items: recurring personal tasks, job-search tasks, file paths, PDF names, and likely noisy extracted fragments.
- Right panel: `Smart Connections`, `0 FOUND`, with an empty state: `No smart connections found for this note`.
- A partial Vault action grid is visible beside it, again suggesting navigation/category confusion.
- Handwritten notes question whether these results are too raw, whether todos should be domain-grouped, and why Smart Connections found nothing in a vault with lots of data.

Design diagnosis:

- `Vault Todos` is currently optimized for exhaustive extraction, not for prioritization. `677 / 677` communicates volume, but also tells the user the system has not reduced cognitive load.
- The list mixes actionable tasks, stale tasks, file references, and extracted noise with the same visual weight.
- There is no task workflow: select → inspect source → decide → convert/apply/snooze/archive. A checkbox alone is ambiguous because it is unclear whether it selects, completes, or marks for batch action.
- `Smart Connections` empty state is not useful enough. In a large vault, "0 found" needs diagnostic context: no index, no graph edges, current note too isolated, threshold too strict, or direct links already exist.
- The app should avoid presenting raw "all vault" results as the default. The default should be a digest of likely relevant, high-confidence, grouped items.

Improvement suggestions:

- Split `Vault Todos` into summary and detail:
  - summary cards: `Overdue`, `This week`, `By folder/project`, `High confidence`, `Needs cleanup`.
  - detail table only after selecting a group.
- Add triage states instead of plain checkboxes:
  - `Review`
  - `Create task`
  - `Open source`
  - `Ignore`
  - `Mark stale`.
- Group extracted todos by domain/project/folder and show counts before item lists.
- Add confidence and noise handling:
  - `Likely task`
  - `Maybe task`
  - `File/reference only`
  - `Already done/stale`.
- For Smart Connections empty state, add actionable diagnostics:
  - `Index status`
  - `Graph edges for this note`
  - `Similarity threshold`
  - `Direct links already present`
  - actions: `Lower threshold`, `Run index update`, `Try broader folder`, `Explain why none found`.
- Treat `0 FOUND` as a result state, not a dead end. The UI should explain what was searched and how to improve recall.

### 07 — `20260514-151802-14-iShot-42aea9792e.png`

Status: reviewed.

Type: `Vault Summary` generated weekly summary result.

What it shows:

- A `Vault Summary` result with `11 NOTES`, scoped to `Past 7 days (May 6-13, 2026)`.
- The output is a polished Chinese prose summary, then three topic groups: `会话与提示`, `产品研究、技术写作与自动化`, and `个人笔记与日记`.
- Footer actions are `Dismiss`, `Copy`, and `Save as Note`, with token usage shown.
- Handwritten notes say the result is basically correct, but there is no source citation and no Markdown-style heading/link structure.

Design diagnosis:

- This is closer to a useful user artifact than the raw agent outputs in earlier screenshots, but it still lacks provenance. A weekly vault summary without citations is hard to trust or refine.
- The result is visually formatted as cards, but the saved artifact likely needs explicit Markdown structure: headings, bullet points, source note links, and possibly date ranges.
- `11 NOTES` is not enough evidence. The user needs to know which notes contributed to each topic group and why.
- `Save as Note` is a good primary action, but there is no preview of the target path, note title, or whether it will overwrite/append/create.
- The page does not expose a useful refinement loop. If the summary is too broad or wrong, the only obvious options are copy/save/dismiss.

Improvement suggestions:

- Render each topic group with source citations:
  - note links under each group
  - date/modified time
  - 1-line evidence excerpt or reason
  - count of included vs skipped notes.
- Make the saved Markdown explicit in the UI:
  - `# Weekly Vault Summary — 2026-05-06 to 2026-05-13`
  - `## Themes`
  - `## Source Notes`
  - `## Suggested Next Actions`.
- Add source inspection actions:
  - `Show sources`
  - `Open all source notes`
  - `Exclude note`
  - `Regenerate with selected sources`.
- Upgrade `Save as Note` into a small apply flow:
  - target folder/title
  - create/append mode
  - template choice
  - duplicate warning if a summary for the same period exists.
- Add refinement chips after completion:
  - `More concise`
  - `Group by project`
  - `Focus on decisions`
  - `Include open tasks`.
- Keep the polished prose, but pair every synthesized claim with traceable source notes so the result becomes a reusable knowledge artifact, not just a generated paragraph.

### 08 — `20260514-151806-13-iShot-353d034013.png`

Status: reviewed.

Type: side-by-side completed/running agent modals for `Knowledge Gaps` and `Synthesize Topic`.

What it shows:

- Left panel: `Knowledge Gaps`, completed after `44s`, with many search/read steps and a long raw markdown result trapped in a lower scroll pane.
- Right panel: `Synthesize Topic`, completed after `114s`, with steps like browsing vault structure, reading notes, following links, and `Evidence plan`.
- Both panels show a large `collapse` control area above the steps, while the final answer appears low in the visual hierarchy.
- Handwritten notes call out that step text is too dense, final output should use Markdown rendering, and the result area should be more structured.

Design diagnosis:

- The agent trace and the agent result are competing inside one vertical stack. The UI makes the user wade through implementation evidence before reaching the product artifact.
- `collapse` looks like a debug affordance, but it occupies prime space. It should not be the central control of a finished agent result.
- Final answers are rendered like raw markdown or plaintext, which makes high-value outputs such as knowledge gaps and topic synthesis feel unfinished.
- The step list gives equal visual weight to low-level operations (`Searching...`, `Reading...`) and high-level reasoning milestones (`Evidence plan`).
- The modal footer still shows `Cancel` after useful content has appeared, which weakens the sense that the run has finished and needs review/apply actions.

Improvement suggestions:

- Redesign completed agent modals into three layers:
  - `Result`: rendered markdown/cards first.
  - `Sources`: compact cited notes and excerpts.
  - `Run details`: collapsed trace/debug log.
- Use a milestone trace instead of every low-level operation by default:
  - `Scoped topic`
  - `Searched vault`
  - `Selected evidence`
  - `Generated synthesis`
  - `Ready to review`.
- For `Knowledge Gaps`, render gap cards:
  - gap title
  - why it matters
  - evidence that coverage is missing
  - suggested note title
  - priority
  - actions: `Create note`, `Add to backlog`, `Ignore`.
- For `Synthesize Topic`, render a proper article/brief preview:
  - summary
  - key arguments
  - source notes
  - contradictions/open questions
  - suggested next writing actions.
- Replace completed-state `Cancel` with result actions:
  - `Save as note`
  - `Copy markdown`
  - `Insert into current note`
  - `Regenerate`.
- Keep the raw trace available, but label it as `Inspect run details` and default it closed when the agent has completed successfully.

### 09 — `20260514-151810-12-iShot-672e2137e2.png`

Status: reviewed.

Type: `Vault Health` result surface.

What it shows:

- Header says `Vault Health`, with `4 ISSUES`.
- Category tabs show `Orphans 1`, `Duplicates`, `Stale 1`, and `Tags 2`.
- The selected `Orphans` tab appears mostly empty except for an orphan/file icon.
- Footer says `4 total issues found`, with only `Dismiss` as an obvious action.
- Handwritten note says this method has little value and suggests reworking Vault Health.

Design diagnosis:

- `Vault Health` is exposing issue counts, but not a health narrative, severity, or next action.
- The selected category has no visible issue card, source path, reason, or fix suggestion, so the user cannot tell whether the scan found a real problem or a rendering bug.
- Counts alone create anxiety without reducing work. A health tool should prioritize and explain, not just enumerate.
- `Dismiss` is not enough for a maintenance result. The user needs review/fix/ignore flows, especially for orphans, stale notes, and tag issues.
- This page should be a dashboard-style maintenance report, not a sparse modal with tabs.

Improvement suggestions:

- Redesign Vault Health around a summary-first report:
  - overall health score or status
  - critical issues
  - quick wins
  - ignored/known issues
  - last scan time and scan scope.
- Each issue type should render actionable cards:
  - issue title
  - affected note/path
  - why it was flagged
  - confidence/severity
  - suggested fix
  - actions: `Open`, `Fix`, `Ignore`, `Create review task`.
- For `Orphans`, show why a note is orphaned:
  - no inbound links
  - no outbound links
  - no tags/folder context
  - suggested related notes to connect.
- For `Stale`, show age plus reason:
  - last modified date
  - linked active projects
  - suggested archive/update action.
- For `Tags`, distinguish missing tags from inconsistent tags and propose specific tag changes.
- Use category tabs as filters inside a richer report, not as the whole result. If a category has no visible items, show a proper empty/diagnostic state.
- Replace bare `Dismiss` with `Save report`, `Review all`, and `Dismiss`, with destructive/fix actions gated behind preview.

### 10 — `20260514-151813-11-iShot-7979b619f9.png`

Status: reviewed.

Type: Command Center action catalog, focused on `WRITING` actions.

What it shows:

- The lower part of the action grid, with `WRITING` actions:
  - `Continue Writing`
  - `Rewrite Selection`
  - `Add Evidence`
  - `Writing Plan`
  - `Write Article`
- The tail of the previous `VAULT` section is also visible: `Detect & File`, `Prompt Audit`, `Run Workflow`.
- Handwritten notes cross out or question `Rewrite Selection`, `Writing Plan`, and `Write Article`, and mention image suggestions / channels / document illustration.
- The annotation around `Rewrite Selection` implies the action should depend on context, especially whether text is selected.

Design diagnosis:

- The action grid does not communicate prerequisites. `Rewrite Selection` should be disabled or transformed when there is no active selection.
- `Writing Plan` and `Write Article` sound powerful but vague. Without scope, inputs, and output preview, they feel like generic AI buttons.
- `Add Evidence` is stronger because it has a clear job: find supporting evidence from the vault. This kind of action label maps better to user intent.
- The writing section is missing content enrichment actions that users naturally expect in a document assistant, such as suggesting images, diagrams, examples, citations, or missing sections.
- The catalog mixes immediate actions, agent workflows, and high-level generators with the same visual treatment.

Improvement suggestions:

- Add context-aware availability:
  - `Rewrite Selection`: enabled only when text is selected; otherwise show `Select text to rewrite`.
  - `Continue Writing`: enabled when a note is open; target defaults to cursor/current section.
  - `Add Evidence`: enabled when current paragraph/heading can be used as a claim/topic.
  - `Write Article`: requires topic, source scope, and target note.
- Rename or clarify vague writing actions:
  - `Writing Plan` → `Create Outline from Sources`
  - `Write Article` → `Draft Article with Citations`
  - `Continue Writing` → keep, but show insertion target.
- Add expected-output previews to action cards:
  - `creates outline`
  - `rewrites selected text`
  - `inserts cited evidence`
  - `drafts a new note`.
- Add a `Visual & Examples` sub-group or writing action family:
  - `Suggest illustration`
  - `Suggest diagram`
  - `Find supporting image idea`
  - `Generate example section`
  - `Suggest charts/tables`.
- Distinguish quick document edits from longer agents:
  - quick actions stay compact
  - agent actions show estimated runtime, source scope, and review/apply lifecycle.
- In Command Center, let context filter the catalog first. The default view should prioritize actions that are valid for the current editor state.

### 11 — `20260514-151822-10-iShot-ef37e0898a.png`

Status: reviewed.

Type: `Article Review` issue list, individual fix preview, and fixed-state return.

What it shows:

- Left panel: `Article Review` for `FULL DOCUMENT`, listing warning items such as `目的不明确`, `结构松散、缺少层级与分类`, `条目内容过于简略且不一致`, and `缺乏证据与来源引用`.
- Each issue includes a recommendation and a `Fix` action.
- Middle panel: after choosing a fix, the UI shows a diff-like preview with removed/added text, `Skip`, `Accept Fix`, and `Back to review`.
- Right panel: returning to the review list shows the first issue as `Fixed`.
- Handwritten notes call out header/back duplication, the need to mark fixed after clicking fix, and unclear state handling.

Design diagnosis:

- This is one of the stronger workflows because it has a concrete review item, a proposed patch, and an accept/skip decision.
- The navigation hierarchy is visually broken: `Back` appears duplicated/overlapped with the title area, and `Back to review` competes with `Skip`/`Accept Fix`.
- The issue state model is under-specified. `Fix` can mean "generate a fix", "apply a fix", or "open a fix preview"; the UI should distinguish these.
- After a fix is applied, the review list needs a clear state transition and audit trail: fixed, skipped, needs manual review, failed, or regenerated.
- The diff preview is useful, but it needs stronger document context: where the change occurs, whether it touches frontmatter/body, and whether the user can edit before accepting.

Improvement suggestions:

- Rename states/actions to match the lifecycle:
  - `Review issue`
  - `Generate fix`
  - `Preview fix`
  - `Accept fix`
  - `Fixed`.
- In the issue list, show state badges:
  - `Warning`
  - `Fix ready`
  - `Fixed`
  - `Skipped`
  - `Manual review`.
- In fix preview, use a clear footer:
  - secondary: `Back to issues`, `Skip`
  - primary: `Accept fix`.
- Remove duplicate `Back` text from the header and keep one small navigation affordance.
- Add context to the diff:
  - target section/frontmatter/body
  - before/after word count
  - whether links/frontmatter will be changed.
- After accepting, keep the fixed issue visible but collapsed, with `Undo`, `View applied diff`, and `Reopen`.
- Treat `Article Review` as a high-confidence pattern for other Copilot actions: finding issues is not enough; every issue should have reviewable, reversible fix flow.

### 12 — `20260514-151825-09-iShot-1ce30f1d43.png`

Status: reviewed.

Type: collage of Copilot modal states: `Article Review`, fix preview, running state, and `Summary`.

What it shows:

- Multiple Copilot result modals are shown in one canvas, with red annotations around duplicated/overlapping `Back` controls and header icons.
- `Article Review` has at least four states visible: generating response, issue list, generating fix, fix preview, and fixed issue list.
- The fix preview shows red/green diff, `Back to review`, `Skip`, and `Accept Fix`.
- After accepting/skipping, the return state is annotated as unclear: the user expects the original item to show a proper fixed/skipped state instead of visually ambiguous status.
- A `Summary` action result is shown with `Dismiss`, `Copy`, and `Insert at Top`; the handwritten note says summary should support concise/brief simplification.

Design diagnosis:

- The core problem is not just one broken header. The Copilot modal shell lacks a single state machine shared by all actions.
- `Back`, title, icon, badge, scope, file name, and status are competing in the same top-left area. This makes every modal state look slightly broken.
- Running, generated, preview, accepted, skipped, and completed states are presented as separate screens, but the user cannot easily understand what state they are in or what happens after each action.
- `Skip` in the fix preview is ambiguous. It could mean skip this issue, reject this generated patch, or return without applying.
- `Summary` is currently treated as a plain generated block. For a document-summary workflow, the useful controls are not just copy/insert; the user needs length, placement, and format controls.

Improvement suggestions:

- Define one Copilot modal state model and reuse it across all actions:
  - `Configuring`
  - `Running`
  - `Result ready`
  - `Previewing change`
  - `Applied`
  - `Skipped`
  - `Failed`.
- Standardize the modal header:
  - one back button at far left
  - action icon + title in a stable title slot
  - scope badge under or beside title
  - current file/path on the right
  - no duplicated `Back` text inside content.
- For review/fix flows, separate patch lifecycle actions:
  - `Back to issues`
  - `Reject this fix`
  - `Accept fix`
  - `Regenerate fix`.
- After accepting a fix, return to the issue list with a compact applied state:
  - `Fixed`
  - `View diff`
  - `Undo`
  - `Reopen`.
- For `Summary`, add result transformation controls:
  - `Shorter`
  - `Detailed`
  - `Bullet summary`
  - `Executive summary`
  - `With source links`.
- Replace `Insert at Top` with placement choices or a dropdown: top of note, below title, current cursor, new note, or append to summary section.
- Treat this screenshot as evidence that Copilot needs a shared result shell before individual action polish; otherwise the same header/state bugs will recur across every action.

### 13 — `20260514-151828-08-iShot-302759bcef.png`

Status: reviewed.

Type: Copilot action taxonomy critique, focused on link/tag/split/review/polish actions and agent-vs-direct workflows.

What it shows:

- `Suggest Links` is shown as an agent-style run with step trace, searches, reads, and an `Evidence plan`.
- A separate `Semantic Link Suggestions` / graph-neighbor style panel is shown beside it, suggesting there are at least two link recommendation mechanisms.
- `Correct Content` is shown as a batch diff/review result with `Accept`, `Reject`, and `Accept All Remaining`.
- The action catalog shows document actions: `Suggest Tags`, `Suggest Links`, `Suggest Links (Graph)`, `Suggest Split`, `Review Article`, `Correct Content`, `Polish Document`, `Format Polish`, `Summarize`, `Translate`, and others.
- Handwritten notes ask whether each action can choose auto/manual behavior, whether link recommendation should be an agent workflow, whether link actions should merge, and whether all Copilot mutations should use diff.

Design diagnosis:

- The current action catalog exposes implementation variants as separate user choices. `Suggest Links` and `Suggest Links (Graph)` are probably two strategies under one user intent, not two top-level actions.
- Some actions are discovery-only, some generate text, and some mutate the document, but the grid gives them the same weight and interaction expectation.
- Link suggestion is a good example of strategy confusion: semantic search, graph neighbor expansion, and agent exploration can all contribute to one result, but the user should mainly see candidates and evidence.
- `Correct Content`, `Polish Document`, `Format Polish`, `Translate`, and `Summarize` all risk changing text. They need consistent diff and accept/reject semantics.
- The user is asking for per-action operating modes: some actions should run automatically as ambient suggestions, while others should remain explicit commands.

Improvement suggestions:

- Merge link-related actions into one `Suggest Links` workflow with strategy tabs or provenance labels:
  - semantic similarity
  - graph neighbors
  - backlinks/co-citation
  - agent-discovered evidence.
- Add a per-action capability model in the Command Center:
  - `Suggests only`
  - `Creates draft`
  - `Edits document`
  - `Runs vault scan`
  - `Needs approval`.
- For every document-mutating action, use the same review surface:
  - grouped proposed changes
  - inline diff
  - accept/reject per item
  - accept all only after visible summary
  - undo or rollback note.
- Add per-action automation settings:
  - `Manual only`
  - `Suggest quietly`
  - `Auto-run on save`
  - `Auto-apply never`.
- Move strategy names out of the main grid. The card should say `Suggest Links`; its detail panel can explain which signals are used and let advanced users tune them.
- Group document actions by outcome:
  - `Connect`: tags, links, concepts
  - `Structure`: split, format, outline
  - `Review`: article review, correct content, task check
  - `Rewrite`: polish, translate, summarize.
- For link suggestions, final output should be candidate link cards, not an agent transcript:
  - target note
  - anchor text
  - insertion location
  - reason/source signal
  - confidence
  - preview diff.
- Treat `Correct Content`'s accept/reject batch UI as the baseline pattern for all text-changing actions, but fix the header/state issues noted in screenshots 11-12.

### 14 — `20260514-151831-07-iShot-28899c6417.png`

Status: reviewed.

Type: `Suggest Links` agent run critique and semantic-link result comparison.

What it shows:

- Three `Suggest Links` modal states at different elapsed times: around `8s`, `20s`, and `108s`.
- The step trace shows repeated searches and reads, ending with `Evidence plan`.
- The bottom result is a plain numbered list of suggested link ideas such as `Your existing SAAS knowledge base`, `SAAS tool matrix`, and `Search technology context`.
- A separate `Semantic Link Suggestions` panel lists many candidate notes with percentages and `IN`/`OUT` direction labels.
- Handwritten notes say the process is too obviously an agent walk, link recommendations should not be just simple semantic search, and the final result should be inserted/previewed at a specific document position.

Design diagnosis:

- The agent progress is too low-level for a normal link suggestion workflow. It exposes search steps, but does not clearly show when the system has enough evidence to propose links.
- The final result is not in a form the user can act on. A numbered paragraph forces the user to manually translate suggestions into Markdown links.
- The semantic-link panel has useful candidate ranking, but it is detached from document editing: there is no anchor text, insertion location, or diff preview.
- `Suggest Links` should not choose between agent exploration and semantic graph search as separate experiences. The best product experience is a single result list enriched by multiple evidence sources.
- The current UI lacks a "recommend automatically, let me approve" mode. Link suggestions are exactly the kind of feature that should be able to run quietly and surface a small review queue.

Improvement suggestions:

- Make `Suggest Links` output link insertion proposals:
  - source sentence/paragraph
  - proposed anchor text
  - target note
  - direction: outgoing link to add, incoming backlink opportunity, or related note only
  - reason and confidence
  - diff preview.
- Collapse the agent trace into a progress summary:
  - `Searched 5 queries`
  - `Read 4 notes`
  - `Found 13 candidates`
  - `Selected 5 insertions`.
- Combine semantic and agent signals in one ranked candidate list. Show source badges like `semantic`, `graph`, `agent`, `backlink`, `co-citation`.
- Add batch actions:
  - `Apply selected links`
  - `Open target notes`
  - `Ignore selected`
  - `Save as suggestions`.
- Add automatic modes at the Command Center/action settings level:
  - suggest links while editing
  - show suggestions only above confidence threshold
  - never auto-apply
  - include/exclude graph-only candidates.
- For graph/semantic candidates that are relevant but not suitable for direct insertion, label them as `Related notes` rather than forcing them into link edits.
- Replace the long final paragraph with a review table/card list; keep the agent narrative only under `Inspect reasoning`.

### 15 — `20260514-151835-06-iShot-614aab5a12.png`

Status: reviewed.

Type: `Tag Suggestions` batch recommendation panel.

What it shows:

- A `Tag Suggestions` modal for file `SAAS公司`.
- Four `MEDIUM CONFIDENCE` tag suggestions are shown: `#search-as-a-service`, `#integrations`, `#ecommerce`, and `#headless-cms`, with confidence around `46-48%`.
- Each row has accept, reject, and edit icons.
- Footer says `0 of 4 accepted`, with buttons `Accept High Confidence`, `Skip All`, and a disabled-looking `Apply 0 Tags`.
- Handwritten notes say the UI is repetitive across Copilot function panels, the style is inconsistent, and there is "没反应" around the high-confidence action.

Design diagnosis:

- This is a good candidate for a reusable "suggestion review" pattern, but the current implementation feels like another one-off modal.
- `Accept High Confidence` is misleading when all visible suggestions are medium confidence. Clicking it may correctly do nothing, but the UI does not explain why.
- `Apply 0 Tags` is technically accurate but not helpful. It should tell the user what selection is needed or stay secondary until there are accepted tags.
- Per-row icon-only actions are compact, but without labels/tooltips or hover explanations they are too cryptic for a review workflow.
- The modal still has the same header problem as earlier screenshots: icon/title/back are visually crowded, making a useful panel feel rough.
- Tag suggestions need a stronger "why this tag" and "where it will be written" preview because tags alter document metadata/frontmatter.

Improvement suggestions:

- Introduce a shared `SuggestionReviewPanel` pattern for tags, links, todos, evidence, and corrections:
  - suggestion rows/cards
  - confidence tier
  - rationale/evidence
  - accept/reject/edit
  - batch actions
  - apply preview.
- Hide or disable `Accept High Confidence` when there are no high-confidence items, with helper text such as `No high-confidence tags found`.
- Replace `Apply 0 Tags` with a clearer disabled state:
  - `Select tags to apply`
  - enabled state: `Apply 2 Tags`.
- Show the write target before applying:
  - frontmatter `tags`
  - append vs merge behavior
  - duplicate tag handling
  - preview of final tag list.
- Add row action labels or tooltips:
  - accept tag
  - reject tag
  - edit tag.
- Allow quick filtering by confidence: `High`, `Medium`, `Low`, `Rejected`, `Accepted`.
- For low/medium confidence tags, show stronger evidence: matching phrases, neighbor tags, graph signals, or source section.
- Treat this as a reusable review surface, not a bespoke tag modal. The same visual rules should apply to link suggestions, content corrections, and task extraction.

### 16 — `20260514-151839-05-iShot-372221cf57.png`

Status: reviewed.

Type: full Command Center / Copilot action catalog critique with handwritten taxonomy notes.

What it shows:

- A large action catalog split into `DOCUMENT`, `VAULT`, and `WRITING`.
- `DOCUMENT` includes `Suggest Tags`, `Suggest Links`, `Suggest Links (Graph)`, `Suggest Split`, `Review Article`, `Correct Content`, `Polish Document`, `Format Polish`, `Summarize`, `Extract Concepts`, `Translate`, and `Check Task List`.
- `VAULT` includes `Batch Tag Suggestions`, `Find Related`, `Knowledge Gaps`, `Synthesize Topic`, `Vault Health`, `Vault Summary`, `Extract Todos`, `Deduplicate Scan`, `Find & Solve Tasks`, `Smart Connections`, `Detect & File`, `Prompt Audit`, and `Run Workflow`.
- `WRITING` includes `Continue Writing`, `Rewrite Selection`, `Add Evidence`, `Writing Plan`, and `Write Article`.
- Handwritten notes propose merging `Suggest Links` and `Suggest Links (Graph)`, turning review/polish actions into a shared review/fix flow, questioning `Translate`, `Check Task List`, `Rewrite Selection`, `Writing Plan`, and `Write Article`, and adding image/channel/document-illustration suggestions.
- Several side thumbnails repeat the same modal-shell problems from earlier screenshots: duplicated/overlapping `Back`, ambiguous `Cancel`, generated-fix state, and long review lists.

Design diagnosis:

- The catalog is organized by implementation buckets, but the user is judging it by intent and workflow. Many cards are not wrong individually; the problem is that the catalog asks the user to choose between too many near-duplicate verbs before the system has used context.
- `Suggest Links` and `Suggest Links (Graph)` should not be separate top-level choices. They are strategies/signals inside one link recommendation workflow.
- `Polish Document`, `Format Polish`, `Correct Content`, and parts of `Review Article` overlap. They should share one review/fix engine with different issue filters and output presets.
- `Translate` is not naturally a first-class Copilot action for this product unless the current document or user workflow clearly needs it. Otherwise it reads like generic AI assistant filler.
- `Check Task List`, `Extract Todos`, and `Find & Solve Tasks` are three stages of one task workflow, not three unrelated cards.
- `Find Related` and `Smart Connections` overlap heavily. If both remain, the difference must be visible: one quick semantic lookup vs one richer graph/agent explanation.
- `Rewrite Selection` should be context-gated. If no text is selected, it should not appear as a normal enabled card.
- `Writing Plan` and `Write Article` are too broad without inputs, source scope, citations, and target note handling. They need configuration before they become trustworthy.
- The handwritten image/channel note is important: for a document assistant, "what visual/diagram/example should this section include" may be more differentiated than another generic rewrite action.

Improvement suggestions:

- Reframe the catalog around user goals, not current code modules:
  - `Improve current note`: review, correct, polish, summarize, translate only when relevant.
  - `Connect this note`: tags, links, related notes, concepts.
  - `Structure this note`: split, format, outline, task check.
  - `Use my vault`: evidence, synthesis, knowledge gaps, vault summary.
  - `Maintain my vault`: health, duplicates, batch tags, filing, index/graph upkeep.
  - `Create from sources`: writing plan, article draft, visual/diagram suggestions.
- Merge top-level duplicates:
  - `Suggest Links` + `Suggest Links (Graph)` → one `Suggest Links` action with semantic/graph/agent source badges.
  - `Find Related` + `Smart Connections` → one related-notes experience with quick and deep modes.
  - `Extract Todos` + `Check Task List` + `Find & Solve Tasks` → one task workflow with scan, review, and solve modes.
  - `Polish Document` + `Format Polish` + `Correct Content` → one document quality workflow with issue categories.
- Add context-aware surfacing:
  - selection exists → show `Rewrite Selection`.
  - long note → show `Suggest Split`, `Summarize`, `Create Outline`.
  - claim-like paragraph → show `Add Evidence`.
  - many orphan/duplicate/stale signals → show vault maintenance tools.
  - image/diagram-worthy section → show `Suggest Visual`.
- Make risky or mutating actions use the shared review/apply shell:
  - generated changes are shown as diffs.
  - each change can be accepted/rejected.
  - batch accept is secondary until the user has seen the summary.
  - every apply operation has undo or at least a visible recovery path.
- Demote generic or unclear actions:
  - hide `Translate` unless language mismatch or selected text makes it relevant.
  - hide `Prompt Audit` behind advanced/admin mode.
  - treat `Run Workflow` as an advanced builder entry, not a normal daily action.
- Add missing document-enrichment actions:
  - `Suggest Visual`
  - `Suggest Diagram`
  - `Suggest Example`
  - `Suggest Table/Chart`
  - `Find Missing Evidence`.
- Preserve the star/recommended signal, but make it explainable: `Recommended because this note is long`, `Recommended because no tags`, `Recommended because similar notes exist`.

## Cross-Screenshot Themes

1. Command Center needs an intent-first information architecture.

The repeated complaint is not that there are too many features in absolute terms. It is that the current grid exposes raw feature inventory. The product needs a router that starts from user intent, current context, and risk level, then reveals the right workflow.

2. Copilot needs one shared action lifecycle.

Across article review, tags, links, evidence, summary, writing, and agent actions, the shell should follow the same state model: configure → run → result ready → preview change → apply/reject → applied/skipped/failed. The duplicated `Back`, lingering `Cancel`, and ambiguous fixed/skipped states are symptoms of each action inventing its own modal behavior.

3. Results should become reviewable artifacts, not raw output.

Several screenshots show traces, raw markdown, or JSON-like text after a successful run. Completed results should become domain artifacts: evidence cards, link insertion proposals, tag suggestions, task cards, health issue cards, article review issues, summary notes, or diffs.

4. Trace is useful but currently too prominent.

Agent steps are valuable for trust and debugging, but after completion they should collapse behind `Inspect run details`. The primary screen should show what the user can approve, save, insert, fix, ignore, or refine.

5. Document mutation must always be previewable and reversible.

Anything that changes a note should use diff/preview semantics: correct content, polish, format, translate, summarize insert, continue writing, add evidence, links, tags, and task-list edits. A blunt `Insert at End` or `Accept All Remaining` should never be the first or only product decision.

6. Several features should be merged as modes, not exposed as separate cards.

The clearest merges are link suggestions, related notes, task extraction/solving, document quality fixes, and vault maintenance. Strategy names such as semantic, graph, agent, or MD5 belong in provenance badges and advanced controls, not necessarily top-level cards.

7. Empty and low-confidence states need explanation.

`0 FOUND`, `Accept High Confidence` with no high-confidence items, and sparse health tabs all feel broken even when technically correct. The UI should explain what was checked, why nothing happened, and what the user can do next.

8. The strongest existing pattern is review → diff → accept/reject.

`Article Review` and `Correct Content` are closest to the right interaction model. Their content can become the baseline for all mutation workflows, once the modal shell and state transitions are cleaned up.

## Proposed Improvement Backlog

### P0 — Shared Copilot / Command Center Foundations

- Define the Command Center IA: `Copilot`, `Knowledge`, `Maintain`, `Manage`, plus global search and context strip.
- Define a shared Copilot action lifecycle state machine and modal shell.
- Fix the header system once: one back affordance, stable title/icon/scope/status layout, no duplicated `Back`, running-state `Cancel` only while actually running.
- Build a reusable `SuggestionReviewPanel` / result-review pattern for tags, links, evidence, tasks, and corrections.
- Make completed agent runs default to result-first, with trace collapsed as `Inspect run details`.

### P1 — Merge and Clarify Action Taxonomy

- Merge `Suggest Links` and `Suggest Links (Graph)` into one link workflow with semantic/graph/agent provenance.
- Merge `Find Related` and `Smart Connections` or clearly split them into quick vs deep modes.
- Merge `Extract Todos`, `Check Task List`, and `Find & Solve Tasks` into one task workflow with scan/review/solve modes.
- Merge `Polish Document`, `Format Polish`, `Correct Content`, and parts of `Review Article` into one document quality workflow with issue categories.
- Demote `Prompt Audit`, `Run Workflow`, and possibly `Translate` behind advanced/contextual availability.

### P2 — Result Surfaces by Workflow

- Link suggestions: candidate cards with anchor text, target note, insertion location, reason, confidence, and diff preview.
- Tags: confidence/rationale rows, frontmatter preview, no-op explanations for high-confidence batch actions.
- Evidence: source cards, quote/excerpt, insertion preview, selected evidence apply flow.
- Writing: cursor/section-aware insertion, editable generated text, placement choices, side-by-side or inline diff.
- Review/fix: issue list, generated patch preview, fixed/skipped/manual-review states, undo/view applied diff.
- Vault health: dashboard summary, issue cards, severity/confidence, review/fix/ignore actions.
- Vault summary/topic synthesis: Markdown preview with source citations, save target, refinement chips.

### P3 — Context-Aware Recommendations

- Show recommended actions because of observable context: selection, note length, missing tags, weak links, stale/duplicate signals, topic density, or visual/diagram opportunities.
- Disable or transform invalid actions instead of showing generic cards, e.g. `Rewrite Selection` only when text is selected.
- Add scope chips to action cards: `Selection`, `Current note`, `Folder`, `Vault`, `Admin`.
- Add automation modes per action: `Manual only`, `Suggest quietly`, `Auto-run on save`, `Auto-apply never`.

### P4 — Product Differentiators

- Add document-enrichment actions that fit this product better than generic AI assistant commands: `Suggest Visual`, `Suggest Diagram`, `Suggest Example`, `Suggest Table/Chart`, and `Find Missing Evidence`.
- Turn vault maintenance into a guided review queue rather than raw scans: duplicate groups, stale notes, orphan notes, tag cleanup, and filing suggestions should all explain risk and offer safe apply/ignore paths.
- Use provenance everywhere: source notes, graph signal, semantic match, agent-discovered evidence, modified date, and confidence should be visible enough to build trust without overwhelming the default view.

## 2026-05-14 Direction Correction

After the first design artifact pass, user feedback clarified that the full-page Command Center/workbench direction is too complex for the actual product boundary.

Corrected conclusion:

- Peak Assistant should primarily live in an Obsidian side panel.
- The note/editor remains the primary workspace.
- Command Center is a routing model, not necessarily a standalone page.
- Actions should be quickly callable from selection, command palette, panel shortcuts, toolbar, context menu, or existing Obsidian commands.
- Complex workflows should unfold across multiple small states: recommendation -> scoped action -> running summary -> result review -> preview/apply.
- Full-page or three-column workbench views should be treated as secondary/advanced expansion, not the first implementation target.

Follow-up artifacts:

- `docs/gstack/copilot-command-center-redesign-2026-05-14/panel-first-revision.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/obsidian-panel-flow-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/imagegen-panel-flow-prompt.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/obsidian-panel-flow-codex-imagegen.png`

## 2026-05-14 Follow-Up Correction: Pop-Out Panels

User follow-up clarified that "panel-first" must not become "narrow side panel only." The product also needs pop-out panels similar to the referenced Copilot action panel, because many operations require more space to browse, compare, configure, and review.

Updated conclusion:

- The docked Obsidian side panel is the daily ambient home.
- A larger pop-out command panel is needed for action browsing, category navigation, and workflow configuration.
- A focused review/apply panel is needed for candidates, provenance, diffs, and safe mutation.
- The correct model is a multi-panel system inside Obsidian, not a separate full page and not a cramped sidebar-only experience.
- The referenced middle panel is directionally useful, but it should improve hierarchy: recommendations should explain why, duplicate actions should be merged, and cards should show scope/risk rather than appearing as equal generic buttons.

Follow-up artifacts:

- `docs/gstack/copilot-command-center-redesign-2026-05-14/multi-panel-surface-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/popout-command-panel-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/imagegen-panel-system-prompt.md`

## 2026-05-14 Follow-Up Correction: Intent Hubs And Auto-Orchestration

Re-reading the original hand-drawn sketch and later annotations changes the product interpretation again.

The most important request is not just better panels. The user wants high-level entries like `Copilot` or `Knowledge Analysis` to automatically decide which underlying functions to call.

Updated conclusion:

- `Copilot` should be an intent hub: analyze the current note/selection and produce a plan across tags, links, split, evidence, review/fix, summary, tasks, and visual suggestions.
- `Knowledge Analysis` should be an intent hub: analyze topic/folder/vault scope and produce a plan across related notes, knowledge gaps, synthesis, vault summary, health, tasks, and maintenance.
- The action grid should become a capability registry, not the primary product face.
- Safe discovery can run automatically; mutations still require review/apply.
- Manual action search remains important, but it is a fallback for power users or edge cases.
- The panel system should display the generated plan and review queue, not merely reorganize the old cards.

Follow-up artifacts:

- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/intent-hub-auto-orchestration-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/intent-hub-orchestration-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/capability-visual-gallery.html`

## 2026-05-15 Follow-Up Correction: Merge Vault-Level Hubs

The latest review clarified that `Knowledge Analysis`, `Research / Synthesize`, and `Maintain Vault` should not remain as separate top-level entries. They are all vault-level work and should merge into one hub: `Vault Intelligence`.

Updated conclusion:

- `Copilot` remains the current-note/selection hub.
- `Vault Intelligence` becomes the vault/topic/folder hub with three modes:
  - `Analyze`: related notes, gaps, graph signals, vault summaries.
  - `Synthesize`: cited topic synthesis, source-backed draft/report, save-as-note.
  - `Maintain`: vault health, dedupe, filing, tags, stale notes, task review.
- `Manage System` remains separate for index/model/skills/prompts/diagnostics.
- The canonical rendered report should be a visual UX flow board with embedded evidence images, bitmap mockups, prototype iframes, and page/panel transitions, not a text-heavy report or one-card-per-feature gallery.
- The side-panel diff shown in the storyboard is too small for real document changes. For polish/rewrite/format/review fixes, the review surface should become a VSCode-like full-document diff with current and proposed rendered Markdown side by side. Raw Markdown/source diff should be secondary.
- The pop-out command panel should follow the existing Search-view pattern: top tabs for `Document`, `Vault`, and `Setting`, with a command search input in every tab. These tabs map to Copilot, Vault Intelligence, and Manage System respectively.

Follow-up artifacts:

- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`
- `docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `docs/superpowers/plans/2026-05-14-copilot-command-center-user-centered-redesign.md`
