# Peak Composer Related Document Map

Date: 2026-07-22
Status: handoff map for the next Composer + Intelligence requirements task

## Purpose

This document organizes the artifacts from the Peak Composer editing-view discussion and the earlier Copilot, Ambient, Chat Studio, File Atlas, and AI-surface sessions.

Use it before starting a new implementation or requirements session. The goal is not to read everything. The goal is to know which documents are source of truth, which are visual evidence, and which are older background that should not override the latest Composer direction.

## Immediate Handoff Target

The complete production implementation task now has one consolidated execution handoff:

- [`2026-07-24-peak-composer-complete-implementation-handoff.md`](../plans/2026-07-24-peak-composer-complete-implementation-handoff.md)

It combines the dedicated Composer host, Markdown/source model, editing and selection contracts, transaction/History/Undo rules, every current block/object requirement, the AI capability architecture, Intelligence Sidecar, shared Result Browser, execution DAG, Impact Contract and verification gates. A new coding session should start from that document rather than reconstructing requirements from the long mock conversation.

Current decision and execution handoff:

- [`2026-07-22-peak-composer-intelligence-sidecar-handoff.md`](../plans/2026-07-22-peak-composer-intelligence-sidecar-handoff.md)

Primary review URL:

`file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/index.html?mode=copilot&stage=brief`

Primary local artifact folder:

`docs/gstack/peak-composer-editing-view-2026-07-09/`

Latest owner-review additions in the integrated mock:

- selection toolbar: Paste URL into one semantic unit, Highlightr marks, Easy Copy as text / image / Markdown / HTML; cross-paragraph / cross-Block / cross-item / cross-cell formatting is one transaction partitioned into per-unit inline wrappers so structural nodes are never wrapped. Code Block selections suppress rich-text formatting entirely;
- Block hover: Easy Copy uses the same output contract as a text selection. Choosing a format copies immediately, shows a transient in-place check, and closes; there is no preview or second `复制 PNG` action. Image output sends the original rendered HTMLElement and click-time source rect into the rasterizer, so lists, table column widths/line breaks and KaTeX retain their actual appearance;
- formula workflow: the parent formula group and every individual display-formula micro-block independently expose text / LaTeX / HTML / exact-rendered-image output; each micro-block uses one flattened deterministic + AI action row rather than an `AI · N` opener followed by a second menu. Explain, split, and `变量表` all stay on the clicked micro-block; `变量表` shows only that formula's symbols, with no parent-group projection, other-formula cards, scope switcher, multi-select, or shared-variable map. Any future cross-formula comparison must be a separately named parent-group capability;
- image workflow: a clipboard bitmap pasted at a document caret creates a new image Block there (including paragraph split when needed), then enters semantic rename review; this is not an action on an existing image toolbar. Existing images keep deterministic Image Converter, exact-render copy, AI caption/edit and immutable-original writeback. AI caption is an in-place `figcaption` rewrite inside the same figure; an existing caption is streamed and diffed in that line, while an absent caption alone creates a caption slot. It never inserts a sibling prose Block;
- generated-content review: semantic AI drafts routed through the additive draft runtime—such as supplementary prose, question lists and generated table/image candidates—stay in one transaction with a targeted instruction field, `previous / next version`, `接受`, `重新生成` and `丢弃`; in-place rewrite diff uses the same field with `重新生成`. Enter and the button submit the same instruction, which is frozen into the new review-only candidate rather than Markdown and remains editable for the following iteration. Their pending visual is an inline document draft: neutral body and outline, no decorative colored rail or shadow, one compact aligned review footer, and no ordinary Block chrome until acceptance. Version controls are absent for a single candidate and become one aligned segmented control only when multiple candidates exist. Textual candidates visibly stream into the candidate body on both initial generation and regeneration; they cannot wait and then appear all at once. Regeneration appends a candidate without overwriting or writing Markdown, and accepting commits only the currently visible completed version. Deterministic transforms and object patches keep their own recalculate/restore semantics instead of pretending to regenerate;
- Frontmatter workflow: the vault-wide field/tag inventory powers a persistent `添加属性` row under the current properties. Clicking it opens a bounded search/create picker rather than expanding the full inventory into the document; common missing fields appear first, existing/system/single-use noise stays out of the default set, and `浏览全部` scrolls inside the overlay. Selection creates an editable current-note candidate and nothing writes YAML without field-level acceptance. Vault-wide statistics and schema conflict governance are separate from this editing flow. The pre-run AI trigger says `AI 建议` and never presents an action count as a result count;
- table workflow: plain grids remain pipe Markdown; merged cells upgrade that block to a raw HTML table inside Markdown; bar/line/pie output is a separate review-only Chart Block backed by fenced `chart` source;
- component consistency: peer controls share geometry by role, density and state rather than by whether they are AI-powered. Block action capsules, compact selection/object tools, 30×30 rail controls, review actions, status chips and panel shells are six distinct families. The current mock consumes production Peak tokens and browser QA compares computed styles across the families;
- these remain design-stage capabilities in the dedicated Composer View. They do not imply changes to the existing CodeMirror editor or completed production adapters.

Latest AI development architecture:

- [`2026-07-24-peak-composer-ai-capability-modularity-architecture.md`](2026-07-24-peak-composer-ai-capability-modularity-architecture.md) is the source of truth for the capability inventory, stable IDs, target/applicability/result contracts, app-owned runtime composition, renderer and writeback registries, candidate/history lifecycles, migration order and extension checklist. It translates the interaction contract into a modular implementation model; it does not supersede the visual/product behavior rules in the current mock or Block AI contract.

## Source Of Truth Order

1. Current owner decisions recorded in the handoff and current Composer contracts.
2. Current integrated mock and its README.
3. The July Composer specs: editing view, block AI capability contract, Intelligence sidecar UI.
4. The sidecar / lab files in the same Composer artifact folder.
5. User feedback embedded in the current conversation and browser comments.
6. Earlier Copilot, Ambient, Chat Studio, and AI-surface documents as background patterns only.
7. `docs/progress.md` for current project phase and implementation state.

When documents conflict, the later Composer-specific docs win. Older Copilot Command Center and Ambient Push artifacts provide concepts and visual vocabulary, not the final current layout.

## Current Composer Artifacts

These are the must-read files for a new session.

- `docs/superpowers/specs/2026-07-24-peak-composer-ai-capability-modularity-architecture.md`
  Capability inventory and modular implementation architecture. Start here when adding, migrating or maintaining an AI capability.
- `docs/gstack/peak-composer-editing-view-2026-07-09/README.md`  
  Entry point and current source-of-truth boundaries for the mock.
- `docs/gstack/peak-composer-editing-view-2026-07-09/index.html`  
  Integrated owner-review mock for the Composer view.
- `docs/gstack/peak-composer-editing-view-2026-07-09/mock.css`  
  Main document canvas, block controls, native object, table, image, formula, and inline AI styles.
- `docs/gstack/peak-composer-editing-view-2026-07-09/mock.js`  
  Block interaction fixtures, AI menu behavior, generated drafts, object transforms, native renderers, and focused-block projection.
- `docs/gstack/peak-composer-editing-view-2026-07-09/diff-patterns-lab.html`
- `docs/gstack/peak-composer-editing-view-2026-07-09/diff-patterns-lab.css`
- `docs/gstack/peak-composer-editing-view-2026-07-09/diff-patterns-lab.js`
  Interactive owner-review surface for `工作视图 / 全部改动 / 纯净阅读` and text, heading, insertion, deletion, link/citation, list, table, image and Frontmatter diff patterns.
- `docs/gstack/peak-composer-editing-view-2026-07-09/composer-editing-patterns.qa.mjs`
  Browser acceptance for global Vault property selection, field-level Frontmatter candidates, matched collapse/drag hit targets, immediate Easy Copy feedback, complex-table HTML persistence, Chart Block acceptance, Code Block formatting exclusion, combined selection toolbar, in-place review modes, lab filtering/decisions and horizontal overflow. `selection-format-matrix.qa.mjs` adds 24 structural-format cases and four owner-review screenshots.
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence.css`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-panel.js`  
  Current shared static-mock source for the Intelligence shell.
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.html`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.css`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.js`  
  Small-DOM sidecar debugging host. Use it to iterate sidecar IA without repeatedly reading the large integrated mock.
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.css`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.js`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.qa.mjs`  
  Isolated IA acceptance and comparison harness. The `adaptive` route is the current selected acceptance fixture; `staged` and `hybrid` remain comparison / regression evidence and must not redefine the shared sidecar.
- `docs/gstack/peak-composer-editing-view-2026-07-09/copilot-ambient-consolidation-review-2026-07-17.md`  
  Notes on how Copilot and Ambient were consolidated for the sidecar.

## Current Composer Specs

These define the product contract behind the mock.

- `docs/superpowers/specs/2026-07-09-peak-composer-editing-view.md`  
  Core Composer editing-view product direction: a dedicated Peak Composer View over the same Markdown/native files. It does not modify the existing Obsidian Markdown CodeMirror editor and is not a Notion clone.
- `docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md`  
  Block/core operation matrix plus the shared `SuggestionFinding` identity/lifecycle used by document-local AI suggestions and the Copilot Brief.
- `docs/superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md`  
  Sidecar UI, proactive intelligence evaluation, related-material complete-view, and interaction boundaries.
- `docs/superpowers/specs/2026-07-22-peak-composer-component-consistency.md`
  Normative component-family and state matrix for the Composer canvas, Intelligence bridge and shared Result Browser. It explicitly prevents “AI has another shape” and “make everything a pill” regressions.

Related implementation / extraction plan:

- `docs/superpowers/plans/2026-07-21-vault-result-browser-shared-component.md`  
  Shared controlled ResultBrowser extraction plan. Composer's `打开完整视图` stays inside Composer and browses its existing related-material snapshot; Vault Search / Quick Search provide reusable components but are not navigation destinations.

## Visual Evidence In Current Composer Folder

Do not open every preview image by default. Use these only when checking a specific interaction.

- `preview-block-granularity.png` and `preview-block-kind-separation.png`  
  Evidence for title / paragraph / list / quote / callout as distinct editable blocks.
- `preview-hover-controls.png`, `preview-hover-corridor.png`, `preview-insert-under-block.png`, `preview-comment-editor.png`  
  Evidence for block control reachability, click-to-toggle insertion/comment behavior, and hover corridor issues.
- `preview-blockai-capsule.png`, `preview-blockai-input-morph.png`, `preview-blockai-combined.png`, `preview-contextual-ai-actions.png`  
  Evidence for the block AI capsule / command / suggestion model.
- `preview-component-consistency-block-actions.png`, `preview-component-consistency-selection-toolbar.png`, `preview-component-consistency-object-toolbar.png`
  Current browser evidence for the combined Block row, editor-style selection toolbar and shared image/table/native object-toolbar grammar; owner review is still allowed to revise the family matrix.
- `preview-blockai-inplace-diff.png`, `preview-blockai-rewrite-accepted.png`, `preview-ai-streaming.png`, `preview-ai-stream-busy.png`, `preview-ai-stream-done.png`  
  Evidence for streaming, in-place rewrite, and accept/reject review.
- `preview-image-lightgallery.png`  
  Evidence for LoveIt-style `lightGallery` image viewing.
- `preview-atlas-mermaid.png`, `preview-native.png`, `preview-native-followup-content.png`  
  Evidence for Mermaid / Base / Canvas / Excalidraw style native-object handling.
- `preview-intelligence-copilot-v3.png`, `preview-intelligence-ambient-v3.png`, `preview-intelligence-history-v3.png`  
  Earlier sidecar screenshots. Use only as historical comparison unless the current integrated mock matches them.

## Native File And Real Data Fixtures

These are important because the Composer view must preserve original Markdown/native formats.

- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/real-map-auckland-route.png`  
  Real image fixture used for the image block and lightGallery path.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/pkm-composer.base`
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/Untitled.base`  
  Base examples.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/pkm-composer.canvas`  
  JSON Canvas sample.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/101-A-产品类别分析.excalidraw.md`  
  Excalidraw sample with real text elements.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/ai-knowledge-workflow-illustration.png`  
  Generated illustration fixture for AI image insertion and review.

## Research From The Composer Session

These explain why Composer focuses on block-level editing, rich objects, images, tables, and AI-local editing.

- `docs/research/2026-07-09-obsidian-editor-view-ui-plugins/report.md`  
  Obsidian editor-view and UI plugin research.
- `docs/research/2026-07-09-open-source-editor-ui-tools/report.md`  
  Open-source editor UI / block editor tool research.
- `docs/research/2026-07-09-ai-surfaces-ui-review/README.md`
- `docs/research/2026-07-09-ai-surfaces-ui-review/01-ai-search.html`
- `docs/research/2026-07-09-ai-surfaces-ui-review/02-vault-intelligence.html`
- `docs/research/2026-07-09-ai-surfaces-ui-review/03-document-copilot.html`  
  AI surfaces review; useful for sidecar and Copilot language.
- `docs/research/2026-07-09-collection-notes-canvas-reuse/README.md`  
  Notes on reusing collection / canvas style ideas.

## Copilot Command Center Background

These are older but still useful for capability organization, run receipts, command discovery, diff review, and action orchestration.

- `docs/gstack/copilot-command-center-redesign-2026-05-14/README.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/brief.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow-screenshot.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/intent-hub-auto-orchestration-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/multi-panel-surface-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/capability-visual-gallery.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/command-center-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/intent-hub-orchestration-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/full-document-rendered-diff-prototype.html`

Associated specs and plans:

- `docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `docs/superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md`
- `docs/superpowers/specs/2026-05-17-copilot-meta-agent-redesign.md`
- `docs/superpowers/plans/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `docs/superpowers/plans/2026-05-16-copilot-command-center-final-ux-flow.md`
- `docs/superpowers/plans/2026-05-16-copilot-panel-flow-implementation.md`

Important boundary: do not copy the old command-center dashboard into Composer. Composer needs a document-adjacent sidecar and in-place document patches.

## Document Copilot Background

These define older document-copilot and agent-loop thinking.

- `docs/16-feature-document-copilot.html`
- `docs/superpowers/specs/2026-04-24-copilot-document-intelligence-design.md`
- `docs/superpowers/plans/2026-04-24-copilot-document-intelligence.md`
- `docs/superpowers/specs/2026-05-07-copilot-expansion-design.md`
- `docs/superpowers/plans/2026-05-07-copilot-expansion.md`
- `docs/superpowers/specs/2026-05-10-copilot-agent-loop-design.md`
- `docs/superpowers/plans/2026-05-10-copilot-agent-loop.md`

Use these for capability semantics, not for current UI layout.

## Ambient / Current Work State Background

These are needed because the sidecar keeps using Ambient ideas, but the user does not want a generic enterprise dashboard.

- `docs/14-feature-ambient-push.html`
- `docs/superpowers/specs/2026-05-01-ambient-push-design.md`
- `docs/superpowers/plans/2026-05-01-ambient-push-phase1.md`
- `docs/superpowers/plans/2026-05-10-ambient-push-phase2.md`
- `docs/superpowers/plans/2026-05-10-ambient-push-phase3.md`
- `docs/superpowers/plans/2026-05-10-ambient-push-phase4.md`
- `docs/superpowers/specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html`
- `docs/gstack/ambient-current-work-state-2026-06-02/ambient-current-work-state-v1.png`
- `docs/gstack/ambient-current-work-state-2026-06-02/ambient-session-thought-trace-v1.png`
- `docs/superpowers/specs/2026-07-07-ambient-floating-panel.html`

Concept mapping for Composer:

- Current Work State: why the system thinks the user is currently writing / reviewing / organizing this document.
- Recent Work Trace: evidence behind that inference.
- Session Thought Trace: loose ideas and not-yet-placed thoughts for the current writing session.
- Ambient Push: ranking and initiative layer behind Copilot, not a separate editor.

## Chat Studio And Input Composer References

Use these when designing the sidecar Copilot input, capability picker, action chips, model/runtime affordances, and conversation threading.

- `docs/11-feature-chat-studio-ui-ux.html`
- `docs/11-feature-chat-context.html`
- `docs/gstack/chat-studio-interactive-2026-07-13/README.md`
- `docs/gstack/chat-studio-interactive-2026-07-13/discussion-synthesis.md`
- `docs/gstack/chat-studio-interactive-2026-07-13/research-and-inventory.md`
- `docs/gstack/chat-studio-interactive-2026-07-13/composer-lab.html`
- `docs/gstack/chat-studio-interactive-2026-07-13/product-strategy.html`
- `docs/gstack/chat-studio-interactive-2026-07-13/index.html`
- `docs/superpowers/specs/2026-07-14-chat-studio-product-positioning-and-composer-v2.md`
- `docs/superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md`
- `docs/superpowers/plans/2026-07-13-chat-studio-interactive-html-mock-plan.md`
- `docs/superpowers/plans/2026-07-21-chat-zero-gap-closure-delivery.md`
- `docs/superpowers/plans/2026-07-21-chat-zero-gap-closure-claude-handoff.md`

Boundary: Chat Studio can inspire the Copilot composer and capability picker, but Composer View is still a document editing surface.

## File Atlas / Related Material References

These matter because Composer should not duplicate Atlas outline/search/gallery/comment columns, and related-material expansion should reuse real graph/search surfaces.

- `docs/gstack/file-atlas-mock-2026-07-08/index-v3.html`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3.png`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3-graph.png`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3-search-tray.png`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3-insight-inspector.png`
- `docs/23-infra-search-index.html`

Boundary: Composer exposes a bounded relation preview in the sidecar, then opens a Composer-owned wide modal that mounts shared List / Tree / Graph result components over the same frozen material snapshot. It does not navigate to Vault Search / Quick Search, reuse their store, or rerun their query lifecycle.

## Product Index And Progress References

- `docs/index.html`  
  Long-term docs portal.
- `docs/roadmap.html`  
  Roadmap surface; use it when converting the Composer requirements into roadmap tracks.
- `docs/progress.md`  
  Current project phase and recent implementation status. Read before making implementation claims.

## Recommended Reading Order For A New Task

1. Open the primary review URL and inspect the current screen.
2. Read this document map.
3. Read `docs/gstack/peak-composer-editing-view-2026-07-09/README.md`.
4. Read the three July Composer specs.
5. Read only the background pack needed for the current question:
   - sidecar / capabilities: Copilot Command Center + Chat Studio input composer docs;
   - Ambient semantics: Ambient / Current Work State docs;
   - related materials: File Atlas / Vault Result Browser docs;
   - native objects: current Composer fixture assets and README.
6. Write one integrated requirements document for Composer + sidecar, then update the current mock or open a fresh implementation task.

## Conflict Rules

- Do not reintroduce a three-column outline/search/gallery/comment layout inside Composer. Atlas owns that.
- Do not treat Ambient as a third permanent chat tab unless the latest sidecar design explicitly reintroduces it.
- Do not turn AI suggestions into explanatory cards when the action can be rendered as an in-place patch, real inserted object, real transformed table, rendered formula, native file patch, or generated image.
- Do not use old Command Center dashboard density as the sidecar style target.
- Do not use Chat Studio conversation surfaces as proof that Composer should stop being document-first.
- Do not implement Composer as decorations/widgets/state inside the existing Obsidian Markdown CodeMirror editor; the owner-approved host is a dedicated Peak Composer View over the same source files.
- Do not create separate finding stores for document-local `AI 建议` and the Copilot Brief; both project one app-owned `SuggestionFinding` identity and lifecycle.
- Do not recreate a two-level per-Block action hierarchy. The current contract is one hover/focus row: `在下方插入 / 复制 / 评论 / contextual AI actions / History / 指令`; there is no separate `AI 建议 · N` opener.
- Do not put Undo/Redo in every Block, AI draft, or the prototype-only top strip. One compact standard-icon pair remains permanently reachable in Composer's bottom document-status bar; shortcuts traverse the same committed document stack. After commit/undo/redo, one transient lower-canvas notice exposes the exact transaction and only currently valid actions, then may hide without clearing the controls or stack. Pending candidates keep restore/discard/version controls, input-field undo remains native, the Block clock-arrow remains generation History, and durable History records direct user operations as well as accepted AI-assisted writes and explicit inverse rollback transactions.
- Do not duplicate production related-material browser UI in static Composer mock; mark the reuse slot and link to the real component plan.
- Do not describe `打开完整视图` as navigation to Vault Search / Quick Search. It remains inside Composer and mounts shared controlled components over Composer's existing snapshot.
- Do not use acceptance rate as the only proactive-intelligence success metric; retained usefulness and quality/autonomy/reliability/performance guardrails are required.
- Do not read all preview PNGs by default. Pick the screenshots that match the specific design question.

## Requirement Work To Produce Next

The next requirements document should be separate from this map. Suggested future path, not created yet:

`docs/superpowers/specs/2026-07-22-peak-composer-integrated-requirements.md`

Suggested sections:

1. Product contract: Composer View + Intelligence sidecar as one document editing experience.
2. Dedicated host contract: independent Peak Composer View, standard editor isolation, source synchronization and safe view switching.
3. Composer document canvas: block granularity, block/section collapse, selection toolbar, insertion, comments, drag, Markdown/native and HTML-enhanced source preservation.
4. Block/core capability matrix: fixed operations, AI review suggestions, incremental native generation, manual commands.
5. SuggestionFinding contract: shared identity, deduplication, cross-surface dismiss/consume/stale synchronization and evidence revision.
6. Copilot sidecar: capability picker, context chips, chat composer, run snapshot, live patch navigation.
7. Ambient projection: current work state, related materials, loose thoughts, confidence / evidence.
8. Related-material complete view: Composer-owned modal, immutable snapshot and shared controlled result components without search-host navigation.
9. Proactive intelligence evaluation: retained-usefulness north star plus quality, autonomy, review, efficiency, reliability and local-performance guardrails.
10. Frontmatter intelligence: global Vault field/tag frequency, type consistency and rare keys; current-note custom/deterministic fields and review-only semantic AI candidates.
11. Undo/Redo: current-session committed-transaction cursor, shortcuts, input ownership, Redo invalidation and separation from candidate/history UI.
12. History: accepted transactions, rollback, diff, provenance, plus projection-only grouping by explicit direct-edit burst or AI run/change-set while preserving every child transaction.
13. Native object adapters and object-native diff: image, table, list/checklist, formula, Mermaid, Base, Canvas, Excalidraw.
14. Responsive behavior: stable right sidecar on wide screens; fixed, closeable right drawer on narrow screens. It must never fall below the document or become a bottom sheet.
15. Roadmap: shipped in mock, ready to implement, needs production adapter, future exploration.
16. Verification checklist: visual QA, no horizontal overflow, source format preserved, cross-block selection, object actions, Undo/Redo shortcuts and focus ownership, sidecar states and proactive-intelligence guardrails.

## Short Copyable Handoff

Use this if starting a fresh task:

```text
We need to integrate the latest Peak Composer editing-view mock with the latest Intelligence sidecar design and turn the combined system into a product requirements document plus any necessary mock cleanup.

Start from:
- docs/superpowers/plans/2026-07-22-peak-composer-intelligence-sidecar-handoff.md
- docs/superpowers/specs/2026-07-22-peak-composer-related-document-map.md
- docs/gstack/peak-composer-editing-view-2026-07-09/README.md
- docs/gstack/peak-composer-editing-view-2026-07-09/index.html?mode=copilot&stage=brief
- docs/superpowers/specs/2026-07-09-peak-composer-editing-view.md
- docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md
- docs/superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md

Do not restart from generic Notion/Feishu cloning. Composer is a dedicated Obsidian view over the same Markdown and native files; it does not modify the existing Markdown CodeMirror editor. Atlas owns outline/search/gallery/comment navigation. The document canvas is primary; Ambient projects into the Copilot Brief, while Copilot/History support in-place editing, source-preserving native object patches, and accepted transaction history.

Document-local AI suggestions and the Copilot Brief must project the same SuggestionFinding identity/lifecycle. Related-material `打开完整视图` stays inside Composer and mounts shared controlled components over the snapshot already found by Composer; it does not navigate to Vault Search/Quick Search or rerun search. Proactive intelligence requires retained-usefulness plus quality, autonomy, reliability and local-performance guardrails; acceptance rate alone is insufficient.

First audit the current mock and latest sidecar design, then write docs/superpowers/specs/2026-07-22-peak-composer-integrated-requirements.md. After that, update the mock only where it makes the integrated requirement clearer.
```
